import { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/pool.js';
import { GROUP_STAGES, GROUP_STAGE_LABEL, MEAL_PLANS, MEAL_PLAN_LABEL, type GroupStage, type MealPlan } from '../../../../shared/domain.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { diffDays, isIsoDate, today } from '../../lib/dates.js';
import { applyBps, roundUpToUnit, sum } from '../../lib/money.js';
import { nextReference } from '../../lib/refs.js';
import { audit } from '../../lib/audit.js';

const CAPACITY = { single: 1, double: 2, twin: 2, triple: 3, family: 4 } as const;
const date = z.string().refine(isIsoDate, 'Invalid date');

export const enquirySchema = z.object({
  title: z.string().trim().min(3).max(120),
  groupType: z.enum(['leisure', 'corporate', 'mice', 'tour_series', 'other']),
  legs: z.array(z.object({ city: z.string().trim().min(2).max(80), checkIn: date, checkOut: date })).min(1).max(8),
  totalPassengers: z.number().int().min(1).max(2000),
  rooming: z.object({
    single: z.number().int().min(0).max(500).default(0), double: z.number().int().min(0).max(500).default(0),
    twin: z.number().int().min(0).max(500).default(0), triple: z.number().int().min(0).max(500).default(0),
    family: z.number().int().min(0).max(500).default(0),
  }),
  hotelCategory: z.enum(['3', '4', '5', 'any']).default('any'),
  mealPlan: z.enum(MEAL_PLANS).optional(),
  budgetMinor: z.number().int().positive().optional(),
  budgetCurrency: z.string().length(3).optional(),
  coachParking: z.boolean().default(false),
  accessibility: z.string().trim().max(500).optional(),
  specialRequests: z.string().trim().max(2000).optional(),
  quoteNeededBy: date,
});
export type EnquiryInput = z.infer<typeof enquirySchema>;

export function validateEnquiry(e: EnquiryInput, now: Date) {
  const rooms = Object.values(e.rooming).reduce((a, b) => a + b, 0);
  if (rooms === 0) throw badRequest('Add at least one room to the rooming list.');
  const capacity = (Object.keys(CAPACITY) as (keyof typeof CAPACITY)[]).reduce((a, k) => a + CAPACITY[k] * e.rooming[k], 0);
  if (capacity < e.totalPassengers) throw badRequest(`The rooming list sleeps ${capacity}, fewer than ${e.totalPassengers} passengers.`);
  if (rooms > e.totalPassengers) throw badRequest('There are more rooms than passengers.');
  const t = today(now);
  for (const [i, leg] of e.legs.entries()) {
    if (leg.checkIn < t) throw badRequest(`Leg ${i + 1}: arrival is in the past.`);
    if (diffDays(leg.checkIn, leg.checkOut) < 1) throw badRequest(`Leg ${i + 1}: departure must be after arrival.`);
  }
  if (e.quoteNeededBy < t) throw badRequest('The quotation deadline is in the past.');
  if (e.quoteNeededBy > e.legs[0].checkIn) throw badRequest('The quotation deadline must be before arrival.');
  if (e.budgetMinor && !e.budgetCurrency) throw badRequest('Choose a currency for the budget.');
  return { rooms, capacity };
}

export async function createEnquiry(ctx: AppContext, agencyId: string, userId: string, e: EnquiryInput) {
  const now = ctx.now();
  validateEnquiry(e, now);
  const target = new Date(now.getTime() + ctx.config.groupResponseSlaHours * 3_600_000);
  return ctx.db.tx(async (q) => {
    const reference = await nextReference(q, 'GRP');
    const row = await q.one<{ id: string }>(
      `INSERT INTO group_enquiries (reference, agency_id, created_by, title, group_type, legs, total_passengers, rooming, hotel_category, meal_plan,
         budget_minor, budget_currency, coach_parking, accessibility, special_requests, quote_needed_by, target_response_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [reference, agencyId, userId, e.title, e.groupType, JSON.stringify(e.legs), e.totalPassengers, JSON.stringify(e.rooming), e.hotelCategory,
        e.mealPlan ?? null, e.budgetMinor ?? null, e.budgetCurrency ?? null, e.coachParking, e.accessibility ?? null, e.specialRequests ?? null,
        e.quoteNeededBy, target]);
    await q.query(`INSERT INTO group_messages (enquiry_id, visibility, body) VALUES ($1,'agent',$2)`, [row!.id,
      `Automatic acknowledgement: we have received your group request ${reference}. The Group Desk will review it and respond by ${target.toISOString().slice(0, 16).replace('T', ' ')} UTC. Rates are negotiated with hotels individually, so a proposal follows once hotel offers are received.`]);
    await audit(q, { actorUserId: userId, agencyId, entityType: 'group_enquiry', entityId: row!.id, action: 'created', details: { reference } });
    return { id: row!.id, reference };
  });
}

export async function loadEnquiry(q: Queryable, id: string, agencyId?: string) {
  const row = await q.one<any>(`SELECT * FROM group_enquiries WHERE id = $1 ${agencyId ? 'AND agency_id = $2' : ''}`, agencyId ? [id, agencyId] : [id]);
  if (!row) throw notFound('Group enquiry');
  return row;
}

export async function setStage(q: Queryable, enquiryId: string, stage: GroupStage, actorUserId: string | null, reason?: string) {
  if (!GROUP_STAGES.includes(stage)) throw badRequest('Unknown stage');
  if ((stage === 'lost' || stage === 'cancelled') && !reason) throw badRequest('Record a reason when closing an enquiry.');
  await q.query('UPDATE group_enquiries SET status = $2, outcome_reason = COALESCE($3, outcome_reason), updated_at = now() WHERE id = $1', [enquiryId, stage, reason ?? null]);
  await q.query(`INSERT INTO group_messages (enquiry_id, author_user_id, visibility, body) VALUES ($1,$2,'internal',$3)`,
    [enquiryId, actorUserId, `Stage changed to ${GROUP_STAGE_LABEL[stage]}${reason ? ` — ${reason}` : ''}.`]);
}

// ---------------------------------------------------------------- hotel enquiries

export function enquiryEmail(e: any, leg: { city: string; checkIn: string; checkOut: string }, hotelName: string, respondBy: string) {
  const r = e.rooming;
  const roomLines = (Object.keys(CAPACITY) as (keyof typeof CAPACITY)[]).filter((k) => r[k] > 0).map((k) => `  • ${r[k]} × ${k}`).join('\n');
  const nights = diffDays(leg.checkIn, leg.checkOut);
  // Deliberately excludes the agency's identity and any budget: hotels quote on requirements.
  return {
    subject: `Group rate request ${e.reference} — ${leg.checkIn} to ${leg.checkOut} (${e.total_passengers} pax)`,
    body: [
      `Dear ${hotelName} reservations team,`, '',
      `HotelBridge would like to request a group rate for the following requirement:`, '',
      `Reference: ${e.reference}`,
      `Group type: ${e.group_type}`,
      `Dates: arrival ${leg.checkIn}, departure ${leg.checkOut} (${nights} night${nights === 1 ? '' : 's'})`,
      `Passengers: ${e.total_passengers}`,
      `Rooms:`, roomLines,
      e.meal_plan ? `Meal plan: ${MEAL_PLAN_LABEL[e.meal_plan as MealPlan]}` : null,
      e.coach_parking ? 'Coach parking / drop-off is required.' : null,
      e.accessibility ? `Accessibility: ${e.accessibility}` : null,
      e.special_requests ? `Other requirements: ${e.special_requests}` : null, '',
      'Please include: net rate per room type per night, applicable taxes and city tax, cancellation and attrition terms, deposit/payment schedule, rooming-list deadline and offer validity.', '',
      `We would be grateful for your offer by ${respondBy}.`, '',
      'Kind regards,', 'HotelBridge Group Desk',
    ].filter((l) => l !== null).join('\n'),
  };
}

export const hotelRequestSchema = z.object({
  legIndex: z.number().int().min(0),
  hotels: z.array(z.object({ hotelId: z.string().uuid().optional(), hotelName: z.string().trim().min(2).max(160).optional(), contactEmail: z.string().email().optional() })).min(1).max(20),
  respondBy: date,
});

export async function draftHotelRequests(ctx: AppContext, enquiryId: string, actorUserId: string, input: z.infer<typeof hotelRequestSchema>) {
  const e = await loadEnquiry(ctx.db, enquiryId);
  const leg = e.legs[input.legIndex];
  if (!leg) throw badRequest('Unknown itinerary leg');
  const created: string[] = [];
  await ctx.db.tx(async (q) => {
    for (const h of input.hotels) {
      let name = h.hotelName, email = h.contactEmail ?? null;
      if (h.hotelId) {
        const row = await q.one<{ name: string; partner_contact_email: string | null }>('SELECT name, partner_contact_email FROM hotels WHERE id = $1', [h.hotelId]);
        if (!row) throw notFound('Hotel');
        name = row.name; email = email ?? row.partner_contact_email;
      }
      if (!name) throw badRequest('Each hotel needs a catalogue hotel or a name.');
      const mail = enquiryEmail(e, leg, name, input.respondBy);
      const r = await q.one<{ id: string }>(
        `INSERT INTO group_hotel_requests (enquiry_id, hotel_id, hotel_name, contact_email, subject, body, respond_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [enquiryId, h.hotelId ?? null, name, email, mail.subject, mail.body, new Date(`${input.respondBy}T23:59:00Z`)]);
      created.push(r!.id);
    }
    if (e.status === 'new') await setStage(q, enquiryId, 'under_review', actorUserId);
  });
  return created;
}

/** Records that a drafted enquiry was actually sent (by the user, outside the platform). */
export async function markHotelRequestSent(ctx: AppContext, requestId: string, actorUserId: string) {
  await ctx.db.tx(async (q) => {
    const r = await q.one<{ enquiry_id: string; status: string }>('SELECT enquiry_id, status FROM group_hotel_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (!r) throw notFound('Hotel request');
    if (r.status !== 'drafted') throw conflict('INVALID_STATE', 'This request has already been marked as sent.');
    await q.query(`UPDATE group_hotel_requests SET status = 'sent', sent_via = 'manual_email', sent_at = now(), sent_by = $2 WHERE id = $1`, [requestId, actorUserId]);
    const e = await q.one<{ status: string }>('SELECT status FROM group_enquiries WHERE id = $1', [r.enquiry_id]);
    if (e && ['new', 'under_review'].includes(e.status)) await setStage(q, r.enquiry_id, 'sent_to_hotels', actorUserId);
  });
}

export async function setHotelRequestOutcome(ctx: AppContext, requestId: string, status: 'declined' | 'no_response') {
  await ctx.db.query(`UPDATE group_hotel_requests SET status = $2 WHERE id = $1 AND status IN ('drafted','sent')`, [requestId, status]);
}

// ---------------------------------------------------------------- offers

export const offerSchema = z.object({
  hotelRequestId: z.string().uuid().optional(),
  hotelName: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(80),
  checkIn: date, checkOut: date,
  currency: z.string().length(3),
  lines: z.array(z.object({ roomType: z.string().trim().min(2).max(60), rooms: z.number().int().min(1).max(500), nightlyNetMinor: z.number().int().positive() })).min(1).max(10),
  mealPlan: z.enum(MEAL_PLANS).optional(),
  taxesMinor: z.number().int().min(0).default(0),
  cancellationTerms: z.string().trim().min(3).max(2000),
  paymentTerms: z.string().trim().min(3).max(2000),
  conditions: z.string().trim().max(2000).optional(),
  validUntil: date,
});

export function offerNetTotal(o: { checkIn: string; checkOut: string; lines: { rooms: number; nightlyNetMinor: number }[]; taxesMinor: number }) {
  const nights = diffDays(o.checkIn, o.checkOut);
  if (nights < 1) throw badRequest('Offer departure must be after arrival.');
  return sum(o.lines.map((l) => l.rooms * l.nightlyNetMinor * nights)) + o.taxesMinor;
}

export async function recordOffer(ctx: AppContext, enquiryId: string, actorUserId: string, o: z.infer<typeof offerSchema>) {
  await loadEnquiry(ctx.db, enquiryId);
  const net = offerNetTotal(o);
  return ctx.db.tx(async (q) => {
    const row = await q.one<{ id: string }>(
      `INSERT INTO group_offers (enquiry_id, hotel_request_id, hotel_name, city, check_in, check_out, currency, lines, meal_plan, taxes_minor, net_total_minor,
         cancellation_terms, payment_terms, conditions, valid_until, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [enquiryId, o.hotelRequestId ?? null, o.hotelName, o.city, o.checkIn, o.checkOut, o.currency, JSON.stringify(o.lines), o.mealPlan ?? null,
        o.taxesMinor, net, o.cancellationTerms, o.paymentTerms, o.conditions ?? null, o.validUntil, actorUserId]);
    if (o.hotelRequestId) await q.query(`UPDATE group_hotel_requests SET status = 'responded' WHERE id = $1`, [o.hotelRequestId]);
    const e = await q.one<{ status: string }>('SELECT status FROM group_enquiries WHERE id = $1', [enquiryId]);
    if (e && ['new', 'under_review', 'sent_to_hotels'].includes(e.status)) await setStage(q, enquiryId, 'offers_received', actorUserId);
    return { id: row!.id, netTotalMinor: net };
  });
}

// ---------------------------------------------------------------- proposals

export const proposalSchema = z.object({
  offerIds: z.array(z.string().uuid()).min(1).max(12),
  markupBps: z.number().int().min(0).max(5000),
  validUntil: date,
  exclusions: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Proposals are built ONLY from recorded hotel offers — nothing is invented to fill gaps. */
export async function createProposal(ctx: AppContext, enquiryId: string, actorUserId: string, p: z.infer<typeof proposalSchema>) {
  const offers = await ctx.db.query<any>('SELECT * FROM group_offers WHERE enquiry_id = $1 AND id = ANY($2::uuid[])', [enquiryId, p.offerIds]);
  if (offers.length !== p.offerIds.length) throw badRequest('Every option must be a recorded offer for this enquiry.');
  const currencies = new Set(offers.map((o) => o.currency));
  if (currencies.size > 1) throw badRequest('All options in one proposal must share a currency (record a converted offer first).');
  const currency = offers[0].currency as string;
  const earliestValidity = offers.map((o) => o.valid_until as string).sort()[0];
  if (p.validUntil > earliestValidity) throw badRequest(`Proposal validity cannot exceed the hotels' offer validity (${earliestValidity}).`);
  if (p.validUntil < today(ctx.now())) throw badRequest('Proposal validity is in the past.');

  const options = offers.map((o) => {
    const nights = diffDays(o.check_in, o.check_out);
    // Markup applies to room revenue; taxes pass through at cost. Line totals sum exactly to the option total.
    const lines = o.lines.map((l: any) => {
      const lineNet = l.rooms * l.nightlyNetMinor * nights;
      const lineSellMinor = roundUpToUnit(lineNet + applyBps(lineNet, p.markupBps), currency);
      return { roomType: l.roomType, rooms: l.rooms, nights, lineSellMinor, approxPerRoomNightMinor: Math.round(lineSellMinor / (l.rooms * nights)) };
    });
    const sellTotal = sum(lines.map((l: any) => l.lineSellMinor)) + o.taxes_minor;
    return {
      offerId: o.id, hotelName: o.hotel_name, city: o.city, checkIn: o.check_in, checkOut: o.check_out, nights, mealPlan: o.meal_plan,
      lines, taxesMinor: o.taxes_minor, netTotalMinor: o.net_total_minor, sellTotalMinor: sellTotal,
      cancellationTerms: o.cancellation_terms, paymentTerms: o.payment_terms, conditions: o.conditions,
    };
  });
  // Totals: cheapest option per leg (city + dates) — the agent chooses one option per leg.
  const legs = new Map<string, typeof options>();
  for (const o of options) { const k = `${o.city}|${o.checkIn}|${o.checkOut}`; legs.set(k, [...(legs.get(k) ?? []), o]); }
  const cheapest = [...legs.values()].map((l) => l.reduce((a, b) => (b.sellTotalMinor < a.sellTotalMinor ? b : a)));
  const totalNet = sum(cheapest.map((o) => o.netTotalMinor));
  const totalSell = sum(cheapest.map((o) => o.sellTotalMinor));

  return ctx.db.tx(async (q) => {
    const v = await q.one<{ v: number }>('SELECT COALESCE(MAX(version),0)::int + 1 AS v FROM group_proposals WHERE enquiry_id = $1', [enquiryId]);
    const row = await q.one<{ id: string }>(
      `INSERT INTO group_proposals (enquiry_id, version, currency, options, total_net_minor, total_sell_minor, markup_bps, valid_until, exclusions, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [enquiryId, v!.v, currency, JSON.stringify(options), totalNet, totalSell, p.markupBps, p.validUntil, p.exclusions ?? null, p.notes ?? null, actorUserId]);
    await setStage(q, enquiryId, 'proposal_prepared', actorUserId);
    return { id: row!.id, version: v!.v, totalNetMinor: totalNet, totalSellMinor: totalSell };
  });
}

export async function sendProposal(ctx: AppContext, proposalId: string, actorUserId: string) {
  await ctx.db.tx(async (q) => {
    const p = await q.one<{ enquiry_id: string; status: string; version: number }>('SELECT enquiry_id, status, version FROM group_proposals WHERE id = $1 FOR UPDATE', [proposalId]);
    if (!p) throw notFound('Proposal');
    if (p.status !== 'draft') throw conflict('INVALID_STATE', 'Only draft proposals can be sent.');
    await q.query(`UPDATE group_proposals SET status = 'superseded' WHERE enquiry_id = $1 AND status = 'sent'`, [p.enquiry_id]);
    await q.query(`UPDATE group_proposals SET status = 'sent', sent_at = now() WHERE id = $1`, [proposalId]);
    await setStage(q, p.enquiry_id, 'sent_to_agent', actorUserId);
    await q.query(`INSERT INTO group_messages (enquiry_id, author_user_id, visibility, body) VALUES ($1,$2,'agent',$3)`,
      [p.enquiry_id, actorUserId, `Proposal version ${p.version} is ready for your review.`]);
  });
}

export async function respondToProposal(ctx: AppContext, agencyId: string, proposalId: string, userId: string, accept: boolean, comment?: string) {
  await ctx.db.tx(async (q) => {
    const p = await q.one<{ enquiry_id: string; status: string; valid_until: string; version: number }>(
      `SELECT p.enquiry_id, p.status, p.valid_until, p.version FROM group_proposals p JOIN group_enquiries e ON e.id = p.enquiry_id
        WHERE p.id = $1 AND e.agency_id = $2 FOR UPDATE OF p`, [proposalId, agencyId]);
    if (!p) throw notFound('Proposal');
    if (p.status !== 'sent') throw conflict('INVALID_STATE', 'This proposal is no longer open for a response.');
    if (accept && p.valid_until < today(ctx.now())) throw conflict('PROPOSAL_EXPIRED', 'This proposal has expired. Please ask the Group Desk to revalidate it with the hotels.');
    await q.query(`UPDATE group_proposals SET status = $2, responded_at = now() WHERE id = $1`, [proposalId, accept ? 'accepted' : 'declined']);
    await setStage(q, p.enquiry_id, accept ? 'won' : 'negotiation', userId, accept ? 'Agency accepted the proposal' : undefined);
    await q.query(`INSERT INTO group_messages (enquiry_id, author_user_id, visibility, body) VALUES ($1,$2,'agent',$3)`,
      [p.enquiry_id, userId, accept
        ? `Agency accepted proposal v${p.version}. The Group Desk will now contract with the hotels and confirm deposit and rooming-list deadlines.${comment ? ` Comment: ${comment}` : ''}`
        : `Agency declined proposal v${p.version}.${comment ? ` Comment: ${comment}` : ''}`]);
  });
}

// ---------------------------------------------------------------- views

export async function agentEnquiryView(q: Queryable, e: any) {
  const [proposals, messages] = await Promise.all([
    q.query(`SELECT id, version, currency, options, total_sell_minor, valid_until, exclusions, notes, status, sent_at, responded_at
               FROM group_proposals WHERE enquiry_id = $1 AND status <> 'draft' ORDER BY version DESC`, [e.id]),
    q.query(`SELECT m.body, m.at, u.name AS author FROM group_messages m LEFT JOIN users u ON u.id = m.author_user_id
              WHERE m.enquiry_id = $1 AND m.visibility = 'agent' ORDER BY m.at, m.id`, [e.id]),
  ]);
  return {
    ...enquirySummary(e),
    proposals: proposals.map((p: any) => ({
      ...p, options: p.options.map(({ netTotalMinor: _n, offerId: _o, ...rest }: any) => rest), // never expose net cost
    })),
    messages,
  };
}

export function enquirySummary(e: any) {
  return {
    id: e.id, reference: e.reference, title: e.title, status: e.status, groupType: e.group_type, legs: e.legs,
    totalPassengers: e.total_passengers, rooming: e.rooming, hotelCategory: e.hotel_category, mealPlan: e.meal_plan,
    budgetMinor: e.budget_minor, budgetCurrency: e.budget_currency, coachParking: e.coach_parking, accessibility: e.accessibility,
    specialRequests: e.special_requests, quoteNeededBy: e.quote_needed_by, targetResponseAt: e.target_response_at,
    createdAt: e.created_at, updatedAt: e.updated_at, outcomeReason: e.outcome_reason,
  };
}

export async function adminEnquiryView(q: Queryable, e: any) {
  const [requests, offers, proposals, messages, agency] = await Promise.all([
    q.query('SELECT * FROM group_hotel_requests WHERE enquiry_id = $1 ORDER BY created_at', [e.id]),
    q.query('SELECT * FROM group_offers WHERE enquiry_id = $1 ORDER BY created_at', [e.id]),
    q.query('SELECT * FROM group_proposals WHERE enquiry_id = $1 ORDER BY version DESC', [e.id]),
    q.query(`SELECT m.visibility, m.body, m.at, u.name AS author FROM group_messages m LEFT JOIN users u ON u.id = m.author_user_id WHERE m.enquiry_id = $1 ORDER BY m.at, m.id`, [e.id]),
    q.one('SELECT id, name, country_code FROM agencies WHERE id = $1', [e.agency_id]),
  ]);
  return { ...enquirySummary(e), agency, assignedTo: e.assigned_to, hotelRequests: requests, offers, proposals, messages };
}
