import { NextResponse } from "next/server";
import { inquirySchema, fieldErrors } from "@/lib/validation";
import { submitInquiry, InquiryError } from "@/lib/services/inquiry";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request";
import { signFollowToken } from "@/lib/follow-token";

/**
 * POST /api/inquiries — public buyer registration.
 * Body: see inquirySchema (src/lib/validation.ts). Returns { ok, followToken, campaign, project }.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  const rl = rateLimit(`inquiry:${ip}`, 8, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Too many submissions. Please try again in ${Math.ceil(rl.retryAfter / 60)} minutes.` }, { status: 429 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) }, { status: 422 });
  // Honeypot filled → pretend success without saving.
  if (parsed.data.website) return NextResponse.json({ ok: true });
  try {
    const r = await submitInquiry(parsed.data, { ip, userAgent: req.headers.get("user-agent") });
    return NextResponse.json({ ok: true, followToken: signFollowToken(r.buyerId), campaign: r.campaignJoined?.name ?? null, project: r.project?.name ?? null });
  } catch (e) {
    if (e instanceof InquiryError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
