import type { InterestTier, LeadStage } from "@prisma/client";
import { db } from "../db";
import { syncFollowUpDates } from "./followups";
import { LEAD_STAGE, INTEREST_TIER } from "../labels";
import { audit } from "../audit";
import { checkCampaignMilestones } from "./campaigns";

type Actor = { id: string; name: string };

export async function changeBuyerStage(buyerId: string, stage: LeadStage, actor: Actor, note?: string | null) {
  const buyer = await db.buyer.findUniqueOrThrow({ where: { id: buyerId }, select: { stage: true } });
  if (buyer.stage === stage) return false;
  await db.$transaction([
    db.buyer.update({
      where: { id: buyerId },
      data: {
        stage,
        ...(stage === "CONTACTED" ? { lastContactedAt: new Date() } : {}),
        ...(stage !== "LOST" ? { lostReason: null } : note ? { lostReason: note } : {}),
      },
    }),
    db.activity.create({
      data: {
        type: "STAGE_CHANGE",
        title: `${LEAD_STAGE[buyer.stage].label} → ${LEAD_STAGE[stage].label}`,
        body: note || null,
        buyerId,
        actorId: actor.id,
        meta: { from: buyer.stage, to: stage },
      },
    }),
  ]);
  // A converted or lost buyer has nothing left to follow up.
  if (stage === "CONVERTED" || stage === "LOST") {
    await db.task.updateMany({ where: { buyerId, status: "OPEN" }, data: { status: "CANCELLED", cancelledAt: new Date(), outcome: `Buyer marked ${LEAD_STAGE[stage].label.toLowerCase()}` } });
    await syncFollowUpDates({ buyerId });
  }
  return true;
}

export async function setInterestTier(interestId: string, tier: InterestTier, actor: Actor) {
  const interest = await db.projectInterest.findUniqueOrThrow({
    where: { id: interestId },
    include: { project: { select: { name: true } } },
  });
  if (interest.tier === tier) return;
  await db.$transaction([
    db.projectInterest.update({ where: { id: interestId }, data: { tier } }),
    db.activity.create({
      data: {
        type: "INTEREST",
        title: `${interest.project.name}: ${INTEREST_TIER[interest.tier].label} → ${INTEREST_TIER[tier].label}`,
        buyerId: interest.buyerId,
        projectId: interest.projectId,
        actorId: actor.id,
      },
    }),
  ]);
  // A tier change can move a campaign across a milestone.
  const memberships = await db.campaignMember.findMany({
    where: { buyerId: interest.buyerId, campaign: { projectId: interest.projectId } },
    select: { campaignId: true },
  });
  for (const m of memberships) await checkCampaignMilestones(m.campaignId);
}

/** Right-to-erasure: removes personal data but keeps anonymous demand history for aggregate reporting. */
export async function anonymizeBuyer(buyerId: string, actor: Actor) {
  const suffix = buyerId.slice(-5).toUpperCase();
  await db.$transaction([
    db.buyer.update({
      where: { id: buyerId },
      data: {
        fullName: `Erased buyer ${suffix}`,
        phone: null,
        phoneNormalized: null,
        email: null,
        emailNormalized: null,
        notes: null,
        lostReason: null,
        anonymizedAt: new Date(),
        stage: "LOST",
      },
    }),
    db.projectInterest.updateMany({ where: { buyerId }, data: { status: "WITHDRAWN", requirements: null } }),
    db.activity.updateMany({ where: { buyerId }, data: { body: null } }),
    db.session.deleteMany({ where: { buyerId } }),
    db.document.deleteMany({ where: { buyerId } }),
  ]);
  await audit(actor, "buyer.erase", "Buyer", buyerId);
}
