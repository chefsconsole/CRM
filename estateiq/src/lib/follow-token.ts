// Short-lived signed token that lets a visitor who just registered request a callback or visit
// without creating an account. It identifies the buyer but never exposes their data.
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.SESSION_SECRET || "dev-insecure-session-secret";
const TTL_MS = 2 * 60 * 60_000;

export function signFollowToken(buyerId: string, now = Date.now()) {
  const payload = `${buyerId}.${now + TTL_MS}`;
  const sig = createHmac("sha256", secret()).update(`follow:${payload}`).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyFollowToken(token: string, now = Date.now()): string | null {
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const expected = createHmac("sha256", secret()).update(`follow:${payload}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [buyerId, exp] = payload.split(".");
  if (!buyerId || !exp || Number(exp) < now) return null;
  return buyerId;
}
