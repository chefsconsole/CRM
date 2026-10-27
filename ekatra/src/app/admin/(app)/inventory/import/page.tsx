import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { InventoryImport } from "@/components/admin/inventory-import";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { INVENTORY_COLUMNS } from "@/lib/inventory-csv";
import { confirmImportAction, previewImportAction } from "../actions";

export const metadata = { title: "Import inventory" };

export default async function ImportPage() {
  await requirePermission("projects:write");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Import inventory"
        subtitle="Upload your spreadsheet, check every row in the preview, then confirm. Duplicates (same reference, or same project and unit number) are never saved twice. Imported units stay private until a manager approves them."
        crumbs={[{ href: "/admin/inventory", label: "Available Inventory" }]}
        actions={<a href="/api/admin/inventory/template" className={buttonClass("outline")}><Download className="size-4" /> Download template</a>}
      />
      <InventoryImport preview={previewImportAction} confirm={confirmImportAction} />
      <Card className="mt-5 p-6 text-[13px] text-stone-600">
        <h3 className="font-semibold text-ink-900">Filling the template</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Required: <code>reference, project_name, micro_market, configuration, asking_price_inr</code>.</li>
          <li>Amounts: <code>21500000</code>, <code>2,15,00,000</code>, <code>2.15 Cr</code> or <code>85 L</code> all work.</li>
          <li>Dates: <code>2026-10-12</code> or <code>12/10/2026</code> (day first).</li>
          <li>Availability: AVAILABLE, ON_HOLD, UNDER_NEGOTIATION, SOLD, WITHDRAWN, UNCONFIRMED. Confidentiality: INTERNAL (default), RESTRICTED (managers only), PUBLIC_WHEN_APPROVED.</li>
          <li>The builder quote is only used for a comparison when it has a date, a source and evidence, and matches the unit (same configuration, carpet area within 5%, quote under 90 days old).</li>
        </ul>
        <p className="mt-3 break-words font-mono text-[11.5px] text-stone-500">{INVENTORY_COLUMNS.join(", ")}</p>
      </Card>
    </div>
  );
}
