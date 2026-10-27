import type { BuyerRequirement, Intent, Prisma } from "@prisma/client";
import { db } from "../db";
import { PUBLIC_PROJECT_WHERE } from "../domain/compliance";
import { isRentalRequirement, rankMatches, type MatchProperty, type MatchRequirement } from "../domain/matching";
import { classifyPriority, effectivePriority } from "../domain/priority";

export const matchPropertySelect = {
  id: true,
  segment: true,
  dealType: true,
  propertyType: true,
  status: true,
  locationId: true,
  possessionDate: true,
  availableFrom: true,
  parkingSlots: true,
  monthlyRent: true,
  location: { select: { parentId: true } },
  configurations: { select: { bhk: true, carpetAreaMin: true, carpetAreaMax: true, priceMin: true, priceMax: true, rentMin: true, rentMax: true } },
} satisfies Prisma.ProjectSelect;

type SelectedProperty = Prisma.ProjectGetPayload<{ select: typeof matchPropertySelect }>;

export function toMatchProperty(p: SelectedProperty): MatchProperty {
  return { ...p, locationParentId: p.location.parentId };
}

export function toMatchRequirement(r: Pick<BuyerRequirement, keyof MatchRequirement>): MatchRequirement {
  return {
    intents: r.intents,
    stagePreferences: r.stagePreferences,
    propertyTypes: r.propertyTypes,
    primaryLocationId: r.primaryLocationId,
    secondaryLocationId: r.secondaryLocationId,
    acceptableLocationIds: r.acceptableLocationIds,
    budgetMin: r.budgetMin,
    budgetMax: r.budgetMax,
    budgetStretch: r.budgetStretch,
    rentMin: r.rentMin,
    rentMax: r.rentMax,
    moveInBy: r.moveInBy,
    possessionWaitMonths: r.possessionWaitMonths,
    configurations: r.configurations,
    carpetMin: r.carpetMin,
    parkingNeeded: r.parkingNeeded,
    minGrossYieldPct: r.minGrossYieldPct,
    mustHaves: r.mustHaves,
  };
}

export async function liveMatchProperties() {
  const rows = await db.project.findMany({ where: PUBLIC_PROJECT_WHERE, select: matchPropertySelect });
  return rows.map(toMatchProperty);
}

/** Recomputes a buyer's follow-up priority from their active requirements. Overrides are respected. */
export async function recomputeBuyerPriority(buyerId: string, properties?: MatchProperty[]) {
  const buyer = await db.buyer.findUnique({
    where: { id: buyerId },
    include: { requirements: { where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" } }, locationPreferences: true },
  });
  if (!buyer) return null;
  const props = properties ?? (await liveMatchProperties());
  let best: ReturnType<typeof classifyPriority> = { priority: "D", reasons: ["No requirement captured yet"] };
  const rank = { A: 0, B: 1, C: 2, D: 3 } as const;
  for (const r of buyer.requirements) {
    const req = toMatchRequirement(r);
    const rental = isRentalRequirement(req);
    const matches = rankMatches(req, props).filter((m) => m.eligible && !m.factors.some((f) => f.key === "budget" && f.status === "miss"));
    const result = classifyPriority({
      commitWithinDays: r.commitWithinDays,
      bookingWithinDays: rental ? 0 : r.bookingWithinDays,
      situation: r.situation,
      possessionWaitMonths: r.possessionWaitMonths,
      hasLocations: !!(r.primaryLocationId || r.acceptableLocationIds.length || buyer.locationPreferences.length),
      hasBudget: rental ? !!(r.rentMax || r.rentMin) : !!(r.budgetMax || r.budgetMin),
      hasConfigOrType: r.configurations.length > 0 || r.propertyTypes.length > 0 || r.intents.some((i) => i.startsWith("COM") || i === "PRE_LEASED" || i === "RENT_COMMERCIAL"),
      hasCompatibleProperty: matches.length > 0,
      wantsUpcoming: r.stagePreferences.some((s) => ["ANNOUNCED", "PRE_LAUNCH", "NEW_LAUNCH"].includes(s)),
    });
    if (rank[result.priority] < rank[best.priority]) best = result;
  }
  await db.buyer.update({
    where: { id: buyerId },
    data: { priorityComputed: best.priority, priorityReasons: best.reasons, priority: effectivePriority(best.priority, buyer.priorityOverride) },
  });
  return best;
}

export function intentsForProperty(p: { segment: string; dealType: string; propertyType: string }): Intent[] {
  if (p.dealType === "RENT") return [p.segment === "COMMERCIAL" ? "RENT_COMMERCIAL" : "RENT_RESIDENTIAL"];
  if (p.dealType === "PRE_LEASED") return ["PRE_LEASED"];
  if (p.propertyType === "PLOT") return ["PLOT"];
  if (p.segment === "COMMERCIAL") return [["RETAIL_SHOP", "SHOWROOM"].includes(p.propertyType) ? "COM_RETAIL" : "COM_OFFICE"];
  return ["RES_SELF_USE"];
}
