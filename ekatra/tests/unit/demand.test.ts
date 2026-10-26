import { describe, expect, it } from "vitest";
import { computeCampaignMetrics, newlyCrossedMilestones, publicDemandLabel, publicGroupStage, publicProgress, uniqueActiveMembers, type DemandMember } from "@/lib/domain/demand";
import { isLiveConfirmed, effectiveBenefitStatus } from "@/lib/domain/benefits";

const m = (buyerId: string, tier: DemandMember["tier"], over: Partial<DemandMember> = {}): DemandMember => ({ buyerId, tier, interestStatus: "ACTIVE", configurations: [2], budgetMin: 1.5e7, budgetMax: 1.8e7, timeline: "IMMEDIATE", joinedAt: new Date("2026-10-01"), ...over });
const target = { targetBuyers: 4, countingTiers: ["VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"] as DemandMember["tier"][] };

describe("unique buyer counting", () => {
  it("counts each buyer once, keeps the strongest tier and drops withdrawn interest", () => {
    const u = uniqueActiveMembers([m("a", "EXPRESSION_OF_INTEREST"), m("a", "FINANCIALLY_QUALIFIED"), m("b", "VERIFIED_LEAD", { interestStatus: "WITHDRAWN" })]);
    expect(u).toHaveLength(1);
    expect(u[0]!.tier).toBe("FINANCIALLY_QUALIFIED");
  });
  it("counts only configured tiers toward the target and never double counts budgets", () => {
    const metrics = computeCampaignMetrics([m("a", "EXPRESSION_OF_INTEREST"), m("b", "VERIFIED_LEAD"), m("b", "VERIFIED_LEAD"), m("c", "COMMITTED", { configurations: [3], budgetMin: 3e7 })], target);
    expect(metrics.registered).toBe(3);
    expect(metrics.counting).toBe(2);
    expect(metrics.qualified).toBe(1);
    expect(metrics.progress).toBe(0.5);
    expect(metrics.combinedBudgetCounting).toBe(1.5e7 + 3e7);
    expect(metrics.byConfig).toEqual([{ bhk: 2, buyers: 2 }, { bhk: 3, buyers: 1 }]);
  });
  it("caps progress at 100%", () => {
    expect(computeCampaignMetrics(["a", "b", "c", "d", "e"].map((x) => m(x, "VERIFIED_LEAD")), target).progress).toBe(1);
  });
});

describe("milestones", () => {
  it("fires each milestone once", () => {
    expect(newlyCrossedMilestones(0.76, [])).toEqual([50, 75]);
    expect(newlyCrossedMilestones(0.76, [50, 75])).toEqual([]);
    expect(newlyCrossedMilestones(1, [50, 75])).toEqual([100]);
  });
});

describe("public display", () => {
  it("respects visibility settings", () => {
    expect(publicDemandLabel(8, "EXACT")).toEqual({ value: "8", caption: "interested buyers" });
    expect(publicDemandLabel(13, "APPROXIMATE")?.value).toBe("10+");
    expect(publicDemandLabel(3, "APPROXIMATE")?.value).toBe("Forming");
    expect(publicDemandLabel(50, "PRIVATE")).toBeNull();
    expect(publicProgress(0.5, "APPROXIMATE")).toBeNull();
  });
  it("never shows 'benefits confirmed' without a live confirmed benefit", () => {
    expect(publicGroupStage("BENEFITS_CONFIRMED", false)).toBe("NEGOTIATING");
    expect(publicGroupStage("BENEFITS_CONFIRMED", true)).toBe("BENEFITS_CONFIRMED");
    expect(publicGroupStage("READY_FOR_DEVELOPER", true)).toBe("BUILDING_DEMAND");
  });
  it("treats lapsed or unconfirmed benefits as not live", () => {
    const now = new Date("2026-10-26");
    expect(isLiveConfirmed({ status: "UNDER_NEGOTIATION", confirmedAt: null, validUntil: null }, now)).toBe(false);
    expect(isLiveConfirmed({ status: "CONFIRMED", confirmedAt: new Date("2026-10-01"), validUntil: new Date("2026-10-20") }, now)).toBe(false);
    expect(effectiveBenefitStatus({ status: "CONFIRMED", confirmedAt: new Date("2026-10-01"), validUntil: new Date("2026-10-20") }, now)).toBe("EXPIRED_WITHDRAWN");
    expect(isLiveConfirmed({ status: "CONFIRMED", confirmedAt: new Date("2026-10-01"), validUntil: null }, now)).toBe(true);
  });
});
