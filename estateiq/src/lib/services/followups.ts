// One follow-up system for buyers, developers, inventory units and negotiations.
// Every follow-up is a Task row (open → done | cancelled). The "next follow-up" date shown on a
// buyer / developer / unit / negotiation is derived: the earliest open follow-up for that record.

import type { Prisma } from "@prisma/client";
import { db } from "../db";

export interface FollowUpRef {
  buyerId?: string | null;
  developerId?: string | null;
  inventoryUnitId?: string | null;
  negotiationId?: string | null;
}

type Client = Prisma.TransactionClient | typeof db;

function refWhere(ref: FollowUpRef): Prisma.TaskWhereInput {
  if (ref.negotiationId) return { negotiationId: ref.negotiationId };
  if (ref.inventoryUnitId) return { inventoryUnitId: ref.inventoryUnitId };
  if (ref.buyerId) return { buyerId: ref.buyerId };
  if (ref.developerId) return { developerId: ref.developerId };
  return { id: "__none__" };
}

/** Recomputes the derived next-follow-up date on every record the follow-up touches. */
export async function syncFollowUpDates(ref: FollowUpRef, client: Client = db) {
  const earliest = async (where: Prisma.TaskWhereInput) =>
    (await client.task.findFirst({ where: { ...where, status: "OPEN", dueAt: { not: null } }, orderBy: { dueAt: "asc" }, select: { dueAt: true, title: true } })) ?? null;
  if (ref.buyerId) {
    const t = await earliest({ buyerId: ref.buyerId });
    await client.buyer.update({ where: { id: ref.buyerId }, data: { nextFollowUpAt: t?.dueAt ?? null } });
  }
  if (ref.developerId) {
    const t = await earliest({ developerId: ref.developerId });
    await client.developer.update({ where: { id: ref.developerId }, data: { nextFollowUpAt: t?.dueAt ?? null } });
  }
  if (ref.inventoryUnitId) {
    const t = await earliest({ inventoryUnitId: ref.inventoryUnitId });
    await client.inventoryUnit.update({ where: { id: ref.inventoryUnitId }, data: { nextFollowUpAt: t?.dueAt ?? null } });
  }
  if (ref.negotiationId) {
    const t = await earliest({ negotiationId: ref.negotiationId });
    await client.negotiation.update({ where: { id: ref.negotiationId }, data: { nextActionAt: t?.dueAt ?? null, ...(t ? { nextAction: t.title } : {}) } });
  }
}

/**
 * Keeps a record's "next follow-up" field and its follow-up list in step. Setting a date creates or
 * moves the record's automatic follow-up; clearing it cancels that follow-up. Manually created
 * follow-ups are never touched.
 */
export async function setNextFollowUp(ref: FollowUpRef, dueAt: Date | null, opts: { title: string; assigneeId?: string | null }, client: Client = db) {
  const open = await client.task.findFirst({ where: { ...refWhere(ref), auto: true, status: "OPEN" }, orderBy: { createdAt: "desc" } });
  if (!dueAt) {
    if (open) await client.task.update({ where: { id: open.id }, data: { status: "CANCELLED", cancelledAt: new Date(), outcome: "Next follow-up date cleared" } });
  } else if (open) {
    if (open.dueAt?.getTime() !== dueAt.getTime()) await client.task.update({ where: { id: open.id }, data: { dueAt, title: opts.title } });
  } else {
    await client.task.create({ data: { title: opts.title, dueAt, auto: true, assigneeId: opts.assigneeId ?? null, ...linkData(ref) } });
  }
  await syncFollowUpDates(ref, client);
}

function linkData(ref: FollowUpRef) {
  return { buyerId: ref.buyerId ?? null, developerId: ref.developerId ?? null, inventoryUnitId: ref.inventoryUnitId ?? null, negotiationId: ref.negotiationId ?? null };
}

export async function createFollowUp(input: { title: string; dueAt: Date | null; assigneeId?: string | null; notes?: string | null } & FollowUpRef) {
  const t = await db.task.create({ data: { title: input.title, dueAt: input.dueAt, assigneeId: input.assigneeId ?? null, notes: input.notes ?? null, ...linkData(input) } });
  await syncFollowUpDates(input);
  return t;
}

export class FollowUpError extends Error {
  name = "UserError";
}

/** Marks a follow-up done with what happened, optionally scheduling the next one in the same step. */
export async function completeFollowUp(taskId: string, actorId: string, outcome: string | null, next?: { dueAt: Date; title: string } | null) {
  const t = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  if (t.status !== "OPEN") throw new FollowUpError("This follow-up is already closed.");
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status: "DONE", completedAt: new Date(), completedById: actorId, outcome } });
    if (next) await tx.task.create({ data: { title: next.title, dueAt: next.dueAt, assigneeId: t.assigneeId, auto: t.auto, buyerId: t.buyerId, developerId: t.developerId, inventoryUnitId: t.inventoryUnitId, negotiationId: t.negotiationId } });
    if (t.buyerId && outcome) await tx.buyer.update({ where: { id: t.buyerId }, data: { lastContactedAt: new Date() } });
    await syncFollowUpDates(t, tx);
  });
  if (t.buyerId || t.developerId) {
    await db.activity.create({ data: { type: "NOTE", title: `Follow-up done: ${t.title}`, body: outcome, buyerId: t.buyerId, developerId: t.developerId, actorId } });
  }
}

export async function cancelFollowUp(taskId: string, reason: string | null) {
  const t = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  if (t.status !== "OPEN") throw new FollowUpError("This follow-up is already closed.");
  await db.task.update({ where: { id: taskId }, data: { status: "CANCELLED", cancelledAt: new Date(), outcome: reason } });
  await syncFollowUpDates(t);
}

export async function rescheduleFollowUp(taskId: string, dueAt: Date) {
  const t = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  if (t.status !== "OPEN") throw new FollowUpError("Re-open is not supported — create a new follow-up instead.");
  await db.task.update({ where: { id: taskId }, data: { dueAt } });
  await syncFollowUpDates(t);
}
