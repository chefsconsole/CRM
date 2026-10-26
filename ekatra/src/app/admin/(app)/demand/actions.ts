"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { addBuyerToCampaign, checkCampaignMilestones, removeBuyerFromCampaign } from "@/lib/services/campaigns";
import { slugify } from "@/lib/format";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { isLiveConfirmed } from "@/lib/domain/benefits";

const tiers = z.array(z.enum(["EXPRESSION_OF_INTEREST", "VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"])).min(1, "Choose at least one interest level that counts toward the target.");

function campaignData(form: FormData) {
  return {
    name: z.string().trim().min(3, "Name the campaign.").max(120).parse(form.get("name")),
    headline: fd.str(form, "headline"),
    publicNote: fd.str(form, "publicNote"),
    targetBuyers: z.coerce.number().int().min(1, "Target must be at least 1.").max(1000).parse(form.get("targetBuyers")),
    countingTiers: tiers.parse(fd.list(form, "countingTiers")),
    focusConfigs: fd.list(form, "focusConfigs").map(Number).filter((n) => !Number.isNaN(n)),
    targetDate: fd.date(form, "targetDate"),
    ownerId: fd.str(form, "ownerId"),
    visibility: z.enum(["EXACT", "APPROXIMATE", "PRIVATE"]).parse(form.get("visibility") ?? "APPROXIMATE"),
    isPublic: fd.bool(form, "isPublic"),
  };
}

export async function createCampaignAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await assertPermission("demand:write");
    const projectId = z.string().cuid({ message: "Choose a project." }).parse(form.get("projectId"));
    const data = campaignData(form);
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    if (data.isPublic && !(project.isPublished && project.complianceReviewed)) throw new UserError("Public campaigns need a published, compliance-reviewed project. Keep it internal for now.");
    let slug = slugify(data.name) || "campaign";
    for (let i = 2; await db.campaign.findUnique({ where: { slug } }); i++) slug = `${slugify(data.name)}-${i}`;
    const c = await db.campaign.create({ data: { ...data, slug, projectId, status: "COLLECTING_DEMAND", milestonesNotified: [] } });
    const buyerIds = fd.list(form, "buyerIds");
    for (const b of buyerIds) await addBuyerToCampaign(c.id, b, "Approved group suggestion", user.id);
    await db.activity.create({ data: { type: "CAMPAIGN", title: `Campaign created${buyerIds.length ? ` with ${buyerIds.length} reviewed buyer(s)` : ""}`, campaignId: c.id, projectId, actorId: user.id } });
    await audit(user, "campaign.create", "Campaign", c.id, { buyers: buyerIds.length });
    id = c.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/demand/${id}`);
}

export async function updateCampaignAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("demand:write");
    const id = z.string().cuid().parse(form.get("campaignId"));
    const data = campaignData(form);
    const status = z.enum(["DRAFT", "COLLECTING_DEMAND", "READY_FOR_DEVELOPER", "NEGOTIATING", "BENEFITS_CONFIRMED", "PAUSED", "CLOSED"]).parse(form.get("status"));
    const c = await db.campaign.findUniqueOrThrow({ where: { id }, include: { project: true, benefits: true } });
    if (status === "BENEFITS_CONFIRMED" && !c.benefits.some((b) => isLiveConfirmed(b))) throw new UserError("Record at least one benefit confirmed by the developer before using this status.");
    if (data.isPublic && !(c.project.isPublished && c.project.complianceReviewed)) throw new UserError("The project must be published before the campaign can be public.");
    await db.campaign.update({ where: { id }, data: { ...data, status } });
    if (status !== c.status) await db.activity.create({ data: { type: "CAMPAIGN", title: `Status: ${c.status.replace(/_/g, " ").toLowerCase()} → ${status.replace(/_/g, " ").toLowerCase()}`, campaignId: id, actorId: user.id } });
    await checkCampaignMilestones(id);
    await audit(user, "campaign.update", "Campaign", id);
    revalidatePath(`/admin/demand/${id}`);
    return { ok: true, message: "Campaign saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function memberAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("demand:write");
    const campaignId = z.string().cuid().parse(form.get("campaignId"));
    const buyerId = z.string().cuid({ message: "Choose a buyer." }).parse(form.get("buyerId"));
    if (form.get("op") === "remove") {
      await removeBuyerFromCampaign(campaignId, buyerId, user.id);
      await checkCampaignMilestones(campaignId);
      revalidatePath(`/admin/demand/${campaignId}`);
      return { ok: true, message: "Removed." };
    }
    const r = await addBuyerToCampaign(campaignId, buyerId, "Team", user.id);
    revalidatePath(`/admin/demand/${campaignId}`);
    return { ok: true, message: r.added ? "Buyer added." : "Already in this campaign — counted once." };
  } catch (e) {
    return fail(e);
  }
}

export async function logOutreachAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("demand:write");
    const campaignId = z.string().cuid().parse(form.get("campaignId"));
    const body = z.string().trim().min(3, "Describe the outreach.").max(2000).parse(form.get("body"));
    const kind = z.enum(["Developer outreach", "Developer meeting", "Proposal sent", "Developer response", "Note"]).parse(form.get("kind"));
    await db.activity.create({ data: { type: "CAMPAIGN", title: kind, body, campaignId, actorId: user.id } });
    revalidatePath(`/admin/demand/${campaignId}`);
    return { ok: true, message: "Logged." };
  } catch (e) {
    return fail(e);
  }
}

export async function benefitAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("commercial:write");
    const campaignId = z.string().cuid().parse(form.get("campaignId"));
    const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const status = z.enum(["UNDER_NEGOTIATION", "CONFIRMED", "EXPIRED_WITHDRAWN"]).parse(form.get("status"));
    const confirmedBy = fd.str(form, "confirmedBy");
    const evidenceNote = fd.str(form, "evidenceNote");
    if (status === "CONFIRMED" && (!confirmedBy || !evidenceNote)) throw new UserError("A confirmed benefit needs who confirmed it and the evidence (e.g. signed letter on file).");
    const data = {
      title: z.string().trim().min(3).max(140).parse(form.get("title")),
      description: fd.str(form, "description"),
      status,
      confirmedBy,
      evidenceNote,
      confirmedAt: status === "CONFIRMED" ? fd.date(form, "confirmedAt") ?? new Date() : null,
      validUntil: fd.date(form, "validUntil"),
    };
    const benefitId = fd.str(form, "benefitId");
    if (benefitId) await db.benefit.update({ where: { id: benefitId }, data });
    else await db.benefit.create({ data: { ...data, projectId: c.projectId, campaignId } });
    await db.activity.create({ data: { type: "CAMPAIGN", title: `Benefit ${status === "CONFIRMED" ? "confirmed" : status === "UNDER_NEGOTIATION" ? "under negotiation" : "expired/withdrawn"}: ${data.title}`, campaignId, actorId: user.id } });
    await audit(user, "benefit.save", "Campaign", campaignId, { status });
    revalidatePath(`/admin/demand/${campaignId}`);
    return { ok: true, message: "Benefit saved." };
  } catch (e) {
    return fail(e);
  }
}

/** Emails a confirmed update ONLY to members who opted in to marketing updates. */
export async function notifyMembersAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("demand:write");
    const campaignId = z.string().cuid().parse(form.get("campaignId"));
    const subject = z.string().trim().min(5).max(120).parse(form.get("subject"));
    const body = z.string().trim().min(20, "Write the update.").max(3000).parse(form.get("body"));
    if (!fd.bool(form, "confirmedOnly")) throw new UserError("Confirm the update contains only confirmed information.");
    const members = await db.campaignMember.findMany({ where: { campaignId, buyer: { anonymizedAt: null, email: { not: null } } }, select: { buyer: { select: { email: true, consents: { where: { purpose: "MARKETING_UPDATES" }, orderBy: { createdAt: "desc" }, take: 1 } } } } });
    const opted = members.filter((m) => m.buyer.consents[0]?.granted && m.buyer.email);
    for (const m of opted) await sendEmail(m.buyer.email!, subject, `${body}\n\nYou are receiving this because you opted in to confirmed updates. Reply STOP to opt out.`);
    await db.activity.create({ data: { type: "EMAIL", title: `Update sent to ${opted.length} opted-in member(s)`, body: subject, campaignId, actorId: user.id } });
    await audit(user, "campaign.notify_members", "Campaign", campaignId, { sent: opted.length, skipped: members.length - opted.length });
    revalidatePath(`/admin/demand/${campaignId}`);
    return { ok: true, message: `Sent to ${opted.length} member(s) who opted in. ${members.length - opted.length} skipped (no consent).` };
  } catch (e) {
    return fail(e);
  }
}
