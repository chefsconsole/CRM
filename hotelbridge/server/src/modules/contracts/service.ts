import { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/pool.js';
import { MEAL_PLANS, type Role } from '../../../../shared/domain.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { addDays, diffDays, isIsoDate, today } from '../../lib/dates.js';
import { parseDecimal } from '../../lib/money.js';
import { audit } from '../../lib/audit.js';
import { validatePolicy } from '../pricing/cancellation.js';
import { buildOffers, loadInventory } from '../inventory/adapters/contracted.js';
import { priceSupplierOffer } from '../search/offers.js';

const date = z.string().refine(isIsoDate, 'Invalid date');
const policySchema = z.object({
  refundable: z.boolean(),
  tiers: z.array(z.object({ daysBefore: z.number().int().min(0).max(365), penaltyBps: z.number().int().min(0).max(10000) })).max(6),
  notes: z.string().max(500).optional(),
});

export const contractSchema = z.object({
  hotelId: z.string().uuid(),
  reference: z.string().trim().min(3).max(60),
  rateModel: z.enum(['net', 'commissionable']),
  commissionBps: z.number().int().min(0).max(10000).default(0),
  currency: z.string().length(3).transform((s) => s.toUpperCase()),
  validFrom: date,
  validTo: date,
  bookingMode: z.enum(['instant', 'request']),
  releaseDays: z.number().int().min(0).max(120).default(0),
  taxPolicy: z.object({
    includedInRate: z.boolean(),
    vatBps: z.number().int().min(0).max(5000).optional(),
    localTaxPerPersonNightMinor: z.number().int().min(0).optional(),
    localTaxLabel: z.string().max(80).optional(),
  }),
  cancellationPolicy: policySchema,
  paymentTerms: z.string().trim().max(1000).optional(),
  distribution: z.object({ b2bAgencies: z.boolean(), markets: z.array(z.string().length(2)).default([]), notes: z.string().max(1000).default('') }),
  internalNotes: z.string().max(4000).optional(),
  documents: z.array(z.object({ name: z.string().max(160), reference: z.string().max(300) })).default([]),
});
export type ContractInput = z.infer<typeof contractSchema>;

function check(c: ContractInput) {
  if (c.validTo <= c.validFrom) throw badRequest('Contract end must be after its start.');
  const p = validatePolicy(c.cancellationPolicy);
  if (p) throw badRequest(p);
  if (c.rateModel === 'commissionable' && c.commissionBps <= 0) throw badRequest('Commissionable contracts need a commission percentage.');
  if (c.rateModel === 'net' && c.commissionBps > 0) throw badRequest('Net-rate contracts do not carry a commission.');
  if (!c.taxPolicy.includedInRate && c.taxPolicy.vatBps === undefined) throw badRequest('Specify the tax percentage when taxes are not included in the rate.');
}

async function snapshot(q: Queryable, contractId: string, userId: string, note: string) {
  const c = await q.one<any>('SELECT * FROM contracts WHERE id = $1', [contractId]);
  const [rates, restrictions] = await Promise.all([
    q.query('SELECT * FROM rates WHERE contract_id = $1 ORDER BY created_at', [contractId]),
    q.query('SELECT * FROM restrictions WHERE contract_id = $1 ORDER BY created_at', [contractId]),
  ]);
  await q.query('INSERT INTO contract_versions (contract_id, version, snapshot, change_note, changed_by) VALUES ($1,$2,$3,$4,$5)',
    [contractId, c.version, JSON.stringify({ contract: c, rates, restrictions }), note, userId]);
}

/** Bump the version, snapshot, and — for active contracts — require re-approval for term changes. */
async function newVersion(q: Queryable, contractId: string, userId: string, note: string, opts: { termsChanged: boolean }) {
  const c = await q.one<{ status: string }>('SELECT status FROM contracts WHERE id = $1 FOR UPDATE', [contractId]);
  if (!c) throw notFound('Contract');
  const reapprove = opts.termsChanged && c.status === 'active';
  await q.query(`UPDATE contracts SET version = version + 1, updated_at = now(), status = CASE WHEN $2 THEN 'pending_approval' ELSE status END,
                 approved_by = CASE WHEN $2 THEN NULL ELSE approved_by END WHERE id = $1`, [contractId, reapprove]);
  await snapshot(q, contractId, userId, note + (reapprove ? ' — re-approval required' : ''));
}

function assertCanEdit(role: Role, status: string) {
  if (status === 'active' && role !== 'hb_admin') throw forbidden('Only an administrator can change an active contract.');
}

export async function createContract(ctx: AppContext, userId: string, input: ContractInput) {
  check(input);
  const hotel = await ctx.db.one('SELECT id FROM hotels WHERE id = $1', [input.hotelId]);
  if (!hotel) throw notFound('Hotel');
  return ctx.db.tx(async (q) => {
    const dup = await q.one('SELECT 1 FROM contracts WHERE reference = $1', [input.reference]);
    if (dup) throw conflict('DUPLICATE_REFERENCE', 'A contract with this reference already exists.');
    const row = await q.one<{ id: string }>(
      `INSERT INTO contracts (hotel_id, reference, rate_model, commission_bps, currency, valid_from, valid_to, booking_mode, release_days, tax_policy,
         cancellation_policy, payment_terms, distribution, internal_notes, documents, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [input.hotelId, input.reference, input.rateModel, input.commissionBps, input.currency, input.validFrom, input.validTo, input.bookingMode,
        input.releaseDays, JSON.stringify(input.taxPolicy), JSON.stringify(input.cancellationPolicy), input.paymentTerms ?? null,
        JSON.stringify(input.distribution), input.internalNotes ?? null, JSON.stringify(input.documents), userId]);
    await snapshot(q, row!.id, userId, 'Created');
    await audit(q, { actorUserId: userId, entityType: 'contract', entityId: row!.id, action: 'created', details: { reference: input.reference } });
    return row!.id;
  });
}

export async function updateContract(ctx: AppContext, user: { id: string; role: Role }, contractId: string, input: ContractInput, note: string) {
  check(input);
  await ctx.db.tx(async (q) => {
    const c = await q.one<{ status: string; hotel_id: string; currency: string }>('SELECT status, hotel_id, currency FROM contracts WHERE id = $1', [contractId]);
    if (!c) throw notFound('Contract');
    assertCanEdit(user.role, c.status);
    if (c.hotel_id !== input.hotelId) throw badRequest('A contract cannot be moved to another hotel.');
    if (c.currency !== input.currency) {
      const hasRates = await q.one('SELECT 1 FROM rates WHERE contract_id = $1 LIMIT 1', [contractId]);
      if (hasRates) throw badRequest('Currency cannot change once rates exist. Create a new contract instead.');
    }
    const outside = await q.one('SELECT 1 FROM rates WHERE contract_id = $1 AND (date_from < $2 OR date_to > $3) LIMIT 1', [contractId, input.validFrom, input.validTo]);
    if (outside) throw badRequest('Some rates fall outside the new validity period.');
    await q.query(
      `UPDATE contracts SET reference=$2, rate_model=$3, commission_bps=$4, currency=$5, valid_from=$6, valid_to=$7, booking_mode=$8, release_days=$9,
         tax_policy=$10, cancellation_policy=$11, payment_terms=$12, distribution=$13, internal_notes=$14, documents=$15 WHERE id = $1`,
      [contractId, input.reference, input.rateModel, input.commissionBps, input.currency, input.validFrom, input.validTo, input.bookingMode,
        input.releaseDays, JSON.stringify(input.taxPolicy), JSON.stringify(input.cancellationPolicy), input.paymentTerms ?? null,
        JSON.stringify(input.distribution), input.internalNotes ?? null, JSON.stringify(input.documents)]);
    await newVersion(q, contractId, user.id, note || 'Terms updated', { termsChanged: true });
    await audit(q, { actorUserId: user.id, entityType: 'contract', entityId: contractId, action: 'updated', details: { note } });
  });
}

export async function changeContractStatus(ctx: AppContext, user: { id: string; role: Role }, contractId: string, action: 'submit' | 'approve' | 'suspend' | 'reactivate') {
  await ctx.db.tx(async (q) => {
    const c = await q.one<any>('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [contractId]);
    if (!c) throw notFound('Contract');
    const transitions: Record<string, [string, string]> = {
      submit: ['draft', 'pending_approval'], approve: ['pending_approval', 'active'], suspend: ['active', 'suspended'], reactivate: ['suspended', 'pending_approval'],
    };
    const [from, to] = transitions[action];
    if (c.status !== from) throw conflict('INVALID_STATE', `Contract is ${c.status}; cannot ${action}.`);
    if (action === 'approve') {
      if (user.role !== 'hb_admin') throw forbidden('Only an administrator can approve contracts.');
      if (c.valid_to < today(ctx.now())) throw badRequest('This contract has already expired.');
      const rates = await q.one<{ n: number }>(`SELECT count(*)::int AS n FROM rates WHERE contract_id = $1 AND status = 'active'`, [contractId]);
      if (!rates!.n) throw badRequest('Add at least one active rate before approval.');
      if (!c.distribution?.b2bAgencies) throw badRequest('The contract does not permit distribution to B2B agencies, so it cannot be made bookable.');
      await q.query(`UPDATE contracts SET status = 'active', approved_by = $2, approved_at = now(), updated_at = now() WHERE id = $1`, [contractId, user.id]);
    } else {
      await q.query('UPDATE contracts SET status = $2, updated_at = now() WHERE id = $1', [contractId, to]);
    }
    await audit(q, { actorUserId: user.id, entityType: 'contract', entityId: contractId, action, details: { from, to, selfApproved: action === 'approve' && c.created_by === user.id } });
  });
}

// ---------------------------------------------------------------- rates

export const rateSchema = z.object({
  roomTypeId: z.string().uuid(),
  mealPlan: z.enum(MEAL_PLANS),
  adults: z.number().int().min(1).max(8),
  dateFrom: date,
  dateTo: date,
  amountMinor: z.number().int().positive(),
  childAmountMinor: z.number().int().min(0).default(0),
});
export type RateInput = z.infer<typeof rateSchema>;

async function insertRates(q: Queryable, contract: any, userId: string, rates: RateInput[]) {
  const rooms = await q.query<{ id: string; max_adults: number }>('SELECT id, max_adults FROM room_types WHERE hotel_id = $1', [contract.hotel_id]);
  for (const [i, r] of rates.entries()) {
    const room = rooms.find((x) => x.id === r.roomTypeId);
    const at = rates.length > 1 ? `Row ${i + 1}: ` : '';
    if (!room) throw badRequest(`${at}room type does not belong to this hotel.`);
    if (r.adults > room.max_adults) throw badRequest(`${at}occupancy exceeds the room's maximum adults.`);
    if (r.dateTo < r.dateFrom) throw badRequest(`${at}end date is before start date.`);
    if (r.dateFrom < contract.valid_from || r.dateTo > contract.valid_to) throw badRequest(`${at}dates fall outside the contract validity (${contract.valid_from} – ${contract.valid_to}).`);
    // Overlapping active rates for the same product would make pricing ambiguous: supersede them.
    await q.query(
      `UPDATE rates SET status = 'inactive' WHERE contract_id = $1 AND room_type_id = $2 AND meal_plan = $3 AND adults = $4 AND status = 'active'
         AND date_from <= $6 AND date_to >= $5`, [contract.id, r.roomTypeId, r.mealPlan, r.adults, r.dateFrom, r.dateTo]);
    await q.query(
      `INSERT INTO rates (contract_id, room_type_id, meal_plan, adults, date_from, date_to, amount_minor, child_amount_minor, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [contract.id, r.roomTypeId, r.mealPlan, r.adults, r.dateFrom, r.dateTo, r.amountMinor, r.childAmountMinor, userId]);
  }
}

export async function addRates(ctx: AppContext, user: { id: string; role: Role }, contractId: string, rates: RateInput[], note: string) {
  await ctx.db.tx(async (q) => {
    const c = await q.one<any>('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [contractId]);
    if (!c) throw notFound('Contract');
    assertCanEdit(user.role, c.status);
    await insertRates(q, c, user.id, rates);
    await newVersion(q, contractId, user.id, note || `${rates.length} rate(s) added`, { termsChanged: false });
    await audit(q, { actorUserId: user.id, entityType: 'contract', entityId: contractId, action: 'rates_added', details: { count: rates.length } });
  });
}

/**
 * Structured rate-sheet import (CSV). All-or-nothing: any invalid row rejects the whole sheet.
 * Columns: room_code,meal_plan,adults,date_from,date_to,amount[,child_amount]   (amounts as decimals, e.g. 145.00)
 */
export async function importRateSheet(ctx: AppContext, user: { id: string; role: Role }, contractId: string, csv: string) {
  const c = await ctx.db.one<any>('SELECT * FROM contracts WHERE id = $1', [contractId]);
  if (!c) throw notFound('Contract');
  const rooms = await ctx.db.query<{ id: string; code: string }>('SELECT id, code FROM room_types WHERE hotel_id = $1', [c.hotel_id]);
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw badRequest('The sheet needs a header row and at least one rate.');
  const header = lines[0].toLowerCase().split(',').map((s) => s.trim());
  const need = ['room_code', 'meal_plan', 'adults', 'date_from', 'date_to', 'amount'];
  const missing = need.filter((n) => !header.includes(n));
  if (missing.length) throw badRequest(`Missing columns: ${missing.join(', ')}`);
  const col = (cells: string[], name: string) => cells[header.indexOf(name)]?.trim() ?? '';
  const errors: string[] = [];
  const rates: RateInput[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(',');
    const row = i + 2;
    try {
      const room = rooms.find((r) => r.code.toLowerCase() === col(cells, 'room_code').toLowerCase());
      if (!room) throw new Error(`unknown room code "${col(cells, 'room_code')}"`);
      const parsed = rateSchema.safeParse({
        roomTypeId: room.id, mealPlan: col(cells, 'meal_plan').toUpperCase(), adults: Number(col(cells, 'adults')),
        dateFrom: col(cells, 'date_from'), dateTo: col(cells, 'date_to'),
        amountMinor: parseDecimal(col(cells, 'amount'), c.currency),
        childAmountMinor: header.includes('child_amount') && col(cells, 'child_amount') ? parseDecimal(col(cells, 'child_amount'), c.currency) : 0,
      });
      if (!parsed.success) throw new Error(parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '));
      rates.push(parsed.data);
    } catch (e) {
      errors.push(`Row ${row}: ${(e as Error).message}`);
    }
  });
  if (errors.length) throw badRequest(`The rate sheet has ${errors.length} problem(s). Nothing was imported.`, errors);
  await addRates(ctx, user, contractId, rates, `Rate sheet imported (${rates.length} rows)`);
  return { imported: rates.length };
}

export async function setRateStatus(ctx: AppContext, user: { id: string; role: Role }, rateId: string, status: 'active' | 'inactive') {
  await ctx.db.tx(async (q) => {
    const r = await q.one<{ contract_id: string; status: string }>('SELECT r.contract_id, c.status FROM rates r JOIN contracts c ON c.id = r.contract_id WHERE r.id = $1', [rateId]);
    if (!r) throw notFound('Rate');
    assertCanEdit(user.role, r.status);
    await q.query('UPDATE rates SET status = $2 WHERE id = $1', [rateId, status]);
    await newVersion(q, r.contract_id, user.id, `Rate ${status === 'active' ? 'activated' : 'deactivated'}`, { termsChanged: false });
  });
}

// ---------------------------------------------------------------- restrictions & allocation

export const restrictionSchema = z.object({
  roomTypeId: z.string().uuid().nullable().default(null),
  kind: z.enum(['min_stay', 'stop_sell', 'blackout', 'supplement']),
  dateFrom: date, dateTo: date,
  value: z.number().int().min(0).nullable().default(null),
  note: z.string().max(300).optional(),
});

export async function addRestriction(ctx: AppContext, user: { id: string; role: Role }, contractId: string, r: z.infer<typeof restrictionSchema>) {
  if (r.dateTo < r.dateFrom) throw badRequest('End date is before start date.');
  if ((r.kind === 'min_stay' || r.kind === 'supplement') && !r.value) throw badRequest(r.kind === 'min_stay' ? 'Specify the minimum nights.' : 'Specify the supplement amount.');
  await ctx.db.tx(async (q) => {
    const c = await q.one<{ status: string }>('SELECT status FROM contracts WHERE id = $1', [contractId]);
    if (!c) throw notFound('Contract');
    // Stop-sells are an operational safety control and may always be applied; others follow edit rules.
    if (r.kind !== 'stop_sell') assertCanEdit(user.role, c.status);
    await q.query('INSERT INTO restrictions (contract_id, room_type_id, kind, date_from, date_to, value, note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [contractId, r.roomTypeId, r.kind, r.dateFrom, r.dateTo, r.value, r.note ?? null]);
    await newVersion(q, contractId, user.id, `${r.kind} ${r.dateFrom}–${r.dateTo} added`, { termsChanged: false });
  });
}

export async function removeRestriction(ctx: AppContext, user: { id: string; role: Role }, restrictionId: string) {
  await ctx.db.tx(async (q) => {
    const r = await q.one<{ contract_id: string; status: string }>('SELECT r.contract_id, c.status FROM restrictions r JOIN contracts c ON c.id = r.contract_id WHERE r.id = $1', [restrictionId]);
    if (!r) throw notFound('Restriction');
    assertCanEdit(user.role, r.status);
    await q.query('DELETE FROM restrictions WHERE id = $1', [restrictionId]);
    await newVersion(q, r.contract_id, user.id, 'Restriction removed', { termsChanged: false });
  });
}

export const allocationSchema = z.object({ roomTypeId: z.string().uuid(), dateFrom: date, dateTo: date, allotted: z.number().int().min(0).max(500) });

export async function setAllocation(ctx: AppContext, userId: string, contractId: string, a: z.infer<typeof allocationSchema>) {
  const days = diffDays(a.dateFrom, a.dateTo);
  if (days < 0 || days > 400) throw badRequest('Allocation range must be 1–400 days.');
  await ctx.db.tx(async (q) => {
    for (let i = 0; i <= days; i++) {
      const d = addDays(a.dateFrom, i);
      const existing = await q.one<{ sold: number }>('SELECT sold FROM allocations WHERE contract_id = $1 AND room_type_id = $2 AND stay_date = $3 FOR UPDATE', [contractId, a.roomTypeId, d]);
      if (existing && existing.sold > a.allotted) throw badRequest(`${d}: ${existing.sold} room(s) already sold — allocation cannot go below that.`);
      await q.query(`INSERT INTO allocations (contract_id, room_type_id, stay_date, allotted) VALUES ($1,$2,$3,$4)
                     ON CONFLICT (contract_id, room_type_id, stay_date) DO UPDATE SET allotted = EXCLUDED.allotted`, [contractId, a.roomTypeId, d, a.allotted]);
    }
    await audit(q, { actorUserId: userId, entityType: 'contract', entityId: contractId, action: 'allocation_set', details: a });
  });
}

// ---------------------------------------------------------------- preview

export const previewSchema = z.object({
  checkIn: date, checkOut: date,
  rooms: z.array(z.object({ adults: z.number().int().min(1).max(6), childrenAges: z.array(z.number().int().min(0).max(17)).default([]) })).min(1).max(9),
  agencyId: z.string().uuid().optional(),
  sellingCurrency: z.string().length(3).optional(),
});

/** What an agent would be offered under this contract — with the full internal economics. Never bookable. */
export async function previewContract(ctx: AppContext, contractId: string, input: z.infer<typeof previewSchema>) {
  const c = await ctx.db.one<{ hotel_id: string; currency: string; status: string }>('SELECT hotel_id, currency, status FROM contracts WHERE id = $1', [contractId]);
  if (!c) throw notFound('Contract');
  const inv = await loadInventory(ctx.db, [c.hotel_id], input.checkIn, input.checkOut, { previewContractId: contractId });
  if (!inv.contracts.length) return { contractStatus: c.status, options: [], message: 'The contract does not cover these dates.' };
  const offers = buildOffers(inv, { checkIn: input.checkIn, rooms: input.rooms }, ctx.now());
  let agency = { id: input.agencyId ?? '00000000-0000-0000-0000-000000000000', selling_currency: input.sellingCurrency ?? c.currency };
  if (input.agencyId) {
    const a = await ctx.db.one<{ id: string; selling_currency: string }>('SELECT id, selling_currency FROM agencies WHERE id = $1', [input.agencyId]);
    if (a) agency = a;
  }
  const options = [];
  for (const o of offers) {
    const priced = await priceSupplierOffer(ctx.db, agency, o, ctx.now());
    options.push({ mealPlan: o.mealPlan, availability: o.availability, rooms: o.rooms.map((r) => ({ roomName: r.roomName, adults: r.adults })), pricing: priced.pricing, notes: o.notes });
  }
  return { contractStatus: c.status, bookable: c.status === 'active', options };
}
