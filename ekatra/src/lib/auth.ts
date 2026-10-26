// Session-based authentication for team members and buyers.
// Tokens are random, stored only as HMAC hashes, and sent as httpOnly cookies.

import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { can, ForbiddenError, type Permission } from "./rbac";
import { clientInfo } from "./request";

export const TEAM_COOKIE = "ek_team";
export const BUYER_COOKIE = "ek_buyer";
const TEAM_TTL_MS = 12 * 36e5;
const BUYER_TTL_MS = 30 * 864e5;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ random characters).");
    return "dev-insecure-session-secret";
  }
  return s;
}

export function hashToken(token: string) {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

async function createSession(kind: "team" | "buyer", ownerId: string) {
  const token = randomBytes(32).toString("base64url");
  const { ip, userAgent } = await clientInfo();
  const ttl = kind === "team" ? TEAM_TTL_MS : BUYER_TTL_MS;
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: kind === "team" ? ownerId : null,
      buyerId: kind === "buyer" ? ownerId : null,
      expiresAt: new Date(Date.now() + ttl),
      ip,
      userAgent,
    },
  });
  const jar = await cookies();
  jar.set(kind === "team" ? TEAM_COOKIE : BUYER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl / 1000,
  });
}

export const createTeamSession = (userId: string) => createSession("team", userId);
export const createBuyerSession = (buyerId: string) => createSession("buyer", buyerId);

export async function destroySession(kind: "team" | "buyer") {
  const jar = await cookies();
  const name = kind === "team" ? TEAM_COOKIE : BUYER_COOKIE;
  const token = jar.get(name)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(name);
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export async function getTeamUser(): Promise<TeamUser | null> {
  const token = (await cookies()).get(TEAM_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, name: true, email: true, role: true, active: true } } },
  });
  if (!session || !session.user || session.expiresAt < new Date() || !session.user.active) return null;
  const { active: _active, ...user } = session.user;
  return user;
}

export async function requireTeamUser(): Promise<TeamUser> {
  const user = await getTeamUser();
  if (!user) redirect("/admin/login");
  return user;
}

/** For pages: redirects unauthenticated users, renders 403 for forbidden ones. */
export async function requirePermission(permission: Permission): Promise<TeamUser> {
  const user = await requireTeamUser();
  if (!can(user.role, permission)) redirect(`/admin?denied=${encodeURIComponent(permission)}`);
  return user;
}

/** For server actions / route handlers: never redirects, throws instead. */
export async function assertPermission(permission: Permission): Promise<TeamUser> {
  const user = await getTeamUser();
  if (!user) throw new ForbiddenError(permission);
  if (!can(user.role, permission)) throw new ForbiddenError(permission);
  return user;
}

export async function getBuyerSession() {
  const token = (await cookies()).get(BUYER_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, buyer: { select: { id: true, fullName: true, email: true, anonymizedAt: true } } },
  });
  if (!session?.buyer || session.expiresAt < new Date() || session.buyer.anonymizedAt) return null;
  return session.buyer;
}

/** Constant-time compare for short codes. */
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
