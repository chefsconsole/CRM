"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { InterestTier, LeadStage, Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission, type TeamUser } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { anonymizeBuyer, changeBuyerStage, setInterestTier } from "@/lib/services/buyers";
import { addBuyerToCampaign, checkCampaignMilestones, removeBuyerFromCampaign } from "@/lib/services/campaigns";
import { recomputeBuyerPriority } from "@/lib/services/requirements";
import { normalizeEmail, normalizeIndianPhone } from "@/lib/domain/identity";
import { effectivePriority } from "@/lib/domain/priority";
import { requirementSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { LEAD_STAGES } from "@/lib/labels";
import { parseBuyerFilter } from "@/lib/domain/buyer-filters";
import { requirementFromForm } from "@/lib/forms";

/** Sales reps may only modify buyers assigned to them (or unassigned). */
async function assertCanEdit(user: TeamUser, buyerId: string) {
  if (user.role !== "SALES_REP") return;
  const b = await db.buyer.findUnique({ where: { id: buyerId }, select: { assignedToId: true } });
  if (b && b.assignedToId && b.assignedToId !== user.id) throw new UserError("This buyer is assigned to another representative.");
}

export async function moveStageAction(buyerId: string, stage: LeadStage): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    if (!LEAD_STAGES.includes(stage)) throw new UserError("Unknown stage.");
    await assertCanEdit(user, buyerId);
    await changeBuyerStage(buyerId, stage, user);
    revalidatePath("/admin/buyers");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    const ids = fd.list(form, "ids").slice(0, 200);
    const op = fd.str(form, "op");
    const value = fd.str(form, "value");
    if (!ids.length) throw new UserError("Select at least one buyer.");
    if (user.role === "SALES_REP" && op === "assign") throw new UserError("Only managers can reassign buyers.");
    let n = 0;
    for (const id of ids) {
      await assertCanEdit(user, id);
      if (op === "stage" && value) n += (await changeBuyerStage(id, value as LeadStage, user)) ? 1 : 0;
      else if (op === "assign") {
        await db.buyer.update({ where: { id }, data: { assignedToId: value || null } });
        n++;
      } else if (op === "campaign" && value) {
        await assertPermission("demand:write");
        n += (await addBuyerToCampaign(value, id, "Bulk add", user.id)).added ? 1 : 0;
      } else if (op === "followup" && value) {
        await db.buyer.update({ where: { id }, data: { nextFollowUpAt: new Date(value) } });
        n++;
      }
    }
    await audit(user, `buyers.bulk_${op}`, "Buyer", null, { count: ids.length, value });
    revalidatePath("/admin/buyers");
    return { ok: true, message: `Updated ${n} of ${ids.length} buyer(s).` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSegmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:read");
    const name = z.string().trim().min(2, "Give the segment a name.").max(60).parse(form.get("name"));
    const query = String(form.get("query") ?? "");
    const filters = parseBuyerFilter(new URLSearchParams(query));
    const seg = await db.savedSegment.create({ data: { name, filters: JSON.parse(JSON.stringify(filters)), ownerId: user.id, description: fd.str(form, "description") } });
    revalidatePath("/admin/buyers");
    return { ok: true, message: "Segment saved.", data: seg.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSegmentAction(id: string) {
  const user = await assertPermission("buyers:read");
  const seg = await db.savedSegment.findUnique({ where: { id } });
  if (!seg) return;
  if (seg.ownerId !== user.id && !["SUPER_ADMIN", "OPERATIONS_MANAGER"].includes(user.role)) return;
  await db.savedSegment.delete({ where: { id } });
  revalidatePath("/admin/buyers");
}

const newBuyerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the buyer's name.").max(80),
  phone: z.string().trim().refine((v) => normalizeIndianPhone(v) !== null, "Enter a valid 10-digit Indian mobile number."),
  email: z.string().trim().max(120).optional().nullable().refine((v) => !v || normalizeEmail(v) !== null, "Enter a valid email address."),
  leadSource: z.string().trim().max(60).default("Walk-in"),
});

export async function createBuyerAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await assertPermission("buyers:write");
    const base = newBuyerSchema.parse({ fullName: form.get("fullName"), phone: form.get("phone"), email: fd.str(form, "email"), leadSource: fd.str(form, "leadSource") ?? "Walk-in" });
    const phone = normalizeIndianPhone(base.phone)!;
    const email = normalizeEmail(base.email);
    const dupe = await db.buyer.findFirst({ where: { OR: [{ phoneNormalized: phone }, ...(email ? [{ emailNormalized: email }] : [])] }, select: { id: true, fullName: true } });
    if (dupe) return { error: `A buyer with this phone or email already exists: ${dupe.fullName}.`, data: dupe.id };
    const req = requirementSchema.parse(requirementFromForm(form));
    if (!form.get("consentContact")) throw new UserError("Confirm the buyer agreed to be contacted.");
    const buyer = await db.buyer.create({
      data: {
        fullName: base.fullName,
        phone: base.phone,
        phoneNormalized: phone,
        email: email ? base.email : null,
        emailNormalized: email,
        leadSource: base.leadSource,
        preferredConfigs: req.configurations,
        budgetMin: req.budgetMin,
        budgetMax: req.budgetMax,
        assignedToId: fd.str(form, "assignedToId") ?? (user.role === "SALES_REP" ? user.id : null),
        nextFollowUpAt: fd.date(form, "nextFollowUpAt"),
        notes: fd.str(form, "notes"),
        requirements: { create: req },
        consents: { create: { purpose: "CONTACT_ABOUT_INQUIRY", granted: true, policyVersion: "2026-10", textShown: "Recorded by team member: buyer verbally agreed to be contacted about their requirement." } },
        activities: { create: { type: "NOTE", title: "Buyer created by team", actorId: user.id } },
        locationPreferences: { create: [req.primaryLocationId, req.secondaryLocationId].filter((x): x is string => !!x).map((locationId) => ({ locationId })) },
      },
    });
    await recomputeBuyerPriority(buyer.id);
    await audit(user, "buyer.create", "Buyer", buyer.id);
    id = buyer.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/buyers/${id}`);
}

export async function saveRequirementAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    const buyerId = z.string().cuid().parse(form.get("buyerId"));
    await assertCanEdit(user, buyerId);
    const reqId = fd.str(form, "requirementId");
    const data = requirementSchema.parse(requirementFromForm(form));
    if (reqId) await db.buyerRequirement.update({ where: { id: reqId, buyerId }, data });
    else await db.buyerRequirement.create({ data: { ...data, buyerId } });
    await db.buyer.update({ where: { id: buyerId }, data: { budgetMin: data.budgetMin ?? undefined, budgetMax: data.budgetMax ?? undefined, preferredConfigs: data.configurations.length ? data.configurations : undefined } });
    await db.activity.create({ data: { type: "NOTE", title: reqId ? "Requirement updated" : "Requirement added", buyerId, actorId: user.id } });
    const p = await recomputeBuyerPriority(buyerId);
    revalidatePath(`/admin/buyers/${buyerId}`);
    return { ok: true, message: `Requirement saved. Priority is now ${p?.priority ?? "—"}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateBuyerAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    const buyerId = z.string().cuid().parse(form.get("buyerId"));
    await assertCanEdit(user, buyerId);
    const assignedToId = fd.str(form, "assignedToId");
    const before = await db.buyer.findUniqueOrThrow({ where: { id: buyerId } });
    if (user.role === "SALES_REP" && assignedToId !== before.assignedToId && assignedToId !== user.id) throw new UserError("Only managers can reassign buyers.");
    const verification = (fd.str(form, "verification") ?? before.verification) as typeof before.verification;
    await db.buyer.update({
      where: { id: buyerId },
      data: {
        assignedToId,
        nextFollowUpAt: fd.date(form, "nextFollowUpAt"),
        verification,
        fundingReadiness: (fd.str(form, "fundingReadiness") ?? before.fundingReadiness) as typeof before.fundingReadiness,
        notes: fd.str(form, "notes"),
      },
    });
    const stage = fd.str(form, "stage") as LeadStage | null;
    if (stage && stage !== before.stage) await changeBuyerStage(buyerId, stage, user, fd.str(form, "lostReason"));
    revalidatePath(`/admin/buyers/${buyerId}`);
    return { ok: true, message: "Buyer updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function logActivityAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    const buyerId = z.string().cuid().parse(form.get("buyerId"));
    await assertCanEdit(user, buyerId);
    const type = z.enum(["NOTE", "CALL", "MESSAGE", "EMAIL"]).parse(form.get("type"));
    const body = z.string().trim().min(1, "Add a short note.").max(2000).parse(form.get("body"));
    const titles = { NOTE: "Note", CALL: "Call logged", MESSAGE: "Message logged", EMAIL: "Email logged" };
    await db.activity.create({ data: { type, title: titles[type], body, buyerId, actorId: user.id } });
    const next = fd.date(form, "nextFollowUpAt");
    await db.buyer.update({
      where: { id: buyerId },
      data: { ...(type !== "NOTE" ? { lastContactedAt: new Date() } : {}), ...(next ? { nextFollowUpAt: next } : {}) },
    });
    const b = await db.buyer.findUniqueOrThrow({ where: { id: buyerId }, select: { stage: true } });
    if (type !== "NOTE" && ["NEW_INQUIRY", "CONTACT_PENDING"].includes(b.stage)) await changeBuyerStage(buyerId, "CONTACTED", user);
    revalidatePath(`/admin/buyers/${buyerId}`);
    return { ok: true, message: "Logged." };
  } catch (e) {
    return fail(e);
  }
}

export async function setTierAction(interestId: string, tier: InterestTier): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    const i = await db.projectInterest.findUniqueOrThrow({ where: { id: interestId }, select: { buyerId: true } });
    await assertCanEdit(user, i.buyerId);
    await setInterestTier(interestId, tier, user);
    revalidatePath(`/admin/buyers/${i.buyerId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function overridePriorityAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    const buyerId = z.string().cuid().parse(form.get("buyerId"));
    await assertCanEdit(user, buyerId);
    const raw = fd.str(form, "priority");
    const override = raw ? (z.enum(["A", "B", "C", "D"]).parse(raw) as Priority) : null;
    const reason = fd.str(form, "reason");
    if (override && !reason) throw new UserError("Give a short reason for the override.");
    const b = await db.buyer.findUniqueOrThrow({ where: { id: buyerId } });
    await db.buyer.update({
      where: { id: buyerId },
      data: { priorityOverride: override, priorityOverrideReason: override ? reason : null, priorityOverrideById: override ? user.id : null, priority: effectivePriority(b.priorityComputed, override) },
    });
    await db.activity.create({ data: { type: "SYSTEM", title: override ? `Priority overridden to ${override}` : "Priority override removed", body: reason, buyerId, actorId: user.id } });
    revalidatePath(`/admin/buyers/${buyerId}`);
    return { ok: true, message: override ? "Override saved." : "Override removed — computed priority applies." };
  } catch (e) {
    return fail(e);
  }
}

export async function addInterestAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    const buyerId = z.string().cuid().parse(form.get("buyerId"));
    const projectId = z.string().cuid({ message: "Choose a project." }).parse(form.get("projectId"));
    await assertCanEdit(user, buyerId);
    const configs = fd.list(form, "configurations").flatMap((s) => s.split(",")).map(Number).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 10);
    const b = await db.buyer.findUniqueOrThrow({ where: { id: buyerId } });
    await db.projectInterest.upsert({
      where: { buyerId_projectId: { buyerId, projectId } },
      update: { status: "ACTIVE", configurations: configs.length ? configs : undefined },
      create: { buyerId, projectId, configurations: configs, budgetMin: b.budgetMin, budgetMax: b.budgetMax, timeline: b.timeline, source: "Team" },
    });
    const p = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } });
    await db.activity.create({ data: { type: "INTEREST", title: `Interest recorded in ${p.name}`, buyerId, projectId, actorId: user.id } });
    revalidatePath(`/admin/buyers/${buyerId}`);
    return { ok: true, message: "Interest added." };
  } catch (e) {
    return fail(e);
  }
}

export async function withdrawInterestAction(interestId: string): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:write");
    const i = await db.projectInterest.findUniqueOrThrow({ where: { id: interestId }, include: { project: { select: { name: true } } } });
    await assertCanEdit(user, i.buyerId);
    await db.projectInterest.update({ where: { id: interestId }, data: { status: i.status === "ACTIVE" ? "WITHDRAWN" : "ACTIVE" } });
    await db.activity.create({ data: { type: "INTEREST", title: `${i.status === "ACTIVE" ? "Withdrew" : "Reactivated"} interest in ${i.project.name}`, buyerId: i.buyerId, actorId: user.id } });
    const camps = await db.campaignMember.findMany({ where: { buyerId: i.buyerId, campaign: { projectId: i.projectId } }, select: { campaignId: true } });
    for (const c of camps) await checkCampaignMilestones(c.campaignId);
    revalidatePath(`/admin/buyers/${i.buyerId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function campaignMembershipAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("demand:write");
    const buyerId = z.string().cuid().parse(form.get("buyerId"));
    const campaignId = z.string().cuid({ message: "Choose a campaign." }).parse(form.get("campaignId"));
    if (form.get("remove")) {
      await removeBuyerFromCampaign(campaignId, buyerId, user.id);
      revalidatePath(`/admin/buyers/${buyerId}`);
      return { ok: true, message: "Removed from campaign." };
    }
    const r = await addBuyerToCampaign(campaignId, buyerId, "Team", user.id);
    revalidatePath(`/admin/buyers/${buyerId}`);
    return r.added ? { ok: true, message: "Added to campaign." } : { ok: true, message: "Already a member — counted once." };
  } catch (e) {
    return fail(e);
  }
}

export async function eraseBuyerAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("buyers:erase");
    const buyerId = z.string().cuid().parse(form.get("buyerId"));
    if (form.get("confirm") !== "ERASE") throw new UserError('Type ERASE to confirm.');
    const txCount = await db.transaction.count({ where: { buyerId } });
    if (txCount) throw new UserError("This buyer has recorded transactions. Retain records as required by law; erase after the retention period.");
    await anonymizeBuyer(buyerId, user);
  } catch (e) {
    return fail(e);
  }
  redirect("/admin/buyers");
}
