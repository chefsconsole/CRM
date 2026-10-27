/* eslint-disable no-console */
// Imports the research dataset (prisma/research-data.ts). Idempotent: existing projects are left
// untouched (so manual edits are never overwritten); only missing records and sources are added.

import { PrismaClient } from "@prisma/client";
import { CHECKED_AT, RESEARCH_DEVELOPERS, RESEARCH_PROJECTS } from "./research-data";

/** Recorded on every imported record: the research could not reach the primary sources. */
export const RESEARCH_ACCESS_LIMITATION =
  "Researched on 26 Oct 2026 using web search only. Developer websites and the MahaRERA portal (maharera.maharashtra.gov.in) were blocked by the research environment's network policy, so no fact here was checked against the primary record.";

/** The checks every imported record still needs before it can be verified. */
export function standardChecks(p: { reraNumber?: string; reraStatusText: string; conflict?: string; officialUrl?: string }): string[] {
  return [
    p.reraNumber ? `Look up ${p.reraNumber} on MahaRERA and record the record URL` : "Find the MahaRERA registration (if any) on maharera.maharashtra.gov.in and record the URL",
    "Confirm the promoter's legal name and the registered project name",
    "Confirm configurations and RERA carpet areas from MahaRERA or the developer",
    "Confirm the declared completion date on MahaRERA",
    p.officialUrl ? "Confirm the official developer page is current" : "Find the developer's official project page",
    "Confirm launch / booking status and inventory directly with the developer's sales team",
    ...(p.conflict ? [`Resolve conflict: ${p.conflict}`] : []),
  ];
}

export async function importResearch(db: PrismaClient) {
  let created = 0;
  const devIds: Record<string, string> = {};
  for (const d of RESEARCH_DEVELOPERS) {
    const dev = await db.developer.upsert({
      where: { slug: d.slug },
      update: {},
      create: { slug: d.slug, name: d.name, website: d.website, notes: d.legalNote, stage: "RESEARCHING", verification: "AWAITING_VERIFICATION", isPublic: false, isDemo: false },
    });
    devIds[d.slug] = dev.id;
  }
  for (const p of RESEARCH_PROJECTS) {
    const exists = await db.project.findUnique({ where: { slug: p.slug } });
    if (exists) {
      // Back-fill research bookkeeping on older imports without touching anything a person edited.
      if (!exists.isDemo && !exists.accessLimitations && !exists.outstandingChecks.length && exists.researchStatus === "NEEDS_REVIEW") {
        await db.project.update({ where: { id: exists.id }, data: { accessLimitations: RESEARCH_ACCESS_LIMITATION, outstandingChecks: standardChecks(p) } });
      }
      continue;
    }
    const loc = await db.location.findUnique({ where: { slug: p.location } });
    if (!loc) throw new Error(`Unknown location ${p.location} for ${p.slug}`);
    await db.project.create({
      data: {
        slug: p.slug,
        name: p.name,
        marketingName: p.marketingName ?? null,
        developerId: devIds[p.developer]!,
        locationId: loc.id,
        market: p.market,
        addressLine: p.addressLine ?? null,
        description: p.description,
        segment: p.segment ?? "RESIDENTIAL",
        propertyType: p.segment === "COMMERCIAL" ? "OFFICE" : "APARTMENT",
        category: p.segment === "COMMERCIAL" ? "MIXED_USE" : "RESIDENTIAL",
        status: p.status,
        lifecycleStages: p.lifecycle,
        tier: p.tier,
        tierReason: p.tierReason,
        researchStatus: "NEEDS_REVIEW",
        approvalStatus: "PENDING",
        reraNumber: p.reraNumber ?? null,
        reraUrl: p.reraNumber ? "https://maharera.maharashtra.gov.in/" : null,
        reraVerification: p.reraNumber ? "INDICATIVE" : "AWAITING_VERIFICATION",
        reraStatusText: p.reraStatusText,
        officialWebsite: p.officialUrl ?? null,
        launchVerification: "UNAVAILABLE",
        possessionVerification: "AWAITING_VERIFICATION",
        towers: p.towers ?? null,
        storeys: p.storeys ?? null,
        landParcelAcres: p.acres ?? null,
        amenities: [],
        budgetBandNote: p.budgetBandNote ?? null,
        buyerSegments: p.buyerSegments,
        dueDiligence: p.dueDiligence,
        accessLimitations: RESEARCH_ACCESS_LIMITATION,
        outstandingChecks: standardChecks(p),
        conflictFlag: !!p.conflict || p.sources.some((s) => s.verdict === "CONFLICT"),
        conflictNotes: p.conflict ?? null,
        dataVerification: "AWAITING_VERIFICATION",
        lastVerifiedAt: null,
        nextVerificationAt: new Date(CHECKED_AT.getTime() + 7 * 864e5),
        lat: loc.lat,
        lng: loc.lng,
        coordinatePrecision: "APPROXIMATE",
        sourceLinks: [...new Set(p.sources.map((s) => s.url))],
        internalNotes: "Imported from initial web research (26 Oct 2026). Not verified against official sources — see research audit trail.",
        isPublished: false,
        complianceReviewed: false,
        complianceNotes: "Pending: official source and MahaRERA verification, owner approval.",
        isDemo: false,
        configurations: { create: p.configs.map((c, i) => ({ label: c.label, bhk: c.bhk, priceVerification: "UNAVAILABLE", sortOrder: i })) },
        sources: {
          create: p.sources.map((s) => ({ factKey: s.factKey, claim: s.claim, url: s.url, sourceType: s.sourceType, verdict: s.verdict, notes: s.notes ?? null, checkedAt: CHECKED_AT, checkedBy: "Initial research (web search)" })),
        },
      },
    });
    created++;
  }
  return created;
}

if (require.main === module) {
  const db = new PrismaClient();
  importResearch(db)
    .then((n) => console.log(`Imported ${n} research project(s).`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}

