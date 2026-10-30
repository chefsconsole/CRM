import type { SupplierOffer } from '../inventory/types.js';
import { freeCancellationUntil } from './cancellation.js';

/**
 * Two offers are only "the same product" when every condition that affects value matches.
 * A cheaper rate with worse cancellation terms is NOT a cheaper price for the same thing.
 */
export interface Comparison { comparable: boolean; differences: string[] }

export function compareOffers(a: SupplierOffer, b: SupplierOffer, roomEquivalence: (a: string | null, b: string | null) => boolean): Comparison {
  const d: string[] = [];
  if (a.hotelId !== b.hotelId) d.push('different hotel');
  if (a.rooms.length !== b.rooms.length) d.push('different number of rooms');
  a.rooms.forEach((r, i) => {
    const o = b.rooms[i];
    if (!o) return;
    if (r.adults !== o.adults || r.childrenAges.join(',') !== o.childrenAges.join(',')) d.push(`room ${i + 1}: different occupancy`);
    if (!roomEquivalence(r.roomTypeId, o.roomTypeId)) d.push(`room ${i + 1}: room type not mapped as equivalent`);
    if (r.nightly.map((n) => n.date).join() !== o.nightly.map((n) => n.date).join()) d.push(`room ${i + 1}: different dates`);
  });
  if (a.mealPlan !== b.mealPlan) d.push('different meal plan');
  const checkIn = a.rooms[0]?.nightly[0]?.date ?? '';
  const fa = freeCancellationUntil(a.cancellationPolicy, checkIn)?.toISOString().slice(0, 10) ?? 'non-refundable';
  const fb = freeCancellationUntil(b.cancellationPolicy, checkIn)?.toISOString().slice(0, 10) ?? 'non-refundable';
  if (fa !== fb) d.push(`cancellation differs (${fa} vs ${fb})`);
  if (a.taxPolicy.includedInRate !== b.taxPolicy.includedInRate) d.push('tax treatment differs');
  if ((a.taxPolicy.localTaxPerPersonNightMinor ?? 0) !== (b.taxPolicy.localTaxPerPersonNightMinor ?? 0)) d.push('local charges differ');
  if (a.availability !== b.availability) d.push('confirmation type differs (instant vs on request)');
  if (a.currency !== b.currency) d.push('different currency (compare after recorded FX conversion only)');
  return { comparable: d.length === 0, differences: d };
}
