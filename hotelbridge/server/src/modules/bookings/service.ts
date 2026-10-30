import { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/pool.js';
import type { BookingStatus, CancellationPolicy } from '../../../../shared/domain.js';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors.js';
import { diffDays } from '../../lib/dates.js';
import { applyBps, convert } from '../../lib/money.js';
import { nextReference } from '../../lib/refs.js';
import { audit } from '../../lib/audit.js';
import { log } from '../../lib/log.js';
import { AGENT_BUFFER_DAYS, freeCancellationUntil, penaltyAt } from '../pricing/cancellation.js';
import { agentOfferView, persistOffer, priceSupplierOffer, SOURCE_LABEL, type PricedOffer } from '../search/offers.js';
import { SupplierError, type BookOutcome, type InventoryAdapter } from '../inventory/types.js';
import { bookingBalance, issueInvoice, postBookingConfirmed, postJournal, reverseJournal } from '../finance/ledger.js';
import { transition } from './stateMachine.js';

export interface Actor { userId: string; agencyId: string | null; isStaff: boolean }
export interface AgencyRow {
  id: string; status: string; selling_currency: string; credit_enabled: boolean; credit_limit_minor: number; payment_terms: 'prepay' | 'credit';
}

const guestName = z.object({ first: z.string().trim().min(1).max(60), last: z.string().trim().min(1).max(60) });
export const createBookingSchema = z.object({
  offerId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(100),
  acceptedTotalMinor: z.number().int().nonnegative(),
  acceptedCurrency: z.string().length(3),
  acknowledgeOnRequest: z.boolean().default(false),
  rooms: z.array(z.object({ roomIndex: z.number().int().min(0), guests: z.array(guestName).min(1).max(10) })).min(1).max(9),
  agentReference: z.string().trim().max(60).optional(),
  specialRequests: z.string().trim().max(500).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// ---------------------------------------------------------------- offers & revalidation

async function loadOffer(q: Queryable, agencyId: string, offerId: string) {
  const row = await q.one<{ id: string; payload: PricedOffer; expires_at: Date; search_id: string | null }>(
    'SELECT id, payload, expires_at, search_id FROM offers WHERE id = $1 AND agency_id = $2', [offerId, agencyId]);
  if (!row) throw notFound('Offer');
  return row;
}

function adapterFor(ctx: AppContext, source: string): InventoryAdapter {
  const a = ctx.registry.get(source);
  if (!a) throw new AppError(503, 'SOURCE_UNAVAILABLE', 'This inventory source is not available.');
  return a;
}

const sameTerms = (a: PricedOffer, b: PricedOffer) =>
  a.pricing.totals.sellMinor === b.pricing.totals.sellMinor && a.pricing.sellCurrency === b.pricing.sellCurrency &&
  a.supplierOffer.availability === b.supplierOffer.availability &&
  JSON.stringify(a.supplierOffer.cancellationPolicy) === JSON.stringify(b.supplierOffer.cancellationPolicy);

/**
 * Re-check price and availability with the source. Returns the current state; never silently
 * substitutes a different price — a changed offer gets a new id the agent must explicitly accept.
 */
export async function revalidateOffer(ctx: AppContext, agency: AgencyRow, offerId: string) {
  const stored = await loadOffer(ctx.db, agency.id, offerId);
  const prev = stored.payload;
  const adapter = adapterFor(ctx, prev.supplierOffer.source);
  const now = ctx.now();
  let res;
  try {
    res = await ctx.gateway.call(adapter, 'revalidate', () => adapter.revalidate({ db: ctx.db, q: ctx.db, now }, prev.supplierOffer), { request: { offerId } });
  } catch (err) {
    throw new AppError(503, 'SUPPLIER_UNAVAILABLE', 'We could not confirm the current price with the hotel source. Please try again shortly.');
  }
  if (!res.ok) return { status: 'unavailable' as const, reason: res.reason, previousTotalMinor: prev.pricing.totals.sellMinor };
  const fresh = await priceSupplierOffer(ctx.db, agency, res.offer, now);
  const label = SOURCE_LABEL[fresh.supplierOffer.source] ?? fresh.supplierOffer.source;
  if (sameTerms(prev, fresh)) {
    const expires = new Date(now.getTime() + ctx.config.offerTtlMinutes * 60_000);
    await ctx.db.query('UPDATE offers SET payload = $2, expires_at = $3 WHERE id = $1', [offerId, JSON.stringify(fresh), expires]);
    return { status: 'unchanged' as const, offer: agentOfferView(offerId, expires, fresh, label), previousTotalMinor: prev.pricing.totals.sellMinor, priced: fresh };
  }
  const saved = await persistOffer(ctx, ctx.db, { agencyId: agency.id, searchId: stored.search_id, priced: fresh });
  return { status: 'changed' as const, offer: agentOfferView(saved.id, saved.expiresAt, fresh, label), previousTotalMinor: prev.pricing.totals.sellMinor, priced: fresh };
}

// ---------------------------------------------------------------- credit

export async function creditPosition(q: Queryable, agency: AgencyRow) {
  const currency = agency.selling_currency;
  const ledger = await q.one<{ s: number }>(
    `SELECT COALESCE(SUM(amount_minor),0)::bigint AS s FROM ledger_entries WHERE agency_id = $1 AND account = 'agent_receivable' AND currency = $2`,
    [agency.id, currency]);
  const unposted = await q.one<{ s: number }>(
    `SELECT COALESCE(SUM(total_sell_minor),0)::bigint AS s FROM bookings
      WHERE agency_id = $1 AND currency = $2 AND payment_method = 'credit' AND status IN ('submitting','pending_confirmation')`,
    [agency.id, currency]);
  const used = Math.max(0, ledger!.s) + unposted!.s;
  const limit = agency.credit_enabled ? agency.credit_limit_minor : 0;
  return { currency, limitMinor: limit, usedMinor: used, availableMinor: Math.max(0, limit - used), enabled: agency.credit_enabled };
}

// ---------------------------------------------------------------- create

export async function createBooking(ctx: AppContext, agency: AgencyRow, actor: Actor, input: CreateBookingInput) {
  const existing = await ctx.db.one<{ id: string }>('SELECT id FROM bookings WHERE agency_id = $1 AND idempotency_key = $2', [agency.id, input.idempotencyKey]);
  if (existing) return { bookingId: existing.id, replayed: true };

  const stored = await loadOffer(ctx.db, agency.id, input.offerId);
  const offerRooms = stored.payload.supplierOffer.rooms;
  if (input.rooms.length !== offerRooms.length || offerRooms.some((r) => !input.rooms.find((x) => x.roomIndex === r.roomIndex))) {
    throw badRequest('Guest details are required for every room in the offer.');
  }
  for (const r of input.rooms) {
    const room = offerRooms.find((x) => x.roomIndex === r.roomIndex)!;
    if (r.guests.length > room.adults + room.childrenAges.length) throw badRequest(`Room ${r.roomIndex + 1} has more guests than its occupancy.`);
  }

  // Always revalidate immediately before booking.
  const check = await revalidateOffer(ctx, agency, input.offerId);
  if (check.status === 'unavailable') {
    throw conflict('NO_LONGER_AVAILABLE', check.reason, { previousTotalMinor: check.previousTotalMinor });
  }
  const priced = check.priced;
  // Never silently change the price: any difference from what the agent accepted needs re-acceptance.
  if (check.status === 'changed' || priced.pricing.totals.sellMinor !== input.acceptedTotalMinor || priced.pricing.sellCurrency !== input.acceptedCurrency) {
    throw conflict('PRICE_CHANGED', 'The price or conditions changed when we re-checked with the hotel. Please review the updated offer.', { offer: check.offer, previousTotalMinor: check.previousTotalMinor });
  }
  const so = priced.supplierOffer;
  if (so.availability === 'on_request' && !input.acknowledgeOnRequest) {
    throw conflict('ON_REQUEST_ACK_REQUIRED', 'This booking is on request and needs the hotel to confirm. Please acknowledge to continue.', { offer: check.offer });
  }

  const now = ctx.now();
  const checkIn = so.rooms[0].nightly[0].date;
  const nights = so.rooms[0].nightly.length;
  const checkOut = new Date(Date.parse(`${checkIn}T00:00:00Z`) + nights * 86_400_000).toISOString().slice(0, 10);
  const freeUntil = freeCancellationUntil(so.cancellationPolicy, checkIn, AGENT_BUFFER_DAYS);
  const sell = priced.pricing.totals.sellMinor;

  // Payment path. Credit only if explicitly approved and sufficient; otherwise prepay.
  let method: 'prepay' | 'credit' = 'prepay';
  let status: BookingStatus;
  let paymentDueAt: Date;
  const credit = await creditPosition(ctx.db, agency);
  if (agency.payment_terms === 'credit' && credit.enabled && credit.currency === priced.pricing.sellCurrency && credit.availableMinor >= sell) {
    method = 'credit';
    status = 'submitting';
    paymentDueAt = new Date(`${checkIn}T00:00:00Z`);
  } else if (freeUntil && freeUntil.getTime() - now.getTime() > 24 * 3_600_000) {
    // Refundable: confirm now, payment due before the free-cancellation deadline.
    status = 'submitting';
    paymentDueAt = freeUntil;
  } else {
    // Non-refundable (or deadline imminent): no supplier commitment until payment is received.
    status = 'awaiting_payment';
    paymentDueAt = new Date(now.getTime() + 24 * 3_600_000);
  }

  const leadGuest = input.rooms.sort((a, b) => a.roomIndex - b.roomIndex)[0].guests[0];
  let bookingId: string;
  try {
    bookingId = await ctx.db.tx(async (q) => {
      const reference = await nextReference(q, 'HB');
      const b = await q.one<{ id: string }>(
        `INSERT INTO bookings (reference, agency_id, created_by, hotel_id, offer_id, source, contract_id, status, check_in, check_out, nights,
           currency, total_sell_minor, supplier_currency, supplier_cost_minor, supplier_cost_converted_minor, fx_rate_id, fx_rate_scaled,
           pricing, cancellation_policy, free_cancellation_until, payment_due_at, payment_method, idempotency_key,
           lead_guest_name, agent_reference, special_requests)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING id`,
        [reference, agency.id, actor.userId, so.hotelId, input.offerId, so.source, so.contractId, status, checkIn, checkOut, nights,
          priced.pricing.sellCurrency, sell, priced.pricing.supplierCurrency, priced.pricing.totals.supplierCostMinor,
          priced.pricing.totals.supplierCostConvertedMinor, priced.pricing.fx?.id ?? null, priced.pricing.fx?.rateScaled ?? null,
          JSON.stringify(priced), JSON.stringify(so.cancellationPolicy), freeUntil, paymentDueAt, method, input.idempotencyKey,
          `${leadGuest.first} ${leadGuest.last}`, input.agentReference ?? null, input.specialRequests ?? null]);
      for (const room of so.rooms) {
        const guests = input.rooms.find((r) => r.roomIndex === room.roomIndex)!.guests;
        await q.query(
          `INSERT INTO booking_rooms (booking_id, room_index, room_type_id, room_name, meal_plan, adults, children_ages, guests, sell_minor, supplier_cost_minor)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [b!.id, room.roomIndex, room.roomTypeId, room.roomName, so.mealPlan, room.adults, room.childrenAges, JSON.stringify(guests),
            priced.pricing.rooms[room.roomIndex].sellMinor, priced.pricing.rooms[room.roomIndex].supplierCostMinor]);
      }
      await q.query('INSERT INTO booking_events (booking_id, from_status, to_status, actor_user_id, note) VALUES ($1,NULL,$2,$3,$4)',
        [b!.id, status, actor.userId, status === 'awaiting_payment' ? 'Created. Awaiting payment before submission to the hotel.' : 'Created and submitted.']);
      await audit(q, { actorUserId: actor.userId, agencyId: agency.id, entityType: 'booking', entityId: b!.id, action: 'created', details: { reference, sell, currency: priced.pricing.sellCurrency } });
      return b!.id;
    });
  } catch (err: any) {
    if (err?.code === '23505' || /duplicate key/.test(String(err?.message))) {
      const dup = await ctx.db.one<{ id: string }>('SELECT id FROM bookings WHERE agency_id = $1 AND idempotency_key = $2', [agency.id, input.idempotencyKey]);
      if (dup) return { bookingId: dup.id, replayed: true };
    }
    throw err;
  }

  if (status === 'submitting') await submitToSupplier(ctx, bookingId, actor.userId);
  return { bookingId, replayed: false };
}

// ---------------------------------------------------------------- supplier submission

interface BookingRow {
  id: string; reference: string; agency_id: string; status: BookingStatus; source: string; currency: string; total_sell_minor: number;
  supplier_cost_minor: number; supplier_cost_converted_minor: number; supplier_currency: string; fx_rate_scaled: number | null;
  pricing: PricedOffer; cancellation_policy: CancellationPolicy; check_in: string; lead_guest_name: string; special_requests: string | null;
  supplier_reference: string | null; payment_due_at: Date | null; needs_reconciliation: boolean;
}

export async function loadBooking(q: Queryable, id: string): Promise<BookingRow> {
  const b = await q.one<BookingRow>('SELECT * FROM bookings WHERE id = $1', [id]);
  if (!b) throw notFound('Booking');
  return b;
}

export async function submitToSupplier(ctx: AppContext, bookingId: string, actorUserId: string | null) {
  const b = await loadBooking(ctx.db, bookingId);
  if (b.status !== 'submitting') return;
  const adapter = adapterFor(ctx, b.source);
  const rooms = await ctx.db.query<{ room_index: number; guests: { first: string; last: string }[] }>('SELECT room_index, guests FROM booking_rooms WHERE booking_id = $1', [bookingId]);
  let outcome: BookOutcome;
  try {
    outcome = await ctx.gateway.call(adapter, 'book', () => adapter.book({ db: ctx.db, q: ctx.db, now: ctx.now() }, {
      clientReference: b.reference, bookingId, offer: b.pricing.supplierOffer, leadGuestName: b.lead_guest_name,
      guests: rooms.map((r) => ({ roomIndex: r.room_index, names: r.guests })), specialRequests: b.special_requests,
    }), { bookingId, request: { clientReference: b.reference, source: b.source } });
  } catch (err) {
    const cls = err instanceof SupplierError ? err.errorClass : 'network';
    // Rejected / not configured: the supplier definitely did not book. Anything else: outcome unknown.
    outcome = cls === 'rejected' || cls === 'not_configured' || cls === 'circuit_open'
      ? { outcome: 'failed', reason: (err as Error).message }
      : { outcome: 'unknown', reason: (err as Error).message };
  }
  await applyBookOutcome(ctx, b, outcome, actorUserId);
}

async function applyBookOutcome(ctx: AppContext, b: BookingRow, outcome: BookOutcome, actorUserId: string | null) {
  switch (outcome.outcome) {
    case 'confirmed':
      await confirmBooking(ctx, b.id, { supplierReference: outcome.supplierReference, hotelConfirmationNumber: outcome.hotelConfirmationNumber ?? null, actorUserId, from: 'submitting' });
      return;
    case 'pending':
      await ctx.db.tx((q) => transition(q, b.id, 'submitting', 'pending_confirmation', {
        actorUserId, note: 'Awaiting hotel confirmation.', set: { supplier_reference: outcome.supplierReference, needs_reconciliation: false },
      }));
      return;
    case 'failed':
      await failBooking(ctx, b.id, 'submitting', outcome.reason, actorUserId);
      return;
    case 'unknown':
      log.warn('booking outcome unknown — reconciliation required', { bookingId: b.id, reference: b.reference, reason: outcome.reason });
      await ctx.db.query('UPDATE bookings SET needs_reconciliation = true, updated_at = now() WHERE id = $1', [b.id]);
      await ctx.db.query('INSERT INTO booking_events (booking_id, from_status, to_status, actor_user_id, note) VALUES ($1,$2,$2,$3,$4)',
        [b.id, 'submitting', actorUserId, `Supplier response not received (${outcome.reason}). Not retried; status will be reconciled.`]);
  }
}

export async function confirmBooking(ctx: AppContext, bookingId: string, o: { supplierReference?: string | null; hotelConfirmationNumber?: string | null; actorUserId: string | null; from: BookingStatus; note?: string }) {
  await ctx.db.tx(async (q) => {
    const row = await transition(q, bookingId, o.from, 'confirmed', {
      actorUserId: o.actorUserId, note: o.note ?? 'Confirmed.',
      set: {
        supplier_reference: o.supplierReference ?? null, hotel_confirmation_number: o.hotelConfirmationNumber ?? null,
        confirmed_at: new Date(), needs_reconciliation: false,
      },
    });
    // Keep an existing supplier reference if the caller didn't provide one.
    if (!o.supplierReference) await q.query('UPDATE bookings SET supplier_reference = COALESCE(supplier_reference, $2) WHERE id = $1', [bookingId, row.reference]);
    await postBookingConfirmed(q, row, o.actorUserId);
    await issueInvoice(q, row, row.total_sell_minor, 'invoice', row.payment_due_at);
  });
}

async function failBooking(ctx: AppContext, bookingId: string, from: BookingStatus, reason: string, actorUserId: string | null) {
  const adapter = ctx.registry.get((await loadBooking(ctx.db, bookingId)).source);
  await adapter?.release?.({ db: ctx.db, q: ctx.db, now: ctx.now() }, bookingId);
  await ctx.db.tx((q) => transition(q, bookingId, from, 'failed', { actorUserId, note: reason, set: { failure_reason: reason, needs_reconciliation: false } }));
  await settleRefundState(ctx, bookingId, actorUserId);
}

/** Resolve a booking whose supplier outcome is unknown by looking it up — never by re-booking. */
export async function reconcileBooking(ctx: AppContext, bookingId: string, actorUserId: string | null) {
  const b = await loadBooking(ctx.db, bookingId);
  if (!b.needs_reconciliation) return { changed: false, status: b.status };
  const adapter = adapterFor(ctx, b.source);
  if (!adapter.capabilities.retrieve) return { changed: false, status: b.status, message: 'Source cannot look up bookings — resolve manually with the supplier.' };
  let found: BookOutcome | null;
  try {
    found = await ctx.gateway.call(adapter, 'retrieve', () => adapter.retrieve({ db: ctx.db, q: ctx.db, now: ctx.now() }, b.reference), { bookingId, request: { clientReference: b.reference } });
  } catch (err) {
    return { changed: false, status: b.status, message: `Lookup failed: ${(err as Error).message}` };
  }
  if (!found) {
    await failBooking(ctx, bookingId, 'submitting', 'Supplier has no record of this booking after a timed-out request.', actorUserId);
  } else {
    await applyBookOutcome(ctx, b, found.outcome === 'unknown' ? { outcome: 'unknown', reason: 'still unknown' } : found, actorUserId);
  }
  const after = await loadBooking(ctx.db, bookingId);
  return { changed: after.status !== b.status || !after.needs_reconciliation, status: after.status };
}

export async function reconcileAll(ctx: AppContext) {
  const rows = await ctx.db.query<{ id: string }>(`SELECT id FROM bookings WHERE needs_reconciliation AND updated_at < now() - interval '30 seconds'`);
  for (const r of rows) await reconcileBooking(ctx, r.id, null).catch((e) => log.error('reconcile failed', { bookingId: r.id, error: e.message }));
  return rows.length;
}

// ---------------------------------------------------------------- hotel confirmation (request-to-book)

export async function resolvePendingConfirmation(ctx: AppContext, bookingId: string, actorUserId: string, decision: { confirm: true; hotelConfirmationNumber: string } | { confirm: false; reason: string }) {
  const b = await loadBooking(ctx.db, bookingId);
  if (b.status !== 'pending_confirmation') throw conflict('INVALID_STATE', 'Only bookings pending hotel confirmation can be confirmed or declined.');
  if (decision.confirm) {
    // An on-request contracted booking may draw allocation if any exists; never required.
    await confirmBooking(ctx, bookingId, { from: 'pending_confirmation', actorUserId, hotelConfirmationNumber: decision.hotelConfirmationNumber, supplierReference: b.supplier_reference, note: `Hotel confirmed (${decision.hotelConfirmationNumber}).` });
  } else {
    await failBooking(ctx, bookingId, 'pending_confirmation', `Hotel declined: ${decision.reason}`, actorUserId);
  }
  await audit(ctx.db, { actorUserId, agencyId: b.agency_id, entityType: 'booking', entityId: bookingId, action: decision.confirm ? 'hotel_confirmed' : 'hotel_declined' });
}

// ---------------------------------------------------------------- payments

/** Called after a payment is recorded. Releases awaiting-payment bookings to the supplier once fully paid. */
export async function onPaymentRecorded(ctx: AppContext, bookingId: string, actorUserId: string) {
  const b = await loadBooking(ctx.db, bookingId);
  const balance = await bookingBalance(ctx.db, bookingId);
  if (b.status === 'awaiting_payment' && -balance >= b.total_sell_minor) {
    await ctx.db.tx((q) => transition(q, bookingId, 'awaiting_payment', 'submitting', { actorUserId, note: 'Payment received in full. Submitting to the hotel.' }));
    await submitToSupplier(ctx, bookingId, actorUserId);
  }
  if (b.status === 'refund_pending' && balance >= 0) {
    await ctx.db.tx((q) => transition(q, bookingId, 'refund_pending', 'refunded', { actorUserId, note: 'Refund completed.' }));
  }
}

async function settleRefundState(ctx: AppContext, bookingId: string, actorUserId: string | null) {
  const b = await loadBooking(ctx.db, bookingId);
  const balance = await bookingBalance(ctx.db, bookingId);
  if ((b.status === 'cancelled' || b.status === 'failed') && balance < 0) {
    await ctx.db.tx((q) => transition(q, bookingId, b.status, 'refund_pending', { actorUserId, note: `Refund due to agency: ${-balance} minor units.` }));
  }
}

// ---------------------------------------------------------------- cancellation

export function cancellationQuote(b: BookingRow, now: Date) {
  if (!['confirmed', 'amendment_requested'].includes(b.status)) {
    return { penaltyMinor: 0, penaltyBps: 0, currency: b.currency, refundableMinor: b.total_sell_minor, note: 'Not yet confirmed by the hotel — no cancellation charge.' };
  }
  const { penaltyMinor, penaltyBps } = penaltyAt(b.cancellation_policy, b.check_in, now, b.total_sell_minor, AGENT_BUFFER_DAYS);
  return { penaltyMinor, penaltyBps, currency: b.currency, refundableMinor: b.total_sell_minor - penaltyMinor, note: null as string | null };
}

export async function cancelBooking(ctx: AppContext, bookingId: string, actor: Actor, acceptedPenaltyMinor: number, reason: string) {
  const b = await loadBooking(ctx.db, bookingId);
  const now = ctx.now();
  if (!['awaiting_payment', 'pending_confirmation', 'confirmed', 'amendment_requested'].includes(b.status)) {
    throw conflict('INVALID_STATE', 'This booking cannot be cancelled in its current state.');
  }
  if (diffDays(now.toISOString().slice(0, 10), b.check_in) < 0) throw conflict('STAY_STARTED', 'The stay has already started. Please contact support.');
  const quote = cancellationQuote(b, now);
  if (quote.penaltyMinor !== acceptedPenaltyMinor) {
    throw conflict('PENALTY_CHANGED', 'The cancellation charge has changed. Please review it before confirming.', quote);
  }
  const adapter = adapterFor(ctx, b.source);
  const note = `Cancelled by ${actor.isStaff ? 'HotelBridge' : 'agency'}: ${reason}`;

  if (b.status === 'awaiting_payment') {
    await ctx.db.tx((q) => transition(q, bookingId, 'awaiting_payment', 'cancelled', { actorUserId: actor.userId, note, set: { cancelled_at: now } }));
    await settleRefundState(ctx, bookingId, actor.userId);
    return loadBooking(ctx.db, bookingId);
  }

  // Ask the source to cancel (contracted releases allocation; third parties are called).
  let supplierOk = false;
  if (adapter.capabilities.cancel) {
    try {
      const res = await ctx.gateway.call(adapter, 'cancel', () => adapter.cancel({ db: ctx.db, q: ctx.db, now }, b.reference, b.supplier_reference), { bookingId, request: { clientReference: b.reference } });
      supplierOk = res.outcome === 'cancelled';
    } catch (err) {
      log.warn('supplier cancellation failed', { bookingId, error: (err as Error).message });
    }
  }
  if (!supplierOk) {
    // Do not pretend it's cancelled. Operations must complete it with the supplier.
    if (b.status === 'confirmed' || b.status === 'amendment_requested') {
      await ctx.db.tx((q) => transition(q, bookingId, b.status, 'cancellation_requested', { actorUserId: actor.userId, note: `${note} (supplier cancellation pending — operations will complete it)` }));
      return loadBooking(ctx.db, bookingId);
    }
    throw new AppError(503, 'SUPPLIER_UNAVAILABLE', 'The hotel source could not process the cancellation right now. Please try again or contact support.');
  }

  await finaliseCancellation(ctx, b, actor.userId, quote.penaltyMinor, note);
  return loadBooking(ctx.db, bookingId);
}

/** Post cancellation accounting: reverse the sale, then book the cancellation fee (if any). */
async function finaliseCancellation(ctx: AppContext, b: BookingRow, actorUserId: string | null, agentPenaltyMinor: number, note: string) {
  const now = ctx.now();
  await ctx.db.tx(async (q) => {
    await transition(q, b.id, b.status, 'cancelled', { actorUserId, note, set: { cancelled_at: now } });
    const sale = await q.one<{ journal_id: string }>(`SELECT journal_id FROM ledger_entries WHERE booking_id = $1 AND kind = 'booking_confirmed' LIMIT 1`, [b.id]);
    if (sale) {
      await reverseJournal(q, sale.journal_id, 'Booking cancelled — sale reversed', actorUserId);
      // Supplier penalty under the supplier's own policy (no agent buffer), at the booking's recorded FX.
      const supplierPenalty = penaltyAt(b.cancellation_policy, b.check_in, now, b.supplier_cost_minor, 0).penaltyMinor;
      const supplierPenaltyConv = b.supplier_currency === b.currency ? supplierPenalty : convert(supplierPenalty, b.supplier_currency, b.currency, b.fx_rate_scaled!);
      await postJournal(q, {
        bookingId: b.id, agencyId: b.agency_id, kind: 'cancellation_fee', memo: 'Cancellation charges', createdBy: actorUserId,
        lines: [
          { account: 'agent_receivable', amountMinor: agentPenaltyMinor, currency: b.currency },
          { account: 'supplier_payable', amountMinor: -supplierPenaltyConv, currency: b.currency },
          { account: 'net_revenue', amountMinor: -(agentPenaltyMinor - supplierPenaltyConv), currency: b.currency },
        ],
      });
      const credit = b.total_sell_minor - agentPenaltyMinor;
      if (credit > 0) await issueInvoice(q, b, -credit, 'credit_note', null);
    }
    await audit(q, { actorUserId, agencyId: b.agency_id, entityType: 'booking', entityId: b.id, action: 'cancelled', details: { agentPenaltyMinor } });
  });
  await settleRefundState(ctx, b.id, actorUserId);
}

/** Operations completes a cancellation the supplier could not process automatically. */
export async function completeCancellationRequest(ctx: AppContext, bookingId: string, actorUserId: string, approve: boolean, note: string) {
  const b = await loadBooking(ctx.db, bookingId);
  if (b.status !== 'cancellation_requested') throw conflict('INVALID_STATE', 'No cancellation request is open on this booking.');
  if (!approve) {
    await ctx.db.tx((q) => transition(q, bookingId, 'cancellation_requested', 'confirmed', { actorUserId, note: `Cancellation not completed: ${note}` }));
    return;
  }
  const requestedAt = await ctx.db.one<{ at: Date }>(`SELECT at FROM booking_events WHERE booking_id = $1 AND to_status = 'cancellation_requested' ORDER BY at DESC LIMIT 1`, [bookingId]);
  // The agent's charge is fixed at the moment they requested, not when ops got to it.
  const at = requestedAt ? new Date(requestedAt.at) : ctx.now();
  const penalty = penaltyAt(b.cancellation_policy, b.check_in, at, b.total_sell_minor, AGENT_BUFFER_DAYS).penaltyMinor;
  await finaliseCancellation(ctx, b, actorUserId, penalty, `Cancellation completed by operations: ${note}`);
}

export async function requestAmendment(ctx: AppContext, bookingId: string, actor: Actor, details: string) {
  const b = await loadBooking(ctx.db, bookingId);
  if (b.status !== 'confirmed') throw conflict('INVALID_STATE', 'Amendments can be requested on confirmed bookings only.');
  await ctx.db.tx((q) => transition(q, bookingId, 'confirmed', 'amendment_requested', { actorUserId: actor.userId, note: `Amendment requested: ${details}` }));
}

export async function resolveAmendment(ctx: AppContext, bookingId: string, actorUserId: string, note: string) {
  await ctx.db.tx((q) => transition(q, bookingId, 'amendment_requested', 'confirmed', { actorUserId, note: `Amendment resolved: ${note}` }));
}

export { applyBps };
