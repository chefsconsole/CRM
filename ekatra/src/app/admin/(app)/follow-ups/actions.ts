"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { scheduleVisit } from "@/lib/services/visits";
import { formatDateTime } from "@/lib/format";
import { audit } from "@/lib/audit";

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
    if (v.nextFollowUpAt) await db.buyer.update({ where: { id: v.buyerId }, data: { nextFollowUpAt: v.nextFollowUpAt } });
    if (status === "COMPLETED") await db.buyer.updateMany({ where: { id: v.buyerId, stage: { in: ["NEW_INQUIRY", "CONTACT_PENDING", "CONTACTED", "QUALIFIED", "VISIT_SCHEDULED"] } }, data: { stage: "VISIT_COMPLETED" } });
    revalidatePath("/admin/follow-ups");
    return { ok: true, message: "Updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function taskAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("visits:write");
    const id = fd.str(form, "taskId");
    if (id) {
      const t = await db.task.findUniqueOrThrow({ where: { id } });
      if (user.role === "SALES_REP" && t.assigneeId && t.assigneeId !== user.id) throw new UserError("This task belongs to someone else.");
      const done = t.status !== "DONE";
      await db.task.update({ where: { id }, data: { status: done ? "DONE" : "OPEN", completedAt: done ? new Date() : null } });
    } else {
      await db.task.create({ data: { title: z.string().trim().min(2, "Describe the task.").max(200).parse(form.get("title")), dueAt: fd.date(form, "dueAt"), assigneeId: fd.str(form, "assigneeId") ?? user.id, buyerId: fd.str(form, "buyerId") } });
    }
    revalidatePath("/admin/follow-ups");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
