import { getTeamUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { commissionRows } from "@/lib/queries/commissions";
import { audit } from "@/lib/audit";
import { COMMISSION_BASIS, COMMISSION_STATUS } from "@/lib/labels";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: Request) {
  const user = await getTeamUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (!can(user.role, "commercial:read")) return new Response("Forbidden", { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  const rows = (await commissionRows()).filter((r) => !id || r.id === id);
  const header = ["Developer", "Project", "Unit", "Buyer", "Transaction value (₹)", "Basis", "Rate %", "Applicable value (₹)", "Commission earned (₹)", "Invoiced (₹)", "Invoice no.", "Received (₹)", "Outstanding (₹)", "Status", "Expected payment", "Payments"];
  const lines = rows.map((r) => [
    r.transaction.project.developer.name, r.transaction.project.name, r.transaction.unitLabel, r.transaction.buyer.fullName, r.transaction.transactionValue, COMMISSION_BASIS[r.basis], r.rate ?? "", r.applicableValue, r.amountEarned, r.amountInvoiced, r.invoiceNumber ?? "", r.received, r.outstanding, COMMISSION_STATUS[r.status].label, r.expectedPaymentDate?.toISOString().slice(0, 10) ?? "",
    r.payments.map((p) => `${p.receivedAt.toISOString().slice(0, 10)} ₹${p.amount}${p.reference ? ` (${p.reference})` : ""}`).join("; "),
  ]);
  await audit(user, "commissions.export", "Commission", id, { count: rows.length });
  const body = "﻿" + [["EstateIQ commission statement", new Date().toISOString().slice(0, 10)], [], header, ...lines].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="commission-statement-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
