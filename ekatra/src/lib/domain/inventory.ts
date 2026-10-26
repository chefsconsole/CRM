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
  else if ((now.getTime() - u.builderQuoteDate.getTime()) / 864e5 > QUOTE_MAX_AGE_DAYS) warnings.push(`Builder quote is older than ${QUOTE_MAX_AGE_DAYS} days — refresh before relying on it`);
  if (!u.builderQuoteSource?.trim()) problems.push("The source of the builder quote is not recorded");
  if (u.builderQuoteConfig && normalizeConfig(u.builderQuoteConfig) !== normalizeConfig(u.configuration))
    problems.push(`Configurations differ (${u.configuration} vs quote for ${u.builderQuoteConfig})`);
  if (!u.builderQuoteConfig) missing.push("Configuration of the builder quote");
  if (u.carpetArea && u.builderQuoteCarpet) {
    const delta = Math.abs(u.carpetArea - u.builderQuoteCarpet) / u.builderQuoteCarpet;
    if (delta > CARPET_TOLERANCE) problems.push(`Carpet areas differ by ${Math.round(delta * 100)}% (more than ${CARPET_TOLERANCE * 100}%)`);
  } else missing.push("Carpet area on both sides");
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
  const basis = allIn ? allIn.diff : diff;
  return { status, headline, allIn, isBelowBuilder: status === "COMPARABLE" && basis < 0, problems, warnings, missing };
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
