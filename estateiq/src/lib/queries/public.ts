// Read models for the public site. These select only public-safe fields:
// no buyer identities, contact details, budgets or commercial terms ever leave here.

import "server-only";
import type { DealType, Prisma, ProjectStatus, PropertySegment } from "@prisma/client";
import { cache } from "react";
import { db } from "../db";
import { PUBLIC_PROJECT_WHERE } from "../domain/compliance";
import { computeCampaignMetrics, publicDemandLabel, publicGroupStage, publicProgress } from "../domain/demand";
import { isLiveConfirmed } from "../domain/benefits";
import { loadCampaignMembers } from "../services/campaigns";
import { grossYieldPct } from "../domain/yield";

export const MODES = {
  homes: { label: "Buy a home", short: "Homes", segment: "RESIDENTIAL", deal: ["SALE"] },
  commercial: { label: "Buy commercial", short: "Commercial", segment: "COMMERCIAL", deal: ["SALE"] },
  "pre-leased": { label: "Pre-leased investments", short: "Pre-leased", segment: null, deal: ["PRE_LEASED"] },
  "rent-homes": { label: "Rent a home", short: "Rent homes", segment: "RESIDENTIAL", deal: ["RENT"] },
  "rent-commercial": { label: "Rent commercial", short: "Rent offices & shops", segment: "COMMERCIAL", deal: ["RENT"] },
} as const satisfies Record<string, { label: string; short: string; segment: PropertySegment | null; deal: DealType[] }>;
export type Mode = keyof typeof MODES;
export const isMode = (m: string | undefined | null): m is Mode => !!m && m in MODES;

export function modeOf(p: { segment: PropertySegment; dealType: DealType }): Mode {
  if (p.dealType === "PRE_LEASED") return "pre-leased";
  if (p.dealType === "RENT") return p.segment === "COMMERCIAL" ? "rent-commercial" : "rent-homes";
  return p.segment === "COMMERCIAL" ? "commercial" : "homes";
}

const cardSelect = {
  id: true,
  priceSourceDate: true,
  slug: true,
  name: true,
  tagline: true,
  status: true,
  segment: true,
  dealType: true,
  propertyType: true,
  category: true,
  possessionDate: true,
  possessionVerification: true,
  launchDate: true,
  dataVerification: true,
  lastVerifiedAt: true,
  reraVerification: true,
  lat: true,
  lng: true,
  coordinatePrecision: true,
  monthlyRent: true,
  furnishing: true,
  availableFrom: true,
  isFeatured: true,
  createdAt: true,
  location: { select: { id: true, name: true, slug: true, parentId: true } },
  developer: { select: { name: true, slug: true, isUnverifiedRealName: true } },
  configurations: {
    orderBy: [{ bhk: "asc" }, { sortOrder: "asc" }],
    select: { id: true, label: true, bhk: true, carpetAreaMin: true, carpetAreaMax: true, priceMin: true, priceMax: true, rentMin: true, rentMax: true, priceVerification: true },
  },
  media: { where: { kind: "IMAGE" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { url: true, caption: true } },
  campaigns: {
    where: { isPublic: true, status: { notIn: ["DRAFT", "CLOSED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, headline: true, name: true, status: true, visibility: true, targetBuyers: true, countingTiers: true, focusConfigs: true },
  },
  benefits: { select: { status: true, validUntil: true, confirmedAt: true } },
} satisfies Prisma.ProjectSelect;

type CardRow = Prisma.ProjectGetPayload<{ select: typeof cardSelect }>;

export interface PublicGroup {
  id: string;
  slug: string;
  headline: string;
  stage: ReturnType<typeof publicGroupStage>;
  demand: ReturnType<typeof publicDemandLabel>;
  progress: number | null;
  byConfig: { bhk: number; buyers: number }[] | null;
  target: number | null;
  focusConfigs: number[];
}

async function groupsFor(row: CardRow): Promise<PublicGroup[]> {
  const live = row.benefits.some((b) => isLiveConfirmed(b));
  const out: PublicGroup[] = [];
  for (const c of row.campaigns) {
    const members = await loadCampaignMembers(c.id);
    const m = computeCampaignMetrics(members, c);
    const exact = c.visibility === "EXACT";
    out.push({
      id: c.id,
      slug: c.slug,
      headline: c.headline ?? c.name,
      stage: publicGroupStage(c.status, live),
      // Public counts are all registered buyers (expressions of interest included), labelled as such.
      demand: publicDemandLabel(m.registered, c.visibility),
      progress: publicProgress(m.progress, c.visibility),
      byConfig: exact ? m.byConfig : null,
      target: exact ? c.targetBuyers : null,
      focusConfigs: c.focusConfigs,
    });
  }
  return out;
}

function toCard(row: CardRow, groups: PublicGroup[]) {
  const prices = row.configurations.flatMap((c) => [c.priceMin, c.priceMax]).filter((v): v is number => !!v);
  const rents = row.configurations.flatMap((c) => [c.rentMin, c.rentMax]).filter((v): v is number => !!v);
  const areas = row.configurations.flatMap((c) => [c.carpetAreaMin, c.carpetAreaMax]).filter((v): v is number => !!v);
  const priceMin = prices.length ? Math.min(...prices) : null;
  // How trustworthy the "from" price is: the verification of the configuration it comes from.
  const entry = [...row.configurations].filter((c) => c.priceMin).sort((a, b) => a.priceMin! - b.priceMin!)[0];
  const priceStatus = entry ? entry.priceVerification : null;
  return {
    ...row,
    mode: modeOf(row),
    image: row.media[0]?.url ?? null,
    priceMin,
    priceMax: prices.length ? Math.max(...prices) : null,
    priceStatus,
    rentMin: rents.length ? Math.min(...rents) : null,
    rentMax: rents.length ? Math.max(...rents) : null,
    areaMin: areas.length ? Math.min(...areas) : null,
    areaMax: areas.length ? Math.max(...areas) : null,
    bhks: [...new Set(row.configurations.map((c) => c.bhk).filter((b) => b > 0))],
    grossYield: row.dealType === "PRE_LEASED" ? grossYieldPct(row.monthlyRent, priceMin) : null,
    hasLiveBenefit: row.benefits.some((b) => isLiveConfirmed(b)),
    groups,
  };
}
export type ProjectCard = ReturnType<typeof toCard>;

export interface ProjectFilters {
  mode?: Mode | "all";
  location?: string;
  developer?: string;
  status?: ProjectStatus[];
  bhk?: number[];
  budgetMin?: number;
  budgetMax?: number;
  carpetMin?: number;
  possessionBy?: number; // year
  groups?: boolean;
  benefits?: boolean;
  q?: string;
  sort?: "featured" | "price-asc" | "price-desc" | "possession" | "demand" | "newest";
}

async function locationScope(slug: string): Promise<string[]> {
  const all = await db.location.findMany({ select: { id: true, slug: true, parentId: true } });
  const root = all.find((l) => l.slug === slug);
  if (!root) return [];
  const ids = new Set([root.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of all) if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) ids.add(l.id), (grew = true);
  }
  return [...ids];
}

export async function getProjectCards(f: ProjectFilters = {}): Promise<ProjectCard[]> {
  const where: Prisma.ProjectWhereInput = { ...PUBLIC_PROJECT_WHERE };
  if (f.mode && f.mode !== "all") {
    const m = MODES[f.mode];
    where.dealType = { in: [...m.deal] };
    if (m.segment) where.segment = m.segment;
  }
  if (f.location) where.locationId = { in: await locationScope(f.location) };
  if (f.developer) where.developer = { slug: f.developer };
  if (f.status?.length) where.status = { in: f.status };
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: "insensitive" } },
      { developer: { name: { contains: f.q, mode: "insensitive" } } },
      { location: { name: { contains: f.q, mode: "insensitive" } } },
    ];
  }
  const rows = await db.project.findMany({ where, select: cardSelect, orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }] });
  let cards = await Promise.all(rows.map(async (r) => toCard(r, await groupsFor(r))));

  const rent = f.mode === "rent-homes" || f.mode === "rent-commercial";
  cards = cards.filter((c) => {
    if (f.bhk?.length && !c.bhks.some((b) => f.bhk!.some((x) => (x >= 5 ? b >= 5 : b === x)))) return false;
    const lo = rent ? c.rentMin : c.priceMin;
    const hi = rent ? c.rentMax : c.priceMax;
    if (f.budgetMax && lo !== null && lo > f.budgetMax) return false;
    if (f.budgetMin && hi !== null && hi < f.budgetMin) return false;
    if ((f.budgetMax || f.budgetMin) && lo === null) return false;
    if (f.carpetMin && (c.areaMax === null || c.areaMax < f.carpetMin)) return false;
    if (f.possessionBy) {
      const ready = c.status === "READY_TO_MOVE" || c.dealType !== "SALE";
      if (!ready && (!c.possessionDate || c.possessionDate.getFullYear() > f.possessionBy)) return false;
    }
    if (f.groups && !c.groups.length) return false;
    if (f.benefits && !c.hasLiveBenefit) return false;
    return true;
  });

  const demand = (c: ProjectCard) => (c.groups[0]?.demand ? parseInt(c.groups[0].demand.value) || 1 : 0);
  const priceKey = (c: ProjectCard) => (rent ? c.rentMin : c.priceMin) ?? Infinity;
  switch (f.sort) {
    case "price-asc":
      cards.sort((a, b) => priceKey(a) - priceKey(b));
      break;
    case "price-desc":
      cards.sort((a, b) => (rent ? b.rentMax ?? 0 : b.priceMax ?? 0) - (rent ? a.rentMax ?? 0 : a.priceMax ?? 0));
      break;
    case "possession":
      cards.sort((a, b) => (a.possessionDate?.getTime() ?? Infinity) - (b.possessionDate?.getTime() ?? Infinity));
      break;
    case "demand":
      cards.sort((a, b) => demand(b) - demand(a));
      break;
    case "newest":
      cards.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      break;
  }
  return cards;
}

export const getPublicLocations = cache(async () => {
  const locs = await db.location.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { projects: { where: PUBLIC_PROJECT_WHERE } } } },
  });
  return locs;
});

export async function getProjectDetail(slug: string) {
  const p = await db.project.findFirst({
    where: { slug, ...PUBLIC_PROJECT_WHERE },
    select: {
      ...cardSelect,
      description: true,
      addressLine: true,
      launchVerification: true,
      reraNumber: true,
      reraUrl: true,
      officialWebsite: true,
      priceBasis: true,
      taxesAndCharges: true,
      parkingInfo: true,
      parkingSlots: true,
      amenities: true,
      towers: true,
      storeys: true,
      landParcelAcres: true,
      occupancy: true,
      securityDeposit: true,
      leaseStart: true,
      leaseEnd: true,
      leaseVerification: true,
      leaseTenureMonths: true,
      lockInMonths: true,
      escalationPct: true,
      escalationEveryMonths: true,
      maintenanceMonthly: true,
      propertyTaxAnnual: true,
      insuranceAnnual: true,
      tenantDisclosure: true,
      buildingGrade: true,
      gradeVerification: true,
      powerLoadKva: true,
      infrastructureNotes: true,
      permittedUse: true,
      fitOut: true,
      tenantPolicy: true,
      petsAllowed: true,
      updatedAt: true,
      media: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], select: { id: true, kind: true, url: true, caption: true, credit: true } },
      benefits: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, description: true, status: true, confirmedAt: true, validUntil: true } },
      location: { select: { id: true, name: true, slug: true, parentId: true, lat: true, lng: true, parent: { select: { name: true, slug: true } } } },
      developer: { select: { name: true, slug: true, isUnverifiedRealName: true, description: true, website: true } },
      priceHistory: { orderBy: { changedAt: "desc" }, take: 1, select: { changedAt: true } },
    },
  });
  if (!p) return null;
  const groups = await groupsFor(p as unknown as CardRow);
  return { ...toCard(p as unknown as CardRow, groups), detail: p };
}

export async function getPublicGroups(limit = 6) {
  const cards = await getProjectCards({ mode: "all", groups: true });
  return cards
    .flatMap((c) => c.groups.map((g) => ({ group: g, project: c })))
    .filter((x) => x.group.stage !== "PAUSED")
    .slice(0, limit);
}

export const getPublicStats = cache(async () => {
  const [projects, groups, locations, developers, buyers] = await Promise.all([
    db.project.count({ where: PUBLIC_PROJECT_WHERE }),
    db.campaign.count({ where: { isPublic: true, status: { notIn: ["DRAFT", "CLOSED", "PAUSED"] }, project: PUBLIC_PROJECT_WHERE } }),
    db.location.count({ where: { projects: { some: PUBLIC_PROJECT_WHERE } } }),
    db.developer.count({ where: { isPublic: true, projects: { some: PUBLIC_PROJECT_WHERE } } }),
    db.buyer.count({ where: { anonymizedAt: null } }),
  ]);
  // Buyer totals are rounded down publicly.
  return { projects, groups, locations, developers, buyersRounded: buyers >= 50 ? Math.floor(buyers / 25) * 25 : null };
});

export async function getPublicDevelopers() {
  return db.developer.findMany({
    where: { isPublic: true, isUnverifiedRealName: false, projects: { some: PUBLIC_PROJECT_WHERE } },
    select: {
      slug: true,
      name: true,
      description: true,
      established: true,
      verification: true,
      website: true,
      projects: { where: PUBLIC_PROJECT_WHERE, select: { id: true, name: true, slug: true, status: true, location: { select: { name: true } }, media: { where: { isPrimary: true }, take: 1, select: { url: true } } } },
    },
    orderBy: { name: "asc" },
  });
}
