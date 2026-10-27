import { describe, expect, it } from "vitest";
import { compareInventory, comparisonFingerprint, inventoryGaps, priceClaim } from "@/lib/domain/inventory";
import { parseInventoryCsv, parseRupees, parseSheetDate, planInventoryImport, INVENTORY_COLUMNS } from "@/lib/inventory-csv";
import { toISTDateInput } from "@/lib/time";

const now = new Date("2026-10-26T12:00:00+05:30");
const unit = {
  configuration: "2 BHK", carpetArea: 740, floor: "12", askingPrice: 1.9e7, askingExtraCosts: 1.3e6,
  builderQuote: 2.05e7, builderQuoteDate: new Date("2026-10-10"), builderQuoteSource: "Developer cost sheet", builderQuoteConfig: "2 BHK",
  builderQuoteCarpet: 745, builderQuoteFloor: "12", builderExtraCosts: 1.6e6, builderQuoteIncludes: "1 car park", builderQuoteEvidence: "doc:abc",
};

describe("price claims need a comparable, dated, reviewed quote", () => {
  it("a calculated saving is only 'awaiting review' until a manager accepts it", () => {
    const c = compareInventory(unit, now);
    expect(priceClaim(c, "UNREVIEWED")).toMatchObject({ kind: "AWAITING_REVIEW", diff: -1.8e6, basis: "all-in" });
    expect(priceClaim(c, "ACCEPTED")).toMatchObject({ kind: "CONFIRMED_SAVING", diff: -1.8e6 });
    expect(priceClaim(c, "REJECTED").kind).toBe("REVIEW_REJECTED");
  });
  it("never computes a difference for a non-comparable quote, even if 'accepted'", () => {
    const c = compareInventory({ ...unit, builderQuoteSource: null }, now);
    expect(c.headline).toBeNull();
    expect(priceClaim(c, "ACCEPTED").kind).toBe("NOT_COMPARABLE");
    expect(compareInventory({ ...unit, builderQuoteDate: new Date("2026-11-30") }, now).problems.join()).toMatch(/future/);
  });
  it("a premium is reported honestly", () => {
    const c = compareInventory({ ...unit, askingPrice: 2.2e7 }, now);
    expect(priceClaim(c, "ACCEPTED").kind).toBe("CONFIRMED_PREMIUM");
  });
  it("flags missing evidence and inclusions", () => {
    const c = compareInventory({ ...unit, builderQuoteEvidence: null, builderQuoteIncludes: null }, now);
    expect(c.missing.join(" ")).toMatch(/Evidence/);
    expect(c.missing.join(" ")).toMatch(/includes/);
  });
  it("any change to the comparison inputs changes the fingerprint (forces re-review)", () => {
    expect(comparisonFingerprint(unit)).toBe(comparisonFingerprint({ ...unit }));
    expect(comparisonFingerprint(unit)).not.toBe(comparisonFingerprint({ ...unit, askingPrice: 1.89e7 }));
    expect(comparisonFingerprint(unit)).not.toBe(comparisonFingerprint({ ...unit, builderQuoteDate: new Date("2026-10-11") }));
  });
});

describe("missing information", () => {
  const full = {
    ...unit, developerName: "Dev", unitNumber: "A-1201", parking: "1 covered", availability: "AVAILABLE", lastVerifiedAt: new Date("2026-10-20"),
    ownerSource: "Owner (direct)", contactName: "R. Shah", contactPhone: "+919800000000", contactEmail: null, commercialTerms: "1% from seller",
    askingIncludes: "1 car park", askingExcludes: "Stamp duty", photoUrls: ["/files/x"], comparisonReview: "ACCEPTED" as const,
  };
  it("a complete unit has no gaps", () => expect(inventoryGaps(full, now)).toEqual([]));
  it("blocks on unconfirmed availability, stale verification, no source and no carpet area", () => {
    const g = inventoryGaps({ ...full, availability: "UNCONFIRMED", lastVerifiedAt: new Date("2026-08-01"), ownerSource: null, contactName: null, carpetArea: null }, now);
    expect(g.filter((x) => x.severity === "blocker").map((x) => x.key).sort()).toEqual(["availability", "carpet", "source", "verified"]);
  });
  it("asks for a review when a quote exists but nobody checked it", () => {
    expect(inventoryGaps({ ...full, comparisonReview: "UNREVIEWED" }, now).map((x) => x.key)).toContain("review");
  });
});

describe("CSV import", () => {
  it("reads Indian amount and date formats", () => {
    expect(parseRupees("2.15 Cr")).toBe(21500000);
    expect(parseRupees("₹2,15,00,000")).toBe(21500000);
    expect(parseRupees("85 L")).toBe(8500000);
    expect(parseRupees("85 lakh")).toBe(8500000);
    expect(parseRupees("abc")).toBeNaN();
    expect(toISTDateInput(parseSheetDate("12/10/2026") as Date)).toBe("2026-10-12");
    expect(toISTDateInput(parseSheetDate("2026-10-12") as Date)).toBe("2026-10-12");
    expect(parseSheetDate("31/02/2026")).toBe("invalid");
  });
  const header = INVENTORY_COLUMNS.join(",");
  const row = (o: Record<string, string>) => INVENTORY_COLUMNS.map((c) => o[c] ?? "").join(",");
  const base = { reference: "EIQ-1", project_name: "Aurelian", micro_market: "Borivali West", configuration: "2 BHK", asking_price_inr: "1.9 Cr", unit_number: "A-1201" };
  it("plans creates, duplicates (by reference and by unit) and row errors — without writing", () => {
    const csv = [header, row(base), row({ ...base, reference: "EIQ-2", unit_number: "A 1201" }), row({ ...base, reference: "EIQ-1", unit_number: "B-1" }), row({ ...base, reference: "EIQ-3", asking_price_inr: "" }), row({ ...base, reference: "EIQ-4", unit_number: "C-9" }), row({ ...base, reference: "EIQ-5", unit_number: "D-1", builder_quote_date: "45/45/2026" })].join("\n");
    const parsed = parseInventoryCsv(csv);
    expect(parsed.fileErrors).toEqual([]);
    const plan = planInventoryImport(parsed.rows, [{ id: "u9", reference: "EIQ-4", projectName: "aurelian", unitNumber: null }], { updateExisting: false });
    expect(plan.map((p) => p.action)).toEqual(["CREATE", "ERROR", "ERROR", "ERROR", "SKIP_DUPLICATE", "ERROR"]);
    expect(plan[1]!.messages[0]).toMatch(/Same project and unit as line 2/);
    expect(plan[2]!.messages[0]).toMatch(/Reference repeats line 2/);
    expect(plan[3]!.messages.join()).toMatch(/asking_price_inr/);
    expect(plan[5]!.messages.join()).toMatch(/Invalid date/);
    expect(plan[0]!.row!.askingPrice).toBe(1.9e7);
  });
  it("updates by reference only when asked, and refuses a unit already saved under another reference", () => {
    const csv = [header, row({ ...base, reference: "EIQ-4" }), row({ ...base, reference: "EIQ-7", unit_number: "Z-1" })].join("\n");
    const existing = [{ id: "u9", reference: "EIQ-4", projectName: "Aurelian", unitNumber: "X-1" }, { id: "u8", reference: "EIQ-8", projectName: "Aurelian", unitNumber: "Z-1" }];
    const plan = planInventoryImport(parseInventoryCsv(csv).rows, existing, { updateExisting: true });
    expect(plan.map((p) => p.action)).toEqual(["UPDATE", "SKIP_DUPLICATE"]);
    expect(plan[1]!.messages[0]).toMatch(/EIQ-8/);
  });
  it("rejects files without the required headers", () => {
    expect(parseInventoryCsv("ref,price\n1,2").fileErrors[0]).toMatch(/Missing required columns/);
  });
});
