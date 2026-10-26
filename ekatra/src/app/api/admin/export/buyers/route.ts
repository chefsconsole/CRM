import ExcelJS from "exceljs";
import { getTeamUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { buyerWhere, parseBuyerFilter } from "@/lib/domain/buyer-filters";
import { audit } from "@/lib/audit";
import { LEAD_STAGE, TIMELINE } from "@/lib/labels";
import { commitLabel, possessionLabel } from "@/lib/domain/timelines";
import { rateLimit } from "@/lib/rate-limit";

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(req: Request) {
  const user = await getTeamUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (!can(user.role, "buyers:export")) return new Response("Forbidden", { status: 403 });
  if (!rateLimit(`export:${user.id}`, 20, 60 * 60_000).ok) return new Response("Too many exports — try again later.", { status: 429 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const filter = parseBuyerFilter(url.searchParams);
  const buyers = await db.buyer.findMany({
    where: buyerWhere(filter, user.id),
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      assignedTo: { select: { name: true } },
      requirements: { where: { status: "ACTIVE" }, take: 1, orderBy: { updatedAt: "desc" } },
      interests: { where: { status: "ACTIVE" }, include: { project: { select: { name: true } } } },
      locationPreferences: { include: { location: { select: { name: true } } } },
    },
  });
  const header = ["Name", "Phone", "Email", "Stage", "Priority", "Budget min (₹)", "Budget max (₹)", "Could commit", "Possession wait", "Timeline", "Preferred locations", "Projects", "Assigned to", "Next follow-up", "Lead source", "Created"];
  const rows = buyers.map((b) => [
    b.fullName, b.phone ?? "", b.email ?? "", LEAD_STAGE[b.stage].label, b.priority, b.budgetMin ?? "", b.budgetMax ?? "",
    commitLabel(b.requirements[0]?.commitWithinDays), possessionLabel(b.requirements[0]?.possessionWaitMonths), TIMELINE[b.timeline],
    b.locationPreferences.map((l) => l.location.name).join("; "), b.interests.map((i) => `${i.project.name} (${i.tier.replace(/_/g, " ").toLowerCase()})`).join("; "),
    b.assignedTo?.name ?? "", b.nextFollowUpAt?.toISOString().slice(0, 10) ?? "", b.leadSource, b.createdAt.toISOString().slice(0, 10),
  ]);
  await audit(user, "buyers.export", "Buyer", null, { format, count: rows.length, filter: url.searchParams.toString() });
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const body = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="estateiq-buyers-${stamp}.csv"`, "Cache-Control": "no-store" } });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Buyers");
  ws.addRow(header).font = { bold: true };
  rows.forEach((r) => ws.addRow(r.map((c) => (typeof c === "string" && /^[=+\-@]/.test(c) ? `'${c}` : c))));
  ws.columns.forEach((c) => (c.width = 20));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="estateiq-buyers-${stamp}.xlsx"`, "Cache-Control": "no-store" } });
}
