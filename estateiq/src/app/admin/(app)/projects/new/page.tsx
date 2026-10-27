import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PROJECT_STATUS, PROPERTY_TYPE } from "@/lib/labels";
import { createProjectAction } from "../actions";

export const metadata = { title: "New project" };

export default async function NewProject() {
  await requirePermission("projects:write");
  const [developers, locations] = await Promise.all([
    db.developer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New project" subtitle="Start with identity. Prices, legal details and sources are added on the project page — and nothing is public until approved." crumbs={[{ href: "/admin/projects", label: "Projects" }]} />
      <Card className="p-6 md:p-8">
        <ActionForm action={createProjectAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Official project name" required className="sm:col-span-2"><Input name="name" required maxLength={120} /></Field>
          <Field label="Developer" required><Select name="developerId" defaultValue=""><option value="">Choose…</option>{developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Location" required><Select name="locationId" defaultValue=""><option value="">Choose…</option>{locations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Market"><Select name="market" defaultValue="Borivali West & Kandivali West">{["Borivali West & Kandivali West", "Thane", "Powai", "Adjacent — awaiting scope approval", "Other"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Project status"><Select name="status" defaultValue="ANNOUNCED">{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          <Field label="Segment"><Select name="segment" defaultValue="RESIDENTIAL"><option value="RESIDENTIAL">Residential</option><option value="COMMERCIAL">Commercial</option></Select></Field>
          <Field label="Deal type"><Select name="dealType" defaultValue="SALE"><option value="SALE">For sale</option><option value="RENT">For rent</option><option value="PRE_LEASED">Pre-leased</option></Select></Field>
          <Field label="Property type"><Select name="propertyType" defaultValue="APARTMENT">{Object.entries(PROPERTY_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Official developer project URL" hint="Only the developer's own page"><Input name="officialWebsite" type="url" placeholder="https://" /></Field>
          <Field label="Short description" className="sm:col-span-2"><Textarea name="description" /></Field>
          <div className="sm:col-span-2"><SubmitButton size="lg">Create project</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
