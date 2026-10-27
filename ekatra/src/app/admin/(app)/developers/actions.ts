"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { DeveloperStage } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { slugify } from "@/lib/format";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { putObject, ALLOWED_MIME } from "@/lib/storage";
import { DEVELOPER_STAGES } from "@/lib/labels";

const stageEnum = z.enum(DEVELOPER_STAGES as [DeveloperStage, ...DeveloperStage[]]);
const optUrl = (v: string | null) => (v ? z.string().url("Enter a full URL").parse(v) : null);

export async function saveDeveloperAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await assertPermission("developers:write");
    const name = z.string().trim().min(2, "Enter the company name.").max(120).parse(form.get("name"));
    const data = {
      name,
      website: optUrl(fd.str(form, "website")),
      description: fd.str(form, "description"),
      officeAddress: fd.str(form, "officeAddress"),
      email: fd.str(form, "email"),
      phone: fd.str(form, "phone"),
      established: fd.num(form, "established"),
      stage: stageEnum.parse(fd.str(form, "stage") ?? "RESEARCHING"),
      verification: (fd.str(form, "verification") ?? "AWAITING_VERIFICATION") as "VERIFIED",
      relationshipOwnerId: fd.str(form, "relationshipOwnerId"),
      nextFollowUpAt: fd.date(form, "nextFollowUpAt"),
      notes: fd.str(form, "notes"),
      isPublic: fd.bool(form, "isPublic"),
    };
    const devId = fd.str(form, "developerId");
    if (devId) {
      const before = await db.developer.findUniqueOrThrow({ where: { id: devId } });
      await db.developer.update({ where: { id: devId }, data });
      if (before.stage !== data.stage) await db.activity.create({ data: { type: "STAGE_CHANGE", title: `Relationship: ${before.stage.replace(/_/g, " ").toLowerCase()} → ${data.stage.replace(/_/g, " ").toLowerCase()}`, developerId: devId, actorId: user.id } });
      await audit(user, "developer.update", "Developer", devId);
      revalidatePath(`/admin/developers/${devId}`);
      return { ok: true, message: "Saved." };
    }
    const dupe = await db.developer.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (dupe) return { error: `${dupe.name} already exists.`, data: dupe.id };
    let slug = slugify(name) || "developer";
    for (let i = 2; await db.developer.findUnique({ where: { slug } }); i++) slug = `${slugify(name)}-${i}`;
    const d = await db.developer.create({ data: { ...data, slug } });
    await audit(user, "developer.create", "Developer", d.id);
    id = d.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/developers/${id}`);
}

export async function setDeveloperStageAction(developerId: string, stage: DeveloperStage): Promise<ActionState> {
  try {
    const user = await assertPermission("developers:write");
    stageEnum.parse(stage);
    const before = await db.developer.findUniqueOrThrow({ where: { id: developerId } });
    if (before.stage === stage) return { ok: true };
    await db.developer.update({ where: { id: developerId }, data: { stage } });
    await db.activity.create({ data: { type: "STAGE_CHANGE", title: `Relationship: ${before.stage.replace(/_/g, " ").toLowerCase()} → ${stage.replace(/_/g, " ").toLowerCase()}`, developerId, actorId: user.id } });
    revalidatePath("/admin/developers");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function contactAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertPermission("developers:write");
    const developerId = z.string().cuid().parse(form.get("developerId"));
    if (form.get("op") === "delete") {
      await db.developerContact.delete({ where: { id: z.string().cuid().parse(form.get("contactId")), developerId } });
    } else {
      const email = fd.str(form, "email");
      if (email) z.string().email("Enter a valid email.").parse(email);
      await db.developerContact.create({
        data: { developerId, name: z.string().trim().min(2, "Enter the contact's name.").max(80).parse(form.get("name")), designation: fd.str(form, "designation"), email, phone: fd.str(form, "phone"), isSalesTeam: fd.bool(form, "isSalesTeam"), notes: fd.str(form, "notes") },
      });
    }
    revalidatePath(`/admin/developers/${developerId}`);
    return { ok: true, message: "Contacts updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function developerNoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("developers:write");
    const developerId = z.string().cuid().parse(form.get("developerId"));
    const body = z.string().trim().min(2).max(2000).parse(form.get("body"));
    await db.activity.create({ data: { type: (fd.str(form, "type") ?? "NOTE") as "NOTE", title: fd.str(form, "title") ?? "Note", body, developerId, actorId: user.id } });
    const next = fd.date(form, "nextFollowUpAt");
    if (next) await db.developer.update({ where: { id: developerId }, data: { nextFollowUpAt: next } });
    revalidatePath(`/admin/developers/${developerId}`);
    return { ok: true, message: "Logged." };
  } catch (e) {
    return fail(e);
  }
}

export async function developerDocAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("commercial:write");
    const developerId = z.string().cuid().parse(form.get("developerId"));
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new UserError("Choose a file.");
    if (!ALLOWED_MIME[file.type]) throw new UserError("Upload a PDF, image, DOCX or XLSX.");
    const key = await putObject(Buffer.from(await file.arrayBuffer()), file.type);
    await db.document.create({ data: { title: fd.str(form, "title") ?? file.name, kind: fd.str(form, "kind") ?? "Agreement", storageKey: key, fileName: file.name.slice(0, 120), mimeType: file.type, size: file.size, isPrivate: true, developerId, agreementId: fd.str(form, "agreementId"), uploadedById: user.id } });
    await audit(user, "developer.document_upload", "Developer", developerId);
    revalidatePath(`/admin/developers/${developerId}`);
    return { ok: true, message: "Uploaded privately." };
  } catch (e) {
    return fail(e);
  }
}

export async function negotiationAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await assertPermission("commercial:write");
    const negId = fd.str(form, "negotiationId");
    const data = {
      title: z.string().trim().min(3, "Give the negotiation a title.").max(140).parse(form.get("title")),
      developerId: z.string().cuid().parse(form.get("developerId")),
      projectId: fd.str(form, "projectId"),
      campaignId: fd.str(form, "campaignId"),
      status: z.enum(["PREPARING", "PRESENTED", "AWAITING_RESPONSE", "COUNTER_PROPOSED", "AGREED", "DECLINED", "CLOSED"]).parse(form.get("status") ?? "PREPARING"),
      interestedPresented: fd.num(form, "interestedPresented") ?? 0,
      qualifiedPresented: fd.num(form, "qualifiedPresented") ?? 0,
      preferredConfigs: fd.str(form, "preferredConfigs"),
      aggregateBudget: fd.num(form, "aggregateBudget"),
      proposedBenefits: fd.str(form, "proposedBenefits"),
      developerResponse: fd.str(form, "developerResponse"),
      proposedCommissionRate: fd.num(form, "proposedCommissionRate"),
      commissionBasis: (fd.str(form, "commissionBasis") as "AGREEMENT_VALUE" | null) ?? null,
      paymentTrigger: (fd.str(form, "paymentTrigger") as "BOOKING" | null) ?? null,
      paymentTimeline: fd.str(form, "paymentTimeline"),
      agreementSigned: fd.bool(form, "agreementSigned"),
      lastFollowUpAt: fd.date(form, "lastFollowUpAt"),
      nextAction: fd.str(form, "nextAction"),
      nextActionAt: fd.date(form, "nextActionAt"),
      ownerId: fd.str(form, "ownerId"),
    };
    if (data.proposedCommissionRate !== null && (data.proposedCommissionRate <= 0 || data.proposedCommissionRate > 10)) throw new UserError("Commission rate should be between 0 and 10%.");
    if (negId) {
      const before = await db.negotiation.findUniqueOrThrow({ where: { id: negId } });
      await db.negotiation.update({ where: { id: negId }, data });
      if (data.developerResponse && data.developerResponse !== before.developerResponse) {
        await db.negotiationUpdate.create({ data: { negotiationId: negId, kind: "DEVELOPER_RESPONSE", body: data.developerResponse, authorId: user.id } });
        await notify("developer.responded", { title: `Developer response: ${data.title}`, body: data.developerResponse.slice(0, 200), link: `/admin/negotiations/${negId}` });
      }
      await audit(user, "negotiation.update", "Negotiation", negId);
      revalidatePath(`/admin/negotiations/${negId}`);
      return { ok: true, message: "Saved." };
    }
    const n = await db.negotiation.create({ data });
    await db.developer.update({ where: { id: data.developerId }, data: { stage: "NEGOTIATING" } }).catch(() => undefined);
    await audit(user, "negotiation.create", "Negotiation", n.id);
    id = n.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/negotiations/${id}`);
}

export async function negotiationUpdateAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("commercial:write");
    const negotiationId = z.string().cuid().parse(form.get("negotiationId"));
    const kind = z.enum(["OUTREACH", "MEETING", "PROPOSAL", "DEVELOPER_RESPONSE", "NOTE"]).parse(form.get("kind"));
    const body = z.string().trim().min(3, "Add details.").max(3000).parse(form.get("body"));
    const n = await db.negotiation.findUniqueOrThrow({ where: { id: negotiationId } });
    await db.negotiationUpdate.create({ data: { negotiationId, kind, body, authorId: user.id } });
    await db.negotiation.update({ where: { id: negotiationId }, data: { lastFollowUpAt: new Date(), ...(kind === "DEVELOPER_RESPONSE" ? { developerResponse: body } : {}), ...(fd.date(form, "nextActionAt") ? { nextActionAt: fd.date(form, "nextActionAt"), nextAction: fd.str(form, "nextAction") } : {}) } });
    if (kind === "DEVELOPER_RESPONSE") await notify("developer.responded", { title: `Developer response: ${n.title}`, body: body.slice(0, 200), link: `/admin/negotiations/${negotiationId}` });
    revalidatePath(`/admin/negotiations/${negotiationId}`);
    return { ok: true, message: "Update recorded." };
  } catch (e) {
    return fail(e);
  }
}

export async function agreementAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("commercial:write");
    const developerId = z.string().cuid().parse(form.get("developerId"));
    const basis = z.enum(["AGREEMENT_VALUE", "BASIC_SALE_PRICE", "FIXED_AMOUNT", "OTHER"]).parse(form.get("basis"));
    const rate = fd.num(form, "commissionRate");
    const fixed = fd.num(form, "fixedAmount");
    if (basis === "FIXED_AMOUNT" ? !fixed : !rate) throw new UserError(basis === "FIXED_AMOUNT" ? "Enter the fixed amount." : "Enter the commission rate.");
    if (rate !== null && (rate <= 0 || rate > 10)) throw new UserError("Commission rate should be between 0 and 10%.");
    const status = z.enum(["DRAFT", "UNDER_REVIEW", "SIGNED", "EXPIRED", "TERMINATED"]).parse(form.get("status"));
    const data = {
      title: z.string().trim().min(3).max(140).parse(form.get("title")),
      developerId,
      projectId: fd.str(form, "projectId"),
      negotiationId: fd.str(form, "negotiationId"),
      commissionRate: rate,
      fixedAmount: fixed,
      basis,
      trigger: z.enum(["BOOKING", "AGREEMENT_REGISTRATION", "PAYMENT_MILESTONE", "POSSESSION", "OTHER"]).parse(form.get("trigger")),
      paymentTermsDays: fd.num(form, "paymentTermsDays"),
      status,
      signedAt: status === "SIGNED" ? fd.date(form, "signedAt") ?? new Date() : null,
      validFrom: fd.date(form, "validFrom"),
      validUntil: fd.date(form, "validUntil"),
      notes: fd.str(form, "notes"),
    };
    const agId = fd.str(form, "agreementId");
    if (agId) await db.commercialAgreement.update({ where: { id: agId }, data });
    else await db.commercialAgreement.create({ data });
    if (status === "SIGNED") await db.developer.update({ where: { id: developerId }, data: { stage: "TERMS_AGREED" } });
    await audit(user, agId ? "agreement.update" : "agreement.create", "Developer", developerId, { status, basis, rate });
    revalidatePath(`/admin/developers/${developerId}`);
    return { ok: true, message: "Agreement saved." };
  } catch (e) {
    return fail(e);
  }
}
