import type { VisitStatus } from "@prisma/client";
import { db } from "../db";
import { findVisitConflicts, type VisitConflict } from "../domain/visits";
import { formatDateTime } from "../format";

export interface ScheduleInput {
  id?: string | null;
  buyerId: string;
  projectId: string;
  scheduledAt: Date;
  durationMins: number;
  assignedToId: string | null;
  meetingPoint?: string | null;
  notes?: string | null;
  status: VisitStatus;
}

export async function detectConflicts(input: ScheduleInput): Promise<VisitConflict[]> {
  const dayStart = new Date(input.scheduledAt.getTime() - 864e5);
  const dayEnd = new Date(input.scheduledAt.getTime() + 864e5);
  const nearby = await db.siteVisit.findMany({
    where: {
      scheduledAt: { gte: dayStart, lte: dayEnd },
      OR: [{ buyerId: input.buyerId }, ...(input.assignedToId ? [{ assignedToId: input.assignedToId }] : [])],
    },
  });
  return findVisitConflicts(
    { ...input, id: input.id ?? undefined },
    nearby.filter((v) => v.scheduledAt).map((v) => ({ ...v, scheduledAt: v.scheduledAt! })),
  );
}

export async function scheduleVisit(input: ScheduleInput, actorId: string, force = false) {
  if (["SCHEDULED", "CONFIRMED"].includes(input.status)) {
    const conflicts = await detectConflicts(input);
    if (conflicts.length && !force) return { ok: false as const, conflicts };
  }
  const data = {
    buyerId: input.buyerId,
    projectId: input.projectId,
    scheduledAt: input.scheduledAt,
    durationMins: input.durationMins,
    assignedToId: input.assignedToId,
    meetingPoint: input.meetingPoint ?? null,
    notes: input.notes ?? null,
    status: input.status,
  };
  const visit = await db.$transaction(async (tx) => {
    const v = input.id ? await tx.siteVisit.update({ where: { id: input.id }, data }) : await tx.siteVisit.create({ data });
    const project = await tx.project.findUniqueOrThrow({ where: { id: input.projectId }, select: { name: true } });
    await tx.activity.create({
      data: {
        type: "VISIT",
        title: `Site visit ${input.status.toLowerCase()} — ${project.name}`,
        body: `${formatDateTime(input.scheduledAt)}${input.meetingPoint ? ` · ${input.meetingPoint}` : ""}`,
        buyerId: input.buyerId,
        projectId: input.projectId,
        actorId,
      },
    });
    const buyer = await tx.buyer.findUniqueOrThrow({ where: { id: input.buyerId }, select: { stage: true } });
    const early = ["NEW_INQUIRY", "CONTACT_PENDING", "CONTACTED", "QUALIFIED"];
    if (["SCHEDULED", "CONFIRMED"].includes(input.status) && early.includes(buyer.stage))
      await tx.buyer.update({ where: { id: input.buyerId }, data: { stage: "VISIT_SCHEDULED" } });
    if (input.status === "COMPLETED" && [...early, "VISIT_SCHEDULED"].includes(buyer.stage))
      await tx.buyer.update({ where: { id: input.buyerId }, data: { stage: "VISIT_COMPLETED" } });
    return v;
  });
  return { ok: true as const, visit };
}
