import { NextResponse } from "next/server";
import { requirementSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request";
import { rankMatches } from "@/lib/domain/matching";
import { liveMatchProperties } from "@/lib/services/requirements";
import { getProjectCards } from "@/lib/queries/public";

/** POST /api/match/preview — scores public listings against a requirement. Stores nothing. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  if (!rateLimit(`match:${ip}`, 40, 60_000).ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const parsed = requirementSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid requirement." }, { status: 422 });
  const r = parsed.data;
  const [props, cards] = await Promise.all([liveMatchProperties(), getProjectCards({ mode: "all" })]);
  const results = rankMatches({ ...r, primaryLocationId: r.primaryLocationId ?? null, secondaryLocationId: r.secondaryLocationId ?? null, moveInBy: r.moveInBy ?? null }, props).slice(0, 12);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return NextResponse.json({
    matches: results.map((m) => {
      const c = byId.get(m.propertyId)!;
      return {
        ...m,
        slug: c.slug, name: c.name, image: c.image, location: c.location.name, developer: c.developer.name, dealType: c.dealType,
        priceMin: c.priceMin, priceMax: c.priceMax, rentMin: c.rentMin, rentMax: c.rentMax, bhks: c.bhks, grossYield: c.grossYield, status: c.status,
      };
    }),
  });
}
