import type { CancellationPolicy, MealPlan, RoomRequest } from '../../../../../shared/domain.js';
import { diffDays, nightsOf, today } from '../../../lib/dates.js';
import type { NightlyRate, TaxPolicy } from '../../pricing/engine.js';
import type {
  AdapterContext, BookOutcome, BookRequest, CancelOutcome, InventoryAdapter, RevalidateResult, SearchQuery, SupplierOffer, SupplierRoom,
} from '../types.js';
import type { Queryable } from '../../../db/pool.js';

/**
 * HotelBridge's own contracted inventory. Rates are only offered when:
 *   - the contract is ACTIVE (approved) and covers every night of the stay,
 *   - the contract permits distribution to B2B agencies,
 *   - every night has an active rate for the exact adult occupancy,
 *   - no stop-sell / blackout applies and minimum-stay is satisfied.
 * Instant confirmation additionally needs an 'instant' contract, the release period not yet reached,
 * and free allocation on every night. Otherwise the offer is on request (the hotel must confirm).
 */

interface ContractRow {
  id: string; hotel_id: string; reference: string; rate_model: 'net' | 'commissionable'; commission_bps: number;
  currency: string; valid_from: string; valid_to: string; booking_mode: 'instant' | 'request'; release_days: number;
  tax_policy: TaxPolicy; cancellation_policy: CancellationPolicy; payment_terms: string | null;
}
interface RoomTypeRow { id: string; hotel_id: string; name: string; max_adults: number; max_children: number; max_occupancy: number }
interface RateRow { contract_id: string; room_type_id: string; meal_plan: MealPlan; adults: number; date_from: string; date_to: string; amount_minor: number; child_amount_minor: number }
interface RestrictionRow { contract_id: string; room_type_id: string | null; kind: string; date_from: string; date_to: string; value: number | null }
interface AllocationRow { contract_id: string; room_type_id: string; stay_date: string; allotted: number; sold: number }

const MAX_OPTIONS_PER_MEAL_PLAN = 3;

export function fits(rt: RoomTypeRow, req: RoomRequest): boolean {
  const children = req.childrenAges.length;
  return req.adults <= rt.max_adults && children <= rt.max_children && req.adults + children <= rt.max_occupancy;
}

export async function loadInventory(q: Queryable, hotelIds: string[], checkIn: string, checkOut: string, opts: { previewContractId?: string } = {}) {
  const nights = nightsOf(checkIn, checkOut);
  const last = nights[nights.length - 1];
  // Preview (staff only) evaluates one contract regardless of approval status; it is never used for booking.
  const contracts = opts.previewContractId
    ? await q.query<ContractRow>(`SELECT * FROM contracts WHERE id = $1 AND valid_from <= $2 AND valid_to >= $3`, [opts.previewContractId, checkIn, last])
    : await q.query<ContractRow>(
    `SELECT * FROM contracts
      WHERE hotel_id = ANY($1::uuid[]) AND status = 'active'
        AND valid_from <= $2 AND valid_to >= $3
        AND COALESCE((distribution->>'b2bAgencies')::boolean, false) = true`,
    [hotelIds, checkIn, last],
  );
  const ids = contracts.map((c) => c.id);
  if (!ids.length) return { nights, contracts, roomTypes: [], rates: [], restrictions: [], allocations: [] };
  const [roomTypes, rates, restrictions, allocations] = await Promise.all([
    q.query<RoomTypeRow>(`SELECT * FROM room_types WHERE hotel_id = ANY($1::uuid[]) AND status = 'active'`, [hotelIds]),
    q.query<RateRow>(`SELECT * FROM rates WHERE contract_id = ANY($1::uuid[]) AND status = 'active' AND date_from <= $3 AND date_to >= $2`, [ids, checkIn, last]),
    q.query<RestrictionRow>(`SELECT * FROM restrictions WHERE contract_id = ANY($1::uuid[]) AND date_from <= $3 AND date_to >= $2`, [ids, checkIn, last]),
    q.query<AllocationRow>(`SELECT * FROM allocations WHERE contract_id = ANY($1::uuid[]) AND stay_date >= $2 AND stay_date <= $3`, [ids, checkIn, last]),
  ]);
  return { nights, contracts, roomTypes, rates, restrictions, allocations };
}

type Inventory = Awaited<ReturnType<typeof loadInventory>>;

/** Nightly prices for one room of a type, or a reason it cannot be sold. */
function priceRoom(inv: Inventory, c: ContractRow, rt: RoomTypeRow, meal: MealPlan, req: RoomRequest): { nightly: NightlyRate[] } | { reason: string } {
  if (!fits(rt, req)) return { reason: 'occupancy' };
  const applies = (r: RestrictionRow, night: string) =>
    r.contract_id === c.id && (r.room_type_id === null || r.room_type_id === rt.id) && night >= r.date_from && night <= r.date_to;
  const nightly: NightlyRate[] = [];
  for (const night of inv.nights) {
    if (inv.restrictions.some((r) => (r.kind === 'stop_sell' || r.kind === 'blackout') && applies(r, night))) return { reason: 'closed' };
    const rate = inv.rates.find((r) => r.contract_id === c.id && r.room_type_id === rt.id && r.meal_plan === meal && r.adults === req.adults && night >= r.date_from && night <= r.date_to);
    if (!rate) return { reason: 'no_rate' };
    const supplement = inv.restrictions.filter((r) => r.kind === 'supplement' && applies(r, night)).reduce((a, r) => a + (r.value ?? 0), 0);
    nightly.push({ date: night, amountMinor: rate.amount_minor + rate.child_amount_minor * req.childrenAges.length + supplement });
  }
  const minStay = inv.restrictions.filter((r) => r.kind === 'min_stay' && applies(r, inv.nights[0])).reduce((a, r) => Math.max(a, r.value ?? 0), 0);
  if (minStay > inv.nights.length) return { reason: `min_stay_${minStay}` };
  return { nightly };
}

function hasAllocation(inv: Inventory, c: ContractRow, assignment: RoomTypeRow[]): boolean {
  const needed = new Map<string, number>();
  for (const rt of assignment) needed.set(rt.id, (needed.get(rt.id) ?? 0) + 1);
  for (const [rtId, count] of needed) {
    for (const night of inv.nights) {
      const a = inv.allocations.find((x) => x.contract_id === c.id && x.room_type_id === rtId && x.stay_date === night);
      if (!a || a.allotted - a.sold < count) return false;
    }
  }
  return true;
}

export function buildOffers(inv: Inventory, query: { checkIn: string; rooms: RoomRequest[]; mealPlan?: MealPlan }, now: Date): SupplierOffer[] {
  const offers: SupplierOffer[] = [];
  const daysToArrival = diffDays(today(now), query.checkIn);
  for (const c of inv.contracts) {
    const types = inv.roomTypes.filter((rt) => rt.hotel_id === c.hotel_id);
    const meals = [...new Set(inv.rates.filter((r) => r.contract_id === c.id).map((r) => r.meal_plan))]
      .filter((m) => !query.mealPlan || m === query.mealPlan);
    for (const meal of meals) {
      // Pre-price every (room request × room type) cell.
      const cells = query.rooms.map((req) => types.map((rt) => ({ rt, res: priceRoom(inv, c, rt, meal, req) })));
      const cheapest = cells.map((row) => row
        .filter((x): x is { rt: RoomTypeRow; res: { nightly: NightlyRate[] } } => 'nightly' in x.res)
        .sort((a, b) => total(a.res.nightly) - total(b.res.nightly))[0]);
      if (cheapest.some((x) => !x)) continue; // some requested room can't be accommodated
      // Combinations: "everyone in type T where it fits, otherwise the cheapest fitting type".
      const combos = new Map<string, { rt: RoomTypeRow; nightly: NightlyRate[] }[]>();
      for (const primary of types) {
        const assignment = cells.map((row, i) => {
          const cell = row.find((x) => x.rt.id === primary.id);
          return cell && 'nightly' in cell.res ? { rt: cell.rt, nightly: cell.res.nightly } : { rt: cheapest[i]!.rt, nightly: cheapest[i]!.res.nightly };
        });
        combos.set(assignment.map((a) => a.rt.id).join('|'), assignment);
      }
      const ranked = [...combos.values()].sort((a, b) => sumRooms(a) - sumRooms(b)).slice(0, MAX_OPTIONS_PER_MEAL_PLAN);
      for (const assignment of ranked) {
        const instant = c.booking_mode === 'instant' && daysToArrival >= c.release_days && hasAllocation(inv, c, assignment.map((a) => a.rt));
        const notes: string[] = [];
        if (c.booking_mode === 'instant' && !instant) notes.push('Allocation not available for these dates — the hotel will be asked to confirm.');
        const rooms: SupplierRoom[] = assignment.map((a, i) => ({
          roomIndex: i, roomTypeId: a.rt.id, roomName: a.rt.name,
          adults: query.rooms[i].adults, childrenAges: query.rooms[i].childrenAges, nightly: a.nightly,
        }));
        offers.push({
          source: 'direct_contract', hotelId: c.hotel_id, contractId: c.id, supplierRateKey: null, mealPlan: meal,
          currency: c.currency, rateModel: c.rate_model, commissionBps: c.commission_bps, taxPolicy: c.tax_policy,
          cancellationPolicy: c.cancellation_policy, availability: instant ? 'instant' : 'on_request',
          requiresRevalidation: false, rooms, notes, paymentTerms: c.payment_terms,
        });
      }
    }
  }
  return offers;
}

const total = (n: NightlyRate[]) => n.reduce((a, b) => a + b.amountMinor, 0);
const sumRooms = (rooms: { nightly: NightlyRate[] }[]) => rooms.reduce((a, r) => a + total(r.nightly), 0);
const sameRooms = (a: SupplierOffer, b: SupplierOffer) =>
  a.contractId === b.contractId && a.mealPlan === b.mealPlan && a.rooms.length === b.rooms.length &&
  a.rooms.every((r, i) => r.roomTypeId === b.rooms[i].roomTypeId);

export class ContractedAdapter implements InventoryAdapter {
  code = 'direct_contract';
  name = 'HotelBridge direct contracts';
  kind = 'direct' as const;
  capabilities = {
    search: true, content: true, revalidate: true, book: true, retrieve: true, cancel: true,
    amend: false, instantConfirmation: true, idempotentBooking: true,
  };

  status() {
    return { configured: true, environment: 'internal' as const, label: 'Live — internal contract engine', missing: [] };
  }

  async search(ctx: AdapterContext, query: SearchQuery) {
    if (!query.hotelIds.length) return [];
    const inv = await loadInventory(ctx.q, query.hotelIds, query.checkIn, query.checkOut);
    return buildOffers(inv, query, ctx.now);
  }

  async revalidate(ctx: AdapterContext, offer: SupplierOffer): Promise<RevalidateResult> {
    const checkIn = offer.rooms[0].nightly[0].date;
    const lastNight = offer.rooms[0].nightly[offer.rooms[0].nightly.length - 1].date;
    const checkOut = new Date(Date.parse(`${lastNight}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const inv = await loadInventory(ctx.q, [offer.hotelId], checkIn, checkOut);
    const rooms = offer.rooms.map((r) => ({ adults: r.adults, childrenAges: r.childrenAges }));
    const fresh = buildOffers(inv, { checkIn, rooms, mealPlan: offer.mealPlan }, ctx.now);
    // Also consider all combinations, not just the top-ranked, so the same room assignment is found.
    const match = fresh.find((o) => sameRooms(o, offer)) ?? (await this.exactMatch(ctx, inv, offer, rooms));
    return match ? { ok: true, offer: match } : { ok: false, reason: 'These rooms are no longer available at this hotel for the selected dates.' };
  }

  private async exactMatch(ctx: AdapterContext, inv: Inventory, offer: SupplierOffer, rooms: RoomRequest[]): Promise<SupplierOffer | null> {
    const c = inv.contracts.find((x) => x.id === offer.contractId);
    if (!c) return null;
    const assignment: { rt: RoomTypeRow; nightly: NightlyRate[] }[] = [];
    for (const [i, r] of offer.rooms.entries()) {
      const rt = inv.roomTypes.find((x) => x.id === r.roomTypeId);
      if (!rt) return null;
      const res = priceRoom(inv, c, rt, offer.mealPlan, rooms[i]);
      if (!('nightly' in res)) return null;
      assignment.push({ rt, nightly: res.nightly });
    }
    const daysToArrival = diffDays(today(ctx.now), offer.rooms[0].nightly[0].date);
    const instant = c.booking_mode === 'instant' && daysToArrival >= c.release_days && hasAllocation(inv, c, assignment.map((a) => a.rt));
    return {
      ...offer, currency: c.currency, rateModel: c.rate_model, commissionBps: c.commission_bps, taxPolicy: c.tax_policy,
      cancellationPolicy: c.cancellation_policy, availability: instant ? 'instant' : 'on_request', paymentTerms: c.payment_terms,
      rooms: offer.rooms.map((r, i) => ({ ...r, nightly: assignment[i].nightly })),
    };
  }

  async book(ctx: AdapterContext, req: BookRequest): Promise<BookOutcome> {
    const c = await ctx.q.one<{ reference: string }>('SELECT reference FROM contracts WHERE id = $1', [req.offer.contractId]);
    if (!c) return { outcome: 'failed', reason: 'Contract no longer exists' };
    const supplierReference = `${c.reference}/${req.clientReference}`;
    if (req.offer.availability !== 'instant') return { outcome: 'pending', supplierReference };
    // Take allocation atomically. If another booking took the last room first, fall back to on request.
    const took = await ctx.db.tx(async (q) => {
      for (const room of req.offer.rooms) {
        for (const n of room.nightly) {
          const updated = await q.query(
            `UPDATE allocations SET sold = sold + 1
              WHERE contract_id = $1 AND room_type_id = $2 AND stay_date = $3 AND sold < allotted RETURNING sold`,
            [req.offer.contractId, room.roomTypeId, n.date],
          );
          if (!updated.length) throw new AllocationExhausted();
        }
      }
      await q.query('UPDATE bookings SET allocation_held = true WHERE id = $1', [req.bookingId]);
      return true;
    }).catch((e) => { if (e instanceof AllocationExhausted) return false; throw e; });
    if (!took) return { outcome: 'pending', supplierReference };
    return { outcome: 'confirmed', supplierReference, hotelConfirmationNumber: null };
  }

  async retrieve(ctx: AdapterContext, clientReference: string): Promise<BookOutcome | null> {
    const b = await ctx.q.one<{ status: string; supplier_reference: string | null }>('SELECT status, supplier_reference FROM bookings WHERE reference = $1', [clientReference]);
    if (!b) return null;
    if (b.status === 'confirmed') return { outcome: 'confirmed', supplierReference: b.supplier_reference ?? clientReference };
    if (b.status === 'failed') return { outcome: 'failed', reason: 'not booked' };
    return { outcome: 'pending', supplierReference: b.supplier_reference };
  }

  async cancel(ctx: AdapterContext, clientReference: string): Promise<CancelOutcome> {
    const b = await ctx.q.one<{ id: string }>('SELECT id FROM bookings WHERE reference = $1', [clientReference]);
    if (b) await this.release(ctx, b.id);
    // Supplier penalty is derived from the contract's own policy by the booking service.
    return { outcome: 'cancelled', supplierPenaltyMinor: null };
  }

  async release(ctx: AdapterContext, bookingId: string) {
    await ctx.db.tx(async (q) => {
      const b = await q.one<{ allocation_held: boolean; contract_id: string; check_in: string; check_out: string }>(
        'SELECT allocation_held, contract_id, check_in, check_out FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
      if (!b?.allocation_held) return;
      const rooms = await q.query<{ room_type_id: string }>('SELECT room_type_id FROM booking_rooms WHERE booking_id = $1', [bookingId]);
      for (const r of rooms) {
        for (const night of nightsOf(b.check_in, b.check_out)) {
          await q.query(`UPDATE allocations SET sold = GREATEST(sold - 1, 0) WHERE contract_id = $1 AND room_type_id = $2 AND stay_date = $3`,
            [b.contract_id, r.room_type_id, night]);
        }
      }
      await q.query('UPDATE bookings SET allocation_held = false WHERE id = $1', [bookingId]);
    });
  }
}

class AllocationExhausted extends Error {}
