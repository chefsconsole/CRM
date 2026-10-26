import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { INVENTORY_COLUMNS } from "@/lib/inventory-csv";
import { importInventoryAction } from "../actions";

export const metadata = { title: "Import inventory" };

export default async function ImportPage() {
  await requirePermission("projects:write");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Import inventory" subtitle="Check the file first — nothing is saved until you choose Import. Existing references are never overwritten." crumbs={[{ href: "/admin/inventory", label: "Available Inventory" }]} actions={<a href="/api/admin/inventory/template" className={buttonClass("outline")}><Download className="size-4" /> Download template</a>} />
      <Card className="p-6 md:p-8">
        <ActionForm action={importInventoryAction} className="space-y-4">
          <input type="file" name="file" accept=".csv,text/csv" required className="block w-full rounded-2xl border border-dashed border-ink-900/20 bg-ivory-50 p-6 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-ink-900 file:px-4 file:py-2 file:text-white" />
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="mode" value="check" variant="outline">Check file</SubmitButton>
            <SubmitButton name="mode" value="import">Import valid rows</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <Card className="mt-5 p-6 text-[13px] text-stone-600">
        <h3 className="font-semibold text-ink-900">Columns</h3>
        <p className="mt-2">Required: <code>reference, project_name, micro_market, configuration, asking_price_inr</code>. Dates as YYYY-MM-DD. Availability: AVAILABLE, ON_HOLD, UNDER_NEGOTIATION, SOLD, WITHDRAWN, UNCONFIRMED. Confidentiality: PUBLIC_WHEN_APPROVED, INTERNAL, RESTRICTED. Full guide in <code>docs/INVENTORY_IMPORT.md</code>.</p>
        <p className="mt-3 break-words font-mono text-[11.5px] text-stone-500">{INVENTORY_COLUMNS.join(", ")}</p>
      </Card>
    </div>
  );
}
