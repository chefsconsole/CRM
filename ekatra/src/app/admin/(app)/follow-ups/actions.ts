"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { scheduleVisit } from "@/lib/services/visits";
import { formatDateTime } from "@/lib/format";
import { audit } from "@/lib/audit";
import { cancelFollowUp, completeFollowUp, createFollowUp, rescheduleFollowUp } from "@/lib/services/followups";

export async function scheduleVisitAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("visits:write");
    const scheduledAt = fd.date(form, "scheduledAt");
    if (!scheduledAt) throw new UserError("Choose a date and time.");
    const status = z.enum(["REQUESTED", "SCHEDULED", "CONFIRMED", "COMPLETED", "RESCHEDULED", "CANCELLED"]).parse(form.get("status") ?? "SCHEDULED");
    if (["SCHEDULED", "CONFIRMED"].includes(status) && scheduledAt < new Date(Date.now() - 60 * 60_000)) throw new UserError("That time is in the past.");
    const input = {
      id: fd.str(form, "visitId"),
      buyerId: z.string().cuid({ message: "Choose a buyer." }).parse(form.get("buyerId")),
      projectId: z.string().cuid({ message: "Choose a project." }).parse(form.get("projectId")),
      scheduledAt,
      durationMins: z.coerce.number().int().min(15).max(480).parse(form.get("durationMins") ?? 60),
      assignedToId: fd.str(form, "assignedToId"),
      meetingPoint: fd.str(form, "meetingPoint"),
      notes: fd.str(form, "notes"),
      status,
    };
    const r = await scheduleVisit(input, user.id, fd.bool(form, "force"));
    if (!r.ok) {
      const ids = r.conflicts.map((c) => c.visitId).filter((x): x is string => !!x);
      const others = await db.siteVisit.findMany({ where: { id: { in: ids } }, include: { buyer: { select: { fullName: true } }, assignedTo: { select: { name: true } } } });
      return { error: `Scheduling conflict: ${others.map((o) => `${o.assignedTo?.name ?? "rep"} has ${o.buyer.fullName} at ${formatDateTime(o.scheduledAt)}`).join("; ")} (30-minute travel buffer applies). Tick "Schedule anyway" to override.` };
    }
    await audit(user, input.id ? "visit.update" : "visit.create", "SiteVisit", r.visit.id);
    revalidatePath("/admin/follow-ups");
    return { ok: true, message: "Visit saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function visitOutcomeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("visits:write");
    const id = z.string().cuid().parse(form.get("visitId"));
    const status = z.enum(["REQUESTED", "SCHEDULED", "CONFIRMED", "COMPLETED", "RESCHEDULED", "CANCELLED"]).parse(form.get("status"));
    const v = await db.siteVisit.update({ where: { id }, data: { status, outcome: fd.str(form, "outcome"), nextFollowUpAt: fd.date(form, "nextFollowUpAt") }, include: { project: { select: { name: true } } } });
    await db.activity.create({ data: { type: "VISIT", title: `Visit ${status.toLowerCase()} — ${v.project.name}`, body: v.outcome, buyerId: v.buyerId, projectId: v.projectId, actorId: user.id } });
    if (v.nextFollowUpAt) await createFollowUp({ buyerId: v.buyerId, title: `Follow up after visit — ${v.project.name}`, dueAt: v.nextFollowUpAt, assigneeId: v.assignedToId ?? user.id });
    if (status === "COMPLETED") await db.buyer.updateMany({ where: { id: v.buyerId, stage: { in: ["NEW_INQUIRY", "CONTACT_PENDING", "CONTACTED", "QUALIFIED", "VISIT_SCHEDULED"] } }, data: { stage: "VISIT_COMPLETED" } });
    revalidatePath("/admin/follow-ups");
    return { ok: true, message: "Updated." };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────── Unified follow-ups ─────────────────────────

const followUpRef = z.object({
  buyerId: z.string().cuid().nullish(),
  developerId: z.string().cuid().nullish(),
  inventoryUnitId: z.string().cuid().nullish(),
  negotiationId: z.string().cuid().nullish(),
});

/** Follow-ups inherit the permission of the record they belong to. */
async function assertFollowUpAccess(ref: { buyerId?: string | null; developerId?: string | null; inventoryUnitId?: string | null; negotiationId?: string | null }) {
  if (ref.inventoryUnitId) return assertPermission("projects:write");
  if (ref.negotiationId) return assertPermission("commercial:write");
  if (ref.developerId) return assertPermission("developers:write");
  return assertPermission("visits:write");
}

function revalidateFollowUps(ref: { buyerId?: string | null; developerId?: string | null; inventoryUnitId?: string | null; negotiationId?: string | null }) {
  revalidatePath("/admin/follow-ups");
  if (ref.buyerId) revalidatePath(`/admin/buyers/${ref.buyerId}`);
  if (ref.developerId) revalidatePath(`/admin/developers/${ref.developerId}`);
  if (ref.inventoryUnitId) revalidatePath(`/admin/inventory/${ref.inventoryUnitId}`);
  if (ref.negotiationId) revalidatePath(`/admin/negotiations/${ref.negotiationId}`);
}

export async function createFollowUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ref = followUpRef.parse({ buyerId: fd.str(form, "buyerId"), developerId: fd.str(form, "developerId"), inventoryUnitId: fd.str(form, "inventoryUnitId"), negotiationId: fd.str(form, "negotiationId") });
    const user = await assertFollowUpAccess(ref);
    const dueAt = fd.date(form, "dueAt");
    if (!dueAt) throw new UserError("Choose when it is due.");
    let developerId = ref.developerId;
    if (ref.negotiationId && !developerId) developerId = (await db.negotiation.findUniqueOrThrow({ where: { id: ref.negotiationId }, select: { developerId: true } })).developerId;
    await createFollowUp({
      ...ref,
      developerId,
      title: z.string().trim().min(2, "Describe the next action.").max(200).parse(form.get("title")),
      dueAt,
      assigneeId: fd.str(form, "assigneeId") ?? user.id,
      notes: fd.str(form, "notes"),
    });
    revalidateFollowUps({ ...ref, developerId });
    return { ok: true, message: "Follow-up scheduled." };
  } catch (e) {
    return fail(e);
  }
}

async function loadTaskForUpdate(form: FormData) {
  // Ids are cuids, or UUIDs for follow-ups migrated from older "next follow-up" dates.
  const id = z.string().min(20).max(40).regex(/^[a-z0-9-]+$/).parse(form.get("taskId"));
  const t = await db.task.findUniqueOrThrow({ where: { id } });
  const user = await assertFollowUpAccess(t);
  if (user.role === "SALES_REP" && t.assigneeId && t.assigneeId !== user.id) throw new UserError("This follow-up belongs to someone else.");
  return { t, user };
}

export async function completeFollowUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { t, user } = await loadTaskForUpdate(form);
    const nextAt = fd.date(form, "nextDueAt");
    await completeFollowUp(t.id, user.id, fd.str(form, "outcome"), nextAt ? { dueAt: nextAt, title: fd.str(form, "nextTitle") ?? t.title } : null);
    revalidateFollowUps(t);
    return { ok: true, message: nextAt ? "Done — next follow-up scheduled." : "Marked as done." };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelFollowUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { t } = await loadTaskForUpdate(form);
    await cancelFollowUp(t.id, fd.str(form, "reason"));
    revalidateFollowUps(t);
    return { ok: true, message: "Cancelled." };
  } catch (e) {
    return fail(e);
  }
}

export async function rescheduleFollowUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { t } = await loadTaskForUpdate(form);
    const dueAt = fd.date(form, "dueAt");
    if (!dueAt) throw new UserError("Choose a new date.");
    await rescheduleFollowUp(t.id, dueAt);
    revalidateFollowUps(t);
    return { ok: true, message: "Rescheduled." };
  } catch (e) {
    return fail(e);
  }
}
