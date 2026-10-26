import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { computeCampaignMetrics, newlyCrossedMilestones, type DemandMember } from "../domain/demand";
import { notify } from "../notify";

type Tx = Prisma.TransactionClient;

/** Loads one demand row per campaign member using their interest in the campaign's project. */
export async function loadCampaignMembers(campaignId: string, client: Tx | typeof db = db): Promise<DemandMember[]> {
  const campaign = await client.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { projectId: true } });
  const members = await client.campaignMember.findMany({
    where: { campaignId },
    select: {
      joinedAt: true,
      buyer: {
        select: {
          id: true,
          anonymizedAt: true,
          interests: { where: { projectId: campaign.projectId } },
          visits: { where: { projectId: campaign.projectId, status: { not: "CANCELLED" } }, select: { id: true } },
        },
      },
    },
  });
  return members.flatMap((m) => {
    const i = m.buyer.interests[0];
    if (!i) return [];
    return [
      {
        buyerId: m.buyer.id,
        tier: i.tier,
        interestStatus: i.status,
        configurations: i.configurations,
        budgetMin: i.budgetMin,
        budgetMax: i.budgetMax,
        timeline: i.timeline,
        joinedAt: m.joinedAt,
        hasVisitRequest: m.buyer.visits.length > 0,
      },
    ];
  });
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
  const project = await db.project.findUniqueOrThrow({ where: { id: campaign.projectId }, select: { name: true } });
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
          ? `${metrics.counting} counting buyers for ${project.name}. The campaign is ready for a developer discussion. Reaching the target does not guarantee any terms.`
          : `${metrics.counting} of ${campaign.targetBuyers} counting buyers for ${project.name}.`,
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
    const existing = await tx.campaignMember.findUnique({ where: { campaignId_buyerId: { campaignId, buyerId } } });
    if (existing) return { added: false };
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
