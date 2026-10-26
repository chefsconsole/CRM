// Indicative price changes are never overwritten silently: every change produces a history row.

export interface PriceRange {
  priceMin: number | null;
  priceMax: number | null;
}

export class PricingError extends Error {
  name = "PricingError";
}

export function validatePriceRange(r: PriceRange): void {
  if (r.priceMin !== null && r.priceMin < 0) throw new PricingError("Prices cannot be negative.");
  if (r.priceMax !== null && r.priceMax < 0) throw new PricingError("Prices cannot be negative.");
  if (r.priceMin !== null && r.priceMax !== null && r.priceMin > r.priceMax)
    throw new PricingError("Minimum price cannot be greater than maximum price.");
}

export function priceChanged(prev: PriceRange, next: PriceRange): boolean {
  return (prev.priceMin ?? null) !== (next.priceMin ?? null) || (prev.priceMax ?? null) !== (next.priceMax ?? null);
}

export function priceHistoryEntry(prev: PriceRange, next: PriceRange, source: { sourceName?: string | null; sourceUrl?: string | null }) {
  if (!priceChanged(prev, next)) return null;
  if (!source.sourceName?.trim()) throw new PricingError("Please record the source of the new price.");
  return {
    oldMin: prev.priceMin,
    oldMax: prev.priceMax,
    newMin: next.priceMin,
    newMax: next.priceMax,
    sourceName: source.sourceName.trim(),
    sourceUrl: source.sourceUrl?.trim() || null,
  };
}

export function changePct(oldV: number | null, newV: number | null): number | null {
  if (!oldV || !newV) return null;
  return (newV - oldV) / oldV;
}

/** Price per sq ft is only meaningful when both price and carpet area are known. */
export function pricePerSqft(price: number | null, carpetArea: number | null): number | null {
  if (!price || !carpetArea) return null;
  return Math.round(price / carpetArea);
}
