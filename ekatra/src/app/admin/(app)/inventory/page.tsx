import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Upload, Download, Gem } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { TableShell, Th, withParams } from "@/components/admin/table";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { APPROVAL, AVAILABILITY } from "@/lib/labels";
import { formatArea, formatINR, relativeTime } from "@/lib/format";
import { compareInventory } from "@/lib/domain/inventory";
import { cn } from "@/lib/cn";

export const metadata = { title: "Available Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("projects:read");
  const sp = await searchParams;
  const manager = ["SUPER_ADMIN", "OPERATIONS_MANAGER"].includes(user.role);
  const where: Prisma.InventoryUnitWhereInput = {
    ...(manager ? {} : { confidentiality: { not: "RESTRICTED" } }),
    ...(sp.availability ? { availability: sp.availability as "AVAILABLE" } : {}),
    ...(sp.market ? { microMarket: sp.market } : {}),
    ...(sp.approval ? { approvalStatus: sp.approval as "APPROVED" } : {}),
  };
  const [units, markets, totals] = await Promise.all([
    db.inventoryUnit.findMany({ where, orderBy: [{ availability: "asc" }, { updatedAt: "desc" }] }),
    db.inventoryUnit.findMany({ distinct: ["microMarket"], select: { microMarket: true }, orderBy: { microMarket: "asc" } }),
    db.inventoryUnit.groupBy({ by: ["availability"], _count: true }),
  ]);
  const w = can(user.role, "projects:write");
  const base = "/admin/inventory";
  const count = (a: string) => totals.find((t) => t.availability === a)?._count ?? 0;
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Available Inventory"
        subtitle="Our own flats — kept separate from developer launches and private until you approve them. Prices are compared only against valid, like-for-like builder quotes."
        actions={w ? <>
          <a href="/api/admin/inventory/template" className={buttonClass("outline")}><Download className="size-4" /> CSV template</a>
          <ButtonLink href="/admin/inventory/import" variant="outline"><Upload className="size-4" /> Import</ButtonLink>
          <ButtonLink href="/admin/inventory/new"><Plus className="size-4" /> Add flat</ButtonLink>
        </> : undefined}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={base} className={cn("rounded-full border px-4 py-2 text-[13px]", !sp.availability ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white")}>All <span className="num opacity-60">{units.length && !sp.availability ? units.length : ""}</span></Link>
        {Object.entries(AVAILABILITY).map(([k, v]) => <Link key={k} href={withParams(base, { market: sp.market }, { availability: k })} className={cn("rounded-full border px-4 py-2 text-[13px]", sp.availability === k ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white text-stone-700")}>{v.label} <span className="num opacity-60">{count(k)}</span></Link>)}
        {markets.length > 1 && <span className="mx-1 h-8 w-px bg-ink-900/10" />}
        {markets.length > 1 && markets.map((m) => <Link key={m.microMarket} href={withParams(base, { availability: sp.availability }, { market: sp.market === m.microMarket ? null : m.microMarket })} className={cn("rounded-full px-3 py-2 text-[12.5px]", sp.market === m.microMarket ? "bg-gold-300 text-ink-950" : "bg-ivory-200 text-stone-600")}>{m.microMarket}</Link>)}
      </div>
      {units.length ? (
        <TableShell>
          <thead className="border-b border-ink-900/5 bg-ivory-50/60"><tr><Th>Unit</Th><Th>Configuration</Th><Th>Asking</Th><Th>Builder quote</Th><Th>Difference</Th><Th>Availability</Th><Th>Verified</Th><Th>Status</Th></tr></thead>
          <tbody className="divide-y divide-ink-900/5">
            {units.map((u) => {
              const c = compareInventory(u);
              const basis = c.allIn ?? c.headline;
              return (
                <tr key={u.id} className="hover:bg-ivory-50">
                  <td className="px-4 py-3"><Link href={`/admin/inventory/${u.id}`} className="font-medium text-ink-900 hover:underline">{u.reference}</Link><p className="text-[12px] text-stone-500">{u.projectName}{u.unitNumber ? ` · ${u.unitNumber}` : ""} · {u.microMarket}</p></td>
                  <td className="px-4 py-3 text-[13px]">{u.configuration}<p className="text-[12px] text-stone-500">{formatArea(u.carpetArea, u.carpetArea)}{u.floor ? ` · Floor ${u.floor}` : ""}</p></td>
                  <td className="num px-4 py-3 font-semibold text-ink-900">{formatINR(u.askingPrice)}</td>
                  <td className="num px-4 py-3 text-[13px]">{u.builderQuote ? formatINR(u.builderQuote) : <span className="text-stone-400">—</span>}</td>
                  <td className="px-4 py-3 text-[13px]">
                    {c.status === "COMPARABLE" && basis ? <span className={cn("num font-semibold", basis.diff < 0 ? "text-sage-600" : "text-clay-600")}>{basis.diff < 0 ? "−" : "+"}{formatINR(Math.abs(basis.diff))} ({basis.pct > 0 ? "+" : ""}{basis.pct}%){c.allIn ? <span className="ml-1 text-[11px] font-normal text-stone-500">all-in</span> : <span className="ml-1 text-[11px] font-normal text-stone-500">headline</span>}</span> : <Badge tone={c.status === "NO_QUOTE" ? "muted" : "warning"} title={c.problems.join("; ")}>{c.status === "NO_QUOTE" ? "No quote" : "Not comparable"}</Badge>}
                  </td>
                  <td className="px-4 py-3"><LabelBadge map={AVAILABILITY} value={u.availability} /></td>
                  <td className="px-4 py-3 text-[12.5px] text-stone-600">{u.lastVerifiedAt ? relativeTime(u.lastVerifiedAt) : "Never"}</td>
                  <td className="px-4 py-3">{u.isPublic ? <Badge tone="positive">Public</Badge> : <LabelBadge map={APPROVAL} value={u.approvalStatus} />}</td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      ) : (
        <EmptyState icon={<Gem className="size-5" />} title="No flats yet" body="Add your 20–30 available flats one by one, or download the CSV template and import them together. Nothing is invented — every unit comes from you." action={w ? <div className="flex flex-wrap justify-center gap-2"><ButtonLink href="/admin/inventory/new">Add a flat</ButtonLink><ButtonLink href="/admin/inventory/import" variant="outline">Import CSV</ButtonLink></div> : undefined} />
      )}
    </div>
  );
}
