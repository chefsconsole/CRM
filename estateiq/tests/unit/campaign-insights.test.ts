import { describe, expect, it } from "vitest";
import { budgetFit, buyerReadinessTier, campaignInsights, explainMatch, uniqueAcrossCampaigns, type CampaignBuyer, type CampaignCriteria } from "@/lib/domain/campaign-insights";
import { istDay } from "@/lib/time";

const now = new Date("2026-10-27T10:00:00+05:30");
const day = istDay(now);
const locality: CampaignCriteria = { scope: "LOCALITY", localities: ["Borivali West"], configs: [2], budgetMin: 1.5e7, budgetMax: 2e7, projectPrice: null, targetBuyers: 10, countingTiers: ["VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"] };
const b = (id: string, o: Partial<CampaignBuyer> = {}): CampaignBuyer => ({
  buyerId: id, tier: "EXPRESSION_OF_INTEREST", active: true, stage: "NEW_INQUIRY", verification: "UNVERIFIED", fundingReadiness: "NOT_SHARED",
  budgetMin: 1.6e7, budgetMax: 1.9e7, budgetStretch: null, configs: [2], localities: ["Borivali West"], commitWithinDays: null, nextFollowUpAt: null, ...o,
});

describe("readiness is conservative — casual enquiries never count as committed", () => {
  it("derives tiers from verified contact, financing and stage", () => {
    expect(buyerReadinessTier({ stage: "NEW_INQUIRY", verification: "UNVERIFIED", fundingReadiness: "SELF_FUNDED" })).toBe("EXPRESSION_OF_INTEREST");
    expect(buyerReadinessTier({ stage: "CONTACTED", verification: "CONTACT_VERIFIED", fundingReadiness: "LOAN_REQUIRED" })).toBe("VERIFIED_LEAD");
    expect(buyerReadinessTier({ stage: "QUALIFIED", verification: "CONTACT_VERIFIED", fundingReadiness: "LOAN_PRE_APPROVED" })).toBe("FINANCIALLY_QUALIFIED");
    expect(buyerReadinessTier({ stage: "BOOKING_IN_PROGRESS", verification: "KYC_VERIFIED", fundingReadiness: "SELF_FUNDED" })).toBe("COMMITTED");
  });
});

describe("budget fit", () => {
  it("project campaigns compare with the entry price; locality campaigns with the band", () => {
    const project = { ...locality, scope: "PROJECT" as const, projectPrice: { min: 1.85e7, max: 2.2e7 } };
    expect(budgetFit(b("a"), project)).toBe("FITS");
    expect(budgetFit(b("a", { budgetMax: 1.8e7, budgetStretch: 1.9e7 }), project)).toBe("STRETCH");
    expect(budgetFit(b("a", { budgetMax: 1.5e7 }), project)).toBe("OUTSIDE");
    expect(budgetFit(b("a"), { ...project, projectPrice: null })).toBe("UNKNOWN");
    expect(budgetFit(b("a", { budgetMin: 2.5e7, budgetMax: 3e7 }), locality)).toBe("OUTSIDE");
    expect(budgetFit(b("a", { budgetMin: null, budgetMax: null }), locality)).toBe("UNKNOWN");
  });
});

describe("explainable matches", () => {
  it("lists why a buyer fits and what doesn't", () => {
    const e = explainMatch(b("a", { commitWithinDays: 15, fundingReadiness: "LOAN_PRE_APPROVED" }), locality);
    expect(e.matches).toBe(true);
    expect(e.reasons).toEqual(expect.arrayContaining(["Wants Borivali West", "Wants 2 BHK", "Can commit within 15 days", "Loan pre-approved"]));
    const miss = explainMatch(b("b", { localities: ["Thane"], configs: [3] }), locality);
    expect(miss.matches).toBe(false);
    expect(miss.misses.join()).toMatch(/Thane/);
  });
});

describe("campaign insights", () => {
  const rows = [
    b("a", { tier: "FINANCIALLY_QUALIFIED", fundingReadiness: "SELF_FUNDED", commitWithinDays: 15, nextFollowUpAt: new Date(day.start.getTime() - 864e5) }),
    b("a", { tier: "VERIFIED_LEAD" }), // duplicate row for the same person
    b("b", { tier: "VERIFIED_LEAD", commitWithinDays: 45, nextFollowUpAt: new Date(day.start.getTime() + 3600e3) }),
    b("c"),
    b("d"),
    b("e", { active: false, tier: "COMMITTED" }),
  ];
  const ins = campaignInsights(rows, locality, { now, dayStart: day.start, dayEnd: day.end });
  it("counts each buyer once, excludes withdrawn and keeps casual enquiries separate", () => {
    expect(ins.interested).toBe(4);
    expect(ins.counting).toBe(2);
    expect(ins.qualified).toBe(1);
    expect(ins.casual).toBe(2);
    expect(ins.committed).toBe(0);
  });
  it("reports readiness, budget fit, financing and follow-ups", () => {
    expect(ins.ready30).toBe(1);
    expect(ins.readyUnknown).toBe(2);
    expect(ins.budget.FITS).toBe(4);
    expect(ins.financing.SELF_FUNDED).toBe(1);
    expect(ins.followUpsDue).toBe(2);
    expect(ins.followUpsOverdue).toBe(1);
  });
  it("suggests the most urgent next action with a reason", () => {
    expect(ins.nextActions[0]!.title).toMatch(/overdue/);
    expect(ins.nextActions.every((a) => a.why.length > 0)).toBe(true);
  });
  it("suggests a developer proposal when a project campaign reaches target", () => {
    const p = campaignInsights([b("a", { tier: "VERIFIED_LEAD" }), b("b", { tier: "COMMITTED" })], { ...locality, scope: "PROJECT", targetBuyers: 2, projectPrice: { min: 1.8e7, max: 2e7 } }, { dayStart: day.start, dayEnd: day.end, status: "COLLECTING_DEMAND" });
    expect(p.nextActions.map((a) => a.title)).toContain("Prepare the developer proposal");
  });
  it("de-duplicates buyers across campaigns", () => {
    expect(uniqueAcrossCampaigns([{ campaignId: "1", buyerId: "a" }, { campaignId: "2", buyerId: "a" }, { campaignId: "2", buyerId: "b" }])).toEqual({ memberships: 3, uniqueBuyers: 2, inMultiple: 1 });
  });
});
