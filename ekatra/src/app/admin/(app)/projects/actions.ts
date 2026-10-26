"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { DataVerification, LifecycleStage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { saveConfiguration } from "@/lib/services/projects";
import { slugify } from "@/lib/format";
import { audit } from "@/lib/audit";
import { putObject, ALLOWED_MIME } from "@/lib/storage";
import { LIFECYCLE_STAGES } from "@/lib/labels";

const verif = z.enum(["VERIFIED", "INDICATIVE", "AWAITING_VERIFICATION", "OUTDATED", "UNAVAILABLE"]);
const url = z.string().trim().url("Enter a full URL starting with https://").max(500);

async function uniqueSlug(name: string) {
  const base = slugify(name) || "project";
  let slug = base;
  for (let i = 2; await db.project.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function createProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await assertPermission("projects:write");
    const name = z.string().trim().min(2, "Enter the official project name.").max(120).parse(form.get("name"));
    const developerId = z.string().cuid({ message: "Choose a developer." }).parse(form.get("developerId"));
    const locationId = z.string().cuid({ message: "Choose a location." }).parse(form.get("locationId"));
    const dupe = await db.project.findFirst({ where: { name: { equals: name, mode: "insensitive" }, developerId } });
    if (dupe) return { error: "This developer already has a project with that name.", data: dupe.id };
    const loc = await db.location.findUniqueOrThrow({ where: { id: locationId } });
    const p = await db.project.create({
      data: {
        slug: await uniqueSlug(name),
        name,
        developerId,
        locationId,
        market: fd.str(form, "market"),
        segment: (fd.str(form, "segment") ?? "RESIDENTIAL") as "RESIDENTIAL",
        dealType: (fd.str(form, "dealType") ?? "SALE") as "SALE",
        propertyType: (fd.str(form, "propertyType") ?? "APARTMENT") as "APARTMENT",
        status: (fd.str(form, "status") ?? "ANNOUNCED") as "ANNOUNCED",
        officialWebsite: fd.str(form, "officialWebsite"),
        lat: loc.lat,
        lng: loc.lng,
        coordinatePrecision: "APPROXIMATE",
        amenities: [],
        sourceLinks: [],
        researchStatus: "IN_PROGRESS",
        lifecycleStages: [],
        buyerSegments: [],
        description: fd.str(form, "description"),
      },
    });
    await audit(user, "project.create", "Project", p.id);
    id = p.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin/projects/${id}`);
}

export async function updateProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const id = z.string().cuid().parse(form.get("projectId"));
    const section = fd.str(form, "section");
    let data: Prisma.ProjectUpdateInput = {};
    if (section === "overview") {
      data = {
        name: z.string().trim().min(2).max(120).parse(form.get("name")),
        marketingName: fd.str(form, "marketingName"),
        legalPromoterName: fd.str(form, "legalPromoterName"),
        tagline: fd.str(form, "tagline"),
        description: fd.str(form, "description"),
        addressLine: fd.str(form, "addressLine"),
        market: fd.str(form, "market"),
        location: { connect: { id: z.string().cuid().parse(form.get("locationId")) } },
        developer: { connect: { id: z.string().cuid().parse(form.get("developerId")) } },
        status: fd.str(form, "status") as never,
        segment: fd.str(form, "segment") as never,
        dealType: fd.str(form, "dealType") as never,
        propertyType: fd.str(form, "propertyType") as never,
        towers: fd.num(form, "towers"),
        storeys: fd.num(form, "storeys"),
        landParcelAcres: fd.num(form, "landParcelAcres"),
        amenities: (fd.str(form, "amenities") ?? "").split(/\n|,/).map((s) => s.trim()).filter(Boolean).slice(0, 40),
        lat: fd.num(form, "lat"),
        lng: fd.num(form, "lng"),
        coordinatePrecision: fd.str(form, "coordinatePrecision") === "EXACT" ? "EXACT" : "APPROXIMATE",
        isFeatured: fd.bool(form, "isFeatured"),
      };
    } else if (section === "legal") {
      const reraUrl = fd.str(form, "reraUrl");
      const officialWebsite = fd.str(form, "officialWebsite");
      const brochureUrl = fd.str(form, "brochureUrl");
      for (const u of [reraUrl, officialWebsite, brochureUrl]) if (u) url.parse(u);
      data = {
        reraNumber: fd.str(form, "reraNumber"),
        reraUrl,
        reraVerification: verif.parse(fd.str(form, "reraVerification") ?? "AWAITING_VERIFICATION"),
        reraStatusText: fd.str(form, "reraStatusText"),
        officialWebsite,
        brochureUrl,
        lifecycleStages: fd.list(form, "lifecycleStages").filter((s): s is LifecycleStage => LIFECYCLE_STAGES.includes(s as LifecycleStage)),
        launchDate: fd.date(form, "launchDate"),
        launchVerification: verif.parse(fd.str(form, "launchVerification") ?? "UNAVAILABLE"),
        possessionDate: fd.date(form, "possessionDate"),
        possessionVerification: verif.parse(fd.str(form, "possessionVerification") ?? "UNAVAILABLE"),
        declaredCompletionDate: fd.date(form, "declaredCompletionDate"),
        ocStatus: fd.str(form, "ocStatus"),
        bookingStatus: fd.str(form, "bookingStatus"),
        inventoryStatus: fd.str(form, "inventoryStatus"),
      };
    } else if (section === "pricing") {
      const priceSourceUrl = fd.str(form, "priceSourceUrl");
      if (priceSourceUrl) url.parse(priceSourceUrl);
      data = {
        priceBasis: fd.str(form, "priceBasis"),
        taxesAndCharges: fd.str(form, "taxesAndCharges"),
        parkingInfo: fd.str(form, "parkingInfo"),
        parkingSlots: fd.num(form, "parkingSlots"),
        officialPriceText: fd.str(form, "officialPriceText"),
        priceSourceUrl,
        priceSourceDate: fd.date(form, "priceSourceDate"),
        priceInclusions: fd.str(form, "priceInclusions"),
        budgetBandNote: fd.str(form, "budgetBandNote"),
        monthlyRent: fd.num(form, "monthlyRent"),
        securityDeposit: fd.num(form, "securityDeposit"),
        leaseStart: fd.date(form, "leaseStart"),
        leaseEnd: fd.date(form, "leaseEnd"),
        leaseTenureMonths: fd.num(form, "leaseTenureMonths"),
        lockInMonths: fd.num(form, "lockInMonths"),
        escalationPct: fd.num(form, "escalationPct"),
        maintenanceMonthly: fd.num(form, "maintenanceMonthly"),
        propertyTaxAnnual: fd.num(form, "propertyTaxAnnual"),
        availableFrom: fd.date(form, "availableFrom"),
      };
    } else if (section === "commercial") {
      data = {
        buyerSegments: (fd.str(form, "buyerSegments") ?? "").split(/\n|,/).map((s) => s.trim()).filter(Boolean),
        dueDiligence: fd.str(form, "dueDiligence"),
        internalNotes: fd.str(form, "internalNotes"),
        nextVerificationAt: fd.date(form, "nextVerificationAt"),
      };
    } else throw new UserError("Unknown section.");
    await db.project.update({ where: { id }, data });
    await audit(user, `project.update_${section}`, "Project", id);
    revalidatePath(`/admin/projects/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveConfigAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const projectId = z.string().cuid().parse(form.get("projectId"));
    const configId = fd.str(form, "configId");
    const r = await saveConfiguration(
      projectId,
      configId,
      {
        label: z.string().trim().min(1, "Give the configuration a label.").max(60).parse(form.get("label")),
        bhk: z.coerce.number().min(0).max(10).parse(form.get("bhk") ?? 0),
        carpetAreaMin: fd.num(form, "carpetAreaMin"),
        carpetAreaMax: fd.num(form, "carpetAreaMax"),
        priceMin: fd.num(form, "priceMin"),
        priceMax: fd.num(form, "priceMax"),
        priceVerification: verif.parse(fd.str(form, "priceVerification") ?? "INDICATIVE") as DataVerification,
        availabilityNote: fd.str(form, "availabilityNote"),
        sourceName: fd.str(form, "sourceName"),
        sourceUrl: fd.str(form, "sourceUrl"),
        note: fd.str(form, "note"),
      },
      user.id,
    );
    const rent = { rentMin: fd.num(form, "rentMin"), rentMax: fd.num(form, "rentMax") };
    if (rent.rentMin !== null || rent.rentMax !== null) await db.projectConfiguration.update({ where: { id: r.config.id }, data: rent });
    await audit(user, r.priceChanged ? "project.price_change" : "project.config_save", "Project", projectId, { config: r.config.label });
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: r.priceChanged ? "Saved — price change recorded in history." : "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteConfigAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const id = z.string().cuid().parse(form.get("configId"));
    const c = await db.projectConfiguration.findUniqueOrThrow({ where: { id }, include: { _count: { select: { transactions: true } } } });
    if (c._count.transactions) throw new UserError("This configuration has transactions and cannot be deleted.");
    await db.projectConfiguration.delete({ where: { id } });
    await audit(user, "project.config_delete", "Project", c.projectId, { label: c.label });
    revalidatePath(`/admin/projects/${c.projectId}`);
    return { ok: true, message: "Configuration removed. Its price history is kept." };
  } catch (e) {
    return fail(e);
  }
}

export async function addSourceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const projectId = z.string().cuid().parse(form.get("projectId"));
    const u = fd.str(form, "url");
    if (u) url.parse(u);
    await db.researchSource.create({
      data: {
        projectId,
        factKey: z.string().trim().min(1).max(40).parse(form.get("factKey")),
        claim: z.string().trim().min(3, "Describe what the source says.").max(500).parse(form.get("claim")),
        url: u,
        sourceType: z.enum(["OFFICIAL_DEVELOPER", "MAHARERA", "COMPANY_FILING", "GOVERNMENT", "NEWS", "PORTAL", "INTERNAL"]).parse(form.get("sourceType")),
        verdict: z.enum(["CONFIRMED_OFFICIAL", "DEVELOPER_ANNOUNCED", "SECONDARY_ONLY", "CONFLICT", "NOT_VERIFIED"]).parse(form.get("verdict")),
        checkedAt: fd.date(form, "checkedAt") ?? new Date(),
        checkedBy: user.name,
        notes: fd.str(form, "notes"),
      },
    });
    if (form.get("verdict") === "CONFLICT") await db.project.update({ where: { id: projectId }, data: { conflictFlag: true } });
    if (u) await db.project.update({ where: { id: projectId }, data: { sourceLinks: { push: u } } });
    await audit(user, "project.source_add", "Project", projectId);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: "Source recorded in the audit trail." };
  } catch (e) {
    return fail(e);
  }
}

export async function researchDecisionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const projectId = z.string().cuid().parse(form.get("projectId"));
    const status = z.enum(["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVIEW", "VERIFIED", "EXCLUDED"]).parse(form.get("researchStatus"));
    const tierRaw = fd.str(form, "tier");
    const tier = tierRaw ? z.enum(["A", "B"]).parse(tierRaw) : null;
    const conflictFlag = fd.bool(form, "conflictFlag");
    const p = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { sources: true } });
    if (status === "VERIFIED") {
      if (!p.sources.some((s) => s.verdict === "CONFIRMED_OFFICIAL")) throw new UserError("Add at least one source confirmed on an official record (e.g. MahaRERA) before marking the project verified.");
      if (conflictFlag) throw new UserError("Resolve and clear the conflict flag before marking the project verified.");
    }
    if (tier && !fd.str(form, "tierReason")) throw new UserError("Explain the tier assignment briefly.");
    await db.project.update({
      where: { id: projectId },
      data: {
        researchStatus: status,
        tier,
        tierReason: fd.str(form, "tierReason"),
        conflictFlag,
        conflictNotes: fd.str(form, "conflictNotes"),
        ...(status === "VERIFIED" ? { lastVerifiedAt: new Date(), dataVerification: "VERIFIED" } : {}),
      },
    });
    await audit(user, "project.research_decision", "Project", projectId, { status, tier });
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: "Research status updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function markVerifiedTodayAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const projectId = z.string().cuid().parse(form.get("projectId"));
    await db.project.update({ where: { id: projectId }, data: { lastVerifiedAt: new Date(), nextVerificationAt: new Date(Date.now() + 45 * 864e5) } });
    await audit(user, "project.reverified", "Project", projectId);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: "Marked as checked today." };
  } catch (e) {
    return fail(e);
  }
}

export async function publishAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const projectId = z.string().cuid().parse(form.get("projectId"));
    const approval = z.enum(["PENDING", "APPROVED", "REJECTED"]).parse(form.get("approvalStatus"));
    if (approval !== "PENDING" && !["SUPER_ADMIN", "OPERATIONS_MANAGER"].includes(user.role)) throw new UserError("Only managers can approve.");
    const complianceReviewed = fd.bool(form, "complianceReviewed");
    const isPublished = fd.bool(form, "isPublished");
    if (isPublished && (approval !== "APPROVED" || !complianceReviewed)) throw new UserError("A project can be published only after owner approval and compliance review.");
    const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    if (isPublished && p.researchStatus === "EXCLUDED") throw new UserError("Excluded projects cannot be published.");
    await db.project.update({ where: { id: projectId }, data: { approvalStatus: approval, complianceReviewed, isPublished, complianceNotes: fd.str(form, "complianceNotes") } });
    await audit(user, "project.publication", "Project", projectId, { approval, complianceReviewed, isPublished });
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath("/");
    return { ok: true, message: isPublished ? "Published on the public site." : "Saved. Not public." };
  } catch (e) {
    return fail(e);
  }
}

export async function addMediaAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("projects:write");
    const projectId = z.string().cuid().parse(form.get("projectId"));
    const kind = z.enum(["IMAGE", "FLOOR_PLAN", "BROCHURE"]).parse(form.get("kind"));
    const file = form.get("file");
    let mediaUrl = fd.str(form, "url");
    if (file instanceof File && file.size > 0) {
      if (!ALLOWED_MIME[file.type]) throw new UserError("Upload a JPG, PNG, WebP or PDF file.");
      const key = await putObject(Buffer.from(await file.arrayBuffer()), file.type);
      const doc = await db.document.create({ data: { title: file.name, kind, storageKey: key, fileName: file.name.slice(0, 120), mimeType: file.type, size: file.size, isPrivate: false, projectId, uploadedById: user.id } });
      mediaUrl = `/files/${doc.id}`;
    } else if (mediaUrl) url.parse(mediaUrl);
    if (!mediaUrl) throw new UserError("Choose a file or paste an image URL.");
    const count = await db.projectMedia.count({ where: { projectId, kind } });
    await db.projectMedia.create({ data: { projectId, kind, url: mediaUrl, caption: fd.str(form, "caption"), credit: fd.str(form, "credit"), isPrimary: kind === "IMAGE" && count === 0, sortOrder: count } });
    await audit(user, "project.media_add", "Project", projectId, { kind });
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: "Added." };
  } catch (e) {
    return fail(e);
  }
}

export async function mediaOpAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertPermission("projects:write");
    const id = z.string().cuid().parse(form.get("mediaId"));
    const op = form.get("op");
    const m = await db.projectMedia.findUniqueOrThrow({ where: { id } });
    if (op === "primary") {
      await db.$transaction([db.projectMedia.updateMany({ where: { projectId: m.projectId }, data: { isPrimary: false } }), db.projectMedia.update({ where: { id }, data: { isPrimary: true } })]);
    } else if (op === "delete") await db.projectMedia.delete({ where: { id } });
    revalidatePath(`/admin/projects/${m.projectId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
