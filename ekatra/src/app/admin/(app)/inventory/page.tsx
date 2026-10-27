import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Upload, Download, Gem, Search } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { TableShell, Th, withParams } from "@/components/admin/table";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { APPROVAL, AVAILABILITY } from "@/lib/labels";
import { formatArea, formatDate, formatINR, relativeTime } from "@/lib/format";
import { compareInventory, inventoryGaps, priceClaim } from "@/lib/domain/inventory";
import { ClaimCell } from "@/components/admin/inventory-claim";
import { dueBucket } from "@/lib/time";
import { cn } from "@/lib/cn";

export const metadata = { title: "Available Inventory" };

const VIEWS = {
  all: "All units",
  attention: "Needs attention",
  review: "Comparison to review",
  saving: "Confirmed below builder",
  followup: "Follow-up due",
} as const;
type View = keyof typeof VIEWS;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("projects:read");
  const sp = await searchParams;
  const manager = ["SUPER_ADMIN", "OPERATIONS_MANAGER"].includes(user.role);
  const view: View = (sp.view as View) in VIEWS ? (sp.view as View) : "all";
  const q = sp.q?.trim();
  const where: Prisma.InventoryUnitWhereInput = {
    ...(manager ? {} : { confidentiality: { not: "RESTRICTED" } }),
    ...(sp.availability ? { availability: sp.availability as "AVAILABLE" } : {}),
    ...(sp.market ? { microMarket: sp.market } : {}),
    ...(sp.approval ? { approvalStatus: sp.approval as "APPROVED" } : {}),
    ...(q ? { OR: [{ reference: { contains: q, mode: "insensitive" } }, { projectName: { contains: q, mode: "insensitive" } }, { developerName: { contains: q, mode: "insensitive" } }, { unitNumber: { contains: q, mode: "insensitive" } }, { microMarket: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [all, markets] = await Promise.all([
    db.inventoryUnit.findMany({ where, orderBy: [{ availability: "asc" }, { updatedAt: "desc" }] }),
    db.inventoryUnit.findMany({ where: manager ? {} : { confidentiality: { not: "RESTRICTED" } }, distinct: ["microMarket"], select: { microMarket: true }, orderBy: { microMarket: "asc" } }),
  ]);
  const now = new Date();
  const rows = all.map((u) => {
    const c = compareInventory(u, now);
    const claim = priceClaim(c, u.comparisonReview);
    const gaps = inventoryGaps(u, now);
    const due = dueBucket(u.nextFollowUpAt, now);
    return { u, claim, gaps, blockers: gaps.filter((g) => g.severity === "blocker"), due };
  });
  const live = rows.filter((r) => !["SOLD", "WITHDRAWN"].includes(r.u.availability));
  const counts: Record<View, number> = {
    all: rows.length,
    attention: live.filter((r) => r.blockers.length).length,
    review: rows.filter((r) => r.claim.kind === "AWAITING_REVIEW").length,
    saving: rows.filter((r) => r.claim.kind === "CONFIRMED_SAVING").length,
    followup: live.filter((r) => r.due === "OVERDUE" || r.due === "TODAY").length,
  };
  const shown = rows.filter((r) =>
    view === "attention" ? live.includes(r) && r.blockers.length > 0
    : view === "review" ? r.claim.kind === "AWAITING_REVIEW"
    : view === "saving" ? r.claim.kind === "CONFIRMED_SAVING"
    : view === "followup" ? live.includes(r) && (r.due === "OVERDUE" || r.due === "TODAY")
    : true,
  );
  const available = rows.filter((r) => r.u.availability === "AVAILABLE");
  const w = can(user.role, "projects:write");
  const base = "/admin/inventory";
  const keep = { q: sp.q, market: sp.market, availability: sp.availability, view: sp.view };
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Available Inventory"
        subtitle="Our own flats — private, kept separate from developer launches, and never published without a manager's approval. A price difference is shown only against a current, dated, like-for-like developer quote."
        actions={w ? <>
          <a href="/api/admin/inventory/template" className={buttonClass("outline")}><Download className="size-4" /> CSV template</a>
          <ButtonLink href="/admin/inventory/import" variant="outline"><Upload className="size-4" /> Import</ButtonLink>
          <ButtonLink href="/admin/inventory/new"><Plus className="size-4" /> Add flat</ButtonLink>
        </> : undefined}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Available now" value={available.length} sub={`${rows.length} units tracked`} />
        <Stat label="Confirmed below builder" value={counts.saving} sub="Reviewed, like-for-like comparisons" tone="positive" />
        <Stat label="Comparisons to review" value={counts.review} sub="Calculated, not yet accepted" tone={counts.review ? "warning" : undefined} />
        <Stat label="Need attention" value={counts.attention} sub="Missing source, carpet, charges or verification" tone={counts.attention ? "danger" : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(VIEWS) as View[]).map((k) => (
          <Link key={k} href={withParams(base, keep, { view: k === "all" ? null : k })} className={cn("rounded-full border px-4 py-2 text-[13px]", view === k ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white text-stone-700")}>
            {VIEWS[k]} <span className="num opacity-60">{counts[k]}</span>
          </Link>
        ))}
        <form action={base} className="ml-auto flex min-w-[220px] flex-1 basis-full items-center gap-2 rounded-full border border-ink-900/10 bg-white px-4 sm:basis-auto sm:flex-none">
          {sp.view && <input type="hidden" name="view" value={sp.view} />}
          <Search className="size-4 text-stone-400" />
          <input name="q" defaultValue={q ?? ""} placeholder="Reference, project, unit, locality…" className="h-10 w-full bg-transparent text-[13px] focus:outline-none" aria-label="Search inventory" />
        </form>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={withParams(base, keep, { availability: null })} className={cn("rounded-full px-3 py-1.5 text-[12.5px]", !sp.availability ? "bg-ink-900 text-white" : "bg-ivory-200 text-stone-600")}>Any availability</Link>
        {Object.entries(AVAILABILITY).map(([k, v]) => <Link key={k} href={withParams(base, keep, { availability: sp.availability === k ? null : k })} className={cn("rounded-full px-3 py-1.5 text-[12.5px]", sp.availability === k ? "bg-ink-900 text-white" : "bg-ivory-200 text-stone-600")}>{v.label}</Link>)}
        {markets.length > 1 && <span className="mx-1 h-7 w-px bg-ink-900/10" />}
        {markets.length > 1 && markets.map((m) => <Link key={m.microMarket} href={withParams(base, keep, { market: sp.market === m.microMarket ? null : m.microMarket })} className={cn("rounded-full px-3 py-1.5 text-[12.5px]", sp.market === m.microMarket ? "bg-gold-300 text-ink-950" : "bg-ivory-200 text-stone-600")}>{m.microMarket}</Link>)}
      </div>

      {shown.length ? (
        <TableShell>
          <thead className="border-b border-ink-900/5 bg-ivory-50/60"><tr><Th>Unit</Th><Th>Configuration</Th><Th>Asking</Th><Th>Developer quote</Th><Th>Difference</Th><Th>Availability</Th><Th>Information</Th><Th>Follow-up</Th><Th>Status</Th></tr></thead>
          <tbody className="divide-y divide-ink-900/5">
            {shown.map(({ u, claim, gaps, blockers, due }) => (
              <tr key={u.id} className="hover:bg-ivory-50">
                <td className="px-4 py-3"><Link href={`/admin/inventory/${u.id}`} className="font-medium text-ink-900 hover:underline">{u.reference}</Link><p className="text-[12px] text-stone-500">{u.projectName}{u.unitNumber ? ` · ${u.unitNumber}` : ""} · {u.microMarket}</p></td>
                <td className="px-4 py-3 text-[13px]">{u.configuration}<p className="text-[12px] text-stone-500">{u.carpetArea ? formatArea(u.carpetArea, u.carpetArea) : "Carpet —"}{u.floor ? ` · Floor ${u.floor}` : ""}</p></td>
                <td className="num whitespace-nowrap px-4 py-3 font-semibold text-ink-900">{formatINR(u.askingPrice)}</td>
                <td className="num whitespace-nowrap px-4 py-3 text-[13px]">{u.builderQuote ? <>{formatINR(u.builderQuote)}<p className="text-[11.5px] text-stone-500">{u.builderQuoteDate ? formatDate(u.builderQuoteDate) : "undated"}</p></> : <span className="text-stone-400">—</span>}</td>
                <td className="px-4 py-3 text-[13px]"><ClaimCell claim={claim} /></td>
                <td className="px-4 py-3"><LabelBadge map={AVAILABILITY} value={u.availability} /><p className="mt-1 text-[11.5px] text-stone-500">{u.lastVerifiedAt ? `Verified ${relativeTime(u.lastVerifiedAt)}` : "Never verified"}</p></td>
                <td className="px-4 py-3 text-[12.5px]">{blockers.length ? <span className="text-clay-600" title={blockers.map((g) => g.label).join("\n")}>{blockers.length} blocker{blockers.length > 1 ? "s" : ""}</span> : <span className="text-sage-600">Complete</span>}{gaps.length - blockers.length > 0 && <p className="text-stone-500" title={gaps.filter((g) => g.severity === "info").map((g) => g.label).join("\n")}>{gaps.length - blockers.length} to add</p>}</td>
                <td className={cn("px-4 py-3 text-[12.5px]", due === "OVERDUE" ? "font-medium text-clay-600" : due === "TODAY" ? "font-medium text-amber-600" : "text-stone-600")}>{u.nextFollowUpAt ? formatDate(u.nextFollowUpAt) : "—"}</td>
                <td className="px-4 py-3">{u.isPublic ? <Badge tone="positive">Public</Badge> : <LabelBadge map={APPROVAL} value={u.approvalStatus} />}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      ) : rows.length ? (
        <EmptyState icon={<Gem className="size-5" />} title="Nothing in this view" body="Try another view or clear the filters." action={<ButtonLink href={base} variant="outline">Show all units</ButtonLink>} />
      ) : (
        <EmptyState icon={<Gem className="size-5" />} title="No flats yet" body="Add your available flats one by one, or download the CSV template and import them together. Nothing is invented — every unit comes from you." action={w ? <div className="flex flex-wrap justify-center gap-2"><ButtonLink href="/admin/inventory/new">Add a flat</ButtonLink><ButtonLink href="/admin/inventory/import" variant="outline">Import CSV</ButtonLink></div> : undefined} />
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: "positive" | "warning" | "danger" }) {
  return (
    <div className="rounded-2xl border border-ink-900/[0.07] bg-white px-5 py-4">
      <p className="text-[12.5px] text-stone-500">{label}</p>
      <p className={cn("num mt-1 font-serif text-3xl", tone === "positive" ? "text-sage-600" : tone === "warning" ? "text-amber-600" : tone === "danger" ? "text-clay-600" : "text-ink-900")}>{value}</p>
      <p className="text-[11.5px] text-stone-500">{sub}</p>
    </div>
  );
}
