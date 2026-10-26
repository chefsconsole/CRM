import { describe, expect, it } from "vitest";
import { classifyPriority, effectivePriority } from "@/lib/domain/priority";
import { suggestGroups, type GroupCandidate } from "@/lib/domain/grouping";
import { compareInventory, unitBuyerFit } from "@/lib/domain/inventory";
import { priceHistoryEntry, PricingError, validatePriceRange, pricePerSqft } from "@/lib/domain/pricing";
import { findVisitConflicts } from "@/lib/domain/visits";
import { maskEmail, maskPhone, normalizeEmail, normalizeIndianPhone } from "@/lib/domain/identity";
import { grossYieldPct, netYield } from "@/lib/domain/yield";
import { formatINR, formatINRFull, formatPhone } from "@/lib/format";
import { parseCsv, rowsFromCsv } from "@/lib/inventory-csv";
import { isPubliclyVisible, needsReverification } from "@/lib/domain/compliance";
import { signFollowToken, verifyFollowToken } from "@/lib/follow-token";

describe("priority (never based on budget size)", () => {
  const base = { commitWithinDays: 15, bookingWithinDays: 7, situation: "READY_TO_PURCHASE" as const, possessionWaitMonths: 36, hasLocations: true, hasBudget: true, hasConfigOrType: true, hasCompatibleProperty: true, wantsUpcoming: false };
  it("A requires short timeline, booking readiness, defined needs and a compatible property", () => {
    expect(classifyPriority(base).priority).toBe("A");
    expect(classifyPriority({ ...base, hasCompatibleProperty: false }).priority).toBe("B");
    expect(classifyPriority({ ...base, bookingWithinDays: -1 }).priority).toBe("B");
  });
  it("C for later purchases or long possession tolerance, D when undefined", () => {
    expect(classifyPriority({ ...base, commitWithinDays: 365 }).priority).toBe("C");
    expect(classifyPriority({ ...base, commitWithinDays: 9999, hasBudget: false, possessionWaitMonths: null }).priority).toBe("D");
  });
  it("explains itself and respects overrides", () => {
    expect(classifyPriority(base).reasons.length).toBeGreaterThan(1);
    expect(effectivePriority("D", "A")).toBe("A");
    expect(effectivePriority("B", null)).toBe("B");
  });
});

describe("group suggestions", () => {
  const c = (id: string, o: Partial<GroupCandidate> = {}): GroupCandidate => ({ buyerId: id, projectId: "p", projectName: "P", locationName: "Borivali West", tier: "VERIFIED_LEAD", configurations: [2], budgetMin: 1.5e7, budgetMax: 1.8e7, commitWithinDays: 30, possessionWaitMonths: 36, fundingReady: true, ...o });
  it("clusters compatible buyers and keeps incompatible ones apart", () => {
    const g = suggestGroups([c("a"), c("b"), c("c"), c("d", { configurations: [3] }), c("e", { commitWithinDays: 365 })]);
    expect(g).toHaveLength(1);
    expect(g[0]!.buyerIds.sort()).toEqual(["a", "b", "c"]);
  });
  it("excludes buyers already in a campaign and those without a budget", () => {
    expect(suggestGroups([c("a"), c("b"), c("c")], new Set(["p:2:a"]))).toHaveLength(0);
    expect(suggestGroups([c("a"), c("b"), c("c", { budgetMin: null, budgetMax: null })])).toHaveLength(0);
  });
  it("counts each buyer once even with duplicate rows", () => {
    expect(suggestGroups([c("a"), c("a"), c("b"), c("c")])[0]!.buyerIds).toHaveLength(3);
  });
});

describe("inventory comparison", () => {
  const u = { configuration: "2 BHK", carpetArea: 740, floor: "12", askingPrice: 1.9e7, askingExtraCosts: 1.3e6, builderQuote: 2.05e7, builderQuoteDate: new Date("2026-10-10"), builderQuoteSource: "Developer cost sheet", builderQuoteConfig: "2 BHK", builderQuoteCarpet: 745, builderQuoteFloor: "12", builderExtraCosts: 1.6e6 };
  const now = new Date("2026-10-26");
  it("labels a unit below the builder only when like-for-like", () => {
    const r = compareInventory(u, now);
    expect(r.status).toBe("COMPARABLE");
    expect(r.isBelowBuilder).toBe(true);
    expect(r.headline).toEqual({ diff: -1.5e6, pct: -7.3 });
    expect(r.allIn!.diff).toBe(-1.8e6);
  });
  it("refuses mismatched or undated quotes", () => {
    expect(compareInventory({ ...u, builderQuoteConfig: "3 BHK" }, now).isBelowBuilder).toBe(false);
    expect(compareInventory({ ...u, builderQuoteCarpet: 900 }, now).status).toBe("NOT_COMPARABLE");
    expect(compareInventory({ ...u, builderQuoteDate: null }, now).status).toBe("NOT_COMPARABLE");
    expect(compareInventory({ ...u, builderQuote: null }, now).status).toBe("NO_QUOTE");
  });
  it("lists missing costs instead of assuming them", () => {
    const r = compareInventory({ ...u, askingExtraCosts: null }, now);
    expect(r.allIn).toBeNull();
    expect(r.missing.join(" ")).toMatch(/our unit/);
  });
  it("warns about stale quotes", () => {
    expect(compareInventory({ ...u, builderQuoteDate: new Date("2026-05-01") }, now).warnings[0]).toMatch(/older than/);
  });
  it("buyer fit respects budget and configuration", () => {
    const unit = { bhk: 2, askingPrice: 1.9e7, microMarket: "Borivali West", carpetArea: 740 };
    expect(unitBuyerFit(unit, { id: "b", budgetMin: 1.5e7, budgetMax: 2e7, budgetStretch: null, configs: [2], locationNames: ["Borivali West"], carpetMin: 700, commitWithinDays: 15 })!.score).toBe(100);
    expect(unitBuyerFit(unit, { id: "b", budgetMin: 1e7, budgetMax: 1.5e7, budgetStretch: null, configs: [2], locationNames: [], carpetMin: null, commitWithinDays: null })).toBeNull();
    expect(unitBuyerFit(unit, { id: "b", budgetMin: 1.5e7, budgetMax: 2e7, budgetStretch: null, configs: [3], locationNames: [], carpetMin: null, commitWithinDays: null })).toBeNull();
  });
});

describe("pricing", () => {
  it("records a history entry with a source only when the price changes", () => {
    expect(priceHistoryEntry({ priceMin: 1, priceMax: 2 }, { priceMin: 1, priceMax: 2 }, {})).toBeNull();
    expect(() => priceHistoryEntry({ priceMin: 1, priceMax: 2 }, { priceMin: 2, priceMax: 3 }, {})).toThrow(PricingError);
    expect(priceHistoryEntry({ priceMin: 1, priceMax: 2 }, { priceMin: 2, priceMax: 3 }, { sourceName: "Price sheet" })).toMatchObject({ oldMin: 1, newMin: 2, sourceName: "Price sheet" });
  });
  it("validates ranges and computes price per carpet sq ft", () => {
    expect(() => validatePriceRange({ priceMin: 3, priceMax: 2 })).toThrow();
    expect(pricePerSqft(1.85e7, 760)).toBe(24342);
    expect(pricePerSqft(null, 760)).toBeNull();
  });
});

describe("site visit conflicts", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
  it("detects rep clashes with a travel buffer and buyer double-booking", () => {
    const existing = [{ id: "v1", scheduledAt: at(5), durationMins: 60, assignedToId: "rep", buyerId: "x", status: "SCHEDULED" as const }];
    expect(findVisitConflicts({ scheduledAt: new Date(at(6).getTime() + 15 * 60000), durationMins: 60, assignedToId: "rep", buyerId: "y", status: "SCHEDULED" }, existing)).toHaveLength(1);
    expect(findVisitConflicts({ scheduledAt: at(8), durationMins: 60, assignedToId: "rep", buyerId: "y", status: "SCHEDULED" }, existing)).toHaveLength(0);
    expect(findVisitConflicts({ scheduledAt: at(5), durationMins: 60, assignedToId: "other", buyerId: "x", status: "SCHEDULED" }, existing)[0]!.reason).toBe("BUYER_BUSY");
    expect(findVisitConflicts({ scheduledAt: at(5), durationMins: 60, assignedToId: "rep", buyerId: "y", status: "SCHEDULED" }, [{ ...existing[0]!, status: "CANCELLED" }])).toHaveLength(0);
  });
});

describe("identity & privacy helpers", () => {
  it("normalises Indian phones and emails for duplicate detection", () => {
    for (const p of ["98200 12345", "+91 98200-12345", "09820012345", "919820012345", "0091 9820012345"]) expect(normalizeIndianPhone(p)).toBe("+919820012345");
    expect(normalizeIndianPhone("12345")).toBeNull();
    expect(normalizeIndianPhone("5820012345")).toBeNull();
    expect(normalizeEmail("  Riya@Example.COM ")).toBe("riya@example.com");
    expect(normalizeEmail("nope")).toBeNull();
  });
  it("masks PII for restricted roles", () => {
    expect(maskPhone("+919820012345")).toBe("+91 98•••• ••45");
    expect(maskEmail("riya@example.com")).toBe("r•••@example.com");
  });
  it("signed follow-up tokens expire and resist tampering", () => {
    const t = signFollowToken("buyer123", 1_000_000);
    expect(verifyFollowToken(t, 1_000_001)).toBe("buyer123");
    expect(verifyFollowToken(t, 1_000_000 + 3 * 3600_000)).toBeNull();
    expect(verifyFollowToken(t.slice(0, -2) + "xx", 1_000_001)).toBeNull();
  });
});

describe("formatting, yield, csv, compliance", () => {
  it("formats INR the Indian way", () => {
    expect(formatINR(1.25e7)).toBe("₹1.25 Cr");
    expect(formatINR(8.5e6)).toBe("₹85 L");
    expect(formatINR(42000)).toBe("₹42,000");
    expect(formatINRFull(2e7)).toBe("₹2,00,00,000");
    expect(formatPhone("+919820012345")).toBe("+91 98200 12345");
  });
  it("gross yield and net yield (only with expense data)", () => {
    expect(grossYieldPct(2.1e5, 3.6e7)).toBe(7);
    expect(netYield({ monthlyRent: 2.1e5, price: 3.6e7, maintenanceMonthly: null, propertyTaxAnnual: 85000 })).toBeNull();
    expect(netYield({ monthlyRent: 2.1e5, price: 3.6e7, maintenanceMonthly: 18000, propertyTaxAnnual: 85000 })).toEqual({ pct: 6.16, included: ["Maintenance", "Property tax"] });
  });
  it("parses CSV with quotes and validates inventory rows", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    const { valid, errors } = rowsFromCsv("reference,project_name,micro_market,configuration,asking_price_inr,availability\nR1,Proj,Borivali West,2 BHK,\"1,90,00,000\",available\nR2,Proj,Borivali West,2 BHK,,\nR1,Proj,Borivali West,2 BHK,1,");
    expect(valid).toHaveLength(1);
    expect(valid[0]!.askingPrice).toBe(1.9e7);
    expect(valid[0]!.availability).toBe("AVAILABLE");
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
  });
  it("public visibility needs publication AND compliance review", () => {
    expect(isPubliclyVisible({ isPublished: true, complianceReviewed: false })).toBe(false);
    expect(isPubliclyVisible({ isPublished: true, complianceReviewed: true })).toBe(true);
    expect(needsReverification(null)).toBe(true);
    expect(needsReverification(new Date("2026-10-20"), new Date("2026-10-26"))).toBe(false);
  });
});
