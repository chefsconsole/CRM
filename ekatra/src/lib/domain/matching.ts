// Transparent property-matching engine.
//
// Algorithm (documented in docs/MATCHING.md):
// 1. Gate: the property's deal type and segment must suit at least one of the buyer's intents
//    (a rental requirement never matches a sale; an office requirement never matches an apartment).
// 2. Score each applicable factor 0–1 and weight it. Unknown property data scores 0.5 and is flagged
//    "requires confirmation" rather than being guessed.
// 3. Score = Σ(weight × points) ÷ Σ(weights) × 100.
// 4. Any failed factor the buyer marked as a must-have caps the score at 35 and marks it ineligible.
// 5. A property outside every location the buyer chose is capped at 55 — it can be shown as a
//    partial alternative but never as a strong match, because location is fundamental.

import type { DealType, Intent, ProjectStatus, PropertySegment, PropertyType } from "@prisma/client";
import { FLEXIBLE_MONTHS, monthsUntil } from "./timelines";
import { grossYieldPct } from "./yield";

export interface MatchRequirement {
  intents: Intent[];
  stagePreferences: ProjectStatus[];
  propertyTypes: PropertyType[];
  primaryLocationId: string | null;
  secondaryLocationId: string | null;
  acceptableLocationIds: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetStretch: number | null;
  rentMin: number | null;
  rentMax: number | null;
  moveInBy: Date | null;
  possessionWaitMonths: number | null;
  configurations: number[];
  carpetMin: number | null;
  parkingNeeded: number | null;
  minGrossYieldPct: number | null;
  mustHaves: string[];
}

export interface MatchProperty {
  id: string;
  segment: PropertySegment;
  dealType: DealType;
  propertyType: PropertyType;
  status: ProjectStatus;
  locationId: string;
  locationParentId?: string | null;
  possessionDate: Date | null;
  availableFrom: Date | null;
  parkingSlots: number | null;
  monthlyRent: number | null;
  configurations: { bhk: number; carpetAreaMin: number | null; carpetAreaMax: number | null; priceMin: number | null; priceMax: number | null; rentMin: number | null; rentMax: number | null }[];
}

export type FactorStatus = "match" | "partial" | "miss" | "unknown";
export interface MatchFactor {
  key: "location" | "budget" | "configuration" | "carpet" | "possession" | "stage" | "parking" | "yield";
  label: string;
  status: FactorStatus;
  detail: string;
  weight: number;
  points: number;
}
export interface MatchResult {
  propertyId: string;
  eligible: boolean;
  score: number;
  factors: MatchFactor[];
  failedMustHaves: string[];
}

export const STRONG_MATCH = 60;
export const LOCATION_MISS_CAP = 55;
const RENT_INTENTS: Intent[] = ["RENT_RESIDENTIAL", "RENT_COMMERCIAL"];
const COMMERCIAL_TYPES: PropertyType[] = ["OFFICE", "RETAIL_SHOP", "SHOWROOM", "BUSINESS_PREMISES", "COWORKING", "WAREHOUSE"];

/** Does at least one intent accept this kind of property? */
export function intentAccepts(intent: Intent, p: Pick<MatchProperty, "segment" | "dealType" | "propertyType">): boolean {
  switch (intent) {
    case "RES_SELF_USE":
    case "RES_INVESTMENT":
      return p.segment === "RESIDENTIAL" && p.dealType === "SALE" && p.propertyType !== "PLOT";
    case "PLOT":
      return p.dealType === "SALE" && p.propertyType === "PLOT";
    case "COM_OFFICE":
      return p.segment === "COMMERCIAL" && p.dealType !== "RENT" && ["OFFICE", "COWORKING", "BUSINESS_PREMISES"].includes(p.propertyType);
    case "COM_RETAIL":
      return p.segment === "COMMERCIAL" && p.dealType !== "RENT" && ["RETAIL_SHOP", "SHOWROOM"].includes(p.propertyType);
    case "COM_INVESTMENT":
      return p.segment === "COMMERCIAL" && p.dealType !== "RENT";
    case "PRE_LEASED":
      return p.dealType === "PRE_LEASED";
    case "RENT_RESIDENTIAL":
      return p.segment === "RESIDENTIAL" && p.dealType === "RENT";
    case "RENT_COMMERCIAL":
      return p.segment === "COMMERCIAL" && p.dealType === "RENT";
  }
}

export function isRentalRequirement(r: Pick<MatchRequirement, "intents">) {
  return r.intents.length > 0 && r.intents.every((i) => RENT_INTENTS.includes(i));
}

function range(values: (number | null)[]): [number, number] | null {
  const v = values.filter((x): x is number => typeof x === "number" && x > 0);
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
}

export function matchProperty(r: MatchRequirement, p: MatchProperty, now = new Date()): MatchResult | null {
  if (!r.intents.some((i) => intentAccepts(i, p))) return null;
  if (r.propertyTypes.length && !r.propertyTypes.includes(p.propertyType)) {
    // Buyer asked for specific formats (e.g. office only, penthouse only).
    if (!(p.propertyType === "APARTMENT" && r.propertyTypes.some((t) => !COMMERCIAL_TYPES.includes(t)) && r.propertyTypes.includes("APARTMENT"))) return null;
  }
  const isRent = p.dealType === "RENT";
  const factors: MatchFactor[] = [];
  const add = (f: MatchFactor) => factors.push(f);

  // Location — only locations the buyer explicitly named count.
  const locs = [r.primaryLocationId, r.secondaryLocationId, ...r.acceptableLocationIds].filter(Boolean);
  if (!locs.length) add({ key: "location", label: "Location", status: "unknown", detail: "No location preference given", weight: 25, points: 0.5 });
  else {
    const at = (id: string | null) => id && (id === p.locationId || id === p.locationParentId);
    if (at(r.primaryLocationId)) add({ key: "location", label: "Location", status: "match", detail: "Preferred location — exact match", weight: 25, points: 1 });
    else if (at(r.secondaryLocationId)) add({ key: "location", label: "Location", status: "match", detail: "Your second preference", weight: 25, points: 0.85 });
    else if (r.acceptableLocationIds.some((id) => at(id))) add({ key: "location", label: "Location", status: "partial", detail: "An area you said is acceptable", weight: 25, points: 0.7 });
    else add({ key: "location", label: "Location", status: "miss", detail: "Outside your chosen locations", weight: 25, points: 0 });
  }

  // Configurations relevant to this buyer (all, if the buyer named none).
  const relevant = r.configurations.length
    ? p.configurations.filter((c) => r.configurations.some((b) => (b >= 5 ? c.bhk >= 5 : Math.abs(c.bhk - b) < 0.01)))
    : p.configurations;
  if (r.configurations.length && p.segment === "RESIDENTIAL" && p.propertyType !== "PLOT") {
    if (relevant.length) add({ key: "configuration", label: "Configuration", status: "match", detail: "Offers the configuration you want", weight: 15, points: 1 });
    else {
      const near = p.configurations.some((c) => r.configurations.some((b) => Math.abs(c.bhk - b) <= 0.5));
      add({ key: "configuration", label: "Configuration", status: near ? "partial" : "miss", detail: near ? "A close configuration is available" : "Your configuration is not offered", weight: 15, points: near ? 0.4 : 0 });
    }
  }
  const pool = relevant.length ? relevant : p.configurations;

  // Budget (rent for rentals, price otherwise).
  if (isRent) {
    const rr = range(pool.flatMap((c) => [c.rentMin, c.rentMax])) ?? (p.monthlyRent ? [p.monthlyRent, p.monthlyRent] : null);
    if (!rr || (!r.rentMax && !r.rentMin)) add({ key: "budget", label: "Monthly rent", status: "unknown", detail: rr ? "Share a rent budget to compare" : "Rent requires confirmation", weight: 25, points: 0.5 });
    else if (!r.rentMax || rr[0] <= r.rentMax) add({ key: "budget", label: "Monthly rent", status: "match", detail: "Within your rent budget", weight: 25, points: 1 });
    else if (rr[0] <= r.rentMax * 1.1) add({ key: "budget", label: "Monthly rent", status: "partial", detail: "Slightly above your rent budget", weight: 25, points: 0.5 });
    else add({ key: "budget", label: "Monthly rent", status: "miss", detail: "Above your rent budget", weight: 25, points: 0 });
  } else {
    const pr = range(pool.flatMap((c) => [c.priceMin, c.priceMax]));
    if (!pr) add({ key: "budget", label: "Budget", status: "unknown", detail: "Price requires confirmation", weight: 25, points: 0.5 });
    else if (!r.budgetMax && !r.budgetMin) add({ key: "budget", label: "Budget", status: "unknown", detail: "Share a budget to compare", weight: 25, points: 0.5 });
    else if (!r.budgetMax || pr[0] <= r.budgetMax) add({ key: "budget", label: "Budget", status: "match", detail: "Within your budget range", weight: 25, points: 1 });
    else if (r.budgetStretch && pr[0] <= r.budgetStretch) add({ key: "budget", label: "Budget", status: "partial", detail: "Within your stretch budget", weight: 25, points: 0.6 });
    else add({ key: "budget", label: "Budget", status: "miss", detail: "Starting price is above your budget", weight: 25, points: 0 });
  }

  // Carpet area.
  if (r.carpetMin) {
    const ar = range(pool.flatMap((c) => [c.carpetAreaMin, c.carpetAreaMax]));
    if (!ar) add({ key: "carpet", label: "Carpet area", status: "unknown", detail: "Carpet area requires confirmation", weight: 10, points: 0.5 });
    else if (ar[1] >= r.carpetMin) add({ key: "carpet", label: "Carpet area", status: "match", detail: "Meets your minimum carpet area", weight: 10, points: 1 });
    else if (ar[1] >= r.carpetMin * 0.9) add({ key: "carpet", label: "Carpet area", status: "partial", detail: "Within 10% of your minimum", weight: 10, points: 0.5 });
    else add({ key: "carpet", label: "Carpet area", status: "miss", detail: "Smaller than your minimum", weight: 10, points: 0 });
  }

  // Possession (purchases) or move-in date (rentals).
  if (isRent) {
    if (r.moveInBy) {
      const ok = !p.availableFrom || p.availableFrom <= r.moveInBy;
      add({ key: "possession", label: "Move-in", status: !p.availableFrom ? "unknown" : ok ? "match" : "miss", detail: !p.availableFrom ? "Availability requires confirmation" : ok ? "Available by your move-in date" : "Available after your move-in date", weight: 15, points: !p.availableFrom ? 0.5 : ok ? 1 : 0 });
    }
  } else if (r.possessionWaitMonths !== null) {
    const ready = p.status === "READY_TO_MOVE" || p.dealType === "PRE_LEASED";
    if (r.possessionWaitMonths >= FLEXIBLE_MONTHS) add({ key: "possession", label: "Possession", status: "match", detail: "You are flexible on possession", weight: 15, points: 1 });
    else if (ready) add({ key: "possession", label: "Possession", status: "match", detail: "Ready for possession", weight: 15, points: 1 });
    else if (!p.possessionDate) add({ key: "possession", label: "Possession", status: "unknown", detail: "Possession date requires confirmation", weight: 15, points: 0.5 });
    else {
      const m = monthsUntil(p.possessionDate, now);
      if (m <= r.possessionWaitMonths) add({ key: "possession", label: "Possession", status: "match", detail: "Within your preferred waiting period", weight: 15, points: 1 });
      else if (m <= r.possessionWaitMonths + 6) add({ key: "possession", label: "Possession", status: "partial", detail: "Up to 6 months beyond your waiting period", weight: 15, points: 0.4 });
      else add({ key: "possession", label: "Possession", status: "miss", detail: "Possession is later than you can wait", weight: 15, points: 0 });
    }
  }

  // Project stage preference.
  if (r.stagePreferences.length) {
    const ok = r.stagePreferences.includes(p.status);
    add({ key: "stage", label: "Project stage", status: ok ? "match" : "partial", detail: ok ? "Matches your preferred project stage" : "A different project stage", weight: 5, points: ok ? 1 : 0.3 });
  }

  // Parking.
  if (r.parkingNeeded) {
    if (p.parkingSlots === null) add({ key: "parking", label: "Parking", status: "unknown", detail: "Parking requires confirmation", weight: 5, points: 0.5 });
    else add({ key: "parking", label: "Parking", status: p.parkingSlots >= r.parkingNeeded ? "match" : "miss", detail: p.parkingSlots >= r.parkingNeeded ? "Enough parking" : "Not enough parking", weight: 5, points: p.parkingSlots >= r.parkingNeeded ? 1 : 0 });
  }

  // Yield for investors.
  if (r.minGrossYieldPct && p.dealType === "PRE_LEASED") {
    const price = range(pool.flatMap((c) => [c.priceMin]))?.[0] ?? null;
    const y = grossYieldPct(p.monthlyRent, price);
    if (y === null) add({ key: "yield", label: "Gross yield", status: "unknown", detail: "Rent or price requires confirmation", weight: 10, points: 0.5 });
    else add({ key: "yield", label: "Gross yield", status: y >= r.minGrossYieldPct ? "match" : "miss", detail: `Estimated gross yield ${y}% (not guaranteed)`, weight: 10, points: y >= r.minGrossYieldPct ? 1 : 0 });
  }

  const totalW = factors.reduce((s, f) => s + f.weight, 0) || 1;
  let score = Math.round((factors.reduce((s, f) => s + f.weight * f.points, 0) / totalW) * 100);
  const failedMustHaves = factors.filter((f) => r.mustHaves.includes(f.key) && f.status === "miss").map((f) => f.key);
  if (failedMustHaves.length) score = Math.min(score, 35);
  else if (factors.some((f) => f.key === "location" && f.status === "miss")) score = Math.min(score, LOCATION_MISS_CAP);
  return { propertyId: p.id, eligible: failedMustHaves.length === 0, score, factors, failedMustHaves };
}

export function rankMatches(r: MatchRequirement, properties: MatchProperty[], now = new Date()): MatchResult[] {
  return properties
    .map((p) => matchProperty(r, p, now))
    .filter((m): m is MatchResult => m !== null)
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}
