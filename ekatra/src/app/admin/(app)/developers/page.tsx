import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { TableShell, Th } from "@/components/admin/table";
import { DevStageSelect } from "@/components/admin/dev-stage";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DEVELOPER_STAGE, DEVELOPER_STAGES, NEGOTIATION_STATUS } from "@/lib/labels";
import { formatDate, formatINR, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Developers" };

export default async function DevelopersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("developers:read");
  const { tab = "pipeline" } = await searchParams;
  const commercial = can(user.role, "commercial:read");
  const w = can(user.role, "developers:write");
  const devs = await db.developer.findMany({
    orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    include: { relationshipOwner: { select: { name: true } }, _count: { select: { projects: true, negotiations: true, contacts: true } }, agreements: { where: { status: "SIGNED" }, select: { id: true } } },
  });
  const negotiations = commercial && tab === "negotiations" ? await db.negotiation.findMany({ orderBy: [{ nextActionAt: { sort: "asc", nulls: "last" } }], include: { developer: { select: { name: true } }, project: { select: { name: true } }, owner: { select: { name: true } } } }) : [];
  const tabs = [{ k: "pipeline", l: "Relationship pipeline" }, { k: "list", l: "All developers" }, ...(commercial ? [{ k: "negotiations", l: "Negotiations" }] : [])];
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title="Developers" subtitle="Who you know, where each relationship stands, and what was proposed. Commercial terms are visible only to authorised roles." actions={w ? <ButtonLink href="/admin/developers/new"><Plus className="size-4" /> New developer</ButtonLink> : undefined} />
      <div className="mb-6 inline-flex gap-1 rounded-full border border-ink-900/[0.07] bg-white p-1 shadow-soft">
        {tabs.map((t) => <Link key={t.k} href={`/admin/developers?tab=${t.k}`} className={cn("rounded-full px-4 py-2 text-[13px] font-medium", tab === t.k ? "bg-ink-900 text-white" : "text-stone-600")}>{t.l}</Link>)}
      </div>

      {tab === "pipeline" && (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          {DEVELOPER_STAGES.map((s) => {
            const col = devs.filter((d) => d.stage === s);
            return (
              <section key={s} className="flex w-[250px] shrink-0 flex-col rounded-3xl border border-ink-900/[0.06] bg-ivory-50/70 p-2">
                <header className="flex items-center justify-between px-3 py-2.5"><p className="text-[13px] font-semibold text-ink-900">{DEVELOPER_STAGE[s].label}</p><span className="num rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-500 shadow-soft">{col.length}</span></header>
                <div className="flex flex-col gap-2">
                  {col.map((d) => (
                    <article key={d.id} className="rounded-2xl border border-ink-900/[0.06] bg-white p-3.5 shadow-soft">
                      <Link href={`/admin/developers/${d.id}`} className="font-medium text-ink-900 hover:underline">{d.name}</Link>
                      <p className="mt-0.5 text-[12px] text-stone-500">{d._count.projects} project(s){d.relationshipOwner ? ` · ${d.relationshipOwner.name}` : ""}</p>
                      {d.nextFollowUpAt && <p className={`mt-1 text-[12px] ${d.nextFollowUpAt < new Date() ? "text-clay-600" : "text-stone-500"}`}>Follow-up {relativeTime(d.nextFollowUpAt)}</p>}
                      {d.isUnverifiedRealName && <Badge tone="warning" className="mt-1">Unverified</Badge>}
                      {w && <div className="mt-2"><DevStageSelect id={d.id} stage={d.stage} /></div>}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "list" && (
        <TableShell>
          <thead className="border-b border-ink-900/5 bg-ivory-50/60"><tr><Th>Developer</Th><Th>Stage</Th><Th>Projects</Th><Th>Contacts</Th><Th>Owner</Th><Th>Next follow-up</Th>{commercial && <Th>Agreement</Th>}</tr></thead>
          <tbody className="divide-y divide-ink-900/5">
            {devs.map((d) => (
              <tr key={d.id} className="hover:bg-ivory-50">
                <td className="px-4 py-3"><Link href={`/admin/developers/${d.id}`} className="font-medium text-ink-900 hover:underline">{d.name}</Link>{d.isDemo && <Badge tone="muted" className="ml-2">Demo</Badge>}</td>
                <td className="px-4 py-3"><LabelBadge map={DEVELOPER_STAGE} value={d.stage} /></td>
                <td className="num px-4 py-3">{d._count.projects}</td>
                <td className="num px-4 py-3">{d._count.contacts}</td>
                <td className="px-4 py-3 text-[13px] text-stone-600">{d.relationshipOwner?.name ?? "—"}</td>
                <td className="px-4 py-3 text-[13px] text-stone-600">{d.nextFollowUpAt ? formatDate(d.nextFollowUpAt) : "—"}</td>
                {commercial && <td className="px-4 py-3">{d.agreements.length ? <Badge tone="positive">Signed</Badge> : <span className="text-[12px] text-stone-400">None</span>}</td>}
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {tab === "negotiations" && (
        <TableShell>
          <thead className="border-b border-ink-900/5 bg-ivory-50/60"><tr><Th>Negotiation</Th><Th>Status</Th><Th>Presented</Th><Th>Aggregate budget</Th><Th>Proposed commission</Th><Th>Next action</Th></tr></thead>
          <tbody className="divide-y divide-ink-900/5">
            {negotiations.map((n) => (
              <tr key={n.id} className="hover:bg-ivory-50">
                <td className="px-4 py-3"><Link href={`/admin/negotiations/${n.id}`} className="font-medium text-ink-900 hover:underline">{n.title}</Link><p className="text-[12px] text-stone-500">{n.developer.name}{n.project ? ` · ${n.project.name}` : ""}</p></td>
                <td className="px-4 py-3"><LabelBadge map={NEGOTIATION_STATUS} value={n.status} /></td>
                <td className="num px-4 py-3 text-[13px]">{n.interestedPresented} interested · {n.qualifiedPresented} qualified</td>
                <td className="num px-4 py-3">{formatINR(n.aggregateBudget)}</td>
                <td className="num px-4 py-3">{n.proposedCommissionRate ? `${n.proposedCommissionRate}%` : "—"}</td>
                <td className="px-4 py-3 text-[13px]">{n.nextAction ?? "—"}<p className={`text-[12px] ${n.nextActionAt && n.nextActionAt < new Date() ? "text-clay-600" : "text-stone-500"}`}>{n.nextActionAt ? relativeTime(n.nextActionAt) : ""}</p></td>
              </tr>
            ))}
            {!negotiations.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-stone-500">No negotiations yet. Start one from a developer&apos;s page.</td></tr>}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
