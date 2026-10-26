import { db } from "@/lib/db";

/** Clears every table — only ever against a database whose name contains "_test". */
export async function resetTestDb() {
  const [{ current_database }] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  if (!current_database.endsWith("_test")) throw new Error(`Refusing to clear ${current_database}`);
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function fixture() {
  const user = await db.user.create({ data: { name: "Test Admin", email: "t@test.local", passwordHash: "x", role: "SUPER_ADMIN" } });
  const loc = await db.location.create({ data: { slug: "bw", name: "Borivali West", kind: "NEIGHBOURHOOD", highlights: [], lat: 19.23, lng: 72.85 } });
  const dev = await db.developer.create({ data: { slug: "dev", name: "Test Developer" } });
  const project = await db.project.create({
    data: { slug: "proj", name: "Test Project", developerId: dev.id, locationId: loc.id, amenities: [], sourceLinks: [], lifecycleStages: [], buyerSegments: [], isPublished: true, complianceReviewed: true, approvalStatus: "APPROVED", status: "UNDER_CONSTRUCTION", possessionDate: new Date("2029-06-30"),
      configurations: { create: [{ label: "2 BHK", bhk: 2, carpetAreaMin: 700, carpetAreaMax: 760, priceMin: 1.85e7, priceMax: 2.05e7 }] } },
    include: { configurations: true },
  });
  const hidden = await db.project.create({ data: { slug: "hidden", name: "Unpublished", developerId: dev.id, locationId: loc.id, amenities: [], sourceLinks: [], lifecycleStages: [], buyerSegments: [], isPublished: true, complianceReviewed: false } });
  const campaign = await db.campaign.create({ data: { slug: "c", name: "Group", projectId: project.id, targetBuyers: 2, countingTiers: ["VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"], focusConfigs: [], milestonesNotified: [], visibility: "EXACT", isPublic: true } });
  return { user, loc, dev, project, hidden, campaign };
}

export const inquiry = (projectId: string | null, o: Record<string, unknown> = {}) => ({
  projectId, campaignId: null, locationIds: [], configurations: [2], budgetMin: 1.8e7, budgetMax: 2.1e7, timeline: "IMMEDIATE" as const, fundingReadiness: "NOT_SHARED" as const, requirements: null,
  fullName: "Asha Mehta", phone: "98200 12345", email: "asha@example.com", consentContact: true as const, consentShare: false, consentUpdates: true, consentWhatsApp: false, wantsVisit: false, source: "Test", website: "", requirement: null, ...o,
});
