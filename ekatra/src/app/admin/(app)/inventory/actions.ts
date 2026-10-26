"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { inventoryRowSchema, rowsFromCsv } from "@/lib/inventory-csv";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { putObject, ALLOWED_MIME } from "@/lib/storage";

function rowFromForm(form: FormData) {
  const g = (k: string) => (form.get(k) as string | null) ?? "";
  return {
    reference: g("reference"), projectName: g("projectName"), developerName: g("developerName"), microMarket: g("microMarket"), unitNumber: g("unitNumber"), configuration: g("configuration"),
    bhk: g("bhk"), carpetArea: g("carpetArea"), floor: g("floor"), facing: g("facing"), parking: g("parking"), furnishing: g("furnishing"), possessionDetails: g("possessionDetails"),
    askingPrice: g("askingPrice"), askingIncludes: g("askingIncludes"), askingExcludes: g("askingExcludes"), askingExtraCosts: g("askingExtraCosts"),
    builderQuote: g("builderQuote"), builderQuoteDate: g("builderQuoteDate"), builderQuoteSource: g("builderQuoteSource"), builderQuoteConfig: g("builderQuoteConfig"), builderQuoteCarpet: g("builderQuoteCarpet"),
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
    const dupe = await db.inventoryUnit.findUnique({ where: { reference: row.reference } });
    if (dupe && dupe.id !== unitId) throw new UserError(`Reference ${row.reference} is already used.`);
    if (row.unitNumber) {
      const same = await db.inventoryUnit.findFirst({ where: { projectName: { equals: row.projectName, mode: "insensitive" }, unitNumber: { equals: row.unitNumber, mode: "insensitive" }, NOT: unitId ? { id: unitId } : undefined } });
      if (same) throw new UserError(`Unit ${row.unitNumber} in ${row.projectName} already exists as ${same.reference}.`);
    }
    const data = { ...row, projectId: projectId || null };
    // Roles without commercial access never see owner contacts or terms — keep the stored values.
    if (!can(user.role, "commercial:read")) {
      const prev = unitId ? await db.inventoryUnit.findUnique({ where: { id: unitId } }) : null;
      Object.assign(data, { ownerSource: prev?.ownerSource ?? null, contactName: prev?.contactName ?? null, contactPhone: prev?.contactPhone ?? null, contactEmail: prev?.contactEmail ?? null, commercialTerms: prev?.commercialTerms ?? null });
    }
    const u = unitId ? await db.inventoryUnit.update({ where: { id: unitId }, data }) : await db.inventoryUnit.create({ data: { ...data, createdById: user.id } });
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

export async function addUnitFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const id = z.string().cuid().parse(form.get("unitId"));
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new UserError("Choose a file.");
    if (!ALLOWED_MIME[file.type]) throw new UserError("Upload a JPG, PNG, WebP, PDF, DOCX or XLSX file.");
    const key = await putObject(Buffer.from(await file.arrayBuffer()), file.type);
    const isPhoto = file.type.startsWith("image/");
    const doc = await db.document.create({ data: { title: fd.str(form, "title") ?? file.name, kind: isPhoto ? "Inventory photo" : "Inventory evidence", storageKey: key, fileName: file.name.slice(0, 120), mimeType: file.type, size: file.size, isPrivate: true, uploadedById: user.id } });
    await db.inventoryUnit.update({ where: { id }, data: isPhoto ? { photoUrls: { push: `/files/${doc.id}` } } : { documentIds: { push: doc.id } } });
    await audit(user, "inventory.file_add", "InventoryUnit", id);
    revalidatePath(`/admin/inventory/${id}`);
    return { ok: true, message: "Uploaded (private)." };
  } catch (e) {
    return fail(e);
  }
}

export async function importInventoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new UserError("Choose a CSV file.");
    if (file.size > 2 * 1024 * 1024) throw new UserError("CSV must be 2 MB or smaller.");
    const { valid, errors } = rowsFromCsv(await file.text());
    const existing = new Set((await db.inventoryUnit.findMany({ where: { reference: { in: valid.map((v) => v.reference) } }, select: { reference: true } })).map((x) => x.reference));
    const fresh = valid.filter((v) => !existing.has(v.reference));
    const dryRun = form.get("mode") !== "import";
    if (!dryRun && fresh.length) await db.inventoryUnit.createMany({ data: fresh.map((r) => ({ ...r, createdById: user.id })) });
    if (!dryRun) await audit(user, "inventory.import", "InventoryUnit", null, { imported: fresh.length, skipped: existing.size, errors: errors.length });
    revalidatePath("/admin/inventory");
    const lines = [
      `${valid.length} valid row(s)`,
      existing.size ? `${existing.size} skipped — reference already exists` : null,
      errors.length ? `${errors.length} row(s) with errors:\n${errors.slice(0, 20).map((e) => `  line ${e.line}: ${e.message}`).join("\n")}` : null,
    ].filter(Boolean);
    return { ok: true, message: dryRun ? `Check complete. ${lines.join(" · ")}` : `Imported ${fresh.length} unit(s). ${lines.join(" · ")}` };
  } catch (e) {
    return fail(e);
  }
}
