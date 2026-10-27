import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { InterestTier } from "@prisma/client";
import { computeCampaignMetrics, newlyCrossedMilestones, type DemandMember } from "../domain/demand";
import { buyerReadinessTier, explainMatch, type CampaignBuyer, type CampaignCriteria } from "../domain/campaign-insights";
import { buyerWhere, type BuyerFilter } from "../domain/buyer-filters";
import { notify } from "../notify";

type Tx = Prisma.TransactionClient;

/**
 * One demand row per campaign member. For a project campaign the tier is the buyer's interest in
 * that project; for a locality or segment campaign it is the buyer's own (conservative) readiness.
 */
export async function loadCampaignMembers(campaignId: string, client: Tx | typeof db = db): Promise<DemandMember[]> {
  const campaign = await client.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { projectId: true } });
  const pid = campaign.projectId;
  const members = await client.campaignMember.findMany({
    where: { campaignId },
    select: {
      joinedAt: true,
      buyer: {
        select: {
          id: true, anonymizedAt: true, stage: true, verification: true, fundingReadiness: true, budgetMin: true, budgetMax: true, preferredConfigs: true, timeline: true,
          interests: pid ? { where: { projectId: pid } } : false,
          visits: pid ? { where: { projectId: pid, status: { not: "CANCELLED" } }, select: { id: true } } : false,
        },
      },
    },
  });
  return members.flatMap((m) => {
    const b = m.buyer;
    if (pid) {
      const i = b.interests?.[0];
      if (!i) return [];
      return [{ buyerId: b.id, tier: i.tier, interestStatus: i.status, configurations: i.configurations, budgetMin: i.budgetMin, budgetMax: i.budgetMax, timeline: i.timeline, joinedAt: m.joinedAt, hasVisitRequest: (b.visits?.length ?? 0) > 0 }];
    }
    return [{ buyerId: b.id, tier: buyerReadinessTier(b), interestStatus: b.anonymizedAt || b.stage === "LOST" ? "WITHDRAWN" : "ACTIVE", configurations: b.preferredConfigs, budgetMin: b.budgetMin, budgetMax: b.budgetMax, timeline: b.timeline, joinedAt: m.joinedAt }];
  });
}

const buyerSelect = (projectId: string | null) => ({
  id: true, fullName: true, anonymizedAt: true, stage: true, verification: true, fundingReadiness: true, budgetMin: true, budgetMax: true, preferredConfigs: true, nextFollowUpAt: true, priority: true,
  locationPreferences: { select: { location: { select: { name: true } } } },
  requirements: { where: { status: "ACTIVE" as const }, take: 1, orderBy: { updatedAt: "desc" as const }, select: { budgetMin: true, budgetMax: true, budgetStretch: true, configurations: true, commitWithinDays: true, primaryLocationId: true, secondaryLocationId: true, acceptableLocationIds: true } },
  interests: projectId ? { where: { projectId }, select: { id: true, tier: true, status: true, configurations: true, budgetMin: true, budgetMax: true } } : (false as const),
});
type BuyerRow = Prisma.BuyerGetPayload<{ select: ReturnType<typeof buyerSelect> }>;

/** Turns a buyer record into the shape the Demand Studio rules work with. */
export function toCampaignBuyer(b: BuyerRow, locationNames: Map<string, string>, projectId: string | null): CampaignBuyer & { name: string; priority: string; interestId: string | null } {
  const r = b.requirements[0];
  const i = projectId ? (b.interests as { id: string; tier: InterestTier; status: string; configurations: number[]; budgetMin: number | null; budgetMax: number | null }[] | undefined)?.[0] : undefined;
  const reqLocs = r ? [r.primaryLocationId, r.secondaryLocationId, ...r.acceptableLocationIds].flatMap((id) => (id && locationNames.get(id) ? [locationNames.get(id)!] : [])) : [];
  const localities = [...new Set([...reqLocs, ...b.locationPreferences.map((l) => l.location.name)])];
  return {
    buyerId: b.id,
    interestId: i?.id ?? null,
    name: b.fullName,
    priority: b.priority,
    tier: i ? i.tier : buyerReadinessTier(b),
    active: !b.anonymizedAt && b.stage !== "LOST" && (!i || i.status === "ACTIVE"),
    stage: b.stage,
    verification: b.verification,
    fundingReadiness: b.fundingReadiness,
    budgetMin: i?.budgetMin ?? r?.budgetMin ?? b.budgetMin,
    budgetMax: i?.budgetMax ?? r?.budgetMax ?? b.budgetMax,
    budgetStretch: r?.budgetStretch ?? null,
    configs: i?.configurations.length ? i.configurations : r?.configurations.length ? r.configurations : b.preferredConfigs,
    localities,
    commitWithinDays: r?.commitWithinDays ?? null,
    nextFollowUpAt: b.nextFollowUpAt,
  };
}

/** Everything Demand Studio needs about one campaign: criteria, members and matching non-members. */
export async function loadCampaignDemand(campaignId: string, opts: { candidates?: boolean } = {}) {
  const c = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { project: { select: { id: true, name: true, location: { select: { name: true } }, configurations: { select: { bhk: true, priceMin: true, priceMax: true } } } }, segment: true },
  });
  const locations = await db.location.findMany({ select: { id: true, name: true } });
  const names = new Map(locations.map((l) => [l.id, l.name]));
  const localities = c.scope === "PROJECT" ? (c.project ? [c.project.location.name] : []) : c.locationIds.flatMap((id) => (names.get(id) ? [names.get(id)!] : []));
  const priced = c.project?.configurations.filter((x) => x.priceMin && (!c.focusConfigs.length || c.focusConfigs.includes(x.bhk))) ?? [];
  const criteria: CampaignCriteria = {
    scope: c.scope,
    localities,
    configs: c.focusConfigs,
    budgetMin: c.budgetMin,
    budgetMax: c.budgetMax,
    projectPrice: priced.length ? { min: Math.min(...priced.map((x) => x.priceMin!)), max: Math.max(...priced.map((x) => x.priceMax ?? x.priceMin!)) } : null,
    targetBuyers: c.targetBuyers,
    countingTiers: c.countingTiers,
  };
  const memberRows = await db.campaignMember.findMany({ where: { campaignId }, orderBy: { joinedAt: "desc" }, select: { joinedAt: true, joinedVia: true, buyer: { select: buyerSelect(c.projectId) } } });
  const members = memberRows.map((m) => ({ ...toCampaignBuyer(m.buyer, names, c.projectId), joinedAt: m.joinedAt, joinedVia: m.joinedVia }));
  const memberIds = new Set(members.map((m) => m.buyerId));

  if (opts.candidates === false) return { campaign: c, criteria, members, candidates: [] as (ReturnType<typeof toCampaignBuyer> & { why: ReturnType<typeof explainMatch> })[] };
  // Candidates: buyers who aren't members but match the criteria — always shown with reasons, never auto-added.
  let pool: Prisma.BuyerWhereInput = { anonymizedAt: null, stage: { notIn: ["CONVERTED", "LOST"] }, id: { notIn: [...memberIds] } };
  if (c.scope === "SEGMENT" && c.segment) pool = { AND: [pool, buyerWhere(c.segment.filters as unknown as BuyerFilter)] };
  const poolRows = await db.buyer.findMany({ where: pool, take: 600, orderBy: [{ priority: "asc" }, { updatedAt: "desc" }], select: buyerSelect(c.projectId) });
  const candidates = poolRows
    .map((b) => toCampaignBuyer(b, names, c.projectId))
    .filter((b) => b.active)
    .map((b) => ({ ...b, why: explainMatch(b, criteria) }))
    .filter((b) => (c.scope === "SEGMENT" ? b.why.misses.length <= 1 : b.why.matches))
    .slice(0, 50);
  return { campaign: c, criteria, members, candidates };
}

export async function campaignMetrics(campaignId: string) {
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const members = await loadCampaignMembers(campaignId);
  return { campaign, members, metrics: computeCampaignMetrics(members, campaign) };
}

/** Raises 50/75/100% alerts exactly once and flags a campaign as ready for the developer at 100%. */
export async function checkCampaignMilestones(campaignId: string) {
  const { campaign, metrics } = await campaignMetrics(campaignId);
  const crossed = newlyCrossedMilestones(metrics.progress, campaign.milestonesNotified);
  if (!crossed.length) return [];
  const subject = campaign.projectId ? (await db.project.findUniqueOrThrow({ where: { id: campaign.projectId }, select: { name: true } })).name : campaign.name;
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      milestonesNotified: [...campaign.milestonesNotified, ...crossed],
      ...(crossed.includes(100) && campaign.status === "COLLECTING_DEMAND" ? { status: "READY_FOR_DEVELOPER" } : {}),
    },
  });
  for (const m of crossed) {
    await notify("campaign.milestone", {
      title: m === 100 ? `${campaign.name} has reached its target` : `${campaign.name} is ${m}% to target`,
      body:
        m === 100
          ? `${metrics.counting} counting buyers for ${subject}. The campaign is ready for a developer discussion. Reaching the target does not guarantee any terms.`
          : `${metrics.counting} of ${campaign.targetBuyers} counting buyers for ${subject}.`,
      link: `/admin/demand/${campaignId}`,
      dedupeKey: `campaign:${campaignId}:${m}`,
      userIds: campaign.ownerId ? [campaign.ownerId] : [],
    });
    await db.activity.create({
      data: { type: "CAMPAIGN", title: `Reached ${m}% of target`, campaignId, projectId: campaign.projectId },
    });
  }
  return crossed;
}

/**
 * Adds a buyer to a campaign. Membership is unique per (campaign, buyer), so repeated adds are
 * harmless; an interest in the campaign's project is created if missing (as an expression of interest).
 */
export async function addBuyerToCampaign(campaignId: string, buyerId: string, via: string, actorId?: string) {
  const result = await db.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const buyer = await tx.buyer.findUniqueOrThrow({ where: { id: buyerId } });
    const existing = await tx.campaignMember.findUnique({ where: { campaignId_buyerId: { campaignId, buyerId } } });
    if (existing) return { added: false };
    // Locality / segment campaigns gather demand before a project is chosen: no project interest is created.
    if (!campaign.projectId) {
      await tx.campaignMember.create({ data: { campaignId, buyerId, joinedVia: via } });
      await tx.activity.create({ data: { type: "CAMPAIGN", title: `Added to ${campaign.name}`, buyerId, campaignId, actorId: actorId ?? null } });
      return { added: true };
    }
    const interest = await tx.projectInterest.upsert({
      where: { buyerId_projectId: { buyerId, projectId: campaign.projectId } },
      update: { status: "ACTIVE" },
      create: {
        buyerId,
        projectId: campaign.projectId,
        configurations: campaign.focusConfigs.length ? campaign.focusConfigs : buyer.preferredConfigs,
        budgetMin: buyer.budgetMin,
        budgetMax: buyer.budgetMax,
        timeline: buyer.timeline,
        source: via,
      },
    });
    await tx.campaignMember.create({ data: { campaignId, buyerId, interestId: interest.id, joinedVia: via } });
    await tx.activity.create({
      data: { type: "CAMPAIGN", title: `Added to ${campaign.name}`, buyerId, campaignId, actorId: actorId ?? null },
    });
    return { added: true };
  });
  if (result.added) await checkCampaignMilestones(campaignId);
  return result;
}

export async function removeBuyerFromCampaign(campaignId: string, buyerId: string, actorId?: string) {
  await db.campaignMember.deleteMany({ where: { campaignId, buyerId } });
  await db.activity.create({ data: { type: "CAMPAIGN", title: "Removed from campaign", buyerId, campaignId, actorId } });
}
