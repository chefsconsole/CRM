import { NextResponse } from "next/server";
import { getTeamUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import { maskPhone } from "@/lib/domain/identity";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const user = await getTeamUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!rateLimit(`search:${user.id}`, 120, 60_000).ok) return NextResponse.json({ hits: [] }, { status: 429 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const digits = q.replace(/\D/g, "");
  const ci = { contains: q, mode: "insensitive" as const };
  const hits: { type: string; id: string; title: string; subtitle: string; href: string }[] = [];
  const pii = can(user.role, "buyers:pii");

  if (can(user.role, "buyers:read")) {
    const buyers = await db.buyer.findMany({
      where: { anonymizedAt: null, OR: [{ fullName: ci }, ...(pii ? [{ email: ci }] : []), ...(pii && digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : [])] },
      take: 6,
      select: { id: true, fullName: true, phoneNormalized: true, stage: true },
    });
    buyers.forEach((b) => hits.push({ type: "Buyer", id: b.id, title: b.fullName, subtitle: pii ? formatPhone(b.phoneNormalized) : maskPhone(b.phoneNormalized), href: `/admin/buyers/${b.id}` }));
  }
  if (can(user.role, "projects:read")) {
    const projects = await db.project.findMany({ where: { OR: [{ name: ci }, { marketingName: ci }, { location: { name: ci } }] }, take: 6, select: { id: true, name: true, location: { select: { name: true } }, developer: { select: { name: true } } } });
    projects.forEach((p) => hits.push({ type: "Project", id: p.id, title: p.name, subtitle: `${p.developer.name} · ${p.location.name}`, href: `/admin/projects/${p.id}` }));
    const units = await db.inventoryUnit.findMany({ where: { OR: [{ reference: ci }, { projectName: ci }, { unitNumber: ci }] }, take: 4, select: { id: true, reference: true, projectName: true, configuration: true } });
    units.forEach((u) => hits.push({ type: "Inventory", id: u.id, title: `${u.reference} · ${u.projectName}`, subtitle: u.configuration, href: `/admin/inventory/${u.id}` }));
  }
  if (can(user.role, "developers:read")) {
    const devs = await db.developer.findMany({ where: { name: ci }, take: 4, select: { id: true, name: true, stage: true } });
    devs.forEach((d) => hits.push({ type: "Developer", id: d.id, title: d.name, subtitle: d.stage.replace(/_/g, " ").toLowerCase(), href: `/admin/developers/${d.id}` }));
  }
  if (can(user.role, "demand:read")) {
    const camps = await db.campaign.findMany({ where: { name: ci }, take: 4, select: { id: true, name: true, status: true } });
    camps.forEach((c) => hits.push({ type: "Campaign", id: c.id, title: c.name, subtitle: c.status.replace(/_/g, " ").toLowerCase(), href: `/admin/demand/${c.id}` }));
  }
  return NextResponse.json({ hits });
}
