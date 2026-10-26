"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { createBuyerSession, destroySession, getBuyerSession, hashToken, safeEqual } from "@/lib/auth";
import { normalizeEmail } from "@/lib/domain/identity";
import { rateLimit } from "@/lib/rate-limit";
import { clientInfo } from "@/lib/request";
import { sendEmail } from "@/lib/email";
import { notify } from "@/lib/notify";
import type { ActionState } from "@/lib/action";

export async function requestCodeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "Enter a valid email address." };
  const { ip } = await clientInfo();
  if (!rateLimit(`otp:${ip}`, 6, 15 * 60_000).ok || !rateLimit(`otp:${email}`, 3, 15 * 60_000).ok) return { error: "Too many codes requested. Please wait a few minutes." };
  const code = String(randomInt(100000, 1000000));
  await db.buyerLoginCode.create({ data: { email, codeHash: hashToken(`otp:${email}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  await sendEmail(email, "Your EstateIQ sign-in code", `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this email.`);
  const devHint = !process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production" ? code : undefined;
  // Same response whether or not the email belongs to a buyer.
  return { ok: true, message: "We've sent a 6-digit code to your email.", data: { email, devHint } };
}

export async function verifyCodeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) return { error: "Enter the 6-digit code." };
  const { ip } = await clientInfo();
  if (!rateLimit(`otp-verify:${ip}`, 15, 15 * 60_000).ok) return { error: "Too many attempts. Please wait a few minutes." };
  const rec = await db.buyerLoginCode.findFirst({ where: { email, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!rec || rec.attempts >= 5) return { error: "That code has expired. Request a new one." };
  if (!safeEqual(rec.codeHash, hashToken(`otp:${email}:${code}`))) {
    await db.buyerLoginCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    return { error: "That code isn't right. Please check and try again." };
  }
  await db.buyerLoginCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } });
  let buyer = await db.buyer.findUnique({ where: { emailNormalized: email } });
  if (buyer?.anonymizedAt) buyer = null;
  if (!buyer) buyer = await db.buyer.create({ data: { fullName: email.split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), email, emailNormalized: email, leadSource: "Account sign-up", stage: "NEW_INQUIRY" } });
  await db.buyer.update({ where: { id: buyer.id }, data: { verification: buyer.verification === "UNVERIFIED" ? "CONTACT_VERIFIED" : buyer.verification } });
  await createBuyerSession(buyer.id);
  revalidatePath("/account");
  return { ok: true };
}

export async function signOutAction() {
  await destroySession("buyer");
  revalidatePath("/account");
}

export async function updateConsentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getBuyerSession();
  if (!me) return { error: "Please sign in again." };
  const { ip, userAgent } = await clientInfo();
  const purposes = ["SHARE_WITH_DEVELOPER", "MARKETING_UPDATES", "WHATSAPP_MESSAGES"] as const;
  await db.consentRecord.createMany({ data: purposes.map((p) => ({ buyerId: me.id, purpose: p, granted: form.get(p) === "on", policyVersion: "2026-10", textShown: `Updated from account page`, ip, userAgent })) });
  revalidatePath("/account");
  return { ok: true, message: "Your preferences are saved." };
}

export async function requestDeletionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getBuyerSession();
  if (!me) return { error: "Please sign in again." };
  if (form.get("confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  await db.buyer.update({ where: { id: me.id }, data: { deletionRequestedAt: new Date() } });
  await db.activity.create({ data: { type: "SYSTEM", title: "Buyer requested deletion of personal data", buyerId: me.id } });
  await notify("buyer.registered", { title: "Data deletion request", body: `${me.fullName} asked for their personal data to be deleted.`, link: `/admin/buyers/${me.id}` });
  revalidatePath("/account");
  return { ok: true, message: "Request received. We'll erase your personal data and confirm by email." };
}

export async function withdrawInterestBuyerAction(interestId: string) {
  const me = await getBuyerSession();
  if (!me) return;
  const id = z.string().cuid().parse(interestId);
  await db.projectInterest.updateMany({ where: { id, buyerId: me.id }, data: { status: "WITHDRAWN" } });
  await db.activity.create({ data: { type: "INTEREST", title: "Buyer withdrew interest from their account", buyerId: me.id } });
  revalidatePath("/account");
}
