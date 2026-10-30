import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { book, Client, DEMO_USERS, findOffer, futureDate, guestsFor, login, startTestApp, type TestEnv } from './helpers.js';
import { SandboxAdapter } from '../src/modules/inventory/adapters/sandbox.js';
import { postJournal, UnbalancedJournal } from '../src/modules/finance/ledger.js';

let env: TestEnv;
let agent: Client, dmc: Client, admin: Client, ops: Client, finance: Client;
const checkIn = futureDate(30), checkOut = futureDate(32);

beforeAll(async () => {
  env = await startTestApp();
  [agent, dmc, admin, ops, finance] = await Promise.all([
    login(env, DEMO_USERS.agent), login(env, DEMO_USERS.creditAgent), login(env, DEMO_USERS.admin), login(env, DEMO_USERS.ops), login(env, DEMO_USERS.finance),
  ]);
});
afterAll(async () => { await env.close(); });

async function ledgerBalancesByJournal() {
  return env.db.query<{ journal_id: string; s: number }>('SELECT journal_id, SUM(amount_minor)::bigint AS s FROM ledger_entries GROUP BY journal_id, currency HAVING SUM(amount_minor) <> 0');
}

describe('authentication & authorisation', () => {
  it('rejects bad credentials with a generic message', async () => {
    const r = await new Client(env.base).req('POST', '/api/auth/login', { email: DEMO_USERS.agent, password: 'wrong-password-1' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Email or password is incorrect.');
  });
  it('requires a CSRF token for state-changing requests', async () => {
    const r = await agent.req('POST', '/api/agent/search', { destination: 'Amsterdam', checkIn, checkOut, rooms: [{ adults: 2 }] }, { csrf: false });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CSRF');
  });
  it('blocks unverified agencies from searching', async () => {
    const pending = await login(env, DEMO_USERS.pendingAgent);
    const r = await pending.post('/api/agent/search', { destination: 'Amsterdam', checkIn, checkOut, rooms: [{ adults: 2 }] });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('AGENCY_NOT_ACTIVE');
  });
  it('keeps agents out of the admin console and staff out of agent data', async () => {
    expect((await agent.get('/api/admin/overview')).status).toBe(403);
    expect((await admin.get('/api/agent/bookings')).status).toBe(403);
    expect((await new Client(env.base).get('/api/agent/bookings')).status).toBe(401);
  });
  it('registers a new agency as pending', async () => {
    const c = new Client(env.base);
    const r = await c.post('/api/auth/register', {
      agency: { name: 'New Agency', countryCode: 'in', city: 'Delhi', phone: '+91 11 0000 0000' },
      admin: { name: 'New Owner', email: 'owner@new-agency.test', password: 'weak' }, acceptTerms: true,
    });
    expect(r.status).toBe(400); // weak password
    const ok = await c.post('/api/auth/register', {
      agency: { name: 'New Agency', countryCode: 'in', city: 'Delhi', phone: '+91 11 0000 0000' },
      admin: { name: 'New Owner', email: 'owner@new-agency.test', password: 'a-strong-passw0rd' }, acceptTerms: true,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('pending');
  });
});

describe('search', () => {
  it('preserves mixed room configurations and never exposes supplier cost', async () => {
    const rooms = [{ adults: 2 }, { adults: 2 }, { adults: 1 }];
    const { hotel, offer, search } = await findOffer(agent, { city: 'amsterdam', slug: 'kade-house-amsterdam', checkIn, checkOut, rooms });
    expect(search.results.length).toBeGreaterThan(0);
    expect(offer.rooms.map((r: any) => r.adults)).toEqual([2, 2, 1]);
    expect(offer.totalMinor).toBe(offer.rooms.reduce((a: number, r: any) => a + r.sellMinor, 0));
    expect(offer.availability).toBe('instant');
    expect(offer.localCharges.amountMinor).toBe(350 * 5 * 2); // 5 guests × 2 nights, payable at hotel
    const raw = JSON.stringify(search);
    for (const secret of ['supplierCost', 'grossProfit', 'margin', 'commission', 'inclusion_rationale', 'markup']) expect(raw).not.toContain(secret);
    expect(hotel.hotel.isSample).toBe(true);
  });
  it('shows request-to-book hotels as on request, and sandbox offers labelled', async () => {
    const { hotel } = await findOffer(agent, { city: 'Amsterdam', slug: 'station-loft-amsterdam', checkIn, checkOut, rooms: [{ adults: 2 }] });
    const contract = hotel.offers.find((o: any) => o.source === 'direct_contract');
    const sandbox = hotel.offers.find((o: any) => o.source === 'sandbox');
    expect(contract.availability).toBe('on_request');
    expect(sandbox.isSandbox).toBe(true);
    expect(sandbox.availability).toBe('revalidate');
  });
  it('validates dates and occupancy', async () => {
    expect((await agent.post('/api/agent/search', { destination: 'Amsterdam', checkIn: futureDate(-1), checkOut, rooms: [{ adults: 2 }] })).status).toBe(400);
    expect((await agent.post('/api/agent/search', { destination: 'Amsterdam', checkIn, checkOut: checkIn, rooms: [{ adults: 2 }] })).status).toBe(400);
    expect((await agent.post('/api/agent/search', { destination: 'Amsterdam', checkIn, checkOut, rooms: [{ adults: 9 }] })).status).toBe(400);
  });
  it('converts to the agency selling currency using the recorded FX rate', async () => {
    const { offer } = await findOffer(dmc, { city: 'Amsterdam', slug: 'kade-house-amsterdam', checkIn, checkOut, rooms: [{ adults: 2 }] });
    expect(offer.currency).toBe('USD');
    expect(offer.fx.from).toBe('EUR');
  });
});

describe('instant booking lifecycle', () => {
  let bookingId: string;
  it('books, confirms, invoices and posts a balanced journal', async () => {
    const { offer } = await findOffer(agent, { city: 'Amsterdam', slug: 'kade-house-amsterdam', checkIn, checkOut, rooms: [{ adults: 2 }, { adults: 1 }] });
    const before = await env.db.one<{ sold: number }>(`SELECT sum(sold)::int AS sold FROM allocations a JOIN contracts c ON c.id = a.contract_id WHERE c.reference = 'DEMO-AMS-KADE-2026'`);
    const r = await book(agent, offer);
    expect(r.status).toBe(201);
    bookingId = r.body.booking.id;
    expect(r.body.booking.status).toBe('confirmed');
    expect(r.body.booking.totalMinor).toBe(offer.totalMinor);
    expect(r.body.booking.invoices).toHaveLength(1);
    expect(r.body.booking.payment.outstandingMinor).toBe(offer.totalMinor);
    const after = await env.db.one<{ sold: number }>(`SELECT sum(sold)::int AS sold FROM allocations a JOIN contracts c ON c.id = a.contract_id WHERE c.reference = 'DEMO-AMS-KADE-2026'`);
    expect(after!.sold - before!.sold).toBe(4); // 2 rooms × 2 nights
    expect(await ledgerBalancesByJournal()).toHaveLength(0);
    const rev = await env.db.one<{ s: number }>(`SELECT -SUM(amount_minor)::bigint AS s FROM ledger_entries WHERE booking_id = $1 AND account = 'net_revenue'`, [bookingId]);
    const b = await env.db.one<any>('SELECT total_sell_minor, supplier_cost_converted_minor FROM bookings WHERE id = $1', [bookingId]);
    expect(rev!.s).toBe(b.total_sell_minor - b.supplier_cost_converted_minor);
    expect(JSON.stringify(r.body)).not.toContain('supplierCost');
  });

  it('serves a voucher only to the owning agency', async () => {
    const v = await agent.get(`/api/agent/bookings/${bookingId}/voucher`);
    expect(v.status).toBe(200);
    expect(String(v.body)).toContain('Kade House');
    expect(String(v.body)).toContain('Not valid for travel');
    expect((await dmc.get(`/api/agent/bookings/${bookingId}`)).status).toBe(404);
    expect((await dmc.get(`/api/agent/bookings/${bookingId}/voucher`)).status).toBe(404);
  });

  it('requires the agent to accept the current cancellation charge, then cancels and reverses accounting', async () => {
    const detail = await agent.get(`/api/agent/bookings/${bookingId}`);
    expect(detail.body.cancellation.penaltyMinor).toBe(0);
    const wrong = await agent.post(`/api/agent/bookings/${bookingId}/cancel`, { acceptedPenaltyMinor: 100, reason: 'Client changed plans' });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe('PENALTY_CHANGED');
    const ok = await agent.post(`/api/agent/bookings/${bookingId}/cancel`, { acceptedPenaltyMinor: 0, reason: 'Client changed plans' });
    expect(ok.status).toBe(200);
    expect(ok.body.booking.status).toBe('cancelled');
    const bal = await env.db.one<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0)::bigint AS s FROM ledger_entries WHERE booking_id = $1 AND account = 'net_revenue'`, [bookingId]);
    expect(bal!.s).toBe(0);
    expect(await ledgerBalancesByJournal()).toHaveLength(0);
    const sold = await env.db.one<{ held: boolean }>('SELECT allocation_held AS held FROM bookings WHERE id = $1', [bookingId]);
    expect(sold!.held).toBe(false);
    // Cannot cancel twice.
    expect((await agent.post(`/api/agent/bookings/${bookingId}/cancel`, { acceptedPenaltyMinor: 0, reason: 'again' })).status).toBe(409);
  });
});

describe('duplicate protection & price integrity', () => {
  it('replays the same booking for a repeated idempotency key', async () => {
    const { offer } = await findOffer(agent, { city: 'Barcelona', slug: 'casa-patio-barcelona', checkIn, checkOut, rooms: [{ adults: 2 }] });
    const payload = { offerId: offer.id, idempotencyKey: 'same-key-12345', acceptedTotalMinor: offer.totalMinor, acceptedCurrency: offer.currency, rooms: guestsFor(offer) };
    const [a, b] = await Promise.all([agent.post('/api/agent/bookings', payload), agent.post('/api/agent/bookings', payload)]);
    const c = await agent.post('/api/agent/bookings', payload);
    const ids = new Set([a.body.booking.id, b.body.booking.id, c.body.booking.id]);
    expect(ids.size).toBe(1);
    expect(c.body.replayed).toBe(true);
    const n = await env.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM bookings WHERE idempotency_key = 'same-key-12345'`);
    expect(n!.n).toBe(1);
  });

  it('refuses to book at a price the agent did not accept', async () => {
    const { offer } = await findOffer(agent, { city: 'Barcelona', slug: 'sants-central-barcelona', checkIn, checkOut, rooms: [{ adults: 2 }] });
    const tampered = await book(agent, offer, { acceptedTotalMinor: offer.totalMinor - 5000 });
    expect(tampered.status).toBe(409);
    expect(tampered.body.error.code).toBe('PRICE_CHANGED');
  });

  it('surfaces a price change detected at revalidation and requires re-acceptance', async () => {
    const { offer } = await findOffer(agent, { city: 'Barcelona', slug: 'sants-central-barcelona', checkIn, checkOut, rooms: [{ adults: 2 }] });
    // Commercial rule changes between search and checkout.
    await admin.post('/api/admin/pricing-rules', { markupType: 'percent', value: 1500, rounding: 'up_to_unit' });
    const reval = await agent.post(`/api/agent/offers/${offer.id}/revalidate`);
    expect(reval.body.status).toBe('changed');
    expect(reval.body.offer.totalMinor).toBeGreaterThan(offer.totalMinor);
    const r = await book(agent, offer);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('PRICE_CHANGED');
    const ok = await book(agent, reval.body.offer);
    expect(ok.status).toBe(201);
    expect(ok.body.booking.totalMinor).toBe(reval.body.offer.totalMinor);
    await admin.post('/api/admin/pricing-rules', { markupType: 'percent', value: 1000, rounding: 'up_to_unit' });
  });

  it('cannot use another agency\'s offer', async () => {
    const { offer } = await findOffer(agent, { city: 'Barcelona', slug: 'casa-patio-barcelona', checkIn, checkOut, rooms: [{ adults: 2 }] });
    expect((await book(dmc, offer)).status).toBe(404);
    expect((await dmc.get(`/api/agent/offers/${offer.id}`)).status).toBe(404);
  });
});

describe('request-to-book', () => {
  it('stays pending until the hotel confirms, and the agent must acknowledge', async () => {
    const { hotel } = await findOffer(agent, { city: 'Amsterdam', slug: 'station-loft-amsterdam', checkIn, checkOut, rooms: [{ adults: 2 }] });
    const offer = hotel.offers.find((o: any) => o.source === 'direct_contract');
    const noAck = await book(agent, offer, { acknowledgeOnRequest: false });
    expect(noAck.status).toBe(409);
    expect(noAck.body.error.code).toBe('ON_REQUEST_ACK_REQUIRED');
    const r = await book(agent, offer);
    expect(r.body.booking.status).toBe('pending_confirmation');
    expect(r.body.booking.voucherAvailable).toBe(false);
    expect(r.body.booking.invoices).toHaveLength(0);
    const id = r.body.booking.id;
    const issues = await admin.get('/api/admin/overview');
    expect(issues.body.issues.some((i: any) => i.kind === 'pending_confirmation' && i.entityId === id)).toBe(true);
    expect((await agent.post(`/api/admin/bookings/${id}/confirm`, { hotelConfirmationNumber: 'X1' })).status).toBe(403);
    const c = await ops.post(`/api/admin/bookings/${id}/confirm`, { hotelConfirmationNumber: 'SL-88231' });
    expect(c.status).toBe(200);
    const after = await agent.get(`/api/agent/bookings/${id}`);
    expect(after.body.booking.status).toBe('confirmed');
    expect(after.body.booking.hotelConfirmationNumber).toBe('SL-88231');
  });
});

describe('payment & credit paths', () => {
  it('holds non-refundable prepay bookings until payment, then submits', async () => {
    const { offer } = await findOffer(agent, { city: 'Amsterdam', slug: 'runway-hotel-schiphol', checkIn, checkOut, rooms: [{ adults: 2 }] });
    expect(offer.cancellation.refundable).toBe(false);
    const r = await book(agent, offer);
    expect(r.body.booking.status).toBe('awaiting_payment');
    const id = r.body.booking.id;
    // Agents cannot record their own payments.
    expect((await agent.post('/api/admin/payments', {})).status).toBe(403);
    const pay = await finance.post('/api/admin/payments', {
      bookingId: id, direction: 'received', method: 'bank_transfer', amountMinor: offer.totalMinor, currency: offer.currency,
      externalReference: 'BANK-TRX-001', receivedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(pay.status).toBe(201);
    const after = await agent.get(`/api/agent/bookings/${id}`);
    expect(after.body.booking.status).toBe('confirmed');
    expect(after.body.booking.payment.outstandingMinor).toBe(0);
    expect(await ledgerBalancesByJournal()).toHaveLength(0);
  });

  it('confirms immediately on approved credit and tracks credit usage', async () => {
    const { offer } = await findOffer(dmc, { city: 'Amsterdam', slug: 'runway-hotel-schiphol', checkIn, checkOut, rooms: [{ adults: 1 }] });
    const before = (await dmc.get('/api/agent/finance')).body.credit;
    const r = await book(dmc, offer);
    expect(r.body.booking.status).toBe('confirmed');
    expect(r.body.booking.payment.method).toBe('credit');
    const after = (await dmc.get('/api/agent/finance')).body.credit;
    expect(after.usedMinor - before.usedMinor).toBe(offer.totalMinor);
  });

  it('refund flow: cancelled after payment → refund pending → refunded', async () => {
    const { offer } = await findOffer(agent, { city: 'Barcelona', slug: 'casa-patio-barcelona', checkIn: futureDate(40), checkOut: futureDate(41), rooms: [{ adults: 1 }] });
    const r = await book(agent, offer);
    const id = r.body.booking.id;
    await finance.post('/api/admin/payments', { bookingId: id, direction: 'received', method: 'bank_transfer', amountMinor: offer.totalMinor, currency: offer.currency, externalReference: 'TRX-2', receivedAt: new Date(Date.now() - 1000).toISOString() });
    const c = await agent.post(`/api/agent/bookings/${id}/cancel`, { acceptedPenaltyMinor: 0, reason: 'Trip cancelled' });
    expect(c.body.booking.status).toBe('refund_pending');
    expect(c.body.booking.payment.creditMinor).toBe(offer.totalMinor);
    const tooMuch = await finance.post('/api/admin/payments', { bookingId: id, direction: 'refunded', method: 'bank_transfer', amountMinor: offer.totalMinor + 1, currency: offer.currency, externalReference: 'RF-1', receivedAt: new Date().toISOString() });
    expect(tooMuch.status).toBe(400);
    await finance.post('/api/admin/payments', { bookingId: id, direction: 'refunded', method: 'bank_transfer', amountMinor: offer.totalMinor, currency: offer.currency, externalReference: 'RF-1', receivedAt: new Date(Date.now() - 1000).toISOString() });
    expect((await agent.get(`/api/agent/bookings/${id}`)).body.booking.status).toBe('refunded');
  });
});

describe('supplier failures', () => {
  const sandbox = () => env.ctx.registry.get('sandbox') as SandboxAdapter;
  const sandboxOffer = async () => {
    const { hotel } = await findOffer(agent, { city: 'Amsterdam', slug: 'station-loft-amsterdam', checkIn, checkOut, rooms: [{ adults: 2 }] });
    return hotel.offers.find((o: any) => o.source === 'sandbox');
  };

  it('a timed-out booking is never retried blindly; reconciliation resolves it without duplicates', async () => {
    const offer = await sandboxOffer();
    sandbox().fault = 'book_timeout_after_commit';
    const before = sandbox().store.size;
    const r = await book(agent, offer);
    sandbox().fault = 'none';
    expect(r.body.booking.status).toBe('submitting');
    const id = r.body.booking.id;
    const row = await env.db.one<{ needs_reconciliation: boolean }>('SELECT needs_reconciliation FROM bookings WHERE id = $1', [id]);
    expect(row!.needs_reconciliation).toBe(true);
    expect(sandbox().store.size).toBe(before + 1);
    const rec = await ops.post(`/api/admin/bookings/${id}/reconcile`);
    expect(rec.body.status).toBe('confirmed');
    expect(sandbox().store.size).toBe(before + 1); // looked up, not re-booked
    const calls = await env.db.query(`SELECT operation FROM supplier_calls WHERE booking_id = $1 ORDER BY id`, [id]);
    expect(calls.map((c: any) => c.operation)).toEqual(['book', 'retrieve']);
  });

  it('a rejected booking fails cleanly with an explanation', async () => {
    const offer = await sandboxOffer();
    sandbox().fault = 'book_reject';
    const r = await book(agent, offer);
    sandbox().fault = 'none';
    expect(r.body.booking.status).toBe('failed');
    expect(r.body.booking.failureReason).toMatch(/rejected/);
  });

  it('supplier price increases are shown, never silently applied', async () => {
    const offer = await sandboxOffer();
    sandbox().fault = 'price_increase';
    const r = await book(agent, offer);
    sandbox().fault = 'none';
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('PRICE_CHANGED');
    expect(r.body.error.details.offer.totalMinor).toBeGreaterThan(offer.totalMinor);
  });

  it('a supplier search outage does not break results from other sources', async () => {
    sandbox().fault = 'search_error';
    const { search, hotel } = await findOffer(agent, { city: 'Amsterdam', slug: 'station-loft-amsterdam', checkIn, checkOut, rooms: [{ adults: 2 }] });
    sandbox().fault = 'none';
    expect(search.sourceIssues.length).toBe(1);
    expect(hotel.offers.some((o: any) => o.source === 'direct_contract')).toBe(true);
  });

  it('supplier logs are redacted', async () => {
    const rows = await env.db.query<{ request: any }>(`SELECT request FROM supplier_calls WHERE operation = 'book'`);
    expect(JSON.stringify(rows)).not.toContain('Guest1');
  });
});

describe('contract controls', () => {
  it('suspended contracts are not bookable; stop-sells close dates', async () => {
    const c = await env.db.one<{ id: string }>(`SELECT id FROM contracts WHERE reference = 'DEMO-BCN-PATIO-2026'`);
    expect((await ops.post(`/api/admin/contracts/${c!.id}/status`, { action: 'suspend' })).status).toBe(200);
    let res = await findOffer(agent, { city: 'Barcelona', slug: 'casa-patio-barcelona', checkIn, checkOut, rooms: [{ adults: 2 }] });
    expect(res.hotel.offers).toHaveLength(0);
    await ops.post(`/api/admin/contracts/${c!.id}/status`, { action: 'reactivate' });
    expect((await ops.post(`/api/admin/contracts/${c!.id}/status`, { action: 'approve' })).status).toBe(403); // only admins approve
    expect((await admin.post(`/api/admin/contracts/${c!.id}/status`, { action: 'approve' })).status).toBe(200);
    const stop = await ops.post(`/api/admin/contracts/${c!.id}/restrictions`, { kind: 'stop_sell', dateFrom: checkIn, dateTo: checkIn });
    expect(stop.status).toBe(201);
    res = await findOffer(agent, { city: 'Barcelona', slug: 'casa-patio-barcelona', checkIn, checkOut, rooms: [{ adults: 2 }] });
    expect(res.hotel.offers).toHaveLength(0);
  });

  it('imports a rate sheet all-or-nothing', async () => {
    const hotel = await env.db.one<{ id: string }>(`SELECT id FROM hotels WHERE slug = 'sants-central-barcelona'`);
    const created = await ops.post('/api/admin/contracts', {
      hotelId: hotel!.id, reference: 'TEST-SANTS-2027', rateModel: 'net', currency: 'EUR', validFrom: futureDate(1), validTo: futureDate(200),
      bookingMode: 'request', taxPolicy: { includedInRate: true }, cancellationPolicy: { refundable: true, tiers: [{ daysBefore: 3, penaltyBps: 0 }] },
      distribution: { b2bAgencies: true },
    });
    expect(created.status).toBe(201);
    const bad = await ops.post(`/api/admin/contracts/${created.body.id}/rate-sheet`, { csv: `room_code,meal_plan,adults,date_from,date_to,amount\nDBL,BB,2,${futureDate(5)},${futureDate(50)},120.00\nXXX,BB,2,${futureDate(5)},${futureDate(50)},99` });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0]).toMatch(/Row 3/);
    const rates0 = await env.db.one<{ n: number }>('SELECT count(*)::int AS n FROM rates WHERE contract_id = $1', [created.body.id]);
    expect(rates0!.n).toBe(0);
    const good = await ops.post(`/api/admin/contracts/${created.body.id}/rate-sheet`, { csv: `room_code,meal_plan,adults,date_from,date_to,amount\nDBL,BB,2,${futureDate(5)},${futureDate(50)},120.00` });
    expect(good.body.imported).toBe(1);
    const preview = await admin.post(`/api/admin/contracts/${created.body.id}/preview`, { checkIn: futureDate(10), checkOut: futureDate(12), rooms: [{ adults: 2 }] });
    expect(preview.body.bookable).toBe(false);
    expect(preview.body.options[0].pricing.totals.supplierCostMinor).toBe(24000);
  });
});

describe('ledger integrity', () => {
  it('rejects unbalanced journals and edits to posted entries', async () => {
    await expect(postJournal(env.db, { kind: 'adjustment', lines: [{ account: 'cash', amountMinor: 100, currency: 'EUR' }] })).rejects.toBeInstanceOf(UnbalancedJournal);
    await expect(env.db.query('UPDATE ledger_entries SET amount_minor = 0')).rejects.toThrow(/append-only/);
    await expect(env.db.query('DELETE FROM ledger_entries')).rejects.toThrow(/append-only/);
  });
});

describe('hotel partner workspace', () => {
  it('shows only own-hotel bookings and net amounts, never agency identity or sell price', async () => {
    const partner = await login(env, DEMO_USERS.partner);
    const r = await partner.get('/api/partner/overview');
    expect(r.status).toBe(200);
    const raw = JSON.stringify(r.body);
    expect(raw).not.toContain('Sample Travel Co');
    expect(raw).not.toContain('total_sell');
    expect(r.body.bookings.every((b: any) => b.reference)).toBe(true);
    expect((await partner.get('/api/agent/bookings')).status).toBe(403);
    expect((await partner.get('/api/admin/overview')).status).toBe(403);
  });
});

describe('founder metrics', () => {
  it('reports from recorded data and keeps GBV separate from revenue', async () => {
    const r = await admin.get('/api/admin/overview');
    const m = r.body.metrics;
    expect(m.bookings.created).toBeGreaterThan(0);
    const eur = m.byCurrency.find((x: any) => x.currency === 'EUR');
    expect(eur.netRevenueMinor).toBeLessThan(eur.gbvMinor);
    expect(eur.contributionMinor).toBeNull();
    expect(m.definitions.gbv).toMatch(/not revenue/);
  });
});
