import { headers } from "next/headers";

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

/** Same-origin check for state-changing route handlers (server actions are checked by Next itself). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
