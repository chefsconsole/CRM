// Price comparison for our own inventory. A unit is only described as below the builder's price
// when a valid, dated, like-for-like quote exists. Assumptions and missing costs are always listed.

export interface InventoryComparable {
  configuration: string;
  carpetArea: number | null;
  floor: string | null;
  askingPrice: number;
  askingExtraCosts: number | null;
  builderQuote: number | null;
  builderQuoteDate: Date | null;
  builderQuoteSource: string | null;
  builderQuoteConfig: string | null;
  builderQuoteCarpet: number | null;
  builderQuoteFloor: string | null;
  builderExtraCosts: number | null;
  builderQuoteIncludes?: string | null;
  builderQuoteEvidence?: string | null;
}

export type ComparisonStatus = "COMPARABLE" | "NOT_COMPARABLE" | "NO_QUOTE";

export interface Comparison {
  status: ComparisonStatus;
  headline: { diff: number; pct: number } | null;
  allIn: { asking: number; builder: number; diff: number; pct: number } | null;
  isBelowBuilder: boolean;
  problems: string[];
  warnings: string[];
  missing: string[];
}

export const QUOTE_MAX_AGE_DAYS = 90;
export const CARPET_TOLERANCE = 0.05;

export function normalizeConfig(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, "").replace("bhk", "bhk");
}

export function compareInventory(u: InventoryComparable, now = new Date()): Comparison {
  const problems: string[] = [];
  const warnings: string[] = [];
  const missing: string[] = [];
  if (!u.builderQuote) {
    return { status: "NO_QUOTE", headline: null, allIn: null, isBelowBuilder: false, problems: ["No builder quote recorded"], warnings, missing: ["Builder quote"] };
  }
  if (!u.builderQuoteDate) problems.push("The builder quote has no date");
  else if (u.builderQuoteDate.getTime() > now.getTime() + 864e5) problems.push("The builder quote date is in the future");
  else if ((now.getTime() - u.builderQuoteDate.getTime()) / 864e5 > QUOTE_MAX_AGE_DAYS) problems.push(`The builder quote is older than ${QUOTE_MAX_AGE_DAYS} days — get a current quote`);
  if (!u.builderQuoteSource?.trim()) problems.push("The source of the builder quote is not recorded");
  if (u.builderQuoteConfig && normalizeConfig(u.builderQuoteConfig) !== normalizeConfig(u.configuration))
    problems.push(`Configurations differ (${u.configuration} vs quote for ${u.builderQuoteConfig})`);
  if (!u.builderQuoteConfig) missing.push("Configuration of the builder quote");
  if (u.carpetArea && u.builderQuoteCarpet) {
    const delta = Math.abs(u.carpetArea - u.builderQuoteCarpet) / u.builderQuoteCarpet;
    if (delta > CARPET_TOLERANCE) problems.push(`Carpet areas differ by ${Math.round(delta * 100)}% (more than ${CARPET_TOLERANCE * 100}%)`);
  } else missing.push("Carpet area on both sides");
  if (!u.builderQuoteEvidence?.trim()) missing.push("Evidence for the builder quote (upload the cost sheet or add its URL)");
  if (u.builderQuoteIncludes !== undefined && !u.builderQuoteIncludes?.trim()) missing.push("What the builder quote includes");
  if (u.floor && u.builderQuoteFloor && u.floor.trim().toLowerCase() !== u.builderQuoteFloor.trim().toLowerCase())
    warnings.push("Floors differ — floor-rise charges may explain part of the difference");

  const diff = u.askingPrice - u.builderQuote;
  const headline = { diff, pct: Math.round((diff / u.builderQuote) * 1000) / 10 };
  let allIn: Comparison["allIn"] = null;
  if (u.askingExtraCosts !== null && u.builderExtraCosts !== null) {
    const a = u.askingPrice + u.askingExtraCosts;
    const b = u.builderQuote + u.builderExtraCosts;
    allIn = { asking: a, builder: b, diff: a - b, pct: Math.round(((a - b) / b) * 1000) / 10 };
  } else {
    if (u.askingExtraCosts === null) missing.push("Additional costs on our unit (stamp duty, registration, GST, parking, etc.)");
    if (u.builderExtraCosts === null) missing.push("Additional costs on the builder quote (floor rise, PLC, development charges, GST, parking)");
  }
  const status: ComparisonStatus = problems.length ? "NOT_COMPARABLE" : "COMPARABLE";
  // A difference is only reported when the comparison is meaningful.
  if (status === "NOT_COMPARABLE") return { status, headline: null, allIn: null, isBelowBuilder: false, problems, warnings, missing };
  const basis = allIn ? allIn.diff : diff;
  return { status, headline, allIn, isBelowBuilder: basis < 0, problems, warnings, missing };
}

export interface BuyerForUnit {
  id: string;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetStretch: number | null;
  configs: number[];
  locationNames: string[];
  carpetMin: number | null;
  commitWithinDays: number | null;
}

/** Explainable buyer fit for a unit: returns reasons, or null when the budget or configuration rules it out. */
export function unitBuyerFit(unit: { bhk: number | null; askingPrice: number; microMarket: string; carpetArea: number | null }, b: BuyerForUnit) {
  const reasons: string[] = [];
  let score = 0;
  const cap = b.budgetMax ?? b.budgetMin;
  if (!cap) return null;
  if (unit.askingPrice <= cap) (score += 40), reasons.push("Within budget");
  else if (b.budgetStretch && unit.askingPrice <= b.budgetStretch) (score += 20), reasons.push("Within stretch budget");
  else return null;
  if (unit.bhk !== null && b.configs.length) {
    if (!b.configs.includes(unit.bhk)) return null;
    score += 25;
    reasons.push("Configuration matches");
  }
  const mm = unit.microMarket.toLowerCase();
  if (b.locationNames.some((l) => l.toLowerCase() === mm)) (score += 25), reasons.push("Preferred location");
  else if (b.locationNames.length) reasons.push("Outside stated locations");
  if (b.carpetMin && unit.carpetArea) {
    if (unit.carpetArea >= b.carpetMin) (score += 5), reasons.push("Meets carpet area");
    else reasons.push("Below minimum carpet area");
  }
  if (b.commitWithinDays !== null && b.commitWithinDays <= 30) (score += 5), reasons.push("Ready within 30 days");
  return { score, reasons };
}

// ───────────────────────── Review, completeness ─────────────────────────

/** The inputs a comparison depends on. When any of them changes, a person must review it again. */
export function comparisonFingerprint(u: InventoryComparable & { builderQuoteExcludes?: string | null; askingIncludes?: string | null; askingExcludes?: string | null }): string {
  return JSON.stringify([
    u.configuration, u.carpetArea, u.floor, u.askingPrice, u.askingExtraCosts, u.askingIncludes ?? null, u.askingExcludes ?? null,
    u.builderQuote, u.builderQuoteDate?.toISOString() ?? null, u.builderQuoteSource, u.builderQuoteConfig, u.builderQuoteCarpet, u.builderQuoteFloor,
    u.builderQuoteIncludes ?? null, u.builderQuoteExcludes ?? null, u.builderExtraCosts,
  ]);
}

/**
 * What can be said about price. A saving is only "confirmed" when the comparison is meaningful AND a
 * person has reviewed the evidence and accepted it. Everything else is internal arithmetic.
 */
export type PriceClaim =
  | { kind: "CONFIRMED_SAVING"; diff: number; pct: number; basis: "all-in" | "headline" }
  | { kind: "CONFIRMED_PREMIUM"; diff: number; pct: number; basis: "all-in" | "headline" }
  | { kind: "AWAITING_REVIEW"; diff: number; pct: number; basis: "all-in" | "headline" }
  | { kind: "REVIEW_REJECTED" }
  | { kind: "NOT_COMPARABLE"; reasons: string[] }
  | { kind: "NO_QUOTE" };

export function priceClaim(c: Comparison, review: "UNREVIEWED" | "ACCEPTED" | "REJECTED"): PriceClaim {
  if (c.status === "NO_QUOTE") return { kind: "NO_QUOTE" };
  if (c.status === "NOT_COMPARABLE") return { kind: "NOT_COMPARABLE", reasons: c.problems };
  const b = c.allIn ?? c.headline!;
  const basis = c.allIn ? "all-in" : "headline";
  if (review === "REJECTED") return { kind: "REVIEW_REJECTED" };
  if (review !== "ACCEPTED") return { kind: "AWAITING_REVIEW", diff: b.diff, pct: b.pct, basis };
  return b.diff < 0 ? { kind: "CONFIRMED_SAVING", diff: b.diff, pct: b.pct, basis } : { kind: "CONFIRMED_PREMIUM", diff: b.diff, pct: b.pct, basis };
}

export interface GapInput extends InventoryComparable {
  developerName: string | null;
  unitNumber: string | null;
  parking: string | null;
  availability: string;
  lastVerifiedAt: Date | null;
  ownerSource: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  commercialTerms: string | null;
  askingIncludes: string | null;
  askingExcludes: string | null;
  photoUrls: string[];
  comparisonReview: "UNREVIEWED" | "ACCEPTED" | "REJECTED";
}

export interface Gap {
  key: string;
  label: string;
  /** "blocker" stops publication / confident use; "info" is good practice. */
  severity: "blocker" | "info";
}

export const VERIFY_MAX_AGE_DAYS = 30;

/** Missing or stale information for a unit, most important first. */
export function inventoryGaps(u: GapInput, now = new Date()): Gap[] {
  const gaps: Gap[] = [];
  if (u.availability === "UNCONFIRMED") gaps.push({ key: "availability", label: "Availability not confirmed with the owner", severity: "blocker" });
  if (!u.lastVerifiedAt) gaps.push({ key: "verified", label: "Never verified", severity: "blocker" });
  else if ((now.getTime() - u.lastVerifiedAt.getTime()) / 864e5 > VERIFY_MAX_AGE_DAYS) gaps.push({ key: "verified", label: `Not verified in the last ${VERIFY_MAX_AGE_DAYS} days`, severity: "blocker" });
  if (!u.ownerSource && !u.contactName) gaps.push({ key: "source", label: "Source / authorised contact missing", severity: "blocker" });
  else if (!u.contactPhone && !u.contactEmail) gaps.push({ key: "contact", label: "No phone or email for the authorised contact", severity: "blocker" });
  if (!u.carpetArea) gaps.push({ key: "carpet", label: "RERA carpet area", severity: "blocker" });
  if (!u.askingIncludes && !u.askingExcludes) gaps.push({ key: "charges", label: "What the asking price includes / excludes", severity: "blocker" });
  if (!u.commercialTerms) gaps.push({ key: "terms", label: "Commercial terms with the owner", severity: "info" });
  if (!u.builderQuote) gaps.push({ key: "quote", label: "No comparable developer quote", severity: "info" });
  else if (u.comparisonReview === "UNREVIEWED") gaps.push({ key: "review", label: "Price comparison awaiting manual review", severity: "info" });
  if (!u.floor) gaps.push({ key: "floor", label: "Floor", severity: "info" });
  if (!u.parking) gaps.push({ key: "parking", label: "Parking (write \"None\" if not included)", severity: "info" });
  if (!u.developerName) gaps.push({ key: "developer", label: "Developer", severity: "info" });
  if (!u.unitNumber) gaps.push({ key: "unit", label: "Unit number (kept private)", severity: "info" });
  if (!u.photoUrls.length) gaps.push({ key: "photos", label: "Photos", severity: "info" });
  return gaps;
}
