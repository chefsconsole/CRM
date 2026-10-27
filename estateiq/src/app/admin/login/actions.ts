"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createTeamSession, destroySession, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientInfo } from "@/lib/request";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200), next: z.string().optional() });

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password"), next: form.get("next") ?? undefined });
  if (!parsed.success) return { error: "Enter your email and password." };
  const { ip } = await clientInfo();
  const rl = rateLimit(`login:${ip}`, 10, 15 * 60_000);
  const rlUser = rateLimit(`login:${parsed.data.email}`, 6, 15 * 60_000);
  if (!rl.ok || !rlUser.ok) return { error: `Too many attempts. Try again in ${Math.ceil(Math.max(rl.retryAfter, rlUser.retryAfter) / 60)} minutes.` };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Always run a hash comparison to keep timing similar for unknown emails.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Ck1j2Q5uYb6Zp0aB2KxJ1z3QnQe1a");
  if (!user || !ok || !user.active) {
    await audit(null, "auth.login_failed", "User", user?.id ?? null, { email: parsed.data.email });
    return { error: "That email and password don't match an active account." };
  }
  await createTeamSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ id: user.id, name: user.name }, "auth.login", "User", user.id);
  const next = parsed.data.next?.startsWith("/admin") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/admin";
  redirect(next);
}

export async function logoutAction() {
  await destroySession("team");
  redirect("/admin/login");
}
