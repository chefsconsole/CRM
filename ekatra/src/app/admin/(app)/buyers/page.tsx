import Link from "next/link";
import { Suspense } from "react";
import { Download, LayoutList, Columns3, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { listBuyers, PAGE_SIZE, pipelineBuyers, resolveFilter } from "@/lib/queries/buyers";
import { PRESET_SEGMENTS, serializeBuyerFilter } from "@/lib/domain/buyer-filters";
import { PageHeader } from "@/components/admin/page-header";
import { BuyerFilterBar } from "@/components/admin/buyer-filters";
import { BuyerTable } from "@/components/admin/buyer-table";
import { Pipeline } from "@/components/admin/pipeline";
import { SegmentsPanel } from "@/components/admin/segments";
import { Pagination, SortTh, Th, withParams } from "@/components/admin/table";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

export const metadata = { title: "Buyers" };

export default async function BuyersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("buyers:read");
  const sp = await searchParams;
  const view = sp.view === "pipeline" ? "pipeline" : "table";
  const page = Math.max(1, Number(sp.page) || 1);
  const { filter, segmentName } = await resolveFilter(sp);
  const query = serializeBuyerFilter(filter);
  const [list, pipe, locations, projects, reps, campaigns, saved] = await Promise.all([
    view === "table" ? listBuyers(filter, sp.sort === "newest" ? "createdAt:desc" : sp.sort, page, user) : Promise.resolve(null),
    view === "pipeline" ? pipelineBuyers(filter, user) : Promise.resolve(null),
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ where: { interests: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true, role: { in: ["SALES_REP", "OPERATIONS_MANAGER", "SUPER_ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.campaign.findMany({ where: { status: { notIn: ["CLOSED"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.savedSegment.findMany({ where: { OR: [{ isShared: true }, { ownerId: user.id }] }, orderBy: { name: "asc" }, select: { id: true, name: true, ownerId: true } }),
  ]);
  const canWrite = can(user.role, "buyers:write");
  const canExport = can(user.role, "buyers:export");
  const params = { ...sp };
  const base = "/admin/buyers";
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title={segmentName ?? "Buyers"}
        subtitle="Every customer in one profile — requirement, readiness, possession window and history. Priority explains itself on each profile."
        actions={
          <>
            <div className="flex rounded-full border border-ink-900/10 bg-white p-1">
              <Link href={withParams(base, params, { view: null, page: null })} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]", view === "table" ? "bg-ink-900 text-white" : "text-stone-600")}><LayoutList className="size-4" /> Table</Link>
              <Link href={withParams(base, params, { view: "pipeline", page: null })} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]", view === "pipeline" ? "bg-ink-900 text-white" : "text-stone-600")}><Columns3 className="size-4" /> Pipeline</Link>
            </div>
            {canExport && (
              <>
                <a href={`/api/admin/export/buyers?format=csv&${query}`} className={buttonClass("outline", "md")}><Download className="size-4" /> CSV</a>
                <a href={`/api/admin/export/buyers?format=xlsx&${query}`} className={buttonClass("outline", "md")}><Download className="size-4" /> Excel</a>
              </>
            )}
            {canWrite && <ButtonLink href="/admin/buyers/new"><Plus className="size-4" /> New buyer</ButtonLink>}
          </>
        }
      />
      <div className="grid gap-6 2xl:grid-cols-[230px_1fr]">
        <aside className="hidden 2xl:block">
          <SegmentsPanel presets={PRESET_SEGMENTS} saved={saved} active={sp.segment} query={sp.segment ? "" : query} canDeleteIds={saved.filter((s) => s.ownerId === user.id || ["SUPER_ADMIN", "OPERATIONS_MANAGER"].includes(user.role)).map((s) => s.id)} />
        </aside>
        <div className="min-w-0 space-y-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none 2xl:hidden">
            {PRESET_SEGMENTS.map((p) => <Link key={p.id} href={`/admin/buyers?segment=${p.id}`} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[12.5px]", sp.segment === p.id ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white text-stone-700")}>{p.name}</Link>)}
          </div>
          <Suspense>
            <BuyerFilterBar locations={locations.map((l) => ({ value: l.id, label: l.name }))} projects={projects.map((p) => ({ value: p.id, label: p.name }))} reps={reps.map((r) => ({ value: r.id, label: r.name }))} />
          </Suspense>
          {list && (list.rows.length ? (
            <>
              <BuyerTable
                rows={list.rows}
                canWrite={canWrite}
                reps={reps.map((r) => ({ value: r.id, label: r.name }))}
                campaigns={campaigns.map((c) => ({ value: c.id, label: c.name }))}
                head={
                  <>
                    <SortTh label="Buyer" field="name" base={base} params={params} />
                    <SortTh label="Priority" field="priority" base={base} params={params} />
                    <SortTh label="Stage" field="stage" base={base} params={params} />
                    <Th>Interest</Th>
                    <SortTh label="Budget" field="budget" base={base} params={params} />
                    <Th>Could commit</Th>
                    <Th>Owner</Th>
                    <SortTh label="Follow-up" field="followup" base={base} params={params} />
                  </>
                }
              />
              <Pagination base={base} params={params} page={page} pageSize={PAGE_SIZE} total={list.total} />
            </>
          ) : (
            <EmptyState title="No buyers match" body="Try removing a filter, or add a buyer you met offline." action={canWrite ? <ButtonLink href="/admin/buyers/new">New buyer</ButtonLink> : undefined} />
          ))}
          {pipe && <Pipeline canWrite={canWrite} cards={pipe.map((b) => ({ id: b.id, fullName: b.fullName, stage: b.stage, priority: b.priority, budgetMin: b.budgetMin, budgetMax: b.budgetMax, project: b.interests[0]?.project.name ?? null, owner: b.assignedTo?.name ?? null }))} />}
        </div>
      </div>
    </div>
  );
}
