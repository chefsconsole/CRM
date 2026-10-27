"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { inventoryRowSchema, parseInventoryCsv, planInventoryImport, type InventoryRow, type PlannedRow } from "@/lib/inventory-csv";
import { compareInventory, comparisonFingerprint, inventoryGaps } from "@/lib/domain/inventory";
import { setNextFollowUp } from "@/lib/services/followups";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { putObject, ALLOWED_MIME } from "@/lib/storage";

function rowFromForm(form: FormData) {
  const g = (k: string) => (form.get(k) as string | null) ?? "";
  return {
    reference: g("reference"), projectName: g("projectName"), developerName: g("developerName"), microMarket: g("microMarket"), unitNumber: g("unitNumber"), configuration: g("configuration"),
    bhk: g("bhk"), carpetArea: g("carpetArea"), floor: g("floor"), facing: g("facing"), parking: g("parking"), furnishing: g("furnishing"), possessionDetails: g("possessionDetails"),
    askingPrice: g("askingPrice"), askingIncludes: g("askingIncludes"), askingExcludes: g("askingExcludes"), askingExtraCosts: g("askingExtraCosts"),
    builderQuote: g("builderQuote"), builderQuoteDate: g("builderQuoteDate"), builderQuoteSource: g("builderQuoteSource"), builderQuoteEvidence: g("builderQuoteEvidence"), builderQuoteConfig: g("builderQuoteConfig"), builderQuoteCarpet: g("builderQuoteCarpet"),
    builderQuoteFloor: g("builderQuoteFloor"), builderQuoteIncludes: g("builderQuoteIncludes"), builderQuoteExcludes: g("builderQuoteExcludes"), builderExtraCosts: g("builderExtraCosts"),
    availability: g("availability"), ownerSource: g("ownerSource"), contactName: g("contactName"), contactPhone: g("contactPhone"), contactEmail: g("contactEmail"), commercialTerms: g("commercialTerms"),
    lastVerifiedAt: g("lastVerifiedAt"), confidentiality: g("confidentiality"), nextFollowUpAt: g("nextFollowUpAt"), notes: g("notes"),
  };
}

export async function saveUnitAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await assertPermission("projects:write");
    const row = inventoryRowSchema.parse(rowFromForm(form));
    const unitId = fd.str(form, "unitId");
    const projectId = fd.str(form, "projectId");
    const dupe = await db.inventoryUnit.findFirst({ where: { reference: { equals: row.reference, mode: "insensitive" } } });
    if (dupe && dupe.id !== unitId) throw new UserError(`Reference ${row.reference} is already used.`);
    if (row.unitNumber) {
      // "A-1201", "A 1201" and "a1201" are the same flat.
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
      const siblings = await db.inventoryUnit.findMany({ where: { projectName: { equals: row.projectName, mode: "insensitive" }, unitNumber: { not: null }, NOT: unitId ? { id: unitId } : undefined }, select: { reference: true, unitNumber: true } });
      const same = siblings.find((x) => norm(x.unitNumber!) === norm(row.unitNumber!));
      if (same) throw new UserError(`Unit ${row.unitNumber} in ${row.projectName} already exists as ${same.reference}.`);
    }
    const { nextFollowUpAt, ...fields } = row;
    const prev = unitId ? await db.inventoryUnit.findUnique({ where: { id: unitId } }) : null;
    const data: Prisma.InventoryUnitUncheckedUpdateInput & typeof fields = { ...fields, projectId: projectId || null };
    // Any change to the numbers or terms behind a comparison sends it back for review.
    if (prev && comparisonFingerprint(prev) !== comparisonFingerprint({ ...prev, ...fields })) Object.assign(data, { comparisonReview: "UNREVIEWED", comparisonReviewedBy: null, comparisonReviewedAt: null });
    // Roles without commercial access never see owner contacts or terms — keep the stored values.
    if (!can(user.role, "commercial:read")) {
      Object.assign(data, { ownerSource: prev?.ownerSource ?? null, contactName: prev?.contactName ?? null, contactPhone: prev?.contactPhone ?? null, contactEmail: prev?.contactEmail ?? null, commercialTerms: prev?.commercialTerms ?? null });
    }
    const u = unitId ? await db.inventoryUnit.update({ where: { id: unitId }, data }) : await db.inventoryUnit.create({ data: { ...fields, projectId: projectId || null, createdById: user.id } });
    await setNextFollowUp({ inventoryUnitId: u.id }, nextFollowUpAt, { title: `Re-check availability and price — ${u.reference}`, assigneeId: user.id });
    await audit(user, unitId ? "inventory.update" : "inventory.create", "InventoryUnit", u.id);
    id = u.id;
    if (unitId) {
      revalidatePath(`/admin/inventory/${u.id}`);
      return { ok: true, message: "Saved." };
    }
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/inventory/${id}`);
}

export async function approveUnitAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    if (!["SUPER_ADMIN", "OPERATIONS_MANAGER"].includes(user.role)) throw new UserError("Only managers can approve inventory.");
    const id = z.string().cuid().parse(form.get("unitId"));
    const approval = z.enum(["PENDING", "APPROVED", "REJECTED"]).parse(form.get("approvalStatus"));
    const isPublic = fd.bool(form, "isPublic");
    const u = await db.inventoryUnit.findUniqueOrThrow({ where: { id } });
    const blockers = inventoryGaps(u).filter((g) => g.severity === "blocker");
    if (approval === "APPROVED" && blockers.length) throw new UserError(`Complete these first: ${blockers.map((g) => g.label.toLowerCase()).join("; ")}.`);
    if (isPublic) {
      if (approval !== "APPROVED") throw new UserError("Approve the unit before making it public.");
      if (u.confidentiality !== "PUBLIC_WHEN_APPROVED") throw new UserError("Set confidentiality to 'Public once approved' first.");
      if (u.availability !== "AVAILABLE") throw new UserError("Only units confirmed as available can be shown publicly.");
      if (!u.lastVerifiedAt || Date.now() - u.lastVerifiedAt.getTime() > 30 * 864e5) throw new UserError("Re-verify availability (within 30 days) before publishing.");
    }
    await db.inventoryUnit.update({ where: { id }, data: { approvalStatus: approval, isPublic } });
    await audit(user, "inventory.approval", "InventoryUnit", id, { approval, isPublic });
    revalidatePath(`/admin/inventory/${id}`);
    return { ok: true, message: isPublic ? "Approved and visible on the public site (owner details stay private)." : "Saved." };
  } catch (e) {
    return fail(e);
  }
}

const MANAGERS = ["SUPER_ADMIN", "OPERATIONS_MANAGER"];

export async function addUnitFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const id = z.string().cuid().parse(form.get("unitId"));
    const kind = z.enum(["PHOTO", "QUOTE_EVIDENCE", "DOCUMENT"]).parse(form.get("kind") ?? "DOCUMENT");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new UserError("Choose a file.");
    if (!ALLOWED_MIME[file.type]) throw new UserError("Upload a JPG, PNG, WebP or PDF file.");
    const isImage = file.type.startsWith("image/");
    if (kind === "PHOTO" && !isImage) throw new UserError("Photos must be JPG, PNG or WebP.");
    const key = await putObject(Buffer.from(await file.arrayBuffer()), file.type);
    const label = kind === "PHOTO" ? "Inventory photo" : kind === "QUOTE_EVIDENCE" ? "Builder quote evidence" : "Inventory document";
    const doc = await db.document.create({ data: { title: fd.str(form, "title") ?? file.name, kind: label, storageKey: key, fileName: file.name.slice(0, 120), mimeType: file.type, size: file.size, isPrivate: true, uploadedById: user.id } });
    await db.inventoryUnit.update({
      where: { id },
      data: kind === "PHOTO" ? { photoUrls: { push: `/files/${doc.id}` } } : { documentIds: { push: doc.id }, ...(kind === "QUOTE_EVIDENCE" ? { builderQuoteEvidence: `doc:${doc.id}` } : {}) },
    });
    await audit(user, "inventory.file_add", "InventoryUnit", id, { kind });
    revalidatePath(`/admin/inventory/${id}`);
    return { ok: true, message: kind === "QUOTE_EVIDENCE" ? "Cost sheet attached as the quote evidence (private)." : "Uploaded (private)." };
  } catch (e) {
    return fail(e);
  }
}

/** A person accepts or rejects the price comparison after looking at the evidence. */
export async function reviewComparisonAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    if (!MANAGERS.includes(user.role)) throw new UserError("Only managers can review price comparisons.");
    const id = z.string().cuid().parse(form.get("unitId"));
    const decision = z.enum(["ACCEPTED", "REJECTED", "UNREVIEWED"]).parse(form.get("decision"));
    const note = fd.str(form, "note");
    const u = await db.inventoryUnit.findUniqueOrThrow({ where: { id } });
    if (decision === "ACCEPTED") {
      const c = compareInventory(u);
      if (c.status !== "COMPARABLE") throw new UserError(`This comparison can't be accepted: ${c.problems.join("; ") || "no builder quote"}.`);
      if (!u.builderQuoteEvidence) throw new UserError("Attach the builder's cost sheet (or its URL) as evidence before accepting.");
    }
    if (decision === "REJECTED" && !note) throw new UserError("Say why the comparison is rejected.");
    await db.inventoryUnit.update({
      where: { id },
      data: { comparisonReview: decision, comparisonReviewNote: note, comparisonReviewedBy: decision === "UNREVIEWED" ? null : user.name, comparisonReviewedAt: decision === "UNREVIEWED" ? null : new Date() },
    });
    await audit(user, "inventory.comparison_review", "InventoryUnit", id, { decision });
    revalidatePath(`/admin/inventory/${id}`);
    revalidatePath("/admin/inventory");
    return { ok: true, message: decision === "ACCEPTED" ? "Comparison accepted. The difference can now be presented as a confirmed comparison." : "Review saved." };
  } catch (e) {
    return fail(e);
  }
}

/** "I confirmed this unit with the owner today." */
export async function verifyUnitAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const id = z.string().cuid().parse(form.get("unitId"));
    const availability = z.enum(["AVAILABLE", "ON_HOLD", "UNDER_NEGOTIATION", "SOLD", "WITHDRAWN", "UNCONFIRMED"]).parse(form.get("availability"));
    const u = await db.inventoryUnit.update({ where: { id }, data: { availability, lastVerifiedAt: new Date(), ...(["SOLD", "WITHDRAWN"].includes(availability) ? { isPublic: false } : {}) } });
    await db.activity.create({ data: { type: "NOTE", title: `Inventory ${u.reference} verified: ${availability.toLowerCase().replace(/_/g, " ")}`, body: fd.str(form, "note"), projectId: u.projectId, actorId: user.id } });
    await audit(user, "inventory.verified", "InventoryUnit", id, { availability });
    revalidatePath(`/admin/inventory/${id}`);
    revalidatePath("/admin/inventory");
    return { ok: true, message: "Marked as verified today." };
  } catch (e) {
    return fail(e);
  }
}

export interface ImportPreview {
  plan: Omit<PlannedRow, "row" | "existingId">[];
  counts: Record<PlannedRow["action"], number>;
  fileErrors: string[];
  unknownColumns: string[];
}

async function readImport(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new UserError("Choose a CSV file.");
  if (file.size > 2 * 1024 * 1024) throw new UserError("CSV must be 2 MB or smaller.");
  if (!/\.csv$/i.test(file.name) && !file.type.includes("csv") && file.type !== "text/plain") throw new UserError("Upload a .csv file (in Excel: File → Save As → CSV UTF-8).");
  const parsed = parseInventoryCsv(await file.text());
  const refs = parsed.rows.flatMap((r) => (r.row ? [r.row.reference] : []));
  const projects = [...new Set(parsed.rows.flatMap((r) => (r.row ? [r.row.projectName] : [])))];
  const existing = await db.inventoryUnit.findMany({
    where: { OR: [{ reference: { in: refs, mode: "insensitive" } }, { projectName: { in: projects, mode: "insensitive" } }] },
    select: { id: true, reference: true, projectName: true, unitNumber: true },
  });
  const plan = planInventoryImport(parsed.rows, existing, { updateExisting: fd.bool(form, "updateExisting") });
  const counts = { CREATE: 0, UPDATE: 0, SKIP_DUPLICATE: 0, ERROR: 0 } as ImportPreview["counts"];
  for (const p of plan) counts[p.action]++;
  return { parsed, plan, counts };
}

/** Step 1: validate and show exactly what would happen. Writes nothing. */
export async function previewImportAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertPermission("projects:write");
    const { parsed, plan, counts } = await readImport(form);
    const data: ImportPreview = { plan: plan.map(({ row: _r, existingId: _e, ...p }) => p), counts, fileErrors: parsed.fileErrors, unknownColumns: parsed.unknownColumns };
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

/** Step 2: the user confirmed the preview. Re-checks everything and saves in one transaction. */
export async function confirmImportAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const { parsed, plan, counts } = await readImport(form);
    if (parsed.fileErrors.length) throw new UserError(parsed.fileErrors.join(" "));
    const expected = z.object({ create: z.coerce.number(), update: z.coerce.number() }).parse({ create: form.get("expectCreate"), update: form.get("expectUpdate") });
    if (expected.create !== counts.CREATE || expected.update !== counts.UPDATE) throw new UserError("Inventory changed since the preview. Check the file again before importing.");
    if (!counts.CREATE && !counts.UPDATE) throw new UserError("Nothing to import.");
    const toCreate = plan.filter((p) => p.action === "CREATE");
    const toUpdate = plan.filter((p) => p.action === "UPDATE");
    const created: { id: string; reference: string; due: Date | null }[] = [];
    await db.$transaction(async (tx) => {
      for (const p of toCreate) {
        const { nextFollowUpAt, ...fields } = p.row as InventoryRow;
        const u = await tx.inventoryUnit.create({ data: { ...fields, createdById: user.id } });
        created.push({ id: u.id, reference: u.reference, due: nextFollowUpAt });
      }
      for (const p of toUpdate) {
        const { nextFollowUpAt, ...fields } = p.row as InventoryRow;
        const prev = await tx.inventoryUnit.findUniqueOrThrow({ where: { id: p.existingId! } });
        const reset = comparisonFingerprint(prev) !== comparisonFingerprint({ ...prev, ...fields });
        await tx.inventoryUnit.update({ where: { id: prev.id }, data: { ...fields, ...(reset ? { comparisonReview: "UNREVIEWED", comparisonReviewedBy: null, comparisonReviewedAt: null } : {}) } });
        created.push({ id: prev.id, reference: prev.reference, due: nextFollowUpAt });
      }
    });
    for (const c of created) if (c.due) await setNextFollowUp({ inventoryUnitId: c.id }, c.due, { title: `Re-check availability and price — ${c.reference}`, assigneeId: user.id });
    await audit(user, "inventory.import", "InventoryUnit", null, { created: counts.CREATE, updated: counts.UPDATE, skipped: counts.SKIP_DUPLICATE, errors: counts.ERROR });
    revalidatePath("/admin/inventory");
    return { ok: true, message: `Imported ${counts.CREATE} new unit(s)${counts.UPDATE ? ` and updated ${counts.UPDATE}` : ""}. ${counts.SKIP_DUPLICATE} duplicate(s) and ${counts.ERROR} row(s) with errors were not saved. Every unit is private and pending approval.` };
  } catch (e) {
    return fail(e);
  }
}
