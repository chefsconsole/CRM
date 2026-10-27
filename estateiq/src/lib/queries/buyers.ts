import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { TeamUser } from "../auth";
import { can } from "../rbac";
import { buyerWhere, parseBuyerFilter, PRESET_SEGMENTS, type BuyerFilter } from "../domain/buyer-filters";
import { maskEmail, maskPhone } from "../domain/identity";
import { formatPhone } from "../format";

export const PAGE_SIZE = 25;

const SORTS: Record<string, Prisma.BuyerOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }],
  "createdAt:asc": [{ createdAt: "asc" }],
  "createdAt:desc": [{ createdAt: "desc" }],
  "name:asc": [{ fullName: "asc" }],
  "name:desc": [{ fullName: "desc" }],
  "priority:asc": [{ priority: "asc" }, { nextFollowUpAt: "asc" }],
  "priority:desc": [{ priority: "desc" }],
  "followup:asc": [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }],
  "followup:desc": [{ nextFollowUpAt: { sort: "desc", nulls: "last" } }],
  "budget:asc": [{ budgetMax: { sort: "asc", nulls: "last" } }],
  "budget:desc": [{ budgetMax: { sort: "desc", nulls: "last" } }],
  "stage:asc": [{ stage: "asc" }],
  "stage:desc": [{ stage: "desc" }],
};

export async function resolveFilter(sp: Record<string, string | undefined>): Promise<{ filter: BuyerFilter; segmentName: string | null }> {
  if (sp.segment) {
    const preset = PRESET_SEGMENTS.find((s) => s.id === sp.segment);
    if (preset) return { filter: preset.filter, segmentName: preset.name };
    const saved = await db.savedSegment.findUnique({ where: { id: sp.segment } });
    if (saved) return { filter: saved.filters as BuyerFilter, segmentName: saved.name };
  }
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) usp.set(k, v);
  return { filter: parseBuyerFilter(usp), segmentName: null };
}

export function piiView(user: TeamUser) {
  const pii = can(user.role, "buyers:pii");
  return {
    phone: (p: string | null) => (pii ? formatPhone(p) : maskPhone(p)),
    email: (e: string | null) => (pii ? e ?? "—" : maskEmail(e)),
    pii,
  };
}

export async function listBuyers(filter: BuyerFilter, sort: string | undefined, page: number, user: TeamUser) {
  const where = buyerWhere(filter, user.id);
  const [total, rows] = await Promise.all([
    db.buyer.count({ where }),
    db.buyer.findMany({
      where,
      orderBy: SORTS[sort ?? "priority:asc"] ?? SORTS["priority:asc"],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        phoneNormalized: true,
        email: true,
        stage: true,
        priority: true,
        budgetMin: true,
        budgetMax: true,
        nextFollowUpAt: true,
        createdAt: true,
        leadSource: true,
        verification: true,
        assignedTo: { select: { id: true, name: true } },
        requirements: { where: { status: "ACTIVE" }, take: 1, orderBy: { updatedAt: "desc" }, select: { commitWithinDays: true, possessionWaitMonths: true, intents: true, configurations: true, rentMax: true } },
        interests: { where: { status: "ACTIVE" }, take: 2, orderBy: { createdAt: "desc" }, select: { tier: true, project: { select: { name: true } } } },
        _count: { select: { interests: true } },
      },
    }),
  ]);
  const v = piiView(user);
  // Raw contact fields never leave the server: rows are serialised to a client component.
  return { total, rows: rows.map(({ phoneNormalized, email, ...r }) => ({ ...r, phoneDisplay: v.phone(phoneNormalized), emailDisplay: v.email(email) })) };
}
export type BuyerRow = Awaited<ReturnType<typeof listBuyers>>["rows"][number];

export async function pipelineBuyers(filter: BuyerFilter, user: TeamUser) {
  const where = buyerWhere(filter, user.id);
  return db.buyer.findMany({
    where,
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    take: 400,
    select: { id: true, fullName: true, stage: true, priority: true, budgetMin: true, budgetMax: true, nextFollowUpAt: true, assignedTo: { select: { name: true } }, interests: { take: 1, orderBy: { createdAt: "desc" }, select: { project: { select: { name: true } } } } },
  });
}
