import Link from "next/link";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { commissionTotals } from "@/lib/queries/commissions";
import { calculateCommission } from "@/lib/domain/commission";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { TableShell, Th } from "@/components/admin/table";
import { Card } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { SplitBar } from "@/components/ui/charts";
import { COMMISSION_BASIS, COMMISSION_STATUS, TRANSACTION_STATUS } from "@/lib/labels";
import { formatDate, formatINR, formatINRFull } from "@/lib/format";
import { createCommissionAction, recordTransactionAction } from "./actions";

export const metadata = { title: "Commissions" };

export default async function CommissionsPage() {
  const user = await requirePermission("commercial:read");
  const w = can(user.role, "commercial:write");
  const t = await commissionTotals();
  const [pending, buyers, projects, agreements] = await Promise.all([
    db.transaction.findMany({ where: { commission: null }, include: { buyer: { select: { fullName: true } }, project: { select: { name: true } }, agreement: { select: { title: true, commissionRate: true, basis: true, fixedAmount: true } } } }),
    w ? db.buyer.findMany({ where: { anonymizedAt: null, stage: { in: ["NEGOTIATION_FOLLOWUP", "BOOKING_IN_PROGRESS", "CONVERTED", "QUALIFIED", "VISIT_COMPLETED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : [],
    w ? db.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    w ? db.commercialAgreement.findMany({ where: { status: { in: ["SIGNED", "UNDER_REVIEW"] } }, select: { id: true, title: true, status: true } }) : [],
  ]);
  const example = calculateCommission({ basis: "AGREEMENT_VALUE", rate: 2, transactionValue: 2e7 });
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Commissions" subtitle="Calculated from the terms agreed with each developer. One record per transaction, so nothing is ever counted twice." actions={<a href="/api/admin/export/commissions" className={buttonClass("outline")}><Download className="size-4" /> Statement (CSV)</a>} />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {([
          ["Expected (agreed)", t.expected, "Earned under signed terms — not revenue until paid", false],
          ["Awaiting confirmation", t.awaiting, "Trigger not yet met", false],
          ["Eligible / invoice pending", t.eligible, "Ready to invoice", false],
          ["Invoiced", t.invoiced, "Sent to developers", false],
          ["Received — revenue", t.received, "Money actually received", true],
          ["Outstanding", t.outstanding, "Expected − received", false],
        ] as const).map(([l, v, sub, hero]) => (
          <div key={l} className={`rounded-3xl border p-5 shadow-soft ${hero ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ink-900/[0.07] bg-white text-ink-900"}`}>
            <p className={`text-[12px] ${hero ? "text-gold-300" : "text-stone-500"}`}>{l}</p>
            <p className="num mt-1 font-serif text-3xl">{formatINR(v)}</p>
            <p className={`mt-1 text-[11px] ${hero ? "text-ink-300" : "text-stone-400"}`}>{sub}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-stone-500">Commission is tracked separately from buyer benefits and savings — those live on campaigns and inventory and are never added to revenue. Only payments recorded as received count as revenue.</p>
      <Card className="mt-4 p-6"><SplitBar format={(v) => formatINR(v)} parts={[{ label: "Received", value: t.received, tone: "ink" }, { label: "Outstanding", value: t.outstanding, tone: "gold" }, { label: "Disputed (incl. in outstanding)", value: t.disputed, tone: "muted" }]} /></Card>

      <h2 className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-500">Commission records</h2>
      <TableShell>
        <thead className="border-b border-ink-900/5 bg-ivory-50/60"><tr><Th>Transaction</Th><Th>Value</Th><Th>Terms</Th><Th>Earned</Th><Th>Received</Th><Th>Outstanding</Th><Th>Status</Th><Th>Expected</Th></tr></thead>
        <tbody className="divide-y divide-ink-900/5">
          {t.rows.map((r) => (
            <tr key={r.id} className="hover:bg-ivory-50">
              <td className="px-4 py-3"><Link href={`/admin/commissions/${r.id}`} className="font-medium text-ink-900 hover:underline">{r.transaction.project.name} · {r.transaction.unitLabel}</Link><p className="text-[12px] text-stone-500">{r.transaction.buyer.fullName} · {r.transaction.project.developer.name}</p></td>
              <td className="num px-4 py-3">{formatINR(r.transaction.transactionValue)}</td>
              <td className="px-4 py-3 text-[12.5px]">{r.rate ? `${r.rate}% of ${COMMISSION_BASIS[r.basis].toLowerCase()}` : COMMISSION_BASIS[r.basis]}</td>
              <td className="num px-4 py-3 font-semibold">{formatINR(r.amountEarned)}</td>
              <td className="num px-4 py-3">{formatINR(r.received)}</td>
              <td className="num px-4 py-3">{formatINR(r.outstanding)}</td>
              <td className="px-4 py-3"><LabelBadge map={COMMISSION_STATUS} value={r.status} /></td>
              <td className={`px-4 py-3 text-[12.5px] ${r.expectedPaymentDate && r.expectedPaymentDate < new Date() && r.outstanding > 0 ? "font-medium text-clay-600" : "text-stone-600"}`}>{formatDate(r.expectedPaymentDate)}</td>
            </tr>
          ))}
          {!t.rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-stone-500">No commission records yet.</td></tr>}
        </tbody>
      </TableShell>

      {pending.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-500">Transactions without a commission record</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {pending.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex items-center justify-between gap-2"><p className="font-medium text-ink-900">{p.project.name} · {p.unitLabel}</p><LabelBadge map={TRANSACTION_STATUS} value={p.status} /></div>
                <p className="num text-[12.5px] text-stone-500">{p.buyer.fullName} · {formatINRFull(p.transactionValue)} · {p.agreement ? `${p.agreement.title}` : "No agreement linked — enter terms manually"}</p>
                {w && p.status !== "CANCELLED" && (
                  <ActionForm action={createCommissionAction} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input type="hidden" name="transactionId" value={p.id} />
                    <Select name="basis" defaultValue={p.agreement?.basis ?? "AGREEMENT_VALUE"} aria-label="Basis">{Object.entries(COMMISSION_BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                    <Input name="rate" inputMode="decimal" placeholder={p.agreement?.commissionRate ? `${p.agreement.commissionRate}%` : "Rate %"} aria-label="Rate" />
                    <Input type="date" name="expectedPaymentDate" aria-label="Expected payment date" />
                    <SubmitButton size="sm">Create</SubmitButton>
                  </ActionForm>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_380px]">
        {w && (
          <Card className="p-6">
            <h3 className="font-serif text-2xl text-ink-900">Record a transaction</h3>
            <ActionForm action={recordTransactionAction} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Buyer"><Select name="buyerId" defaultValue=""><option value="">Choose…</option>{buyers.map((b) => <option key={b.id} value={b.id}>{b.fullName}</option>)}</Select></Field>
              <Field label="Project"><Select name="projectId" defaultValue=""><option value="">Choose…</option>{projects.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
              <Field label="Agreement"><Select name="agreementId" defaultValue=""><option value="">None</option>{agreements.map((b) => <option key={b.id} value={b.id}>{b.title}{b.status !== "SIGNED" ? " (unsigned)" : ""}</option>)}</Select></Field>
              <Field label="Unit"><Input name="unitLabel" placeholder="T2-0804" /></Field>
              <Field label="Transaction value (₹)"><Input name="transactionValue" inputMode="numeric" /></Field>
              <Field label="Basic sale price (₹)"><Input name="basicSalePrice" inputMode="numeric" /></Field>
              <Field label="Booking date"><Input type="date" name="bookingDate" /></Field>
              <Field label="Registration date"><Input type="date" name="registrationDate" /></Field>
              <Field label="Status"><Select name="status" defaultValue="BOOKED">{Object.entries(TRANSACTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
              <div className="sm:col-span-3"><Checkbox name="createCommission" defaultChecked label="Create the commission record now using the agreement's terms" /></div>
              <div className="sm:col-span-3"><SubmitButton>Record transaction</SubmitButton></div>
            </ActionForm>
          </Card>
        )}
        <Card className="p-6 text-[13px]">
          <h3 className="font-semibold text-ink-900">How calculations work</h3>
          <p className="mt-2 text-stone-600">Commission = rate × the value the agreement names (agreement value, basic sale price, or another stated value), or a fixed amount per unit. A cancelled transaction never earns commission.</p>
          <div className="mt-4 rounded-2xl bg-ivory-100 p-4">
            <Badge tone="gold">Calculation example — illustrative</Badge>
            <p className="num mt-2 text-stone-700">{formatINRFull(2e7)} × 2% = <strong>{formatINRFull(example.amount)}</strong></p>
            <p className="mt-1 text-[12px] text-stone-500">Your actual amount depends on the signed agreement and its calculation basis. Taxes and accounting treatment are subject to professional advice.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
