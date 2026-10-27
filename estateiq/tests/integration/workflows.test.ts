import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { submitInquiry, InquiryError } from "@/lib/services/inquiry";
import { addBuyerToCampaign, campaignMetrics } from "@/lib/services/campaigns";
import { setInterestTier } from "@/lib/services/buyers";
import { anonymizeBuyer } from "@/lib/services/buyers";
import { saveConfiguration } from "@/lib/services/projects";
import { createCommissionForTransaction, recordCommissionPayment } from "@/lib/services/commissions";
import { scheduleVisit } from "@/lib/services/visits";
import { getProjectCards, getProjectDetail } from "@/lib/queries/public";
import { inquirySchema } from "@/lib/validation";
import { fixture, inquiry, resetTestDb } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  await resetTestDb();
  f = await fixture();
});
afterAll(() => db.$disconnect());

describe("buyer inquiry → CRM", () => {
  it("saves the buyer, interest, consents and joins the open group", async () => {
    const r = await submitInquiry(inquirySchema.parse(inquiry(f.project.id)));
    expect(r.isNew).toBe(true);
    expect(r.campaignJoined?.id).toBe(f.campaign.id);
    const b = await db.buyer.findUniqueOrThrow({ where: { id: r.buyerId }, include: { interests: true, consents: true, campaignMemberships: true, requirements: true } });
    expect(b.phoneNormalized).toBe("+919820012345");
    expect(b.interests).toHaveLength(1);
    expect(b.interests[0]!.tier).toBe("EXPRESSION_OF_INTEREST");
    expect(b.consents.find((c) => c.purpose === "CONTACT_ABOUT_INQUIRY")?.granted).toBe(true);
    expect(b.consents.find((c) => c.purpose === "SHARE_WITH_DEVELOPER")?.granted).toBe(false);
    expect(b.requirements).toHaveLength(1);
    expect(await db.notification.count({ where: { event: "buyer.registered" } })).toBe(1);
  });
  it("detects duplicates by normalised phone and never creates a second buyer", async () => {
    await submitInquiry(inquirySchema.parse(inquiry(f.project.id)));
    const again = await submitInquiry(inquirySchema.parse(inquiry(f.project.id, { phone: "+91 98200-12345", email: null, fullName: "Asha M" })));
    expect(again.isNew).toBe(false);
    expect(await db.buyer.count()).toBe(1);
    expect(await db.projectInterest.count()).toBe(1);
    expect(await db.campaignMember.count()).toBe(1);
  });
  it("refuses projects that are not public (compliance gate)", async () => {
    await expect(submitInquiry(inquirySchema.parse(inquiry(f.hidden.id)))).rejects.toBeInstanceOf(InquiryError);
  });
});

describe("Demand Studio", () => {
  it("counts unique buyers once and only counting tiers toward the target, raising milestones once", async () => {
    const a = await submitInquiry(inquirySchema.parse(inquiry(f.project.id)));
    const b = await submitInquiry(inquirySchema.parse(inquiry(f.project.id, { phone: "98111 22222", email: "b@example.com" })));
    let m = await campaignMetrics(f.campaign.id);
    expect(m.metrics.registered).toBe(2);
    expect(m.metrics.counting).toBe(0); // expressions of interest don't count
    expect((await addBuyerToCampaign(f.campaign.id, a.buyerId, "Test")).added).toBe(false); // already a member
    const actor = { id: f.user.id, name: f.user.name };
    for (const id of [a.buyerId, b.buyerId]) {
      const i = await db.projectInterest.findFirstOrThrow({ where: { buyerId: id } });
      await setInterestTier(i.id, "VERIFIED_LEAD", actor);
    }
    m = await campaignMetrics(f.campaign.id);
    expect(m.metrics.counting).toBe(2);
    expect(m.metrics.progress).toBe(1);
    const c = await db.campaign.findUniqueOrThrow({ where: { id: f.campaign.id } });
    expect(c.milestonesNotified.sort()).toEqual([100, 50, 75].sort());
    expect(c.status).toBe("READY_FOR_DEVELOPER");
    const before = await db.notification.count({ where: { event: "campaign.milestone" } });
    await setInterestTier((await db.projectInterest.findFirstOrThrow({ where: { buyerId: a.buyerId } })).id, "COMMITTED", actor);
    expect(await db.notification.count({ where: { event: "campaign.milestone" } })).toBe(before);
  });
});

describe("price management", () => {
  it("keeps every price change in history with its source", async () => {
    const cfg = f.project.configurations[0]!;
    const base = { label: cfg.label, bhk: 2, carpetAreaMin: 700, carpetAreaMax: 760, priceVerification: "INDICATIVE" as const, availabilityNote: null };
    await expect(saveConfiguration(f.project.id, cfg.id, { ...base, priceMin: 1.9e7, priceMax: 2.1e7 }, f.user.id)).rejects.toThrow(/source/);
    const r = await saveConfiguration(f.project.id, cfg.id, { ...base, priceMin: 1.9e7, priceMax: 2.1e7, sourceName: "Price sheet 20 Oct" }, f.user.id);
    expect(r.priceChanged).toBe(true);
    const h = await db.priceHistory.findMany({ where: { configurationId: cfg.id } });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ oldMin: 1.85e7, newMin: 1.9e7, sourceName: "Price sheet 20 Oct" });
    const same = await saveConfiguration(f.project.id, cfg.id, { ...base, priceMin: 1.9e7, priceMax: 2.1e7 }, f.user.id);
    expect(same.priceChanged).toBe(false);
  });
});

describe("commissions", () => {
  it("calculates from the agreement, prevents double counting and overpayment", async () => {
    const r = await submitInquiry(inquirySchema.parse(inquiry(f.project.id)));
    const ag = await db.commercialAgreement.create({ data: { title: "A", developerId: f.dev.id, commissionRate: 2, basis: "AGREEMENT_VALUE", trigger: "AGREEMENT_REGISTRATION", status: "SIGNED" } });
    const t = await db.transaction.create({ data: { buyerId: r.buyerId, projectId: f.project.id, agreementId: ag.id, unitLabel: "T1-1201", transactionValue: 2e7 } });
    const c = await createCommissionForTransaction(t.id);
    expect(c.amountEarned).toBe(4e5);
    expect(c.status).toBe("ELIGIBLE");
    await expect(createCommissionForTransaction(t.id)).rejects.toThrow(/already exists/);
    await expect(db.transaction.create({ data: { buyerId: r.buyerId, projectId: f.project.id, unitLabel: "T1-1201", transactionValue: 2e7 } })).rejects.toThrow();
    await recordCommissionPayment(c.id, 1.5e5, new Date());
    await expect(recordCommissionPayment(c.id, 3e5, new Date())).rejects.toThrow(/exceed/);
    const done = await recordCommissionPayment(c.id, 2.5e5, new Date());
    expect(done.status).toBe("PAID");
  });
  it("cancelled transactions earn nothing", async () => {
    const r = await submitInquiry(inquirySchema.parse(inquiry(f.project.id)));
    const t = await db.transaction.create({ data: { buyerId: r.buyerId, projectId: f.project.id, unitLabel: "X", transactionValue: 2e7, status: "CANCELLED" } });
    await expect(createCommissionForTransaction(t.id, { rate: 2 })).rejects.toThrow(/Cancelled/);
  });
});

describe("site visits", () => {
  it("blocks clashing visits for the same representative unless forced", async () => {
    const a = await submitInquiry(inquirySchema.parse(inquiry(f.project.id)));
    const b = await submitInquiry(inquirySchema.parse(inquiry(f.project.id, { phone: "98111 22222", email: "b@example.com" })));
    const at = new Date(Date.now() + 3 * 864e5);
    const ok = await scheduleVisit({ buyerId: a.buyerId, projectId: f.project.id, scheduledAt: at, durationMins: 60, assignedToId: f.user.id, status: "SCHEDULED" }, f.user.id);
    expect(ok.ok).toBe(true);
    const clash = await scheduleVisit({ buyerId: b.buyerId, projectId: f.project.id, scheduledAt: new Date(at.getTime() + 30 * 60000), durationMins: 60, assignedToId: f.user.id, status: "SCHEDULED" }, f.user.id);
    expect(clash.ok).toBe(false);
    const forced = await scheduleVisit({ buyerId: b.buyerId, projectId: f.project.id, scheduledAt: new Date(at.getTime() + 30 * 60000), durationMins: 60, assignedToId: f.user.id, status: "SCHEDULED" }, f.user.id, true);
    expect(forced.ok).toBe(true);
    expect((await db.buyer.findUniqueOrThrow({ where: { id: a.buyerId } })).stage).toBe("VISIT_SCHEDULED");
  });
});

describe("privacy", () => {
  it("public read models never contain buyer identities, contacts or budgets", async () => {
    await submitInquiry(inquirySchema.parse(inquiry(f.project.id)));
    const cards = await getProjectCards({ mode: "all" });
    const detail = await getProjectDetail("proj");
    const json = JSON.stringify({ cards, detail });
    for (const leak of ["asha", "98200", "9820012345", "Asha Mehta", "18000000", "budgetMin", "phone", "email\":\"asha", "internalNotes", "commission"]) expect(json.toLowerCase()).not.toContain(leak.toLowerCase());
    expect(cards.map((c) => c.slug)).toEqual(["proj"]); // unreviewed project hidden
    expect(await getProjectDetail("hidden")).toBeNull();
  });
  it("erasure removes personal data but keeps anonymous counts", async () => {
    const r = await submitInquiry(inquirySchema.parse(inquiry(f.project.id)));
    await anonymizeBuyer(r.buyerId, { id: f.user.id, name: f.user.name });
    const b = await db.buyer.findUniqueOrThrow({ where: { id: r.buyerId }, include: { interests: true } });
    expect(b.phone).toBeNull();
    expect(b.emailNormalized).toBeNull();
    expect(b.fullName).toMatch(/^Erased buyer/);
    expect(b.interests[0]!.status).toBe("WITHDRAWN");
    expect(await db.auditLog.count({ where: { action: "buyer.erase" } })).toBe(1);
  });
});
