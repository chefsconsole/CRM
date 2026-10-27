import { describe, expect, it } from "vitest";
import { intentAccepts, matchProperty, rankMatches, LOCATION_MISS_CAP, type MatchProperty, type MatchRequirement } from "@/lib/domain/matching";

const NOW = new Date("2026-10-26");
const req = (o: Partial<MatchRequirement> = {}): MatchRequirement => ({ intents: ["RES_SELF_USE"], stagePreferences: [], propertyTypes: [], primaryLocationId: "bw", secondaryLocationId: null, acceptableLocationIds: [], budgetMin: 1.5e7, budgetMax: 2.2e7, budgetStretch: null, rentMin: null, rentMax: null, moveInBy: null, possessionWaitMonths: 48, configurations: [2], carpetMin: null, parkingNeeded: null, minGrossYieldPct: null, mustHaves: [], ...o });
const prop = (o: Partial<MatchProperty> = {}): MatchProperty => ({ id: "p", segment: "RESIDENTIAL", dealType: "SALE", propertyType: "APARTMENT", status: "UNDER_CONSTRUCTION", locationId: "bw", possessionDate: new Date("2029-06-30"), availableFrom: null, parkingSlots: null, monthlyRent: null, configurations: [{ bhk: 2, carpetAreaMin: 700, carpetAreaMax: 760, priceMin: 1.85e7, priceMax: 2.05e7, rentMin: null, rentMax: null }], ...o });

describe("matching engine", () => {
  it("scores a perfect fit at 100 with explanations", () => {
    const r = matchProperty(req(), prop(), NOW)!;
    expect(r.score).toBe(100);
    expect(r.eligible).toBe(true);
    expect(r.factors.map((f) => f.status)).toEqual(["match", "match", "match", "match"]);
  });
  it("budget compatibility: within, stretch, above", () => {
    expect(matchProperty(req({ budgetMax: 1.7e7 }), prop(), NOW)!.factors.find((f) => f.key === "budget")!.status).toBe("miss");
    expect(matchProperty(req({ budgetMax: 1.7e7, budgetStretch: 1.9e7 }), prop(), NOW)!.factors.find((f) => f.key === "budget")!.status).toBe("partial");
  });
  it("possession timeline is independent of purchase timing", () => {
    const short = matchProperty(req({ possessionWaitMonths: 12 }), prop(), NOW)!;
    expect(short.factors.find((f) => f.key === "possession")!.status).toBe("miss");
    expect(matchProperty(req({ possessionWaitMonths: 999 }), prop(), NOW)!.factors.find((f) => f.key === "possession")!.status).toBe("match");
    expect(matchProperty(req({ possessionWaitMonths: 0 }), prop({ status: "READY_TO_MOVE", possessionDate: null }), NOW)!.factors.find((f) => f.key === "possession")!.status).toBe("match");
  });
  it("unknown data is flagged, not guessed", () => {
    const r = matchProperty(req(), prop({ possessionDate: null, configurations: [{ bhk: 2, carpetAreaMin: null, carpetAreaMax: null, priceMin: null, priceMax: null, rentMin: null, rentMax: null }] }), NOW)!;
    expect(r.factors.find((f) => f.key === "budget")!.status).toBe("unknown");
    expect(r.factors.find((f) => f.key === "possession")!.detail).toMatch(/requires confirmation/);
  });
  it("must-haves are hard constraints", () => {
    const r = matchProperty(req({ mustHaves: ["budget"], budgetMax: 1e7 }), prop(), NOW)!;
    expect(r.eligible).toBe(false);
    expect(r.score).toBeLessThanOrEqual(35);
  });
  it("a property outside the buyer's chosen locations is never a strong match", () => {
    const r = matchProperty(req(), prop({ locationId: "thane" }), NOW)!;
    expect(r.score).toBeLessThanOrEqual(LOCATION_MISS_CAP);
  });
  it("does not assume nearby areas are acceptable", () => {
    expect(matchProperty(req(), prop({ locationId: "be" }), NOW)!.factors[0]!.status).toBe("miss");
    expect(matchProperty(req({ acceptableLocationIds: ["be"] }), prop({ locationId: "be" }), NOW)!.factors[0]!.status).toBe("partial");
  });
  it("separates rentals from purchases", () => {
    expect(matchProperty(req(), prop({ dealType: "RENT" }), NOW)).toBeNull();
    expect(matchProperty(req({ intents: ["RENT_RESIDENTIAL"] }), prop(), NOW)).toBeNull();
    const rent = matchProperty(req({ intents: ["RENT_RESIDENTIAL"], rentMax: 60000 }), prop({ dealType: "RENT", configurations: [{ bhk: 2, carpetAreaMin: 650, carpetAreaMax: 700, priceMin: null, priceMax: null, rentMin: 52000, rentMax: 60000 }] }), NOW)!;
    expect(rent.factors.find((f) => f.key === "budget")!.status).toBe("match");
  });
  it("separates commercial from residential", () => {
    expect(intentAccepts("COM_OFFICE", { segment: "RESIDENTIAL", dealType: "SALE", propertyType: "APARTMENT" })).toBe(false);
    expect(intentAccepts("RES_SELF_USE", { segment: "COMMERCIAL", dealType: "SALE", propertyType: "OFFICE" })).toBe(false);
    expect(intentAccepts("RENT_COMMERCIAL", { segment: "COMMERCIAL", dealType: "SALE", propertyType: "OFFICE" })).toBe(false);
    expect(intentAccepts("PRE_LEASED", { segment: "COMMERCIAL", dealType: "PRE_LEASED", propertyType: "OFFICE" })).toBe(true);
  });
  it("evaluates pre-leased gross yield against the investor's minimum", () => {
    const p = prop({ segment: "COMMERCIAL", dealType: "PRE_LEASED", propertyType: "OFFICE", monthlyRent: 2.1e5, configurations: [{ bhk: 0, carpetAreaMin: 1450, carpetAreaMax: 1450, priceMin: 3.6e7, priceMax: 3.6e7, rentMin: null, rentMax: null }] });
    const r = matchProperty(req({ intents: ["PRE_LEASED"], configurations: [], budgetMax: 4e7, minGrossYieldPct: 7.5 }), p, NOW)!;
    expect(r.factors.find((f) => f.key === "yield")!.status).toBe("miss"); // 7% gross
  });
  it("ranks eligible matches first", () => {
    const r = rankMatches(req({ mustHaves: ["location"] }), [prop({ id: "far", locationId: "x" }), prop({ id: "near" })], NOW);
    expect(r.map((x) => x.propertyId)).toEqual(["near", "far"]);
  });
});
