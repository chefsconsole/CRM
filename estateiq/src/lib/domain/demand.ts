// Demand aggregation — the heart of the collective-buying model.
// Every figure here is computed from stored records; nothing is hard-coded.

import type { CampaignStatus, DemandVisibility, InterestStatus, InterestTier, PurchaseTimeline } from "@prisma/client";

export const ALL_TIERS: InterestTier[] = ["EXPRESSION_OF_INTEREST", "VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"];
export const QUALIFIED_TIERS: InterestTier[] = ["FINANCIALLY_QUALIFIED", "COMMITTED"];
export const DEFAULT_COUNTING_TIERS: InterestTier[] = ["VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"];
export const MILESTONES = [50, 75, 100] as const;

export interface DemandMember {
  buyerId: string;
  tier: InterestTier;
  interestStatus: InterestStatus;
  configurations: number[];
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: PurchaseTimeline;
  joinedAt: Date;
  hasVisitRequest?: boolean;
}

export interface CampaignTarget {
  targetBuyers: number;
  countingTiers: InterestTier[];
  focusConfigs?: number[];
}

export const BUDGET_BANDS = [
  { key: "lt1", label: "Under ₹1 Cr", min: 0, max: 1e7 },
  { key: "1to2", label: "₹1 – 2 Cr", min: 1e7, max: 2e7 },
  { key: "2to35", label: "₹2 – 3.5 Cr", min: 2e7, max: 3.5e7 },
  { key: "35to5", label: "₹3.5 – 5 Cr", min: 3.5e7, max: 5e7 },
  { key: "gt5", label: "₹5 Cr+", min: 5e7, max: Infinity },
] as const;

/** A conservative single figure for a stated range: the lower bound when present. */
export function indicativeBudget(min: number | null, max: number | null): number {
  return min ?? max ?? 0;
}

export function budgetBand(min: number | null, max: number | null): string | null {
  const v = indicativeBudget(min, max);
  if (!v) return null;
  return BUDGET_BANDS.find((b) => v >= b.min && v < b.max)?.key ?? null;
}

/** Keeps one entry per buyer (the strongest tier wins) and drops withdrawn interests. */
export function uniqueActiveMembers(members: DemandMember[]): DemandMember[] {
  const byBuyer = new Map<string, DemandMember>();
  for (const m of members) {
    if (m.interestStatus !== "ACTIVE") continue;
    const prev = byBuyer.get(m.buyerId);
    if (!prev || ALL_TIERS.indexOf(m.tier) > ALL_TIERS.indexOf(prev.tier)) byBuyer.set(m.buyerId, m);
  }
  return [...byBuyer.values()];
}

export interface CampaignMetrics {
  registered: number;
  counting: number;
  qualified: number;
  committed: number;
  progress: number;
  remaining: number;
  tierCounts: Record<InterestTier, number>;
  byConfig: { bhk: number; buyers: number }[];
  byBudgetBand: { key: string; label: string; buyers: number }[];
  byTimeline: Record<PurchaseTimeline, number>;
  combinedBudgetCounting: number;
  combinedBudgetQualified: number;
  visitRequests: number;
  readyForConversation: number;
}

export function computeCampaignMetrics(members: DemandMember[], target: CampaignTarget): CampaignMetrics {
  const unique = uniqueActiveMembers(members);
  const counting = unique.filter((m) => target.countingTiers.includes(m.tier));
  const qualified = unique.filter((m) => QUALIFIED_TIERS.includes(m.tier));

  const tierCounts = Object.fromEntries(ALL_TIERS.map((t) => [t, 0])) as Record<InterestTier, number>;
  for (const m of unique) tierCounts[m.tier]++;

  const configMap = new Map<number, number>();
  for (const m of unique) for (const bhk of new Set(m.configurations)) configMap.set(bhk, (configMap.get(bhk) ?? 0) + 1);

  const byTimeline = {
    IMMEDIATE: 0,
    WITHIN_6_MONTHS: 0,
    WITHIN_12_MONTHS: 0,
    BEYOND_12_MONTHS: 0,
    EXPLORING: 0,
  } as Record<PurchaseTimeline, number>;
  for (const m of unique) byTimeline[m.timeline]++;

  const byBudgetBand = BUDGET_BANDS.map((b) => ({
    key: b.key,
    label: b.label,
    buyers: unique.filter((m) => budgetBand(m.budgetMin, m.budgetMax) === b.key).length,
  }));

  const target_ = Math.max(1, target.targetBuyers);
  return {
    registered: unique.length,
    counting: counting.length,
    qualified: qualified.length,
    committed: tierCounts.COMMITTED,
    progress: Math.min(1, counting.length / target_),
    remaining: Math.max(0, target_ - counting.length),
    tierCounts,
    byConfig: [...configMap.entries()].sort((a, b) => a[0] - b[0]).map(([bhk, buyers]) => ({ bhk, buyers })),
    byBudgetBand,
    byTimeline,
    combinedBudgetCounting: counting.reduce((s, m) => s + indicativeBudget(m.budgetMin, m.budgetMax), 0),
    combinedBudgetQualified: qualified.reduce((s, m) => s + indicativeBudget(m.budgetMin, m.budgetMax), 0),
    visitRequests: unique.filter((m) => m.hasVisitRequest).length,
    readyForConversation: qualified.length,
  };
}

/** Milestones newly crossed since the last notification (each fires once). */
export function newlyCrossedMilestones(progress: number, alreadyNotified: number[]): number[] {
  const pct = Math.floor(progress * 100 + 1e-9);
  return MILESTONES.filter((m) => pct >= m && !alreadyNotified.includes(m));
}

/** Cumulative unique counting buyers over time — for growth charts. */
export function demandGrowth(members: DemandMember[], target: CampaignTarget, buckets: Date[]): { date: Date; count: number }[] {
  const unique = uniqueActiveMembers(members).filter((m) => target.countingTiers.includes(m.tier));
  return buckets.map((date) => ({ date, count: unique.filter((m) => m.joinedAt <= date).length }));
}

// ───────────── Public display rules ─────────────

/** What a public visitor may see about a group's size. Never reveals identities or budgets. */
export function publicDemandLabel(count: number, visibility: DemandVisibility): { value: string; caption: string } | null {
  if (visibility === "PRIVATE") return null;
  if (visibility === "EXACT") return { value: String(count), caption: count === 1 ? "interested buyer" : "interested buyers" };
  if (count < 5) return { value: "Forming", caption: "first buyers registered" };
  const floor = count >= 100 ? 100 : count >= 50 ? 50 : count >= 25 ? 25 : count >= 10 ? 10 : 5;
  return { value: `${floor}+`, caption: "interested buyers" };
}

/** Progress is only shown publicly when exact counts are public. */
export function publicProgress(progress: number, visibility: DemandVisibility): number | null {
  return visibility === "EXACT" ? progress : null;
}

export type PublicGroupStage = "BUILDING_DEMAND" | "NEGOTIATING" | "BENEFITS_CONFIRMED" | "PAUSED" | "CLOSED";

/**
 * The public stage of a buying group. "Benefits confirmed" requires at least one
 * benefit actually confirmed by the developer and still valid — the campaign status alone is not enough.
 */
export function publicGroupStage(status: CampaignStatus, hasLiveConfirmedBenefit: boolean): PublicGroupStage {
  switch (status) {
    case "DRAFT":
    case "COLLECTING_DEMAND":
    case "READY_FOR_DEVELOPER":
      return "BUILDING_DEMAND";
    case "NEGOTIATING":
      return "NEGOTIATING";
    case "BENEFITS_CONFIRMED":
      return hasLiveConfirmedBenefit ? "BENEFITS_CONFIRMED" : "NEGOTIATING";
    case "PAUSED":
      return "PAUSED";
    case "CLOSED":
      return "CLOSED";
  }
}
