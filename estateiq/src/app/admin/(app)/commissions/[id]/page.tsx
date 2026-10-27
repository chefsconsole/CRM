import { notFound } from "next/navigation";
import { toISTDateInput } from "@/lib/time";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { commissionRows } from "@/lib/queries/commissions";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Card } from "@/components/ui/card";
import { LabelBadge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { COMMISSION_BASIS, COMMISSION_STATUS } from "@/lib/labels";
import { formatDate, formatINR, formatINRFull } from "@/lib/format";
import { recordPaymentAction, updateCommissionAction } from "../actions";

export const metadata = { title: "Commission" };
const d = toISTDateInput;

export default async function CommissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("commercial:read");
  const { id } = await params;
  const c = (await commissionRows()).find((r) => r.id === id);
  if (!c) notFound();
  const w = can(user.role, "commercial:write");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader crumbs={[{ href: "/admin/commissions", label: "Commissions" }]} title={`${c.transaction.project.name} · ${c.transaction.unitLabel}`} subtitle={<span className="flex items-center gap-2">{c.transaction.buyer.fullName} · {c.transaction.project.developer.name} <LabelBadge map={COMMISSION_STATUS} value={c.status} /></span>} actions={<a href={`/api/admin/export/commissions?id=${c.id}`} className={buttonClass("outline")}><Download className="size-4" /> Statement</a>} />
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Earned", c.amountEarned], ["Invoiced", c.amountInvoiced], ["Received", c.received], ["Outstanding", c.outstanding]].map(([l, v]) => <Card key={l as string} className="p-5"><p className="text-[12px] text-stone-500">{l}</p><p className="num mt-1 text-2xl font-semibold text-ink-900">{formatINR(v as number)}</p></Card>)}
      </div>
      <Card className="mt-4 p-6 text-[13px] text-stone-700">
        <p className="num">{c.basis === "FIXED_AMOUNT" ? `Fixed amount: ${formatINRFull(c.amountEarned)}` : `${formatINRFull(c.applicableValue)} (${COMMISSION_BASIS[c.basis].toLowerCase()}) × ${c.rate}% = ${formatINRFull(c.amountEarned)}`}</p>
        <p className="mt-1 text-stone-500">Transaction value {formatINRFull(c.transaction.transactionValue)} · agreement: {c.agreement?.title ?? "none linked"}</p>
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-semibold text-ink-900">Status & invoicing</h3>
          <ActionForm action={updateCommissionAction} className="mt-4 space-y-3">
            <input type="hidden" name="commissionId" value={c.id} />
            <fieldset disabled={!w} className="space-y-3">
              <Field label="Status"><Select name="status" defaultValue={c.status}>{Object.entries(COMMISSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Invoiced amount (₹)"><Input name="amountInvoiced" inputMode="numeric" defaultValue={c.amountInvoiced} /></Field>
                <Field label="Invoice number"><Input name="invoiceNumber" defaultValue={c.invoiceNumber ?? ""} /></Field>
                <Field label="Invoice date"><Input type="date" name="invoiceDate" defaultValue={d(c.invoiceDate)} /></Field>
                <Field label="Expected payment"><Input type="date" name="expectedPaymentDate" defaultValue={d(c.expectedPaymentDate)} /></Field>
              </div>
              <Field label="Tax / accounting note" hint="Subject to professional advice"><Input name="taxNote" defaultValue={c.taxNote ?? ""} /></Field>
              <Field label="Notes"><Textarea name="notes" defaultValue={c.notes ?? ""} /></Field>
            </fieldset>
            {w && <SubmitButton>Save</SubmitButton>}
          </ActionForm>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-ink-900">Payments received</h3>
          <ul className="mt-3 space-y-2">
            {c.payments.map((p) => <li key={p.id} className="flex justify-between rounded-xl bg-ivory-100 px-3 py-2.5 text-[13px]"><span>{formatDate(p.receivedAt)}{p.reference ? ` · ${p.reference}` : ""}</span><span className="num font-semibold">{formatINRFull(p.amount)}</span></li>)}
            {!c.payments.length && <li className="text-[13px] text-stone-500">No payments yet.</li>}
          </ul>
          {w && c.outstanding > 0 && (
            <ActionForm action={recordPaymentAction} resetOnSuccess className="mt-4 grid grid-cols-2 gap-2">
              <input type="hidden" name="commissionId" value={c.id} />
              <Field label="Amount (₹)"><Input name="amount" inputMode="numeric" placeholder={String(c.outstanding)} /></Field>
              <Field label="Received on"><Input type="date" name="receivedAt" defaultValue={d(new Date())} /></Field>
              <Field label="Reference" className="col-span-2"><Input name="reference" placeholder="NEFT / UTR number" /></Field>
              <div className="col-span-2"><SubmitButton size="sm">Record payment</SubmitButton></div>
            </ActionForm>
          )}
          <p className="mt-3 text-[12px] text-stone-500">Payments cannot exceed the amount earned; status updates automatically.</p>
        </Card>
      </div>
    </div>
  );
}
