import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { agencyIdOf, h, parse, user } from '../../lib/http.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { audit } from '../../lib/audit.js';
import { nextReference } from '../../lib/refs.js';
import { requireActiveAgency, requireRole } from '../auth/middleware.js';
import { hashPassword, passwordProblem } from '../auth/passwords.js';
import { runSearch, searchSchema } from '../search/service.js';
import { hotelDetailView, loadHotelCards, hotelCardView } from '../catalogue/views.js';
import { agentOfferView, SOURCE_LABEL } from '../search/offers.js';
import {
  cancelBooking, cancellationQuote, createBooking, createBookingSchema, creditPosition, loadBooking, requestAmendment, revalidateOffer, type AgencyRow,
} from '../bookings/service.js';
import { agencyBooking, agentBookingView } from '../bookings/views.js';
import { renderVoucher } from '../bookings/voucher.js';
import { renderProposal } from '../groups/document.js';
import { agentEnquiryView, createEnquiry, enquirySchema, enquirySummary, loadEnquiry, respondToProposal } from '../groups/service.js';

export function agentRoutes(ctx: AppContext) {
  const r = Router();
  r.use(requireActiveAgency);

  const agencyOf = async (req: any): Promise<AgencyRow> => {
    const a = await ctx.db.one<AgencyRow>('SELECT * FROM agencies WHERE id = $1', [agencyIdOf(req)]);
    if (!a) throw notFound('Agency');
    return a;
  };
  const actorOf = (req: any) => ({ userId: user(req).id, agencyId: agencyIdOf(req), isStaff: false });

  // ------------------------------------------------------------ overview
  r.get('/overview', h(async (req, res) => {
    const id = agencyIdOf(req);
    const [upcoming, recent, pending, outstanding, quotes, searches, agency] = await Promise.all([
      ctx.db.query(`SELECT b.id, b.reference, b.status, b.check_in, b.check_out, b.currency, b.total_sell_minor, b.lead_guest_name, h.name AS hotel_name, h.city
                      FROM bookings b JOIN hotels h ON h.id = b.hotel_id
                     WHERE b.agency_id = $1 AND b.check_in >= current_date AND b.status IN ('confirmed','pending_confirmation','amendment_requested','awaiting_payment')
                     ORDER BY b.check_in LIMIT 6`, [id]),
      ctx.db.query(`SELECT b.id, b.reference, b.status, b.check_in, b.currency, b.total_sell_minor, h.name AS hotel_name, b.created_at
                      FROM bookings b JOIN hotels h ON h.id = b.hotel_id WHERE b.agency_id = $1 ORDER BY b.created_at DESC LIMIT 6`, [id]),
      ctx.db.one(`SELECT count(*)::int AS n FROM bookings WHERE agency_id = $1 AND status IN ('pending_confirmation','submitting','cancellation_requested','amendment_requested')`, [id]),
      ctx.db.query(`SELECT b.id, b.reference, b.currency, b.payment_due_at, s.balance AS outstanding_minor
                      FROM bookings b JOIN (SELECT booking_id, SUM(amount_minor) AS balance FROM ledger_entries WHERE account='agent_receivable' AND agency_id = $1 GROUP BY booking_id) s ON s.booking_id = b.id
                     WHERE b.agency_id = $1 AND s.balance > 0 ORDER BY b.payment_due_at NULLS LAST LIMIT 6`, [id]),
      ctx.db.query(`SELECT id, reference, title, status, quote_needed_by, updated_at FROM group_enquiries WHERE agency_id = $1 ORDER BY updated_at DESC LIMIT 5`, [id]),
      ctx.db.query(`SELECT destination, check_in, check_out, rooms, max(created_at) AS at FROM searches WHERE agency_id = $1 AND user_id = $2
                     GROUP BY destination, check_in, check_out, rooms ORDER BY at DESC LIMIT 5`, [id, user(req).id]),
      ctx.db.one<AgencyRow>('SELECT * FROM agencies WHERE id = $1', [id]),
    ]);
    const awaitingPayment = await ctx.db.query(`SELECT id, reference, currency, total_sell_minor AS outstanding_minor, payment_due_at FROM bookings WHERE agency_id = $1 AND status = 'awaiting_payment'`, [id]);
    res.json({ upcoming, recent, pendingCount: (pending as any).n, outstanding: [...awaitingPayment, ...outstanding], quotes, recentSearches: searches, credit: await creditPosition(ctx.db, agency!) });
  }));

  // ------------------------------------------------------------ catalogue & search
  r.get('/destinations', h(async (_req, res) => {
    res.json(await ctx.db.query(`SELECT city, country_code, count(*)::int AS hotels FROM hotels WHERE status = 'live' GROUP BY city, country_code ORDER BY city`));
  }));

  r.post('/search', rateLimit({ windowMs: 60_000, max: ctx.config.appEnv === 'test' ? 1000 : 30, key: (req) => `search:${req.user?.id}` }), h(async (req, res) => {
    const input = parse(searchSchema, req.body);
    res.json(await runSearch(ctx, await agencyOf(req), user(req).id, input));
  }));

  r.get('/hotels/:slug', h(async (req, res) => {
    const [hotel] = await loadHotelCards(ctx.db, { slug: req.params.slug, liveOnly: true });
    if (!hotel) throw notFound('Hotel');
    const saved = await ctx.db.one('SELECT 1 FROM saved_hotels WHERE user_id = $1 AND hotel_id = $2', [user(req).id, hotel.id]);
    res.json({ ...(await hotelDetailView(ctx.db, hotel)), saved: !!saved });
  }));

  r.get('/offers/:id', h(async (req, res) => {
    const o = await ctx.db.one<any>('SELECT id, payload, expires_at, hotel_id FROM offers WHERE id = $1 AND agency_id = $2', [req.params.id, agencyIdOf(req)]);
    if (!o) throw notFound('Offer');
    const [hotelRow] = await loadHotelCards(ctx.db, { id: o.hotel_id });
    res.json({
      offer: agentOfferView(o.id, o.expires_at, o.payload, SOURCE_LABEL[o.payload.supplierOffer.source] ?? o.payload.supplierOffer.source),
      hotel: hotelCardView(hotelRow), expired: new Date(o.expires_at) < ctx.now(),
      checkIn: o.payload.supplierOffer.rooms[0].nightly[0].date,
      nights: o.payload.supplierOffer.rooms[0].nightly.length,
    });
  }));

  r.post('/offers/:id/revalidate', h(async (req, res) => {
    const result = await revalidateOffer(ctx, await agencyOf(req), req.params.id);
    const { priced: _p, ...safe } = result as any;
    res.json(safe);
  }));

  // ------------------------------------------------------------ bookings
  r.post('/bookings', rateLimit({ windowMs: 60_000, max: ctx.config.appEnv === 'test' ? 1000 : 20, key: (req) => `book:${req.user?.id}` }), h(async (req, res) => {
    const input = parse(createBookingSchema, req.body);
    const { bookingId, replayed } = await createBooking(ctx, await agencyOf(req), actorOf(req), input);
    const b = await agencyBooking(ctx.db, agencyIdOf(req), bookingId);
    res.status(replayed ? 200 : 201).json({ replayed, booking: await agentBookingView(ctx.db, b) });
  }));

  r.get('/bookings', h(async (req, res) => {
    const q = parse(z.object({ status: z.string().optional(), search: z.string().max(80).optional(), page: z.coerce.number().int().min(1).default(1) }), req.query);
    const params: unknown[] = [agencyIdOf(req)];
    const where = ['b.agency_id = $1'];
    if (q.status) { params.push(q.status.split(',')); where.push(`b.status = ANY($${params.length}::text[])`); }
    if (q.search) { params.push(`%${q.search}%`); where.push(`(b.reference ILIKE $${params.length} OR b.lead_guest_name ILIKE $${params.length} OR b.agent_reference ILIKE $${params.length} OR h.name ILIKE $${params.length})`); }
    params.push((q.page - 1) * 25);
    const rows = await ctx.db.query(
      `SELECT b.id, b.reference, b.status, b.check_in, b.check_out, b.nights, b.currency, b.total_sell_minor, b.lead_guest_name, b.agent_reference,
              b.free_cancellation_until, b.payment_due_at, b.source = 'sandbox' AS is_sandbox, h.name AS hotel_name, h.city, b.created_at
         FROM bookings b JOIN hotels h ON h.id = b.hotel_id WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC LIMIT 25 OFFSET $${params.length}`, params);
    res.json({ bookings: rows, page: q.page });
  }));

  r.get('/bookings/:id', h(async (req, res) => {
    const b = await agencyBooking(ctx.db, agencyIdOf(req), req.params.id);
    res.json({ booking: await agentBookingView(ctx.db, b), cancellation: cancellationQuote(await loadBooking(ctx.db, b.id), ctx.now()) });
  }));

  r.get('/bookings/:id/voucher', h(async (req, res) => {
    const b = await agencyBooking(ctx.db, agencyIdOf(req), req.params.id);
    const view = await agentBookingView(ctx.db, b);
    if (!view.voucherAvailable) throw badRequest('A voucher is available once the booking is confirmed.');
    const agency = await ctx.db.one<{ name: string }>('SELECT name FROM agencies WHERE id = $1', [agencyIdOf(req)]);
    res.type('html').send(renderVoucher(view, agency!.name, ctx.config));
  }));

  r.post('/bookings/:id/cancel', h(async (req, res) => {
    const body = parse(z.object({ acceptedPenaltyMinor: z.number().int().min(0), reason: z.string().trim().min(2).max(300) }), req.body);
    const b = await agencyBooking(ctx.db, agencyIdOf(req), req.params.id);
    await cancelBooking(ctx, b.id, actorOf(req), body.acceptedPenaltyMinor, body.reason);
    res.json({ booking: await agentBookingView(ctx.db, await agencyBooking(ctx.db, agencyIdOf(req), b.id)) });
  }));

  r.post('/bookings/:id/amend', h(async (req, res) => {
    const body = parse(z.object({ details: z.string().trim().min(5).max(1000) }), req.body);
    const b = await agencyBooking(ctx.db, agencyIdOf(req), req.params.id);
    await requestAmendment(ctx, b.id, actorOf(req), body.details);
    res.json({ booking: await agentBookingView(ctx.db, await agencyBooking(ctx.db, agencyIdOf(req), b.id)) });
  }));

  // ------------------------------------------------------------ invoices & statement
  r.get('/finance', h(async (req, res) => {
    const id = agencyIdOf(req);
    const [invoices, payments, balances, agency] = await Promise.all([
      ctx.db.query(`SELECT i.number, i.kind, i.currency, i.amount_minor, i.issued_at, i.due_at, b.reference AS booking_reference, b.id AS booking_id
                      FROM invoices i LEFT JOIN bookings b ON b.id = i.booking_id WHERE i.agency_id = $1 ORDER BY i.issued_at DESC LIMIT 100`, [id]),
      ctx.db.query(`SELECT p.direction, p.method, p.amount_minor, p.currency, p.external_reference, p.received_at, b.reference AS booking_reference
                      FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id WHERE p.agency_id = $1 ORDER BY p.received_at DESC LIMIT 100`, [id]),
      ctx.db.query(`SELECT currency, SUM(amount_minor)::bigint AS balance_minor FROM ledger_entries WHERE agency_id = $1 AND account = 'agent_receivable' GROUP BY currency`, [id]),
      ctx.db.one<AgencyRow>('SELECT * FROM agencies WHERE id = $1', [id]),
    ]);
    res.json({ invoices, payments, balances, credit: await creditPosition(ctx.db, agency!), paymentInstructions: 'Bank transfer details are provided on each invoice by HotelBridge finance. Online card payment is not yet enabled.' });
  }));

  // ------------------------------------------------------------ saved hotels
  r.get('/saved', h(async (req, res) => {
    const rows = await ctx.db.query<{ hotel_id: string }>(`SELECT hotel_id FROM saved_hotels WHERE user_id = $1 ORDER BY created_at DESC`, [user(req).id]);
    const cards = await loadHotelCards(ctx.db, { liveOnly: true });
    res.json(rows.map((r) => cards.find((c) => c.id === r.hotel_id)).filter(Boolean).map((c) => hotelCardView(c!)));
  }));
  r.post('/saved/:hotelId', h(async (req, res) => {
    const hotel = await ctx.db.one(`SELECT id FROM hotels WHERE id = $1 AND status = 'live'`, [req.params.hotelId]);
    if (!hotel) throw notFound('Hotel');
    await ctx.db.query('INSERT INTO saved_hotels (agency_id, user_id, hotel_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [agencyIdOf(req), user(req).id, req.params.hotelId]);
    res.json({ saved: true });
  }));
  r.delete('/saved/:hotelId', h(async (req, res) => {
    await ctx.db.query('DELETE FROM saved_hotels WHERE user_id = $1 AND hotel_id = $2', [user(req).id, req.params.hotelId]);
    res.json({ saved: false });
  }));

  // ------------------------------------------------------------ group desk
  r.get('/groups', h(async (req, res) => {
    const rows = await ctx.db.query('SELECT * FROM group_enquiries WHERE agency_id = $1 ORDER BY created_at DESC LIMIT 100', [agencyIdOf(req)]);
    res.json(rows.map(enquirySummary));
  }));
  r.post('/groups', h(async (req, res) => {
    const input = parse(enquirySchema, req.body);
    res.status(201).json(await createEnquiry(ctx, agencyIdOf(req), user(req).id, input));
  }));
  r.get('/groups/:id', h(async (req, res) => {
    res.json(await agentEnquiryView(ctx.db, await loadEnquiry(ctx.db, req.params.id, agencyIdOf(req))));
  }));
  r.post('/groups/:id/messages', h(async (req, res) => {
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
    const e = await loadEnquiry(ctx.db, req.params.id, agencyIdOf(req));
    await ctx.db.query(`INSERT INTO group_messages (enquiry_id, author_user_id, visibility, body) VALUES ($1,$2,'agent',$3)`, [e.id, user(req).id, body]);
    await ctx.db.query('UPDATE group_enquiries SET updated_at = now() WHERE id = $1', [e.id]);
    res.status(201).json({ ok: true });
  }));
  r.get('/groups/proposals/:pid/document', h(async (req, res) => {
    const p = await ctx.db.one<any>(`SELECT p.* FROM group_proposals p JOIN group_enquiries e ON e.id = p.enquiry_id
                                     WHERE p.id = $1 AND e.agency_id = $2 AND p.status <> 'draft'`, [req.params.pid, agencyIdOf(req)]);
    if (!p) throw notFound('Proposal');
    const e = await loadEnquiry(ctx.db, p.enquiry_id, agencyIdOf(req));
    const a = await ctx.db.one<{ name: string }>('SELECT name FROM agencies WHERE id = $1', [agencyIdOf(req)]);
    res.type('html').send(renderProposal(e, p, a!.name, ctx.config));
  }));
  r.post('/groups/proposals/:pid/respond', h(async (req, res) => {
    const body = parse(z.object({ accept: z.boolean(), comment: z.string().trim().max(1000).optional() }), req.body);
    await respondToProposal(ctx, agencyIdOf(req), req.params.pid, user(req).id, body.accept, body.comment);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------ agency profile & users
  r.get('/agency', h(async (req, res) => {
    const a = await ctx.db.one<any>('SELECT * FROM agencies WHERE id = $1', [agencyIdOf(req)]);
    const users = await ctx.db.query(`SELECT id, name, email, role, status, last_login_at FROM users WHERE agency_id = $1 ORDER BY created_at`, [agencyIdOf(req)]);
    res.json({
      agency: {
        name: a.name, legalName: a.legal_name, countryCode: a.country_code, city: a.city, address: a.address, phone: a.phone, website: a.website,
        registrationNumber: a.registration_number, status: a.status, verifiedAt: a.verified_at, sellingCurrency: a.selling_currency, paymentTerms: a.payment_terms,
      },
      credit: await creditPosition(ctx.db, a),
      users,
    });
  }));
  r.patch('/agency', requireRole('agency_admin'), h(async (req, res) => {
    const b = parse(z.object({ phone: z.string().trim().min(5).max(40), address: z.string().trim().max(300).optional(), website: z.string().trim().max(200).optional() }), req.body);
    await ctx.db.query('UPDATE agencies SET phone = $2, address = $3, website = $4 WHERE id = $1', [agencyIdOf(req), b.phone, b.address ?? null, b.website ?? null]);
    await audit(ctx.db, { actorUserId: user(req).id, agencyId: agencyIdOf(req), entityType: 'agency', entityId: agencyIdOf(req), action: 'profile_updated' });
    res.json({ ok: true });
  }));
  r.post('/agency/users', requireRole('agency_admin'), h(async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), password: z.string(), role: z.enum(['agency_admin', 'agency_agent']) }), req.body);
    const problem = passwordProblem(b.password);
    if (problem) throw badRequest(problem);
    if (await ctx.db.one('SELECT 1 FROM users WHERE lower(email) = $1', [b.email])) throw badRequest('A user with this email already exists.');
    const u = await ctx.db.one<{ id: string }>('INSERT INTO users (agency_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [agencyIdOf(req), b.email, b.name, await hashPassword(b.password), b.role]);
    await audit(ctx.db, { actorUserId: user(req).id, agencyId: agencyIdOf(req), entityType: 'user', entityId: u!.id, action: 'created', details: { role: b.role } });
    res.status(201).json({ id: u!.id });
  }));
  r.patch('/agency/users/:id', requireRole('agency_admin'), h(async (req, res) => {
    const b = parse(z.object({ status: z.enum(['active', 'disabled']) }), req.body);
    if (req.params.id === user(req).id) throw forbidden('You cannot disable your own account.');
    const row = await ctx.db.one('UPDATE users SET status = $3 WHERE id = $1 AND agency_id = $2 RETURNING id', [req.params.id, agencyIdOf(req), b.status]);
    if (!row) throw notFound('User');
    if (b.status === 'disabled') await ctx.db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.params.id]);
    await audit(ctx.db, { actorUserId: user(req).id, agencyId: agencyIdOf(req), entityType: 'user', entityId: req.params.id, action: `status_${b.status}` });
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------ support
  r.get('/support', h(async (req, res) => {
    res.json(await ctx.db.query(`SELECT t.id, t.reference, t.subject, t.priority, t.status, t.updated_at, b.reference AS booking_reference
                                  FROM support_tickets t LEFT JOIN bookings b ON b.id = t.booking_id WHERE t.agency_id = $1 ORDER BY t.updated_at DESC`, [agencyIdOf(req)]));
  }));
  r.post('/support', h(async (req, res) => {
    const b = parse(z.object({ subject: z.string().trim().min(3).max(160), body: z.string().trim().min(5).max(5000), bookingId: z.string().uuid().optional(), priority: z.enum(['normal', 'urgent']).default('normal') }), req.body);
    if (b.bookingId) await agencyBooking(ctx.db, agencyIdOf(req), b.bookingId);
    const id = await ctx.db.tx(async (q) => {
      const reference = await nextReference(q, 'SUP');
      const t = await q.one<{ id: string }>('INSERT INTO support_tickets (reference, agency_id, user_id, booking_id, subject, priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [reference, agencyIdOf(req), user(req).id, b.bookingId ?? null, b.subject, b.priority]);
      await q.query('INSERT INTO support_messages (ticket_id, author_user_id, from_staff, body) VALUES ($1,$2,false,$3)', [t!.id, user(req).id, b.body]);
      return t!.id;
    });
    res.status(201).json({ id });
  }));
  r.get('/support/:id', h(async (req, res) => {
    const t = await ctx.db.one('SELECT * FROM support_tickets WHERE id = $1 AND agency_id = $2', [req.params.id, agencyIdOf(req)]);
    if (!t) throw notFound('Support request');
    const messages = await ctx.db.query(`SELECT m.body, m.from_staff, m.at, u.name AS author FROM support_messages m JOIN users u ON u.id = m.author_user_id WHERE m.ticket_id = $1 ORDER BY m.at`, [req.params.id]);
    res.json({ ticket: t, messages });
  }));
  r.post('/support/:id/messages', h(async (req, res) => {
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(5000) }), req.body);
    const t = await ctx.db.one('SELECT id FROM support_tickets WHERE id = $1 AND agency_id = $2', [req.params.id, agencyIdOf(req)]);
    if (!t) throw notFound('Support request');
    await ctx.db.query('INSERT INTO support_messages (ticket_id, author_user_id, from_staff, body) VALUES ($1,$2,false,$3)', [req.params.id, user(req).id, body]);
    await ctx.db.query(`UPDATE support_tickets SET status = 'open', updated_at = now() WHERE id = $1`, [req.params.id]);
    res.status(201).json({ ok: true });
  }));

  return r;
}
