import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { visitRequestSchema } from "@/lib/validation";
import { verifyFollowToken } from "@/lib/follow-token";
import { getBuyerSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request";
import { notify } from "@/lib/notify";
import { PUBLIC_PROJECT_WHERE } from "@/lib/domain/compliance";

/** POST /api/visit-requests — a registered buyer requests a site visit or callback. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  if (!rateLimit(`visit:${ip}`, 6, 10 * 60_000).ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const buyerId = (typeof body?.token === "string" ? verifyFollowToken(body.token) : null) ?? (await getBuyerSession())?.id;
  if (!buyerId) return NextResponse.json({ error: "Your session has expired. Please register again or sign in." }, { status: 401 });
  const parsed = visitRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose a date and time window." }, { status: 422 });
  const project = await db.project.findFirst({ where: { id: parsed.data.projectId, ...PUBLIC_PROJECT_WHERE }, select: { id: true, name: true } });
  if (!project) return NextResponse.json({ error: "Project not available." }, { status: 404 });
  const date = new Date(`${parsed.data.preferredDate}T00:00:00`);
  if (date.getTime() < Date.now() - 864e5 || date.getTime() > Date.now() + 120 * 864e5) return NextResponse.json({ error: "Choose a date within the next four months." }, { status: 422 });
  const buyer = await db.buyer.findUniqueOrThrow({ where: { id: buyerId }, select: { fullName: true, assignedToId: true } });
  if (parsed.data.kind === "SITE_VISIT") {
    const dupe = await db.siteVisit.findFirst({ where: { buyerId, projectId: project.id, status: "REQUESTED" } });
    if (!dupe) await db.siteVisit.create({ data: { buyerId, projectId: project.id, status: "REQUESTED", requestedByBuyer: true, preferredWindow: `${parsed.data.preferredDate} · ${parsed.data.preferredWindow}`, notes: parsed.data.note ?? null } });
  } else {
    await db.task.create({ data: { title: `Callback requested by ${buyer.fullName} (${project.name}) — ${parsed.data.preferredWindow}`, dueAt: date, assigneeId: buyer.assignedToId, buyerId } });
  }
  await db.activity.create({ data: { type: "VISIT", title: parsed.data.kind === "SITE_VISIT" ? `Site visit requested — ${project.name}` : `Callback requested — ${project.name}`, body: `${parsed.data.preferredDate} · ${parsed.data.preferredWindow}${parsed.data.note ? `\n${parsed.data.note}` : ""}`, buyerId, projectId: project.id } });
  await notify("visit.requested", { title: `${parsed.data.kind === "SITE_VISIT" ? "Site visit" : "Callback"} requested: ${buyer.fullName}`, body: `${project.name} · ${parsed.data.preferredDate} · ${parsed.data.preferredWindow}`, link: `/admin/buyers/${buyerId}`, userIds: buyer.assignedToId ? [buyer.assignedToId] : [] });
  return NextResponse.json({ ok: true });
}
