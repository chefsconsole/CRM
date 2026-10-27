// Deal-opportunity finder: where does aggregated demand make a developer conversation worthwhile?
// Recommendations are rules over saved data. They never predict discounts.

import type { DeveloperStage, InterestTier, NegotiationStatus } from "@prisma/client";
import { formatBhk, formatINR } from "../format";
import { indicativeBudget } from "./demand";

export interface OpportunityBuyer {
  buyerId: string;
  tier: InterestTier;
  configurations: number[];
  budgetMin: number | null;
  budgetMax: number | null;
  commitWithinDays: number | null;
}

export interface OpportunityInput {
  projectId: string;
  projectName: string;
  locationName: string;
  developerStage: DeveloperStage;
  hasSignedAgreement: boolean;
  priceVerified: boolean;
  minPrice: number | null;
  campaignTarget: number | null;
  openNegotiation: { status: NegotiationStatus; daysSinceFollowUp: number | null } | null;
  buyers: OpportunityBuyer[];
}

export interface Opportunity {
  projectId: string;
  title: string;
  interested: number;
  qualified: number;
  ready30: number;
  withinBudget: number;
  indicativeDemand: number;
  topConfig: { bhk: number; buyers: number } | null;
  score: number;
  scoreParts: { label: string; points: number }[];
  actions: string[];
}

const QUALIFIED: InterestTier[] = ["FINANCIALLY_QUALIFIED", "COMMITTED"];

export function evaluateOpportunity(i: OpportunityInput): Opportunity {
  // One row per buyer — budgets are never counted twice.
  const unique = new Map<string, OpportunityBuyer>();
  for (const b of i.buyers) if (!unique.has(b.buyerId)) unique.set(b.buyerId, b);
  const buyers = [...unique.values()];

  const qualified = buyers.filter((b) => QUALIFIED.includes(b.tier)).length;
  const ready30 = buyers.filter((b) => b.commitWithinDays !== null && b.commitWithinDays <= 30).length;
  const withinBudget = i.minPrice ? buyers.filter((b) => (b.budgetMax ?? b.budgetMin ?? 0) >= i.minPrice!).length : 0;
  const indicativeDemand = buyers.reduce((s, b) => s + indicativeBudget(b.budgetMin, b.budgetMax), 0);
  const configs = new Map<number, number>();
  for (const b of buyers) for (const c of new Set(b.configurations)) configs.set(c, (configs.get(c) ?? 0) + 1);
  const top = [...configs.entries()].sort((a, b) => b[1] - a[1])[0];
  const topConfig = top ? { bhk: top[0], buyers: top[1] } : null;

  const devPoints: Partial<Record<DeveloperStage, number>> = { NEGOTIATING: 4, TERMS_AGREED: 5, PROPOSAL_SENT: 3, CONTACTED: 1 };
  const scoreParts = [
    { label: "Qualified buyers × 3", points: qualified * 3 },
    { label: "Ready within 30 days × 4", points: ready30 * 4 },
    { label: "Within indicative price × 1", points: withinBudget },
    { label: "Indicative demand (₹ Cr × 0.2, max 10)", points: Math.min(10, Math.round((indicativeDemand / 1e7) * 0.2 * 10) / 10) },
    { label: "Developer relationship", points: devPoints[i.developerStage] ?? 0 },
    { label: "Signed commercial agreement", points: i.hasSignedAgreement ? 5 : 0 },
    { label: "Verified pricing", points: i.priceVerified ? 3 : 0 },
  ];
  const score = Math.round(scoreParts.reduce((s, p) => s + p.points, 0) * 10) / 10;

  const actions: string[] = [];
  const cfg = topConfig ? formatBhk(topConfig.bhk) : "relevant";
  const neg = i.openNegotiation;
  if (neg && ["AWAITING_RESPONSE", "PRESENTED"].includes(neg.status) && (neg.daysSinceFollowUp ?? 99) >= 5)
    actions.push(`Follow up with the developer — last contact ${neg.daysSinceFollowUp ?? "unknown"} days ago.`);
  if (!neg && (qualified >= 5 || ready30 >= 5 || (i.campaignTarget && qualified >= i.campaignTarget)))
    actions.push(`Prepare a developer proposal for the ${cfg} inventory (${qualified} qualified, ${ready30} ready within 30 days).`);
  if (!i.priceVerified) actions.push("Verify current pricing and available inventory before presenting demand.");
  const unverified = buyers.filter((b) => b.tier === "EXPRESSION_OF_INTEREST").length;
  if (unverified >= 3) actions.push(`Call ${unverified} unverified buyers to confirm their requirement.`);
  if (buyers.length < 5) actions.push("Keep building demand — share the buying group with prospective buyers.");
  if (!actions.length) actions.push("Keep the group warm with a confirmed project update.");

  return {
    projectId: i.projectId,
    title: `${i.locationName}${topConfig ? ` · ${formatBhk(topConfig.bhk)}` : ""} — ${i.projectName}`,
    interested: buyers.length,
    qualified,
    ready30,
    withinBudget,
    indicativeDemand,
    topConfig,
    score,
    scoreParts,
    actions,
  };
}

export function describeDemand(o: Opportunity): string {
  return `${o.interested} interested · ${o.qualified} qualified · ${o.ready30} ready ≤30d · ${formatINR(o.indicativeDemand)} stated budgets`;
}
