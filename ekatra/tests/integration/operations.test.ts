import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { submitInquiry } from "@/lib/services/inquiry";
import { cancelFollowUp, completeFollowUp, createFollowUp, setNextFollowUp } from "@/lib/services/followups";
import { changeBuyerStage } from "@/lib/services/buyers";
import { addBuyerToCampaign, loadCampaignDemand, loadCampaignMembers } from "@/lib/services/campaigns";
import { campaignInsights } from "@/lib/domain/campaign-insights";
import { approvalBlockers } from "@/lib/domain/research";
import { getProjectCards } from "@/lib/queries/public";
import { inquirySchema } from "@/lib/validation";
import { istDay } from "@/lib/time";
import { fixture, inquiry, resetTestDb } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  await resetTestDb();
  f = await fixture();
});
afterAll(() => db.$disconnect());

const buyer = async (o: Record<string, unknown> = {}) => (await submitInquiry(inquirySchema.parse(inquiry(f.project.id, o)))).buyerId;

describe("follow-ups", () => {
  it("a record's next-follow-up date is always its earliest open follow-up", async () => {
    const id = await buyer();
    const d1 = new Date("2026-11-05T05:30:00Z");
    await setNextFollowUp({ buyerId: id }, d1, { title: "Call back" });
    expect((await db.buyer.findUniqueOrThrow({ where: { id } })).nextFollowUpAt).toEqual(d1);
    // Moving the date moves the same follow-up instead of creating another.
    const d2 = new Date("2026-11-07T05:30:00Z");
    await setNextFollowUp({ buyerId: id }, d2, { title: "Call back" });
    expect(await db.task.count({ where: { buyerId: id, status: "OPEN" } })).toBe(1);
    // A manual, earlier follow-up wins.
    const early = await createFollowUp({ buyerId: id, title: "Send brochure", dueAt: new Date("2026-11-01T05:30:00Z") });
    expect((await db.buyer.findUniqueOrThrow({ where: { id } })).nextFollowUpAt).toEqual(early.dueAt);
    await cancelFollowUp(early.id, "Sent by email instead");
    expect((await db.buyer.findUniqueOrThrow({ where: { id } })).nextFollowUpAt).toEqual(d2);
    // Clearing the field cancels the automatic follow-up.
    await setNextFollowUp({ buyerId: id }, null, { title: "Call back" });
    expect((await db.buyer.findUniqueOrThrow({ where: { id } })).nextFollowUpAt).toBeNull();
    expect(await db.task.count({ where: { buyerId: id, status: "CANCELLED" } })).toBe(2);
  });
  it("done-with-next closes one and opens the next in one step; can't close twice", async () => {
    const id = await buyer();
    const t = await createFollowUp({ buyerId: id, title: "Call", dueAt: new Date("2026-10-20T05:30:00Z"), assigneeId: f.user.id });
    const next = new Date("2026-11-03T05:30:00Z");
    await completeFollowUp(t.id, f.user.id, "Wants a site visit", { dueAt: next, title: "Confirm visit" });
    const all = await db.task.findMany({ where: { buyerId: id }, orderBy: { createdAt: "asc" } });
    expect(all.map((x) => x.status)).toEqual(["DONE", "OPEN"]);
    expect(all[1]!.assigneeId).toBe(f.user.id);
    expect((await db.buyer.findUniqueOrThrow({ where: { id } })).nextFollowUpAt).toEqual(next);
    await expect(completeFollowUp(t.id, f.user.id, null)).rejects.toThrow(/already closed/);
  });
  it("losing a buyer cancels their open follow-ups", async () => {
    const id = await buyer();
    await createFollowUp({ buyerId: id, title: "Call", dueAt: new Date("2026-11-03T05:30:00Z") });
    await changeBuyerStage(id, "LOST", { id: f.user.id, name: f.user.name }, "Bought elsewhere");
    expect(await db.task.count({ where: { buyerId: id, status: "OPEN" } })).toBe(0);
    expect((await db.buyer.findUniqueOrThrow({ where: { id } })).nextFollowUpAt).toBeNull();
  });
  it("IST day boundaries", () => {
    const { start, end } = istDay(new Date("2026-10-27T20:00:00Z")); // 01:30 IST on 28 Oct
    expect(start.toISOString()).toBe("2026-10-27T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-28T18:30:00.000Z");
  });
});

describe("locality campaigns", () => {
  it("gather unique buyers without inventing project interest, and explain matches", async () => {
    const a = await buyer({ phone: "98111 00001", email: "a@x.in" });
    const b = await buyer({ phone: "98111 00002", email: "b@x.in", budgetMin: 3e7, budgetMax: 4e7 });
    await db.buyerLocationPreference.createMany({ data: [{ buyerId: a, locationId: f.loc.id }, { buyerId: b, locationId: f.loc.id }], skipDuplicates: true });
    const c = await db.campaign.create({ data: { slug: "bw-2bhk", name: "Borivali West | 2 BHK | ₹1.5–2 Cr", scope: "LOCALITY", locationIds: [f.loc.id], budgetMin: 1.5e7, budgetMax: 2e7, focusConfigs: [2], targetBuyers: 5, countingTiers: ["VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"], milestonesNotified: [], isPublic: false } });
    const before = await db.projectInterest.count();
    expect((await addBuyerToCampaign(c.id, a, "Test")).added).toBe(true);
    expect((await addBuyerToCampaign(c.id, a, "Test")).added).toBe(false);
    expect(await db.projectInterest.count()).toBe(before);
    const d = await loadCampaignDemand(c.id);
    expect(d.criteria.localities).toEqual(["Borivali West"]);
    expect(d.members).toHaveLength(1);
    // b's budget is outside the band → not suggested; nobody is auto-added.
    expect(d.candidates.map((x) => x.buyerId)).not.toContain(b);
    const day = istDay();
    const ins = campaignInsights(d.members, d.criteria, { dayStart: day.start, dayEnd: day.end });
    expect(ins.interested).toBe(1);
    expect(ins.casual).toBe(1); // a website enquiry is not a commitment
    expect(ins.counting).toBe(0);
    expect((await loadCampaignMembers(c.id))[0]!.tier).toBe("EXPRESSION_OF_INTEREST");
  });
});

describe("publication requires approval", () => {
  it("a published, compliance-reviewed project stays hidden until a manager approves it", async () => {
    await db.project.update({ where: { id: f.project.id }, data: { approvalStatus: "PENDING" } });
    expect(await getProjectCards({ mode: "all" })).toHaveLength(0);
    await db.project.update({ where: { id: f.project.id }, data: { approvalStatus: "APPROVED" } });
    expect(await getProjectCards({ mode: "all" })).toHaveLength(1);
  });
  it("approval blockers list every unsupported fact", async () => {
    const p = await db.project.update({ where: { id: f.project.id }, data: { reraNumber: "P51800000000", researchStatus: "VERIFIED", lifecycleStages: ["MAHARERA_REGISTERED"] }, include: { configurations: true, sources: true } });
    const research = { ...p, developerName: "Test Developer" };
    const blockers = approvalBlockers(research, p.sources);
    expect(blockers.join(" ")).toMatch(/MahaRERA registration is recorded without a source/);
    expect(blockers.join(" ")).toMatch(/Add the MahaRERA record URL/);
    const sources = [
      { factKey: "rera", sourceType: "MAHARERA" as const, verdict: "CONFIRMED_OFFICIAL" as const, url: "https://maharera.maharashtra.gov.in/x", claim: "Registered P51800000000, Test Developer, Borivali West, 2 BHK 700 sq ft, completion 2029", checkedAt: new Date() },
      { factKey: "completion", sourceType: "MAHARERA" as const, verdict: "CONFIRMED_OFFICIAL" as const, url: null, claim: "Completion 30 Jun 2029", checkedAt: new Date() },
      { factKey: "price", sourceType: "OFFICIAL_DEVELOPER" as const, verdict: "CONFIRMED_OFFICIAL" as const, url: null, claim: "Price sheet", checkedAt: new Date() },
    ];
    expect(approvalBlockers({ ...research, reraUrl: "https://maharera.maharashtra.gov.in/x", possessionDate: null }, sources)).toEqual([]);
  });
});
