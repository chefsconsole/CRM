// Combinable CRM filters. The same definition powers the buyer table, saved segments,
// dashboard drill-downs and exports.

import type { Intent, InterestTier, LeadStage, Prisma, Priority } from "@prisma/client";
import { istDay } from "../time";

export interface BuyerFilter {
  q?: string;
  stage?: LeadStage[];
  priority?: Priority[];
  assignedToId?: string; // "me" | "none" | userId
  locationIds?: string[];
  configs?: number[];
  intents?: Intent[];
  commitWithinDays?: number;
  possessionWaitMin?: number;
  budgetAbove?: number;
  budgetBelow?: number;
  projectId?: string;
  tiers?: InterestTier[];
  upcomingLaunch?: boolean;
  followUpDue?: boolean;
  source?: string;
}

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : undefined);
const num = (v: string | null) => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export function parseBuyerFilter(sp: URLSearchParams): BuyerFilter {
  return {
    q: sp.get("q") || undefined,
    stage: list(sp.get("stage")) as LeadStage[] | undefined,
    priority: list(sp.get("priority")) as Priority[] | undefined,
    assignedToId: sp.get("assigned") || undefined,
    locationIds: list(sp.get("loc")),
    configs: list(sp.get("bhk"))?.map(Number),
    intents: list(sp.get("intent")) as Intent[] | undefined,
    commitWithinDays: num(sp.get("commit")),
    possessionWaitMin: num(sp.get("wait")),
    budgetAbove: num(sp.get("budgetAbove")),
    budgetBelow: num(sp.get("budgetBelow")),
    projectId: sp.get("project") || undefined,
    tiers: list(sp.get("tier")) as InterestTier[] | undefined,
    upcomingLaunch: sp.get("upcoming") === "1" || undefined,
    followUpDue: sp.get("due") === "1" || undefined,
    source: sp.get("source") || undefined,
  };
}

export function serializeBuyerFilter(f: BuyerFilter): string {
  const sp = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || v === false) return;
    sp.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : String(v));
  };
  set("q", f.q);
  set("stage", f.stage);
  set("priority", f.priority);
  set("assigned", f.assignedToId);
  set("loc", f.locationIds);
  set("bhk", f.configs);
  set("intent", f.intents);
  set("commit", f.commitWithinDays);
  set("wait", f.possessionWaitMin);
  set("budgetAbove", f.budgetAbove);
  set("budgetBelow", f.budgetBelow);
  set("project", f.projectId);
  set("tier", f.tiers);
  set("upcoming", f.upcomingLaunch);
  set("due", f.followUpDue);
  set("source", f.source);
  return sp.toString();
}

export function activeFilterCount(f: BuyerFilter): number {
  return Object.values(f).filter((v) => v !== undefined && !(Array.isArray(v) && v.length === 0)).length;
}

const UPCOMING = ["ANNOUNCED", "PRE_LAUNCH", "NEW_LAUNCH"] as const;

export function buyerWhere(f: BuyerFilter, currentUserId?: string, now = new Date()): Prisma.BuyerWhereInput {
  const and: Prisma.BuyerWhereInput[] = [{ anonymizedAt: null }];
  const req = (w: Prisma.BuyerRequirementWhereInput) => and.push({ requirements: { some: { status: "ACTIVE", ...w } } });

  if (f.q) {
    const q = f.q.trim();
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : []),
        { interests: { some: { project: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    });
  }
  if (f.stage?.length) and.push({ stage: { in: f.stage } });
  if (f.priority?.length) and.push({ priority: { in: f.priority } });
  if (f.assignedToId === "none") and.push({ assignedToId: null });
  else if (f.assignedToId === "me" && currentUserId) and.push({ assignedToId: currentUserId });
  else if (f.assignedToId) and.push({ assignedToId: f.assignedToId });
  if (f.locationIds?.length) {
    and.push({
      OR: [
        { locationPreferences: { some: { locationId: { in: f.locationIds } } } },
        { requirements: { some: { status: "ACTIVE", OR: [{ primaryLocationId: { in: f.locationIds } }, { secondaryLocationId: { in: f.locationIds } }, { acceptableLocationIds: { hasSome: f.locationIds } }] } } },
        { interests: { some: { status: "ACTIVE", project: { locationId: { in: f.locationIds } } } } },
      ],
    });
  }
  if (f.configs?.length) {
    and.push({
      OR: [
        { preferredConfigs: { hasSome: f.configs } },
        { requirements: { some: { status: "ACTIVE", configurations: { hasSome: f.configs } } } },
        { interests: { some: { status: "ACTIVE", configurations: { hasSome: f.configs } } } },
      ],
    });
  }
  if (f.intents?.length) req({ intents: { hasSome: f.intents } });
  if (f.commitWithinDays !== undefined) req({ commitWithinDays: { lte: f.commitWithinDays } });
  if (f.possessionWaitMin !== undefined) req({ possessionWaitMonths: { gte: f.possessionWaitMin } });
  if (f.budgetAbove !== undefined) and.push({ OR: [{ budgetMax: { gte: f.budgetAbove } }, { AND: [{ budgetMax: null }, { budgetMin: { gte: f.budgetAbove } }] }] });
  if (f.budgetBelow !== undefined) and.push({ OR: [{ budgetMin: { lte: f.budgetBelow } }, { AND: [{ budgetMin: null }, { budgetMax: { lte: f.budgetBelow } }] }] });
  if (f.projectId || f.tiers?.length)
    and.push({ interests: { some: { status: "ACTIVE", ...(f.projectId ? { projectId: f.projectId } : {}), ...(f.tiers?.length ? { tier: { in: f.tiers } } : {}) } } });
  if (f.upcomingLaunch) req({ stagePreferences: { hasSome: [...UPCOMING] } });
  if (f.followUpDue) {
    const { end } = istDay(now);
    and.push({ nextFollowUpAt: { lt: end }, stage: { notIn: ["CONVERTED", "LOST"] } });
  }
  if (f.source) and.push({ leadSource: f.source });
  return { AND: and };
}

/** Built-in segments, always available. */
export const PRESET_SEGMENTS: { id: string; name: string; description: string; filter: BuyerFilter }[] = [
  { id: "ready-15", name: "Ready within 15 days", description: "Could commit within 15 days", filter: { commitWithinDays: 15, stage: ["NEW_INQUIRY", "CONTACT_PENDING", "CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION_FOLLOWUP"] } },
  { id: "ready-30", name: "Ready within 30 days", description: "Could commit within 30 days", filter: { commitWithinDays: 30, stage: ["NEW_INQUIRY", "CONTACT_PENDING", "CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION_FOLLOWUP"] } },
  { id: "priority-a", name: "Priority A — Ready", description: "Highest follow-up priority", filter: { priority: ["A"] } },
  { id: "commercial-investors", name: "Commercial investors", description: "Commercial or pre-leased investment", filter: { intents: ["COM_INVESTMENT", "PRE_LEASED"] } },
  { id: "rentals", name: "Rental requirements", description: "Residential or commercial rentals", filter: { intents: ["RENT_RESIDENTIAL", "RENT_COMMERCIAL"] } },
  { id: "upcoming", name: "Waiting for new launches", description: "Prefers announced, pre-launch or new-launch projects", filter: { upcomingLaunch: true } },
  { id: "wait-24", name: "Happy to wait 2+ years", description: "Possession wait of 24 months or more", filter: { possessionWaitMin: 24 } },
  { id: "above-2cr", name: "Budget above ₹2 Cr", description: "Stated maximum budget ₹2 Cr or more", filter: { budgetAbove: 2e7 } },
  { id: "due-today", name: "Follow-ups due", description: "Next follow-up due today or overdue", filter: { followUpDue: true } },
];
