import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { InventoryFields } from "@/components/admin/inventory-form";
import { Card } from "@/components/ui/card";
import { saveUnitAction } from "../actions";

export const metadata = { title: "Add flat" };

export default async function NewUnit() {
  await requirePermission("projects:write");
  const [projects, locs] = await Promise.all([
    db.project.findMany({ where: { isDemo: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Add a flat" subtitle="Private by default. Enter only facts you can support with documents." crumbs={[{ href: "/admin/inventory", label: "Available Inventory" }]} />
      <Card className="p-6 md:p-8">
        <ActionForm action={saveUnitAction}>
          <InventoryFields projects={projects} markets={locs.map((l) => l.name)} />
          <div className="mt-8"><SubmitButton size="lg">Save flat</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
