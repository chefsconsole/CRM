import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getBuyerSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/request";
import { PUBLIC_PROJECT_WHERE } from "@/lib/domain/compliance";

/** POST /api/account/saved { projectId } — toggles a saved project for the signed-in buyer. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const me = await getBuyerSession();
  if (!me) return NextResponse.json({ error: "Sign in to save projects." }, { status: 401 });
  const parsed = z.object({ projectId: z.string().cuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid project." }, { status: 422 });
  const project = await db.project.findFirst({ where: { id: parsed.data.projectId, ...PUBLIC_PROJECT_WHERE }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const key = { buyerId_projectId: { buyerId: me.id, projectId: project.id } };
  const existing = await db.savedProject.findUnique({ where: key });
  if (existing) await db.savedProject.delete({ where: key });
  else await db.savedProject.create({ data: { buyerId: me.id, projectId: project.id } });
  return NextResponse.json({ saved: !existing });
}
