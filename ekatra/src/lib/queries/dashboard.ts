import "server-only";
import type { TeamUser } from "../auth";
import { can } from "../rbac";
import { db } from "../db";
import { computeCampaignMetrics, QUALIFIED_TIERS } from "../domain/demand";
import { loadCampaignMembers } from "../services/campaigns";
import { summarizeCommissions, sumPayments } from "../domain/commission";
import { evaluateOpportunity, type Opportunity } from "../domain/opportunity";
import { needsReverification } from "../domain/compliance";
import { liveMatchProperties, toMatchRequirement } from "../services/requirements";
import { rankMatches } from "../domain/matching";
import { suggestGroups, type GroupCandidate } from "../domain/grouping";

const ACTIVE_CAMPAIGN = ["COLLECTING_DEMAND", "READY_FOR_DEVELOPER", "NEGOTIATING", "BENEFITS_CONFIRMED"] as const;
const OPEN_STAGES = { notIn: ["CONVERTED", "LOST"] as ("CONVERTED" | "LOST")[] };

export async function projectOpportunities(limit = 6): Promise<Opportunity[]> {
  const projects = await db.project.findMany({
    where: { interests: { some: { status: "ACTIVE" } } },
    select: {
      id: true,
      name: true,
      location: { select: { name: true } },
      developer: { select: { stage: true } },
      agreements: { where: { status: "SIGNED" }, select: { id: true } },
      configurations: { select: { priceMin: true, priceVerification: true } },
      campaigns: { where: { status: { in: [...ACTIVE_CAMPAIGN] } }, select: { targetBuyers: true }, take: 1 },
      negotiations: { where: { status: { notIn: ["AGREED", "DECLINED", "CLOSED"] } }, orderBy: { updatedAt: "desc" }, take: 1, select: { status: true, lastFollowUpAt: true } },
      interests: {
        where: { status: "ACTIVE", buyer: { anonymizedAt: null } },
        select: { buyerId: true, tier: true, configurations: true, budgetMin: true, budgetMax: true, buyer: { select: { requirements: { where: { status: "ACTIVE" }, select: { commitWithinDays: true }, orderBy: { updatedAt: "desc" }, take: 1 } } } },
      },
    },
  });
  const now = Date.now();
  return projects
    .map((p) => {
      const prices = p.configurations.map((c) => c.priceMin).filter((v): v is number => !!v);
      const neg = p.negotiations[0];
      return evaluateOpportunity({
        projectId: p.id,
        projectName: p.name,
        locationName: p.location.name,
        developerStage: p.developer.stage,
        hasSignedAgreement: p.agreements.length > 0,
        priceVerified: p.configurations.some((c) => c.priceVerification === "VERIFIED"),
        minPrice: prices.length ? Math.min(...prices) : null,
        campaignTarget: p.campaigns[0]?.targetBuyers ?? null,
        openNegotiation: neg ? { status: neg.status, daysSinceFollowUp: neg.lastFollowUpAt ? Math.floor((now - neg.lastFollowUpAt.getTime()) / 864e5) : null } : null,
        buyers: p.interests.map((i) => ({ buyerId: i.buyerId, tier: i.tier, configurations: i.configurations, budgetMin: i.budgetMin, budgetMax: i.budgetMax, commitWithinDays: i.buyer.requirements[0]?.commitWithinDays ?? null })),
      });
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getDashboard(user: TeamUser) {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const repScope = user.role === "SALES_REP" ? { assignedToId: user.id } : {};
  const commercial = can(user.role, "commercial:read");

  const followUpsDueCount = await db.buyer.count({ where: { anonymizedAt: null, nextFollowUpAt: { lte: endOfDay }, stage: OPEN_STAGES, ...repScope } });
  const [newInquiries, qualified, ready30, hotBuyers, followUpsDue, campaigns, negotiationsActive, projectsVerified, projectsReview, tierA, inventoryAvailable, upcomingVisits] = await Promise.all([
    db.buyer.count({ where: { anonymizedAt: null, createdAt: { gte: weekAgo } } }),
    db.buyer.count({ where: { anonymizedAt: null, interests: { some: { status: "ACTIVE", tier: { in: QUALIFIED_TIERS } } } } }),
    db.buyer.count({ where: { anonymizedAt: null, stage: OPEN_STAGES, requirements: { some: { status: "ACTIVE", commitWithinDays: { lte: 30 } } } } }),
    db.buyer.count({ where: { anonymizedAt: null, priority: "A", stage: OPEN_STAGES } }),
    db.buyer.findMany({
      where: { anonymizedAt: null, nextFollowUpAt: { lte: endOfDay }, stage: OPEN_STAGES, ...repScope },
      orderBy: [{ priority: "asc" }, { nextFollowUpAt: "asc" }],
      take: 6,
      select: { id: true, fullName: true, priority: true, stage: true, nextFollowUpAt: true, interests: { take: 1, orderBy: { createdAt: "desc" }, select: { project: { select: { name: true } } } } },
    }),
    db.campaign.findMany({ where: { status: { in: [...ACTIVE_CAMPAIGN] } }, select: { id: true, name: true, status: true, targetBuyers: true, countingTiers: true, focusConfigs: true, project: { select: { name: true } } } }),
    commercial ? db.negotiation.count({ where: { status: { notIn: ["AGREED", "DECLINED", "CLOSED"] } } }) : Promise.resolve(0),
    db.project.count({ where: { researchStatus: "VERIFIED" } }),
    db.project.count({ where: { researchStatus: "NEEDS_REVIEW" } }),
    db.project.count({ where: { tier: "A", researchStatus: { not: "EXCLUDED" } } }),
    db.inventoryUnit.count({ where: { availability: "AVAILABLE" } }),
    db.siteVisit.findMany({
      where: { scheduledAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] }, ...(user.role === "SALES_REP" ? { assignedToId: user.id } : {}) },
      orderBy: { scheduledAt: "asc" },
      take: 4,
      select: { id: true, scheduledAt: true, status: true, buyer: { select: { fullName: true } }, project: { select: { name: true } } },
    }),
  ]);

  const campaignRows = await Promise.all(
    campaigns.map(async (c) => ({ ...c, metrics: computeCampaignMetrics(await loadCampaignMembers(c.id), c) })),
  );
  campaignRows.sort((a, b) => b.metrics.progress - a.metrics.progress);

  let commission = null as null | ReturnType<typeof summarizeCommissions>;
  if (commercial) {
    const rows = await db.commission.findMany({ select: { id: true, transactionId: true, status: true, amountEarned: true, payments: { select: { amount: true } } } });
    commission = summarizeCommissions(rows.map((r) => ({ ...r, received: sumPayments(r.payments) })));
  }

  // Buyer ↔ property matches (strong = eligible and ≥ 70).
  const [props, reqs] = await Promise.all([
    liveMatchProperties(),
    db.buyerRequirement.findMany({ where: { status: "ACTIVE", buyer: { anonymizedAt: null, stage: OPEN_STAGES } } }),
  ]);
  const projectFit = new Map<string, number>();
  let strongMatches = 0;
  const qualifiedBuyerIds = new Set(
    (await db.projectInterest.findMany({ where: { status: "ACTIVE", tier: { in: QUALIFIED_TIERS } }, select: { buyerId: true } })).map((i) => i.buyerId),
  );
  for (const r of reqs) {
    const ms = rankMatches(toMatchRequirement(r), props, now).filter((m) => m.eligible && m.score >= 70);
    strongMatches += ms.length;
    if (qualifiedBuyerIds.has(r.buyerId)) for (const m of ms) projectFit.set(m.propertyId, (projectFit.get(m.propertyId) ?? 0) + 1);
  }
  const fitIds = [...projectFit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const fitNames = await db.project.findMany({ where: { id: { in: fitIds.map(([id]) => id) } }, select: { id: true, name: true } });
  const projectsFittingQualified = fitIds.map(([id, n]) => ({ id, name: fitNames.find((p) => p.id === id)?.name ?? "", buyers: n }));

  const opportunities = await projectOpportunities(4);

  const [developerFollowUps, reverify] = await Promise.all([
    can(user.role, "developers:read")
      ? db.developer.findMany({
          where: { stage: { not: "INACTIVE" }, nextFollowUpAt: { lte: new Date(now.getTime() + 7 * 864e5) } },
          orderBy: { nextFollowUpAt: "asc" },
          take: 4,
          select: { id: true, name: true, nextFollowUpAt: true, stage: true },
        })
      : Promise.resolve([]),
    db.project.findMany({ where: { isPublished: true }, select: { id: true, name: true, lastVerifiedAt: true }, orderBy: { lastVerifiedAt: "asc" } }),
  ]);
  const needsReverify = reverify.filter((p) => needsReverification(p.lastVerifiedAt, now)).slice(0, 4);

  // Charts — computed from stored records.
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const [recentBuyers, stageGroups, interestByLocation] = await Promise.all([
    db.buyer.findMany({ where: { createdAt: { gte: sixMonthsAgo }, anonymizedAt: null }, select: { createdAt: true } }),
    db.buyer.groupBy({ by: ["stage"], where: { anonymizedAt: null }, _count: true }),
    db.projectInterest.findMany({ where: { status: "ACTIVE", buyer: { anonymizedAt: null } }, select: { buyerId: true, project: { select: { location: { select: { name: true } } } } } }),
  ]);
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const monthly = months.map((m) => ({
    label: m.toLocaleString("en-IN", { month: "short" }),
    value: recentBuyers.filter((b) => b.createdAt.getFullYear() === m.getFullYear() && b.createdAt.getMonth() === m.getMonth()).length,
  }));
  const locMap = new Map<string, Set<string>>();
  for (const i of interestByLocation) {
    const k = i.project.location.name;
    if (!locMap.has(k)) locMap.set(k, new Set());
    locMap.get(k)!.add(i.buyerId);
  }
  const demandByLocation = [...locMap.entries()].map(([label, s]) => ({ label, value: s.size })).sort((a, b) => b.value - a.value).slice(0, 7);
  const stageCount = Object.fromEntries(stageGroups.map((g) => [g.stage, g._count])) as Record<string, number>;

  return {
    kpis: { followUpsDueCount, newInquiries, qualified, ready30, hotBuyers, activeCampaigns: campaigns.length, negotiationsActive, projectsVerified, projectsReview, tierA, inventoryAvailable, strongMatches },
    followUpsDue,
    upcomingVisits,
    campaigns: campaignRows,
    commission,
    opportunities,
    projectsFittingQualified,
    developerFollowUps,
    needsReverify,
    charts: { monthly, demandByLocation, stageCount },
  };
}


export async function suggestedGroups(limit = 6) {
  const interests = await db.projectInterest.findMany({
    where: { status: "ACTIVE", buyer: { anonymizedAt: null, stage: { notIn: ["CONVERTED", "LOST"] } }, project: { researchStatus: { not: "EXCLUDED" } } },
    select: {
      buyerId: true, tier: true, configurations: true, budgetMin: true, budgetMax: true, projectId: true,
      project: { select: { name: true, location: { select: { name: true } } } },
      buyer: { select: { fundingReadiness: true, requirements: { where: { status: "ACTIVE" }, take: 1, orderBy: { updatedAt: "desc" }, select: { commitWithinDays: true, possessionWaitMonths: true, fundingStatus: true } } } },
    },
  });
  const memberships = await db.campaignMember.findMany({ select: { buyerId: true, campaign: { select: { projectId: true, focusConfigs: true } } } });
  const excluded = new Set<string>();
  for (const m of memberships) {
    const cfgs = m.campaign.focusConfigs.length ? m.campaign.focusConfigs : [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5];
    for (const b of cfgs) excluded.add(`${m.campaign.projectId}:${b}:${m.buyerId}`);
  }
  const candidates: GroupCandidate[] = interests.map((i) => {
    const r = i.buyer.requirements[0];
    return {
      buyerId: i.buyerId, projectId: i.projectId, projectName: i.project.name, locationName: i.project.location.name, tier: i.tier, configurations: i.configurations,
      budgetMin: i.budgetMin, budgetMax: i.budgetMax, commitWithinDays: r?.commitWithinDays ?? null, possessionWaitMonths: r?.possessionWaitMonths ?? null,
      fundingReady: r?.fundingStatus === "READY" || r?.fundingStatus === "LOAN_IN_PROCESS" || ["SELF_FUNDED", "LOAN_PRE_APPROVED"].includes(i.buyer.fundingReadiness),
    };
  });
  return suggestGroups(candidates, excluded).slice(0, limit);
}
