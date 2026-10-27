// Public inquiry intake: de-duplicates the buyer, records interest, joins the
// relevant buying group and stores consent — all in one transaction.

import type { ConsentPurpose } from "@prisma/client";
import { db } from "../db";
import { normalizeEmail, normalizeIndianPhone } from "../domain/identity";
import { PUBLIC_PROJECT_WHERE } from "../domain/compliance";
import { CONSENT_POLICY_VERSION, CONSENT_TEXT, type InquiryInput } from "../validation";
import { checkCampaignMilestones } from "./campaigns";
import { intentsForProperty, recomputeBuyerPriority } from "./requirements";
import { isRentalRequirement } from "../domain/matching";
import { COMMIT_OPTIONS } from "../domain/timelines";
import { notify } from "../notify";

const OPEN_CAMPAIGN = ["COLLECTING_DEMAND", "READY_FOR_DEVELOPER", "NEGOTIATING", "BENEFITS_CONFIRMED"] as const;

export class InquiryError extends Error {
  name = "InquiryError";
}

export async function submitInquiry(input: InquiryInput, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  const phone = normalizeIndianPhone(input.phone)!;
  const email = normalizeEmail(input.email ?? null);

  const result = await db.$transaction(async (tx) => {
    const project = input.projectId
      ? await tx.project.findFirst({ where: { id: input.projectId, ...PUBLIC_PROJECT_WHERE }, select: { id: true, name: true, locationId: true, segment: true, dealType: true, propertyType: true } })
      : null;
    if (input.projectId && !project) throw new InquiryError("This project is not open for registrations.");
    if (project && project.segment === "RESIDENTIAL" && project.dealType !== "RENT" && project.propertyType !== "PLOT" && !input.configurations.length)
      throw new InquiryError("Please choose at least one configuration.");
    const reqIn = input.requirement ?? null;
    // Buyer-level budget mirrors the latest purchase requirement.
    if (reqIn && !isRentalRequirement(reqIn)) {
      input.budgetMin = reqIn.budgetMin ?? input.budgetMin;
      input.budgetMax = reqIn.budgetMax ?? input.budgetMax;
      if (!input.configurations.length) input.configurations = reqIn.configurations;
    }
    if (reqIn?.commitWithinDays != null) {
      const d = reqIn.commitWithinDays;
      input.timeline = d <= 90 ? "IMMEDIATE" : d <= 180 ? "WITHIN_6_MONTHS" : d <= 365 ? "WITHIN_12_MONTHS" : d < COMMIT_OPTIONS[COMMIT_OPTIONS.length - 1]!.days ? "BEYOND_12_MONTHS" : "EXPLORING";
    }

    // ── Duplicate detection: phone first, then email.
    const byPhone = await tx.buyer.findUnique({ where: { phoneNormalized: phone } });
    const byEmail = email ? await tx.buyer.findUnique({ where: { emailNormalized: email } }) : null;
    let buyer = byPhone ?? byEmail;
    const conflicting = byPhone && byEmail && byPhone.id !== byEmail.id ? byEmail : null;
    const isNew = !buyer;

    const mergedConfigs = [...new Set([...(buyer?.preferredConfigs ?? []), ...input.configurations])].sort((a, b) => a - b);
    if (buyer) {
      buyer = await tx.buyer.update({
        where: { id: buyer.id },
        data: {
          fullName: buyer.fullName || input.fullName,
          phone: buyer.phone ?? input.phone,
          phoneNormalized: buyer.phoneNormalized ?? phone,
          ...(email && !buyer.emailNormalized && !conflicting ? { email: input.email, emailNormalized: email } : {}),
          preferredConfigs: mergedConfigs,
          budgetMin: input.budgetMin ?? buyer.budgetMin,
          budgetMax: input.budgetMax ?? buyer.budgetMax,
          timeline: input.timeline !== "EXPLORING" ? input.timeline : buyer.timeline,
          fundingReadiness: input.fundingReadiness !== "NOT_SHARED" ? input.fundingReadiness : buyer.fundingReadiness,
          stage: buyer.stage === "LOST" ? "NEW_INQUIRY" : buyer.stage,
          deletionRequestedAt: null,
        },
      });
    } else {
      buyer = await tx.buyer.create({
        data: {
          fullName: input.fullName,
          phone: input.phone,
          phoneNormalized: phone,
          email: email ? input.email : null,
          emailNormalized: email,
          preferredConfigs: mergedConfigs,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          timeline: input.timeline,
          fundingReadiness: input.fundingReadiness,
          leadSource: input.source,
          stage: "NEW_INQUIRY",
        },
      });
    }

    // ── Structured requirement: update the latest active one of the same kind (buy vs rent), else create.
    if (reqIn) {
      const rental = isRentalRequirement(reqIn);
      const existingReqs = await tx.buyerRequirement.findMany({ where: { buyerId: buyer.id, status: "ACTIVE" }, orderBy: { updatedAt: "desc" } });
      const same = existingReqs.find((r) => isRentalRequirement(r) === rental);
      const data = { ...reqIn, projectIds: project ? [project.id] : [] };
      if (same) await tx.buyerRequirement.update({ where: { id: same.id }, data: { ...data, projectIds: [...new Set([...same.projectIds, ...data.projectIds])] } });
      else await tx.buyerRequirement.create({ data: { ...data, buyerId: buyer.id } });
    } else if (project) {
      const hasReq = await tx.buyerRequirement.count({ where: { buyerId: buyer.id, status: "ACTIVE" } });
      if (!hasReq) {
        await tx.buyerRequirement.create({
          data: {
            buyerId: buyer.id,
            intents: intentsForProperty(project),
            primaryLocationId: project.locationId,
            projectIds: [project.id],
            configurations: input.configurations,
            budgetMin: input.budgetMin,
            budgetMax: input.budgetMax,
          },
        });
      }
    }

    const locationIds = new Set(input.locationIds);
    if (reqIn?.primaryLocationId) locationIds.add(reqIn.primaryLocationId);
    if (reqIn?.secondaryLocationId) locationIds.add(reqIn.secondaryLocationId);
    if (project) locationIds.add(project.locationId);
    if (locationIds.size) {
      await tx.buyerLocationPreference.createMany({
        data: [...locationIds].map((locationId) => ({ buyerId: buyer!.id, locationId })),
        skipDuplicates: true,
      });
    }

    let campaignJoined: { id: string; name: string } | null = null;
    if (project) {
      const existingInterest = await tx.projectInterest.findUnique({
        where: { buyerId_projectId: { buyerId: buyer.id, projectId: project.id } },
      });
      const interest = await tx.projectInterest.upsert({
        where: { buyerId_projectId: { buyerId: buyer.id, projectId: project.id } },
        // Re-registration refreshes the requirement but never downgrades the tier.
        update: {
          status: "ACTIVE",
          configurations: [...new Set([...(existingInterest?.configurations ?? []), ...input.configurations])],
          budgetMin: input.budgetMin ?? existingInterest?.budgetMin,
          budgetMax: input.budgetMax ?? existingInterest?.budgetMax,
          timeline: input.timeline,
          requirements: input.requirements || existingInterest?.requirements,
        },
        create: {
          buyerId: buyer.id,
          projectId: project.id,
          configurations: input.configurations,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          timeline: input.timeline,
          requirements: input.requirements || null,
          source: input.source,
        },
      });

      const campaigns = await tx.campaign.findMany({
        where: {
          projectId: project.id,
          isPublic: true,
          status: { in: [...OPEN_CAMPAIGN] },
          ...(input.campaignId ? { id: input.campaignId } : {}),
        },
        orderBy: { createdAt: "asc" },
      });
      const match =
        campaigns.find((c) => c.id === input.campaignId) ??
        campaigns.find((c) => c.focusConfigs.length > 0 && input.configurations.some((b) => c.focusConfigs.includes(b))) ??
        campaigns.find((c) => c.focusConfigs.length === 0);
      if (match) {
        await tx.campaignMember.upsert({
          where: { campaignId_buyerId: { campaignId: match.id, buyerId: buyer.id } },
          update: {},
          create: { campaignId: match.id, buyerId: buyer.id, interestId: interest.id, joinedVia: input.source },
        });
        campaignJoined = { id: match.id, name: match.name };
      }

      await tx.activity.create({
        data: {
          type: "INTEREST",
          title: `Registered interest in ${project.name}`,
          body: input.requirements || null,
          buyerId: buyer.id,
          projectId: project.id,
          campaignId: campaignJoined?.id,
          meta: { configurations: input.configurations, budgetMin: input.budgetMin, budgetMax: input.budgetMax },
        },
      });
    } else {
      await tx.activity.create({
        data: { type: "INTEREST", title: "Registered as a buyer", body: input.requirements || null, buyerId: buyer.id },
      });
    }

    if (conflicting) {
      await tx.activity.create({
        data: {
          type: "SYSTEM",
          title: "Possible duplicate profile",
          body: `The email on this inquiry belongs to another buyer record (${conflicting.fullName}). Review and merge if they are the same person.`,
          buyerId: buyer.id,
          meta: { otherBuyerId: conflicting.id },
        },
      });
    }

    const consents: [ConsentPurpose, boolean][] = [
      ["CONTACT_ABOUT_INQUIRY", input.consentContact],
      ["SHARE_WITH_DEVELOPER", input.consentShare],
      ["MARKETING_UPDATES", input.consentUpdates],
      ["WHATSAPP_MESSAGES", input.consentWhatsApp],
    ];
    await tx.consentRecord.createMany({
      data: consents.map(([purpose, granted]) => ({
        buyerId: buyer!.id,
        purpose,
        granted,
        policyVersion: CONSENT_POLICY_VERSION,
        textShown: CONSENT_TEXT[purpose],
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      })),
    });

    return { buyerId: buyer.id, assignedToId: buyer.assignedToId, isNew, project, campaignJoined };
  });

  await notify("buyer.registered", {
    title: result.isNew ? `New buyer: ${input.fullName}` : `Returning buyer: ${input.fullName}`,
    body: result.project ? `Interested in ${result.project.name}.` : "General buyer registration.",
    link: `/admin/buyers/${result.buyerId}`,
    userIds: result.assignedToId ? [result.assignedToId] : [],
  });
  await recomputeBuyerPriority(result.buyerId);
  if (result.campaignJoined) await checkCampaignMilestones(result.campaignJoined.id);
  return result;
}
