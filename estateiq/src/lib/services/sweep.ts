// Periodic checks that raise notifications. Run via /api/cron/sweep (scheduler) — and opportunistically,
// at most hourly, when the dashboard is opened.

import { db } from "../db";
import { notify } from "../notify";
import { needsReverification } from "../domain/compliance";
import { sumPayments } from "../domain/commission";

let lastRun = 0;

export async function runSweep(force = false) {
  if (!force && Date.now() - lastRun < 60 * 60_000) return { skipped: true };
  lastRun = Date.now();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  let raised = 0;

  const overdue = await db.buyer.findMany({ where: { anonymizedAt: null, nextFollowUpAt: { lt: now }, stage: { notIn: ["CONVERTED", "LOST"] }, assignedToId: { not: null } }, select: { id: true, fullName: true, assignedToId: true } });
  const byRep = new Map<string, typeof overdue>();
  for (const b of overdue) byRep.set(b.assignedToId!, [...(byRep.get(b.assignedToId!) ?? []), b]);
  for (const [rep, list] of byRep) {
    raised += await notify("followup.overdue", { title: `${list.length} overdue follow-up${list.length > 1 ? "s" : ""}`, body: list.slice(0, 5).map((b) => b.fullName).join(", "), link: "/admin/follow-ups", dedupeKey: `overdue:${rep}:${day}`, userIds: [rep] });
  }

  const projects = await db.project.findMany({ where: { isPublished: true }, select: { id: true, name: true, lastVerifiedAt: true } });
  const stale = projects.filter((p) => needsReverification(p.lastVerifiedAt, now));
  if (stale.length) raised += await notify("project.reverify", { title: `${stale.length} published project(s) need re-verification`, body: stale.slice(0, 5).map((p) => p.name).join(", "), link: "/admin/projects?reverify=1&market=all", dedupeKey: `reverify:${day}` });

  const commissions = await db.commission.findMany({ where: { status: { notIn: ["PAID", "CANCELLED", "NOT_ELIGIBLE"] }, expectedPaymentDate: { lte: new Date(now.getTime() + 7 * 864e5) } }, include: { payments: true, transaction: { select: { unitLabel: true } } } });
  for (const c of commissions) {
    if (sumPayments(c.payments) >= c.amountEarned) continue;
    raised += await notify("commission.due", { title: `Commission ${c.expectedPaymentDate! < now ? "overdue" : "due soon"}: ${c.transaction.unitLabel}`, link: `/admin/commissions/${c.id}`, dedupeKey: `commission:${c.id}:${day}` });
  }
  return { skipped: false, raised };
}
