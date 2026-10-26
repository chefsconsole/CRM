import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { RequirementFields } from "@/components/admin/requirement-fields";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { createBuyerAction } from "../actions";

export const metadata = { title: "New buyer" };

export default async function NewBuyer() {
  const user = await requirePermission("buyers:write");
  const [locations, reps] = await Promise.all([
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New buyer" subtitle="Duplicates are detected by phone and email before anything is saved." crumbs={[{ href: "/admin/buyers", label: "Buyers" }]} />
      <ActionForm action={createBuyerAction} className="space-y-5">
        <Card className="p-6 md:p-8">
          <h2 className="mb-5 font-serif text-2xl text-ink-900">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required><Input name="fullName" required maxLength={80} /></Field>
            <Field label="Mobile number" required hint="10-digit Indian mobile"><Input name="phone" required inputMode="tel" placeholder="98200 12345" /></Field>
            <Field label="Email"><Input name="email" type="email" /></Field>
            <Field label="Lead source"><Select name="leadSource" defaultValue="Walk-in">{["Walk-in", "Referral", "Phone", "Website", "Instagram", "Google Ads", "Event", "Developer referral"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Assign to"><Select name="assignedToId" defaultValue={user.role === "SALES_REP" ? user.id : ""}><option value="">Unassigned</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            <Field label="Next follow-up"><Input name="nextFollowUpAt" type="datetime-local" /></Field>
          </div>
          <Field label="Notes" className="mt-4"><Textarea name="notes" /></Field>
        </Card>
        <Card className="p-6 md:p-8">
          <h2 className="mb-5 font-serif text-2xl text-ink-900">Requirement</h2>
          <RequirementFields locations={locations} />
        </Card>
        <Card className="p-6">
          <Checkbox name="consentContact" required label="The buyer agreed to be contacted about this requirement (recorded as a consent record)." />
        </Card>
        <div className="flex justify-end"><SubmitButton size="lg">Create buyer</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
