"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission, hashPassword } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";

const role = z.enum(["SUPER_ADMIN", "OPERATIONS_MANAGER", "SALES_REP", "ANALYST"]);
const password = z.string().min(10, "Use at least 10 characters.").max(200).refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include letters and numbers.");

export async function userAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await assertPermission("users:manage");
    const id = fd.str(form, "userId");
    if (id) {
      if (id === actor.id && (form.get("role") !== "SUPER_ADMIN" || !fd.bool(form, "active"))) throw new UserError("You can't demote or deactivate yourself.");
      const pw = fd.str(form, "password");
      await db.user.update({ where: { id }, data: { role: role.parse(form.get("role")), active: fd.bool(form, "active"), ...(pw ? { passwordHash: await hashPassword(password.parse(pw)) } : {}) } });
      if (!fd.bool(form, "active") || pw) await db.session.deleteMany({ where: { userId: id } });
      await audit(actor, "user.update", "User", id, { role: String(form.get("role")), active: fd.bool(form, "active"), passwordReset: !!pw });
    } else {
      const email = z.string().trim().toLowerCase().email("Enter a valid email.").parse(form.get("email"));
      if (await db.user.findUnique({ where: { email } })) throw new UserError("A team member with this email exists.");
      const u = await db.user.create({ data: { name: z.string().trim().min(2).max(80).parse(form.get("name")), email, role: role.parse(form.get("role")), passwordHash: await hashPassword(password.parse(form.get("password"))) } });
      await audit(actor, "user.create", "User", u.id, { role: u.role });
    }
    revalidatePath("/admin/settings");
    return { ok: true, message: "Team updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function ruleAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await assertPermission("settings:manage");
    const id = z.string().cuid().parse(form.get("ruleId"));
    await db.notificationRule.update({ where: { id }, data: { enabled: fd.bool(form, "enabled"), inApp: fd.bool(form, "inApp"), email: fd.bool(form, "email"), audienceRoles: fd.list(form, "audienceRoles").map((r) => role.parse(r)) } });
    await audit(actor, "notification_rule.update", "NotificationRule", id);
    revalidatePath("/admin/settings");
    return { ok: true, message: "Rule saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function businessAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await assertPermission("settings:manage");
    const value = { companyName: fd.str(form, "companyName") ?? "EstateIQ", tagline: fd.str(form, "tagline") ?? "", email: fd.str(form, "email") ?? "", phone: fd.str(form, "phone") ?? "", address: fd.str(form, "address") ?? "", agentReraNumber: fd.str(form, "agentReraNumber") ?? "", agentReraNote: "" };
    await db.setting.upsert({ where: { key: "business" }, update: { value }, create: { key: "business", value } });
    await audit(actor, "settings.business", "Setting", "business");
    revalidatePath("/", "layout");
    return { ok: true, message: "Business details saved." };
  } catch (e) {
    return fail(e);
  }
}

/** Removes every record flagged as demo data. Research records and real entries are untouched. */
export async function removeDemoDataAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await assertPermission("users:manage");
    if (form.get("confirm") !== "REMOVE DEMO") throw new UserError("Type REMOVE DEMO to confirm.");
    const demoProjects = (await db.project.findMany({ where: { isDemo: true }, select: { id: true } })).map((p) => p.id);
    const demoBuyers = (await db.buyer.findMany({ where: { isDemo: true }, select: { id: true } })).map((b) => b.id);
    await db.$transaction([
      db.commissionPayment.deleteMany({ where: { commission: { isDemo: true } } }),
      db.commission.deleteMany({ where: { isDemo: true } }),
      db.transaction.deleteMany({ where: { OR: [{ isDemo: true }, { projectId: { in: demoProjects } }, { buyerId: { in: demoBuyers } }] } }),
      db.commercialAgreement.deleteMany({ where: { isDemo: true } }),
      db.negotiation.deleteMany({ where: { isDemo: true } }),
      db.campaign.deleteMany({ where: { OR: [{ isDemo: true }, { projectId: { in: demoProjects } }] } }),
      db.buyer.deleteMany({ where: { id: { in: demoBuyers } } }),
      db.project.deleteMany({ where: { id: { in: demoProjects } } }),
      db.developer.deleteMany({ where: { isDemo: true, projects: { none: {} } } }),
      db.notification.deleteMany({ where: { dedupeKey: { startsWith: "seed-" } } }),
    ]);
    await audit(actor, "data.remove_demo", "System", null, { projects: demoProjects.length, buyers: demoBuyers.length });
    revalidatePath("/", "layout");
    return { ok: true, message: `Removed ${demoProjects.length} demo projects and ${demoBuyers.length} demo buyers. Research records were kept.` };
  } catch (e) {
    return fail(e);
  }
}
