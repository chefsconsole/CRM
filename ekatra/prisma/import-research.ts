/* eslint-disable no-console */
// Imports the research dataset (prisma/research-data.ts). Idempotent: existing projects are left
// untouched (so manual edits are never overwritten); only missing records and sources are added.

import { PrismaClient } from "@prisma/client";
import { CHECKED_AT, RESEARCH_DEVELOPERS, RESEARCH_PROJECTS } from "./research-data";

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
    if (exists) continue;
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
