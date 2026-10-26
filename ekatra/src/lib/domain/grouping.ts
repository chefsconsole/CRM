// Suggested buying groups: compatible buyers clustered by project, configuration, budget band,
// commitment window and possession tolerance. Suggestions only — an administrator must review
// and approve before anyone is added to a campaign.

import type { InterestTier } from "@prisma/client";
import { budgetBand, BUDGET_BANDS, indicativeBudget, QUALIFIED_TIERS } from "./demand";
import { formatBhk } from "../format";

export interface GroupCandidate {
  buyerId: string;
  projectId: string;
  projectName: string;
  locationName: string;
  tier: InterestTier;
  configurations: number[];
  budgetMin: number | null;
  budgetMax: number | null;
  commitWithinDays: number | null;
  possessionWaitMonths: number | null;
  fundingReady: boolean;
}

export const COMMIT_BUCKETS = [
  { key: "now", label: "ready ≤ 30 days", max: 30 },
  { key: "soon", label: "ready in 1–3 months", max: 90 },
  { key: "later", label: "later / exploring", max: Infinity },
] as const;

export function commitBucket(days: number | null) {
  return COMMIT_BUCKETS.find((b) => (days ?? Infinity) <= b.max)!.key;
}
export function possessionBucket(months: number | null): "short" | "long" {
  return months !== null && months < 24 ? "short" : "long";
}

export interface SuggestedGroup {
  key: string;
  projectId: string;
  title: string;
  bhk: number;
  band: string;
  commit: string;
  buyerIds: string[];
  qualified: number;
  ready30: number;
  fundingReady: number;
  indicativeDemand: number;
  reasons: string[];
}

export function suggestGroups(candidates: GroupCandidate[], excluded: Set<string> = new Set(), minSize = 3): SuggestedGroup[] {
  const groups = new Map<string, { c: GroupCandidate[]; bhk: number; band: string; commit: string }>();
  for (const c of candidates) {
    const band = budgetBand(c.budgetMin, c.budgetMax);
    if (!band) continue; // undefined budgets cannot be grouped responsibly
    const commit = commitBucket(c.commitWithinDays);
    const pos = possessionBucket(c.possessionWaitMonths);
    for (const bhk of new Set(c.configurations)) {
      if (excluded.has(`${c.projectId}:${bhk}:${c.buyerId}`)) continue;
      const key = `${c.projectId}|${bhk}|${band}|${commit}|${pos}`;
      const g = groups.get(key) ?? { c: [], bhk, band, commit };
      if (!g.c.some((x) => x.buyerId === c.buyerId)) g.c.push(c);
      groups.set(key, g);
    }
  }
  return [...groups.entries()]
    .filter(([, g]) => g.c.length >= minSize)
    .map(([key, g]) => {
      const first = g.c[0]!;
      const bandLabel = BUDGET_BANDS.find((b) => b.key === g.band)!.label;
      const commitLabel = COMMIT_BUCKETS.find((b) => b.key === g.commit)!.label;
      const qualified = g.c.filter((x) => QUALIFIED_TIERS.includes(x.tier)).length;
      const ready30 = g.c.filter((x) => (x.commitWithinDays ?? Infinity) <= 30).length;
      return {
        key,
        projectId: first.projectId,
        title: `${first.locationName} · ${formatBhk(g.bhk)} · ${first.projectName}`,
        bhk: g.bhk,
        band: bandLabel,
        commit: commitLabel,
        buyerIds: g.c.map((x) => x.buyerId),
        qualified,
        ready30,
        fundingReady: g.c.filter((x) => x.fundingReady).length,
        indicativeDemand: g.c.reduce((s, x) => s + indicativeBudget(x.budgetMin, x.budgetMax), 0),
        reasons: [`Same project and ${formatBhk(g.bhk)}`, `Budgets in ${bandLabel}`, `All ${commitLabel}`, key.endsWith("short") ? "Want possession within 2 years" : "Comfortable waiting 2+ years"],
      };
    })
    .sort((a, b) => b.qualified * 3 + b.ready30 * 2 + b.buyerIds.length - (a.qualified * 3 + a.ready30 * 2 + a.buyerIds.length));
}
