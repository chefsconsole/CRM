import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { h, parse, user } from '../../lib/http.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { parseRate } from '../../lib/money.js';
import { isIsoDate } from '../../lib/dates.js';
import { COLLECTIONS, GROUP_STAGES } from '../../../../shared/domain.js';
import { requireStaff } from '../auth/middleware.js';
import { hashPassword, passwordProblem } from '../auth/passwords.js';
import {
  addRates, addRestriction, allocationSchema, changeContractStatus, contractSchema, createContract, importRateSheet, previewContract, previewSchema,
  rateSchema, removeRestriction, restrictionSchema, setAllocation, setRateStatus, updateContract,
} from '../contracts/service.js';
import {
  cancelBooking, cancellationQuote, completeCancellationRequest, loadBooking, onPaymentRecorded, reconcileBooking, resolveAmendment, resolvePendingConfirmation,
} from '../bookings/service.js';
import { adminBookingView } from '../bookings/views.js';
import { bookingBalance, postJournal } from '../finance/ledger.js';
import {
  adminEnquiryView, createProposal, draftHotelRequests, hotelRequestSchema, loadEnquiry, markHotelRequestSent, offerSchema, proposalSchema, recordOffer,
  sendProposal, setHotelRequestOutcome, setStage, enquirySummary,
} from '../groups/service.js';
import { renderProposal } from '../groups/document.js';
import { founderMetrics, operationalIssues } from '../intelligence/metrics.js';
import { runScenario, scenarioSchema } from '../intelligence/scenarios.js';
import { breakerState } from '../inventory/gateway.js';
import { SandboxAdapter, type SandboxFault } from '../inventory/adapters/sandbox.js';
import { compareOffers } from '../pricing/compare.js';
import { priceSupplierOffer } from '../search/offers.js';
import { validateStay } from '../search/service.js';

const date = z.string().refine(isIsoDate, 'Invalid date');
const hotelSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{3,80}$/, 'Use lowercase letters, numbers and hyphens'),
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(80),
  countryCode: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  address: z.string().trim().max(300).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  starRating: z.number().min(1).max(5).nullable().optional(),
  starRatingVerified: z.boolean().default(false),
  collections: z.array(z.enum(COLLECTIONS)).default([]),
  summary: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  facilities: z.array(z.string().trim().min(2).max(60)).max(40).default([]),
  contentVerified: z.boolean().default(false),
  transportNotes: z.string().trim().max(1000).optional(),
  checkInTime: z.string().trim().max(20).optional(),
  checkOutTime: z.string().trim().max(20).optional(),
  inclusionRationale: z.string().trim().max(2000).optional(),
  status: z.enum(['draft', 'live', 'paused']).default('draft'),
  partnerContactEmail: z.string().email().optional(),
});
const roomSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/), name: z.string().trim().min(2).max(120), description: z.string().max(1000).optional(),
  maxAdults: z.number().int().min(1).max(8), maxChildren: z.number().int().min(0).max(6), maxOccupancy: z.number().int().min(1).max(10),
  bedConfiguration: z.string().max(120).optional(), sizeSqm: z.number().int().min(5).max(500).nullable().optional(), status: z.enum(['active', 'inactive']).default('active'),
});

export function adminRoutes(ctx: AppContext) {
  const r = Router();
  r.use(requireStaff());
  const admin = requireStaff('hb_admin');
  const finance = requireStaff('hb_admin', 'hb_finance');
  const ops = requireStaff('hb_admin', 'hb_ops');
  const me = (req: any) => ({ id: user(req).id, role: user(req).role });

  // ------------------------------------------------------------ intelligence
  r.get('/overview', h(async (_req, res) => {
    const [metrics, issues] = await Promise.all([founderMetrics(ctx.db, ctx.now()), operationalIssues(ctx.db, ctx.now())]);
    res.json({ metrics, issues, environment: ctx.config.appEnv });
  }));
  r.post('/scenarios', h(async (req, res) => {
    try { res.json(runScenario(parse(scenarioSchema, req.body))); } catch (e) { if (e instanceof AppError) throw e; throw badRequest((e as Error).message); }
  }));
  r.get('/audit', h(async (req, res) => {
    const q = parse(z.object({ entityType: z.string().optional(), entityId: z.string().optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (q.entityType) { params.push(q.entityType); where.push(`a.entity_type = $${params.length}`); }
    if (q.entityId) { params.push(q.entityId); where.push(`a.entity_id = $${params.length}`); }
    res.json(await ctx.db.query(`SELECT a.*, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT 200`, params));
  }));

  // ------------------------------------------------------------ agencies
  r.get('/agencies', h(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    res.json(await ctx.db.query(
      `SELECT a.*, (SELECT count(*)::int FROM bookings b WHERE b.agency_id = a.id) AS bookings, (SELECT count(*)::int FROM users u WHERE u.agency_id = a.id) AS users
         FROM agencies a ${status ? 'WHERE a.status = $1' : ''} ORDER BY a.created_at DESC`, status ? [status] : []));
  }));
  r.get('/agencies/:id', h(async (req, res) => {
    const a = await ctx.db.one('SELECT * FROM agencies WHERE id = $1', [req.params.id]);
    if (!a) throw notFound('Agency');
    const [users, rules, balances] = await Promise.all([
      ctx.db.query('SELECT id, name, email, role, status, last_login_at FROM users WHERE agency_id = $1', [req.params.id]),
      ctx.db.query('SELECT * FROM pricing_rules WHERE agency_id = $1 ORDER BY created_at DESC', [req.params.id]),
      ctx.db.query(`SELECT currency, SUM(amount_minor)::bigint AS balance_minor FROM ledger_entries WHERE agency_id = $1 AND account = 'agent_receivable' GROUP BY currency`, [req.params.id]),
    ]);
    res.json({ agency: a, users, pricingRules: rules, balances });
  }));
  r.post('/agencies/:id/status', requireStaff('hb_admin', 'hb_ops'), h(async (req, res) => {
    const b = parse(z.object({ status: z.enum(['active', 'suspended', 'rejected']), note: z.string().trim().min(3).max(500) }), req.body);
    const row = await ctx.db.one(`UPDATE agencies SET status = $2, verified_at = CASE WHEN $2 = 'active' AND verified_at IS NULL THEN now() ELSE verified_at END,
                                  verified_by = CASE WHEN $2 = 'active' THEN $3::uuid ELSE verified_by END, notes = concat_ws(E'\n', notes, $4::text) WHERE id = $1 RETURNING id`,
      [req.params.id, b.status, user(req).id, `${new Date().toISOString().slice(0, 10)} ${b.status}: ${b.note}`]);
    if (!row) throw notFound('Agency');
    if (b.status !== 'active') await ctx.db.query('UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE agency_id = $1)', [req.params.id]);
    await audit(ctx.db, { actorUserId: user(req).id, agencyId: req.params.id, entityType: 'agency', entityId: req.params.id, action: `status_${b.status}`, details: { note: b.note } });
    res.json({ ok: true });
  }));
  r.post('/agencies/:id/credit', finance, h(async (req, res) => {
    const b = parse(z.object({ enabled: z.boolean(), limitMinor: z.number().int().min(0), paymentTerms: z.enum(['prepay', 'credit']), justification: z.string().trim().min(5).max(1000) }), req.body);
    if (b.enabled && b.limitMinor === 0) throw badRequest('Set a credit limit greater than zero, or disable credit.');
    if (b.paymentTerms === 'credit' && !b.enabled) throw badRequest('Credit payment terms require credit to be enabled.');
    await ctx.db.query(`UPDATE agencies SET credit_enabled = $2, credit_limit_minor = $3, payment_terms = $4, credit_approved_by = $5, credit_approved_at = now() WHERE id = $1`,
      [req.params.id, b.enabled, b.enabled ? b.limitMinor : 0, b.paymentTerms, user(req).id]);
    await audit(ctx.db, { actorUserId: user(req).id, agencyId: req.params.id, entityType: 'agency', entityId: req.params.id, action: 'credit_changed', details: b });
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------ pricing rules & FX
  r.get('/pricing-rules', h(async (_req, res) => {
    res.json(await ctx.db.query(`SELECT p.*, a.name AS agency_name FROM pricing_rules p LEFT JOIN agencies a ON a.id = p.agency_id ORDER BY p.active DESC, p.created_at DESC`));
  }));
  r.post('/pricing-rules', admin, h(async (req, res) => {
    const b = parse(z.object({
      agencyId: z.string().uuid().nullable().default(null), source: z.string().nullable().default(null),
      markupType: z.enum(['percent', 'fixed_per_room_night']), value: z.number().int().min(0), currency: z.string().length(3).nullable().default(null),
      rounding: z.enum(['none', 'up_to_unit']).default('none'),
    }), req.body);
    if (b.markupType === 'percent' && b.value > 5000) throw badRequest('Percentage markups above 50% are not allowed.');
    if (b.markupType === 'fixed_per_room_night' && !b.currency) throw badRequest('Fixed markups need a currency.');
    const row = await ctx.db.tx(async (q) => {
      // One active rule per scope: the new rule supersedes the old one.
      await q.query(`UPDATE pricing_rules SET active = false WHERE active AND agency_id IS NOT DISTINCT FROM $1 AND source IS NOT DISTINCT FROM $2`, [b.agencyId, b.source]);
      return q.one<{ id: string }>(`INSERT INTO pricing_rules (agency_id, source, markup_type, value, currency, rounding, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [b.agencyId, b.source, b.markupType, b.value, b.currency, b.rounding, user(req).id]);
    });
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'pricing_rule', entityId: row!.id, action: 'created', details: b });
    res.status(201).json(row);
  }));
  r.post('/pricing-rules/:id/deactivate', admin, h(async (req, res) => {
    await ctx.db.query('UPDATE pricing_rules SET active = false WHERE id = $1', [req.params.id]);
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'pricing_rule', entityId: req.params.id, action: 'deactivated' });
    res.json({ ok: true });
  }));
  r.get('/fx', h(async (_req, res) => {
    res.json(await ctx.db.query(`SELECT DISTINCT ON (base, quote) * FROM fx_rates ORDER BY base, quote, as_of DESC`));
  }));
  r.post('/fx', finance, h(async (req, res) => {
    const b = parse(z.object({ base: z.string().length(3), quote: z.string().length(3), rate: z.string(), source: z.string().trim().min(2).max(120), asOf: z.string().datetime() }), req.body);
    if (b.base === b.quote) throw badRequest('Base and quote currencies must differ.');
    let scaled: number;
    try { scaled = parseRate(b.rate); } catch (e) { throw badRequest((e as Error).message); }
    if (new Date(b.asOf) > ctx.now()) throw badRequest('A rate cannot be recorded for the future.');
    const row = await ctx.db.one('INSERT INTO fx_rates (base, quote, rate_scaled, source, as_of, recorded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [b.base.toUpperCase(), b.quote.toUpperCase(), scaled, b.source, b.asOf, user(req).id]);
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'fx_rate', entityId: row.id, action: 'recorded', details: b });
    res.status(201).json(row);
  }));

  // ------------------------------------------------------------ hotels
  r.get('/hotels', h(async (_req, res) => {
    res.json(await ctx.db.query(`SELECT h.id, h.slug, h.name, h.city, h.country_code, h.status, h.star_rating, h.star_rating_verified, h.is_sample, h.collections,
        (SELECT count(*)::int FROM contracts c WHERE c.hotel_id = h.id AND c.status = 'active') AS active_contracts,
        (SELECT count(*)::int FROM room_types r WHERE r.hotel_id = h.id) AS room_types,
        (SELECT count(*)::int FROM hotel_images i WHERE i.hotel_id = h.id) AS images
      FROM hotels h ORDER BY h.city, h.name`));
  }));
  r.post('/hotels', ops, h(async (req, res) => {
    const b = parse(hotelSchema, req.body);
    if (await ctx.db.one('SELECT 1 FROM hotels WHERE slug = $1', [b.slug])) throw conflict('DUPLICATE_SLUG', 'That URL name is already in use.');
    const row = await ctx.db.one<{ id: string }>(
      `INSERT INTO hotels (slug, name, city, country_code, address, latitude, longitude, star_rating, star_rating_verified, collections, summary, description,
         facilities, content_verified, transport_notes, check_in_time, check_out_time, inclusion_rationale, status, partner_contact_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`, hotelParams(b));
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'hotel', entityId: row!.id, action: 'created' });
    res.status(201).json(row);
  }));
  r.get('/hotels/:id', h(async (req, res) => {
    const hotel = await ctx.db.one('SELECT * FROM hotels WHERE id = $1', [req.params.id]);
    if (!hotel) throw notFound('Hotel');
    const [rooms, images, contracts, mappings, partners] = await Promise.all([
      ctx.db.query('SELECT * FROM room_types WHERE hotel_id = $1 ORDER BY max_occupancy, name', [req.params.id]),
      ctx.db.query('SELECT * FROM hotel_images WHERE hotel_id = $1 ORDER BY sort_order', [req.params.id]),
      ctx.db.query('SELECT id, reference, status, rate_model, currency, valid_from, valid_to, booking_mode, version FROM contracts WHERE hotel_id = $1 ORDER BY valid_from DESC', [req.params.id]),
      ctx.db.query('SELECT * FROM source_mappings WHERE hotel_id = $1', [req.params.id]),
      ctx.db.query(`SELECT id, name, email, status FROM users WHERE hotel_id = $1`, [req.params.id]),
    ]);
    res.json({ hotel, rooms, images, contracts, mappings, partnerUsers: partners });
  }));
  r.put('/hotels/:id', ops, h(async (req, res) => {
    const b = parse(hotelSchema, req.body);
    if (b.status === 'live') {
      const rooms = await ctx.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM room_types WHERE hotel_id = $1 AND status = 'active'`, [req.params.id]);
      if (!rooms!.n) throw badRequest('Add at least one room type before making the hotel live.');
    }
    const row = await ctx.db.one(
      `UPDATE hotels SET slug=$1, name=$2, city=$3, country_code=$4, address=$5, latitude=$6, longitude=$7, star_rating=$8, star_rating_verified=$9, collections=$10,
         summary=$11, description=$12, facilities=$13, content_verified=$14, transport_notes=$15, check_in_time=$16, check_out_time=$17, inclusion_rationale=$18,
         status=$19, partner_contact_email=$20, updated_at = now() WHERE id = $21 RETURNING id`, [...hotelParams(b), req.params.id]);
    if (!row) throw notFound('Hotel');
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'hotel', entityId: req.params.id, action: 'updated', details: { status: b.status } });
    res.json({ ok: true });
  }));
  r.post('/hotels/:id/rooms', ops, h(async (req, res) => {
    const b = parse(roomSchema, req.body);
    if (b.maxAdults > b.maxOccupancy) throw badRequest('Maximum adults cannot exceed maximum occupancy.');
    const row = await ctx.db.one(`INSERT INTO room_types (hotel_id, code, name, description, max_adults, max_children, max_occupancy, bed_configuration, size_sqm, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.params.id, b.code.toUpperCase(), b.name, b.description ?? null, b.maxAdults, b.maxChildren, b.maxOccupancy, b.bedConfiguration ?? null, b.sizeSqm ?? null, b.status]).catch((e) => {
      if (/duplicate/.test(e.message)) throw conflict('DUPLICATE_CODE', 'That room code already exists for this hotel.');
      throw e;
    });
    res.status(201).json(row);
  }));
  r.put('/rooms/:id', ops, h(async (req, res) => {
    const b = parse(roomSchema, req.body);
    await ctx.db.query(`UPDATE room_types SET code=$2, name=$3, description=$4, max_adults=$5, max_children=$6, max_occupancy=$7, bed_configuration=$8, size_sqm=$9, status=$10 WHERE id = $1`,
      [req.params.id, b.code.toUpperCase(), b.name, b.description ?? null, b.maxAdults, b.maxChildren, b.maxOccupancy, b.bedConfiguration ?? null, b.sizeSqm ?? null, b.status]);
    res.json({ ok: true });
  }));
  r.post('/hotels/:id/images', ops, h(async (req, res) => {
    // Every image requires its owner/credit and the licence or written permission under which we may use it.
    const b = parse(z.object({ url: z.string().url().startsWith('https://'), caption: z.string().max(200).optional(), credit: z.string().trim().min(2).max(200), license: z.string().trim().min(2).max(300) }), req.body);
    const n = await ctx.db.one<{ n: number }>('SELECT count(*)::int AS n FROM hotel_images WHERE hotel_id = $1', [req.params.id]);
    const row = await ctx.db.one('INSERT INTO hotel_images (hotel_id, url, caption, credit, license, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [req.params.id, b.url, b.caption ?? null, b.credit, b.license, n!.n]);
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'hotel', entityId: req.params.id, action: 'image_added', details: { credit: b.credit, license: b.license } });
    res.status(201).json(row);
  }));
  r.delete('/images/:id', ops, h(async (req, res) => { await ctx.db.query('DELETE FROM hotel_images WHERE id = $1', [req.params.id]); res.json({ ok: true }); }));
  r.post('/hotels/:id/mappings', admin, h(async (req, res) => {
    const b = parse(z.object({ source: z.string().min(2).max(40), externalId: z.string().min(1).max(120), roomTypeId: z.string().uuid().nullable().default(null) }), req.body);
    if (!ctx.registry.get(b.source)) throw badRequest('Unknown inventory source.');
    await ctx.db.query('INSERT INTO source_mappings (hotel_id, room_type_id, source, external_id) VALUES ($1,$2,$3,$4)', [req.params.id, b.roomTypeId, b.source, b.externalId]);
    res.status(201).json({ ok: true });
  }));
  r.post('/hotels/:id/partner-users', admin, h(async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(), password: z.string() }), req.body);
    const problem = passwordProblem(b.password);
    if (problem) throw badRequest(problem);
    if (await ctx.db.one('SELECT 1 FROM users WHERE lower(email) = $1', [b.email])) throw conflict('EMAIL_IN_USE', 'A user with this email already exists.');
    const u = await ctx.db.one(`INSERT INTO users (hotel_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,'hotel_partner') RETURNING id`, [req.params.id, b.email, b.name, await hashPassword(b.password)]);
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'user', entityId: u.id, action: 'partner_user_created', details: { hotelId: req.params.id } });
    res.status(201).json(u);
  }));

  // ------------------------------------------------------------ contracts
  r.get('/contracts', h(async (_req, res) => {
    res.json(await ctx.db.query(`SELECT c.id, c.reference, c.status, c.rate_model, c.currency, c.valid_from, c.valid_to, c.booking_mode, c.version, c.updated_at,
        h.name AS hotel_name, h.city, (SELECT count(*)::int FROM rates r WHERE r.contract_id = c.id AND r.status = 'active') AS active_rates
      FROM contracts c JOIN hotels h ON h.id = c.hotel_id ORDER BY c.updated_at DESC`));
  }));
  r.post('/contracts', ops, h(async (req, res) => {
    res.status(201).json({ id: await createContract(ctx, user(req).id, parse(contractSchema, req.body)) });
  }));
  r.get('/contracts/:id', h(async (req, res) => {
    const c = await ctx.db.one<any>('SELECT c.*, h.name AS hotel_name FROM contracts c JOIN hotels h ON h.id = c.hotel_id WHERE c.id = $1', [req.params.id]);
    if (!c) throw notFound('Contract');
    const [rates, restrictions, versions, rooms, allocation] = await Promise.all([
      ctx.db.query(`SELECT r.*, rt.name AS room_name, rt.code AS room_code FROM rates r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.contract_id = $1 ORDER BY r.status, rt.name, r.meal_plan, r.adults, r.date_from`, [req.params.id]),
      ctx.db.query(`SELECT x.*, rt.name AS room_name FROM restrictions x LEFT JOIN room_types rt ON rt.id = x.room_type_id WHERE x.contract_id = $1 ORDER BY x.date_from`, [req.params.id]),
      ctx.db.query(`SELECT v.version, v.change_note, v.changed_at, u.name AS changed_by FROM contract_versions v LEFT JOIN users u ON u.id = v.changed_by WHERE v.contract_id = $1 ORDER BY v.version DESC, v.id DESC`, [req.params.id]),
      ctx.db.query(`SELECT id, code, name, max_adults FROM room_types WHERE hotel_id = $1 AND status = 'active' ORDER BY name`, [c.hotel_id]),
      ctx.db.query(`SELECT a.room_type_id, rt.name AS room_name, min(a.stay_date) AS from_date, max(a.stay_date) AS to_date, sum(a.allotted)::int AS allotted, sum(a.sold)::int AS sold
                      FROM allocations a JOIN room_types rt ON rt.id = a.room_type_id WHERE a.contract_id = $1 AND a.stay_date >= current_date GROUP BY a.room_type_id, rt.name`, [req.params.id]),
    ]);
    res.json({ contract: c, rates, restrictions, versions, rooms, allocation });
  }));
  r.put('/contracts/:id', ops, h(async (req, res) => {
    const b = parse(contractSchema.extend({ changeNote: z.string().trim().min(3).max(300) }), req.body);
    await updateContract(ctx, me(req), req.params.id, b, b.changeNote);
    res.json({ ok: true });
  }));
  r.post('/contracts/:id/status', ops, h(async (req, res) => {
    const { action } = parse(z.object({ action: z.enum(['submit', 'approve', 'suspend', 'reactivate']) }), req.body);
    await changeContractStatus(ctx, me(req), req.params.id, action);
    res.json({ ok: true });
  }));
  r.post('/contracts/:id/rates', ops, h(async (req, res) => {
    const b = parse(z.object({ rates: z.array(rateSchema).min(1).max(500), note: z.string().max(300).default('') }), req.body);
    await addRates(ctx, me(req), req.params.id, b.rates, b.note);
    res.status(201).json({ ok: true });
  }));
  r.post('/contracts/:id/rate-sheet', ops, h(async (req, res) => {
    const { csv } = parse(z.object({ csv: z.string().min(10).max(500_000) }), req.body);
    res.status(201).json(await importRateSheet(ctx, me(req), req.params.id, csv));
  }));
  r.patch('/rates/:id', ops, h(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['active', 'inactive']) }), req.body);
    await setRateStatus(ctx, me(req), req.params.id, status);
    res.json({ ok: true });
  }));
  r.post('/contracts/:id/restrictions', ops, h(async (req, res) => {
    await addRestriction(ctx, me(req), req.params.id, parse(restrictionSchema, req.body));
    res.status(201).json({ ok: true });
  }));
  r.delete('/restrictions/:id', ops, h(async (req, res) => { await removeRestriction(ctx, me(req), req.params.id); res.json({ ok: true }); }));
  r.post('/contracts/:id/allocations', ops, h(async (req, res) => {
    await setAllocation(ctx, user(req).id, req.params.id, parse(allocationSchema, req.body));
    res.status(201).json({ ok: true });
  }));
  r.post('/contracts/:id/preview', h(async (req, res) => {
    res.json(await previewContract(ctx, req.params.id, parse(previewSchema, req.body)));
  }));

  // ------------------------------------------------------------ rate comparison across sources
  r.post('/rate-comparison', h(async (req, res) => {
    const b = parse(z.object({ hotelId: z.string().uuid(), checkIn: date, checkOut: date, rooms: previewSchema.shape.rooms, sellingCurrency: z.string().length(3).default('EUR') }), req.body);
    validateStay({ destination: 'x', ...b, rooms: b.rooms.map((x) => ({ ...x, childrenAges: x.childrenAges ?? [] })) } as any, ctx.now());
    const hotel = await ctx.db.one<{ city: string }>('SELECT city FROM hotels WHERE id = $1', [b.hotelId]);
    if (!hotel) throw notFound('Hotel');
    const query = { agencyId: 'admin', city: hotel.city, hotelIds: [b.hotelId], checkIn: b.checkIn, checkOut: b.checkOut, rooms: b.rooms };
    const pseudoAgency = { id: '00000000-0000-0000-0000-000000000000', selling_currency: b.sellingCurrency };
    const offers: any[] = [];
    const errors: any[] = [];
    for (const a of ctx.registry.searchable()) {
      try {
        const res2 = await ctx.gateway.call(a, 'search', () => a.search({ db: ctx.db, q: ctx.db, now: ctx.now() }, query), { request: query });
        for (const o of res2) offers.push({ offer: o, priced: await priceSupplierOffer(ctx.db, pseudoAgency, o, ctx.now()) });
      } catch (e) { errors.push({ source: a.code, message: (e as Error).message }); }
    }
    // Rooms are equivalent only when both map to the same catalogue room type (via source_mappings for third parties).
    const equivalent = (x: string | null, y: string | null) => x !== null && x === y;
    const pairs = [];
    for (let i = 0; i < offers.length; i++) for (let j = i + 1; j < offers.length; j++) {
      if (offers[i].offer.source === offers[j].offer.source) continue;
      pairs.push({ a: i, b: j, ...compareOffers(offers[i].offer, offers[j].offer, equivalent) });
    }
    res.json({
      offers: offers.map((o, i) => ({ index: i, source: o.offer.source, mealPlan: o.offer.mealPlan, rooms: o.offer.rooms.map((r: any) => r.roomName), availability: o.offer.availability, currency: o.priced.pricing.sellCurrency, supplierCostMinor: o.priced.pricing.totals.supplierCostConvertedMinor, sellMinor: o.priced.pricing.totals.sellMinor })),
      comparisons: pairs, errors,
      note: 'Offers are only treated as equivalent when room, occupancy, dates, board, cancellation, taxes and confirmation type all match.',
    });
  }));

  // ------------------------------------------------------------ bookings (operations)
  r.get('/bookings', h(async (req, res) => {
    const q = parse(z.object({ status: z.string().optional(), search: z.string().max(80).optional(), attention: z.coerce.boolean().optional() }), req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (q.status) { params.push(q.status.split(',')); where.push(`b.status = ANY($${params.length}::text[])`); }
    if (q.attention) where.push(`(b.needs_reconciliation OR b.status IN ('pending_confirmation','cancellation_requested','amendment_requested','refund_pending','awaiting_payment'))`);
    if (q.search) { params.push(`%${q.search}%`); where.push(`(b.reference ILIKE $${params.length} OR b.lead_guest_name ILIKE $${params.length} OR h.name ILIKE $${params.length} OR a.name ILIKE $${params.length})`); }
    res.json(await ctx.db.query(
      `SELECT b.id, b.reference, b.status, b.needs_reconciliation, b.source, b.check_in, b.check_out, b.currency, b.total_sell_minor,
              b.supplier_cost_converted_minor, (b.total_sell_minor - b.supplier_cost_converted_minor) AS gross_profit_minor, b.lead_guest_name,
              h.name AS hotel_name, a.name AS agency_name, b.created_at
         FROM bookings b JOIN hotels h ON h.id = b.hotel_id JOIN agencies a ON a.id = b.agency_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.created_at DESC LIMIT 200`, params));
  }));
  r.get('/bookings/:id', h(async (req, res) => {
    const b = await ctx.db.one('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!b) throw notFound('Booking');
    res.json({ booking: await adminBookingView(ctx.db, b), cancellation: cancellationQuote(await loadBooking(ctx.db, b.id), ctx.now()) });
  }));
  r.post('/bookings/:id/confirm', ops, h(async (req, res) => {
    const { hotelConfirmationNumber } = parse(z.object({ hotelConfirmationNumber: z.string().trim().min(2).max(80) }), req.body);
    await resolvePendingConfirmation(ctx, req.params.id, user(req).id, { confirm: true, hotelConfirmationNumber });
    res.json({ ok: true });
  }));
  r.post('/bookings/:id/decline', ops, h(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    await resolvePendingConfirmation(ctx, req.params.id, user(req).id, { confirm: false, reason });
    res.json({ ok: true });
  }));
  r.post('/bookings/:id/reconcile', ops, h(async (req, res) => { res.json(await reconcileBooking(ctx, req.params.id, user(req).id)); }));
  r.post('/bookings/:id/amendment/resolve', ops, h(async (req, res) => {
    const { note } = parse(z.object({ note: z.string().trim().min(3).max(1000) }), req.body);
    await resolveAmendment(ctx, req.params.id, user(req).id, note);
    res.json({ ok: true });
  }));
  r.post('/bookings/:id/cancellation/complete', ops, h(async (req, res) => {
    const b = parse(z.object({ approve: z.boolean(), note: z.string().trim().min(3).max(500) }), req.body);
    await completeCancellationRequest(ctx, req.params.id, user(req).id, b.approve, b.note);
    res.json({ ok: true });
  }));
  r.post('/bookings/:id/cancel', ops, h(async (req, res) => {
    const b = parse(z.object({ acceptedPenaltyMinor: z.number().int().min(0), reason: z.string().trim().min(3).max(300) }), req.body);
    await cancelBooking(ctx, req.params.id, { userId: user(req).id, agencyId: null, isStaff: true }, b.acceptedPenaltyMinor, b.reason);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------ finance
  r.get('/finance', h(async (_req, res) => {
    const [receivables, payables, journals, payments] = await Promise.all([
      ctx.db.query(`SELECT a.id, a.name, l.currency, SUM(l.amount_minor)::bigint AS balance_minor FROM ledger_entries l JOIN agencies a ON a.id = l.agency_id
                     WHERE l.account = 'agent_receivable' GROUP BY a.id, a.name, l.currency HAVING SUM(l.amount_minor) <> 0 ORDER BY balance_minor DESC`),
      ctx.db.query(`SELECT h.name, l.currency, -SUM(l.amount_minor)::bigint AS payable_minor FROM ledger_entries l JOIN bookings b ON b.id = l.booking_id JOIN hotels h ON h.id = b.hotel_id
                     WHERE l.account = 'supplier_payable' GROUP BY h.name, l.currency HAVING SUM(l.amount_minor) <> 0 ORDER BY payable_minor DESC`),
      ctx.db.query(`SELECT l.journal_id, l.kind, l.memo, l.currency, l.created_at, b.reference,
                           json_agg(json_build_object('account', l.account, 'amountMinor', l.amount_minor) ORDER BY l.id) AS lines
                      FROM ledger_entries l LEFT JOIN bookings b ON b.id = l.booking_id GROUP BY l.journal_id, l.kind, l.memo, l.currency, l.created_at, b.reference
                     ORDER BY l.created_at DESC LIMIT 50`),
      ctx.db.query(`SELECT p.*, a.name AS agency_name, b.reference FROM payments p JOIN agencies a ON a.id = p.agency_id LEFT JOIN bookings b ON b.id = p.booking_id ORDER BY p.created_at DESC LIMIT 50`),
    ]);
    res.json({ receivables, payables, journals, payments, paymentProvider: { configured: false, note: 'No payment provider is connected. Payments are recorded manually from bank statements.' } });
  }));
  r.post('/payments', finance, h(async (req, res) => {
    const b = parse(z.object({
      bookingId: z.string().uuid(), direction: z.enum(['received', 'refunded']), method: z.enum(['bank_transfer', 'payment_provider', 'credit_account', 'other']),
      amountMinor: z.number().int().positive(), currency: z.string().length(3), externalReference: z.string().trim().min(2).max(120), receivedAt: z.string().datetime(),
    }), req.body);
    const booking = await loadBooking(ctx.db, b.bookingId);
    if (booking.currency !== b.currency) throw badRequest(`This booking is invoiced in ${booking.currency}. Record the amount in that currency.`);
    if (new Date(b.receivedAt) > ctx.now()) throw badRequest('Payment date cannot be in the future.');
    const balance = await bookingBalance(ctx.db, b.bookingId);
    if (b.direction === 'refunded' && b.amountMinor > -balance) throw badRequest('Refund exceeds the amount owed to the agency.');
    await ctx.db.tx(async (q) => {
      const p = await q.one<{ id: string }>(`INSERT INTO payments (agency_id, booking_id, direction, method, amount_minor, currency, external_reference, received_at, recorded_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [booking.agency_id, b.bookingId, b.direction, b.method, b.amountMinor, b.currency, b.externalReference, b.receivedAt, user(req).id]);
      const sign = b.direction === 'received' ? 1 : -1;
      await postJournal(q, {
        bookingId: b.bookingId, agencyId: booking.agency_id, kind: b.direction === 'received' ? 'payment' : 'refund', createdBy: user(req).id,
        memo: `${b.method} ${b.externalReference}`,
        lines: [
          { account: 'cash', amountMinor: sign * b.amountMinor, currency: b.currency },
          { account: 'agent_receivable', amountMinor: -sign * b.amountMinor, currency: b.currency },
        ],
      });
      await audit(q, { actorUserId: user(req).id, agencyId: booking.agency_id, entityType: 'payment', entityId: p!.id, action: b.direction, details: { amountMinor: b.amountMinor, currency: b.currency } });
    });
    await onPaymentRecorded(ctx, b.bookingId, user(req).id);
    res.status(201).json({ ok: true, balanceMinor: await bookingBalance(ctx.db, b.bookingId) });
  }));

  // ------------------------------------------------------------ group desk
  r.get('/groups', h(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const rows = await ctx.db.query(`SELECT e.*, a.name AS agency_name, u.name AS assignee FROM group_enquiries e JOIN agencies a ON a.id = e.agency_id LEFT JOIN users u ON u.id = e.assigned_to
                                      ${status ? 'WHERE e.status = $1' : ''} ORDER BY e.updated_at DESC LIMIT 200`, status ? [status] : []);
    res.json(rows.map((e: any) => ({ ...enquirySummary(e), agencyName: e.agency_name, assignee: e.assignee })));
  }));
  r.get('/groups/:id', h(async (req, res) => { res.json(await adminEnquiryView(ctx.db, await loadEnquiry(ctx.db, req.params.id))); }));
  r.post('/groups/:id/assign', h(async (req, res) => {
    await loadEnquiry(ctx.db, req.params.id);
    await ctx.db.query('UPDATE group_enquiries SET assigned_to = $2, updated_at = now() WHERE id = $1', [req.params.id, user(req).id]);
    res.json({ ok: true });
  }));
  r.post('/groups/:id/stage', h(async (req, res) => {
    const b = parse(z.object({ stage: z.enum(GROUP_STAGES), reason: z.string().trim().max(500).optional() }), req.body);
    await loadEnquiry(ctx.db, req.params.id);
    await ctx.db.tx((q) => setStage(q, req.params.id, b.stage, user(req).id, b.reason));
    res.json({ ok: true });
  }));
  r.post('/groups/:id/messages', h(async (req, res) => {
    const b = parse(z.object({ body: z.string().trim().min(1).max(4000), visibility: z.enum(['agent', 'internal']) }), req.body);
    await loadEnquiry(ctx.db, req.params.id);
    await ctx.db.query('INSERT INTO group_messages (enquiry_id, author_user_id, visibility, body) VALUES ($1,$2,$3,$4)', [req.params.id, user(req).id, b.visibility, b.body]);
    await ctx.db.query('UPDATE group_enquiries SET updated_at = now() WHERE id = $1', [req.params.id]);
    res.status(201).json({ ok: true });
  }));
  r.post('/groups/:id/hotel-requests', h(async (req, res) => {
    res.status(201).json({ ids: await draftHotelRequests(ctx, req.params.id, user(req).id, parse(hotelRequestSchema, req.body)), emailIntegration: false });
  }));
  r.post('/hotel-requests/:id/sent', h(async (req, res) => { await markHotelRequestSent(ctx, req.params.id, user(req).id); res.json({ ok: true }); }));
  r.post('/hotel-requests/:id/outcome', h(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['declined', 'no_response']) }), req.body);
    await setHotelRequestOutcome(ctx, req.params.id, status);
    res.json({ ok: true });
  }));
  r.post('/groups/:id/offers', h(async (req, res) => { res.status(201).json(await recordOffer(ctx, req.params.id, user(req).id, parse(offerSchema, req.body))); }));
  r.post('/groups/:id/proposals', h(async (req, res) => { res.status(201).json(await createProposal(ctx, req.params.id, user(req).id, parse(proposalSchema, req.body))); }));
  r.post('/proposals/:id/send', h(async (req, res) => { await sendProposal(ctx, req.params.id, user(req).id); res.json({ ok: true }); }));
  r.get('/proposals/:id/document', h(async (req, res) => {
    const p = await ctx.db.one<any>('SELECT * FROM group_proposals WHERE id = $1', [req.params.id]);
    if (!p) throw notFound('Proposal');
    const e = await loadEnquiry(ctx.db, p.enquiry_id);
    const a = await ctx.db.one<{ name: string }>('SELECT name FROM agencies WHERE id = $1', [e.agency_id]);
    res.type('html').send(renderProposal(e, p, a!.name, ctx.config));
  }));

  // ------------------------------------------------------------ suppliers
  r.get('/suppliers', h(async (_req, res) => {
    const stats = await ctx.db.query(`SELECT source, count(*)::int AS calls, count(*) FILTER (WHERE outcome <> 'success')::int AS failures,
        round(avg(duration_ms))::int AS avg_ms, max(at) AS last_call FROM supplier_calls WHERE at > now() - interval '7 days' GROUP BY source`);
    res.json(ctx.registry.all().map((a) => ({
      code: a.code, name: a.name, kind: a.kind, capabilities: a.capabilities, status: a.status(), breaker: breakerState(a.code),
      stats: stats.find((s: any) => s.source === a.code) ?? null,
      fault: a instanceof SandboxAdapter ? a.fault : undefined,
    })));
  }));
  r.get('/suppliers/calls', h(async (_req, res) => {
    res.json(await ctx.db.query('SELECT * FROM supplier_calls ORDER BY id DESC LIMIT 100'));
  }));
  r.post('/suppliers/sandbox/fault', admin, h(async (req, res) => {
    if (ctx.config.isProduction) throw forbidden();
    const { mode } = parse(z.object({ mode: z.enum(['none', 'search_error', 'price_increase', 'book_reject', 'book_timeout_after_commit', 'sold_out']) }), req.body);
    const sbx = ctx.registry.get('sandbox');
    if (!(sbx instanceof SandboxAdapter)) throw notFound('Sandbox supplier');
    sbx.fault = mode as SandboxFault;
    res.json({ ok: true, mode });
  }));

  // ------------------------------------------------------------ partner applications & support
  r.get('/applications', h(async (_req, res) => { res.json(await ctx.db.query('SELECT * FROM partner_applications ORDER BY created_at DESC LIMIT 200')); }));
  r.patch('/applications/:id', h(async (req, res) => {
    const b = parse(z.object({ status: z.enum(['new', 'reviewing', 'approved', 'declined']), reviewNotes: z.string().max(2000).optional() }), req.body);
    await ctx.db.query('UPDATE partner_applications SET status = $2, review_notes = COALESCE($3, review_notes) WHERE id = $1', [req.params.id, b.status, b.reviewNotes ?? null]);
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'partner_application', entityId: req.params.id, action: b.status });
    res.json({ ok: true });
  }));
  r.get('/support', h(async (_req, res) => {
    res.json(await ctx.db.query(`SELECT t.*, a.name AS agency_name, b.reference AS booking_reference FROM support_tickets t JOIN agencies a ON a.id = t.agency_id LEFT JOIN bookings b ON b.id = t.booking_id ORDER BY (t.status = 'open') DESC, t.priority DESC, t.updated_at DESC LIMIT 200`));
  }));
  r.get('/support/:id', h(async (req, res) => {
    const t = await ctx.db.one('SELECT t.*, a.name AS agency_name FROM support_tickets t JOIN agencies a ON a.id = t.agency_id WHERE t.id = $1', [req.params.id]);
    if (!t) throw notFound('Support request');
    res.json({ ticket: t, messages: await ctx.db.query('SELECT m.*, u.name AS author FROM support_messages m JOIN users u ON u.id = m.author_user_id WHERE m.ticket_id = $1 ORDER BY m.at', [req.params.id]) });
  }));
  r.post('/support/:id/reply', h(async (req, res) => {
    const b = parse(z.object({ body: z.string().trim().min(1).max(5000), close: z.boolean().default(false) }), req.body);
    await ctx.db.query('INSERT INTO support_messages (ticket_id, author_user_id, from_staff, body) VALUES ($1,$2,true,$3)', [req.params.id, user(req).id, b.body]);
    await ctx.db.query('UPDATE support_tickets SET status = $2, updated_at = now() WHERE id = $1', [req.params.id, b.close ? 'closed' : 'answered']);
    res.status(201).json({ ok: true });
  }));

  // ------------------------------------------------------------ staff
  r.get('/staff', admin, h(async (_req, res) => {
    res.json(await ctx.db.query(`SELECT id, name, email, role, status, last_login_at FROM users WHERE role IN ('hb_admin','hb_ops','hb_finance') ORDER BY created_at`));
  }));
  r.post('/staff', admin, h(async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(), password: z.string(), role: z.enum(['hb_admin', 'hb_ops', 'hb_finance']) }), req.body);
    const problem = passwordProblem(b.password);
    if (problem) throw badRequest(problem);
    if (await ctx.db.one('SELECT 1 FROM users WHERE lower(email) = $1', [b.email])) throw conflict('EMAIL_IN_USE', 'A user with this email already exists.');
    const u = await ctx.db.one('INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id', [b.email, b.name, await hashPassword(b.password), b.role]);
    await audit(ctx.db, { actorUserId: user(req).id, entityType: 'user', entityId: u.id, action: 'staff_created', details: { role: b.role } });
    res.status(201).json(u);
  }));

  return r;
}

function hotelParams(b: z.infer<typeof hotelSchema>) {
  return [b.slug, b.name, b.city, b.countryCode, b.address ?? null, b.latitude ?? null, b.longitude ?? null, b.starRating ?? null, b.starRatingVerified,
    b.collections, b.summary ?? null, b.description ?? null, b.facilities, b.contentVerified, b.transportNotes ?? null, b.checkInTime ?? null,
    b.checkOutTime ?? null, b.inclusionRationale ?? null, b.status, b.partnerContactEmail ?? null];
}
