// Demand Studio insights. Pure functions over stored records: who is in a campaign, how ready
// they are, whether their budgets fit, and what to do next — each figure with its reason.
// A buyer is always counted once, and a casual enquiry is never treated as a commitment.

import type { CampaignScope, FundingReadiness, InterestTier, LeadStage, BuyerVerification } from "@prisma/client";
import { ALL_TIERS, QUALIFIED_TIERS } from "./demand";
import { formatBhk, formatBudgetRange } from "../format";

export interface CampaignCriteria {
  scope: CampaignScope;
  /** Locality names the campaign is about (LOCALITY scope, or the project's locality). */
  localities: string[];
  configs: number[];
  budgetMin: number | null;
  budgetMax: number | null;
  /** Price range of the project for the focus configurations, when known (PROJECT scope). */
  projectPrice: { min: number | null; max: number | null } | null;
  targetBuyers: number;
  countingTiers: InterestTier[];
}

export interface CampaignBuyer {
  buyerId: string;
  /** Interest tier for a project campaign; derived readiness for locality/segment campaigns. */
  tier: InterestTier;
  active: boolean;
  stage: LeadStage;
  verification: BuyerVerification;
  fundingReadiness: FundingReadiness;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetStretch: number | null;
  configs: number[];
  localities: string[];
  commitWithinDays: number | null;
  nextFollowUpAt: Date | null;
  hasVisit?: boolean;
}

const READY_FUNDING: FundingReadiness[] = ["SELF_FUNDED", "LOAN_PRE_APPROVED"];
const CONTACTED_STAGES: LeadStage[] = ["CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION_FOLLOWUP", "BOOKING_IN_PROGRESS"];

/**
 * Readiness of a buyer who is not tied to one project. Conservative on purpose:
 *  - Committed only once a booking is actually in progress.
 *  - Financially qualified needs verified contact AND self-funding or a pre-approved loan.
 *  - Verified lead needs verified contact and at least one real conversation.
 *  - Everything else is a casual enquiry (expression of interest).
 */
export function buyerReadinessTier(b: { stage: LeadStage; verification: BuyerVerification; fundingReadiness: FundingReadiness }): InterestTier {
  if (b.stage === "BOOKING_IN_PROGRESS" || b.stage === "CONVERTED") return "COMMITTED";
  const verified = b.verification !== "UNVERIFIED";
  if (verified && READY_FUNDING.includes(b.fundingReadiness) && CONTACTED_STAGES.includes(b.stage)) return "FINANCIALLY_QUALIFIED";
  if (verified && CONTACTED_STAGES.includes(b.stage)) return "VERIFIED_LEAD";
  return "EXPRESSION_OF_INTEREST";
}

export type BudgetFit = "FITS" | "STRETCH" | "OUTSIDE" | "UNKNOWN";

/** Does the buyer's stated budget reach the price (project) or overlap the band (locality/segment)? */
export function budgetFit(b: Pick<CampaignBuyer, "budgetMin" | "budgetMax" | "budgetStretch">, c: Pick<CampaignCriteria, "scope" | "projectPrice" | "budgetMin" | "budgetMax">): BudgetFit {
  const cap = b.budgetMax ?? b.budgetMin;
  if (!cap) return "UNKNOWN";
  if (c.scope === "PROJECT") {
    const entry = c.projectPrice?.min ?? null;
    if (!entry) return "UNKNOWN";
    if (cap >= entry) return "FITS";
    if (b.budgetStretch && b.budgetStretch >= entry) return "STRETCH";
    return "OUTSIDE";
  }
  if (c.budgetMin === null && c.budgetMax === null) return "UNKNOWN";
  const lo = b.budgetMin ?? cap;
  const bandLo = c.budgetMin ?? 0;
  const bandHi = c.budgetMax ?? Infinity;
  if (cap >= bandLo && lo <= bandHi) return "FITS";
  if (b.budgetStretch && b.budgetStretch >= bandLo && lo <= bandHi) return "STRETCH";
  return "OUTSIDE";
}

export interface MatchExplanation {
  matches: boolean;
  reasons: string[];
  misses: string[];
}

/** Why a buyer belongs (or doesn't) in a campaign — shown next to every member and suggestion. */
export function explainMatch(b: CampaignBuyer, c: CampaignCriteria): MatchExplanation {
  const reasons: string[] = [];
  const misses: string[] = [];
  const locs = c.localities.map((l) => l.toLowerCase());
  if (locs.length) {
    const hit = b.localities.find((l) => locs.includes(l.toLowerCase()));
    if (hit) reasons.push(`Wants ${hit}`);
    else if (b.localities.length) misses.push(`Prefers ${b.localities.slice(0, 2).join(", ")}`);
    else misses.push("No locality stated");
  }
  if (c.configs.length) {
    const hit = b.configs.find((x) => c.configs.includes(x));
    if (hit !== undefined) reasons.push(`Wants ${formatBhk(hit)}`);
    else if (b.configs.length) misses.push(`Wants ${b.configs.map(formatBhk).join("/")}`);
    else misses.push("Configuration not stated");
  }
  const fit = budgetFit(b, c);
  if (fit === "FITS") reasons.push(`Budget ${formatBudgetRange(b.budgetMin, b.budgetMax)} fits`);
  else if (fit === "STRETCH") reasons.push("Fits with stretch budget");
  else if (fit === "OUTSIDE") misses.push(`Budget ${formatBudgetRange(b.budgetMin, b.budgetMax)} outside`);
  if (b.commitWithinDays !== null && b.commitWithinDays <= 30) reasons.push(`Can commit within ${b.commitWithinDays} days`);
  if (READY_FUNDING.includes(b.fundingReadiness)) reasons.push(b.fundingReadiness === "SELF_FUNDED" ? "Self-funded" : "Loan pre-approved");
  return { matches: misses.length === 0 && reasons.length > 0, reasons, misses };
}

export interface NextAction {
  title: string;
  why: string;
}

export interface CampaignInsights {
  interested: number;
  casual: number;
  qualified: number;
  committed: number;
  counting: number;
  progress: number;
  remaining: number;
  ready30: number;
  readyUnknown: number;
  budget: Record<BudgetFit, number> & { basis: string };
  financing: Record<FundingReadiness, number>;
  followUpsDue: number;
  followUpsOverdue: number;
  tierCounts: Record<InterestTier, number>;
  nextActions: NextAction[];
}

/** One row per buyer (strongest tier wins), withdrawn members excluded. */
export function uniqueBuyers(rows: CampaignBuyer[]): CampaignBuyer[] {
  const by = new Map<string, CampaignBuyer>();
  for (const r of rows) {
    if (!r.active) continue;
    const prev = by.get(r.buyerId);
    if (!prev || ALL_TIERS.indexOf(r.tier) > ALL_TIERS.indexOf(prev.tier)) by.set(r.buyerId, r);
  }
  return [...by.values()];
}

export function campaignInsights(rows: CampaignBuyer[], c: CampaignCriteria, opts: { now?: Date; dayEnd: Date; dayStart: Date; candidates?: number; status?: string; localityLabel?: string }): CampaignInsights {
  const u = uniqueBuyers(rows);
  const tierCounts = Object.fromEntries(ALL_TIERS.map((t) => [t, 0])) as Record<InterestTier, number>;
  for (const b of u) tierCounts[b.tier]++;
  const counting = u.filter((b) => c.countingTiers.includes(b.tier)).length;
  const qualified = u.filter((b) => QUALIFIED_TIERS.includes(b.tier)).length;
  const budget = { FITS: 0, STRETCH: 0, OUTSIDE: 0, UNKNOWN: 0 } as Record<BudgetFit, number>;
  for (const b of u) budget[budgetFit(b, c)]++;
  const financing = { NOT_SHARED: 0, SELF_FUNDED: 0, LOAN_PRE_APPROVED: 0, LOAN_REQUIRED: 0, PART_FUNDED: 0 } as Record<FundingReadiness, number>;
  for (const b of u) financing[b.fundingReadiness]++;
  const ready30 = u.filter((b) => b.commitWithinDays !== null && b.commitWithinDays <= 30).length;
  const readyUnknown = u.filter((b) => b.commitWithinDays === null).length;
  const followUpsDue = u.filter((b) => b.nextFollowUpAt && b.nextFollowUpAt < opts.dayEnd).length;
  const followUpsOverdue = u.filter((b) => b.nextFollowUpAt && b.nextFollowUpAt < opts.dayStart).length;
  const target = Math.max(1, c.targetBuyers);
  const basis = c.scope === "PROJECT" ? (c.projectPrice?.min ? "project entry price" : "project prices not recorded") : c.budgetMin !== null || c.budgetMax !== null ? "campaign budget band" : "no budget band set";

  const actions: (NextAction & { rank: number })[] = [];
  if (!u.length) actions.push({ rank: 0, title: opts.candidates ? `Review ${opts.candidates} matching buyer${opts.candidates > 1 ? "s" : ""} and add the right ones` : "Collect demand — no buyers yet", why: opts.candidates ? "They match this campaign's criteria but aren't members yet." : "No buyer in the database matches these criteria yet." });
  if (followUpsOverdue) actions.push({ rank: 1, title: `Call ${followUpsOverdue} buyer${followUpsOverdue > 1 ? "s" : ""} with overdue follow-ups`, why: "Overdue follow-ups are the fastest way to lose interest." });
  else if (followUpsDue) actions.push({ rank: 2, title: `Follow up with ${followUpsDue} buyer${followUpsDue > 1 ? "s" : ""} due today`, why: "Scheduled for today (IST)." });
  if (c.scope === "PROJECT" && counting >= target && ["COLLECTING_DEMAND", "READY_FOR_DEVELOPER", undefined].includes(opts.status)) actions.push({ rank: 1, title: "Prepare the developer proposal", why: `Target reached: ${counting} counting buyers (${qualified} financially qualified). Present anonymised demand — it is interest, not a commitment.` });
  if (c.scope !== "PROJECT" && qualified >= 5) actions.push({ rank: 2, title: `Shortlist projects${opts.localityLabel ? ` in ${opts.localityLabel}` : ""} for this group`, why: `${qualified} financially qualified buyers share these requirements.` });
  if (tierCounts.EXPRESSION_OF_INTEREST >= 3 && tierCounts.EXPRESSION_OF_INTEREST >= qualified) actions.push({ rank: 3, title: `Qualify ${tierCounts.EXPRESSION_OF_INTEREST} casual enquir${tierCounts.EXPRESSION_OF_INTEREST > 1 ? "ies" : "y"}`, why: "Confirm budget, financing and timeline — casual enquiries don't count as committed buyers." });
  const needLoan = financing.NOT_SHARED + financing.LOAN_REQUIRED;
  if (u.length >= 3 && needLoan / u.length >= 0.4) actions.push({ rank: 4, title: `Help ${needLoan} buyer${needLoan > 1 ? "s" : ""} with financing`, why: "Financing not shared or loan still needed — a pre-approval makes them count." });
  if (u.length >= 3 && budget.OUTSIDE / u.length >= 0.3) actions.push({ rank: 4, title: `Re-check fit for ${budget.OUTSIDE} buyer${budget.OUTSIDE > 1 ? "s" : ""} whose budget is outside`, why: `Their budget doesn't reach the ${basis}. Consider another configuration or project.` });
  if (c.scope === "PROJECT" && !c.projectPrice?.min) actions.push({ rank: 5, title: "Record the project's price", why: "Budget fit can't be assessed without an official or indicative price." });
  if (u.length && counting < target) actions.push({ rank: 6, title: `Grow the group by ${target - counting} counting buyer${target - counting > 1 ? "s" : ""}`, why: `${counting} of ${target} count toward the target.` });

  return {
    interested: u.length,
    casual: tierCounts.EXPRESSION_OF_INTEREST,
    qualified,
    committed: tierCounts.COMMITTED,
    counting,
    progress: Math.min(1, counting / target),
    remaining: Math.max(0, target - counting),
    ready30,
    readyUnknown,
    budget: { ...budget, basis },
    financing,
    followUpsDue,
    followUpsOverdue,
    tierCounts,
    nextActions: actions.sort((a, b) => a.rank - b.rank).slice(0, 3).map(({ title, why }) => ({ title, why })),
  };
}

/** Across several campaigns: how many memberships, how many distinct people. */
export function uniqueAcrossCampaigns(memberships: { campaignId: string; buyerId: string }[]) {
  const per = new Map<string, Set<string>>();
  for (const m of memberships) per.set(m.buyerId, (per.get(m.buyerId) ?? new Set()).add(m.campaignId));
  return { memberships: memberships.length, uniqueBuyers: per.size, inMultiple: [...per.values()].filter((s) => s.size > 1).length };
}
