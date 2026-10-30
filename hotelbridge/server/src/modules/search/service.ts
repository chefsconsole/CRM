import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { badRequest } from '../../lib/errors.js';
import { diffDays, isIsoDate, today } from '../../lib/dates.js';
import { log } from '../../lib/log.js';
import { MEAL_PLANS, COLLECTIONS } from '../../../../shared/domain.js';
import { agentOfferView, persistOffer, priceSupplierOffer, SOURCE_LABEL, type AgencyCommercials } from './offers.js';
import { hotelCardView, loadHotelCards } from '../catalogue/views.js';
import type { SupplierOffer } from '../inventory/types.js';

export const searchSchema = z.object({
  destination: z.string().trim().min(2).max(80),
  checkIn: z.string().refine(isIsoDate, 'Invalid check-in date'),
  checkOut: z.string().refine(isIsoDate, 'Invalid check-out date'),
  rooms: z.array(z.object({
    adults: z.number().int().min(1).max(6),
    childrenAges: z.array(z.number().int().min(0).max(17)).max(4).default([]),
  })).min(1).max(9),
  mealPlan: z.enum(MEAL_PLANS).optional(),
  minStars: z.number().min(1).max(5).optional(),
  collection: z.enum(COLLECTIONS).optional(),
  hotelSlug: z.string().optional(),
});
export type SearchInput = z.infer<typeof searchSchema>;

export function validateStay(input: SearchInput, now: Date) {
  const nights = diffDays(input.checkIn, input.checkOut);
  if (input.checkIn < today(now)) throw badRequest('Check-in cannot be in the past.');
  if (nights < 1) throw badRequest('Check-out must be after check-in.');
  if (nights > 30) throw badRequest('Online booking supports stays of up to 30 nights. Please use the Group Desk for longer stays.');
  return nights;
}

export async function runSearch(ctx: AppContext, agency: AgencyCommercials, userId: string, input: SearchInput) {
  const now = ctx.now();
  const nights = validateStay(input, now);
  const hotels = await loadHotelCards(ctx.db, {
    city: input.destination, minStars: input.minStars, collection: input.collection, slug: input.hotelSlug, liveOnly: true,
  });
  const search = await ctx.db.one<{ id: string }>(
    `INSERT INTO searches (agency_id, user_id, destination, check_in, check_out, rooms, filters)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [agency.id, userId, input.destination, input.checkIn, input.checkOut, JSON.stringify(input.rooms),
      JSON.stringify({ mealPlan: input.mealPlan, minStars: input.minStars, collection: input.collection })],
  );
  const query = {
    agencyId: agency.id, city: input.destination, hotelIds: hotels.map((h) => h.id),
    checkIn: input.checkIn, checkOut: input.checkOut, rooms: input.rooms, mealPlan: input.mealPlan,
  };

  const sourceIssues: { source: string; message: string }[] = [];
  const supplierOffers: SupplierOffer[] = [];
  await Promise.all(ctx.registry.searchable().map(async (adapter) => {
    try {
      const res = await ctx.gateway.call(adapter, 'search', () => adapter.search({ db: ctx.db, q: ctx.db, now }, query), { request: query });
      supplierOffers.push(...res);
    } catch (err) {
      log.warn('supplier search failed', { source: adapter.code, error: (err as Error).message });
      sourceIssues.push({ source: adapter.code, message: `${adapter.name} did not respond; results may be incomplete.` });
    }
  }));

  const byHotel = new Map<string, ReturnType<typeof agentOfferView>[]>();
  for (const so of supplierOffers) {
    try {
      const priced = await priceSupplierOffer(ctx.db, agency, so, now);
      const stored = await persistOffer(ctx, ctx.db, { agencyId: agency.id, searchId: search!.id, priced });
      const view = agentOfferView(stored.id, stored.expiresAt, priced, SOURCE_LABEL[so.source] ?? so.source);
      byHotel.set(so.hotelId, [...(byHotel.get(so.hotelId) ?? []), view]);
    } catch (err) {
      log.warn('offer could not be priced', { hotelId: so.hotelId, source: so.source, error: (err as Error).message });
    }
  }

  const results = hotels.map((h) => {
    const offers = (byHotel.get(h.id) ?? []).sort((a, b) => a.totalMinor - b.totalMinor);
    return { hotel: hotelCardView(h), offers, fromMinor: offers[0]?.totalMinor ?? null, currency: offers[0]?.currency ?? null };
  }).sort((a, b) => (a.fromMinor === null ? 1 : 0) - (b.fromMinor === null ? 1 : 0) || (a.fromMinor ?? 0) - (b.fromMinor ?? 0));

  const available = results.filter((r) => r.offers.length).length;
  await ctx.db.query('UPDATE searches SET result_count = $2 WHERE id = $1', [search!.id, available]);
  return { searchId: search!.id, nights, query: input, results, sourceIssues };
}
