import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AlertTriangle, Plus, ExternalLink } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { TableShell, Th, withParams } from "@/components/admin/table";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { APPROVAL, LIFECYCLE, PROJECT_STATUS, RESEARCH_STATUS, TIER } from "@/lib/labels";
import { formatDate, relativeTime } from "@/lib/format";
import { needsReverification } from "@/lib/domain/compliance";
import { cn } from "@/lib/cn";

export const metadata = { title: "Projects" };

const MARKETS = [
  { key: "western", label: "Borivali & Kandivali", where: { market: "Borivali West & Kandivali West" } },
  { key: "thane", label: "Thane", where: { market: "Thane" } },
  { key: "powai", label: "Powai", where: { market: "Powai" } },
  { key: "adjacent", label: "Adjacent (scope pending)", where: { market: { startsWith: "Adjacent" } } },
  { key: "demo", label: "Demo listings", where: { isDemo: true } },
  { key: "all", label: "All", where: {} },
] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("projects:read");
  const sp = await searchParams;
  const market = MARKETS.find((m) => m.key === sp.market) ?? (sp.research || sp.tier || sp.reverify || sp.q ? MARKETS[5] : MARKETS[0]);
  const where: Prisma.ProjectWhereInput = {
    ...market.where,
    ...(sp.tier ? { tier: sp.tier as "A" } : {}),
    ...(sp.research ? { researchStatus: sp.research as "VERIFIED" } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { developer: { name: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  let projects = await db.project.findMany({
    where,
    orderBy: [{ tier: { sort: "asc", nulls: "last" } }, { researchStatus: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, tier: true, researchStatus: true, approvalStatus: true, isPublished: true, conflictFlag: true, status: true, lifecycleStages: true, reraStatusText: true, reraNumber: true,
      lastVerifiedAt: true, isDemo: true, market: true, segment: true, dealType: true,
      developer: { select: { name: true } }, location: { select: { name: true } },
      _count: { select: { interests: { where: { status: "ACTIVE" } }, sources: true, campaigns: true } },
    },
  });
  if (sp.reverify) projects = projects.filter((p) => needsReverification(p.lastVerifiedAt));
  const counts = await Promise.all(MARKETS.map((m) => db.project.count({ where: m.where })));
  const base = "/admin/projects";
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Projects"
        subtitle="Developer launches and research records. Tier, research status and approval are separate — nothing is public until approved and compliance-reviewed."
        actions={can(user.role, "projects:write") ? <ButtonLink href="/admin/projects/new"><Plus className="size-4" /> New project</ButtonLink> : undefined}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {MARKETS.map((m, i) => (
          <Link key={m.key} href={withParams(base, {}, { market: m.key })} className={cn("rounded-full border px-4 py-2 text-[13px] font-medium transition", market.key === m.key ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white text-stone-700 hover:border-ink-900/30")}>
            {m.label} <span className="num ml-1 opacity-60">{counts[i]}</span>
          </Link>
        ))}
        <span className="mx-1 h-6 w-px bg-ink-900/10" />
        {[["tier", "A", "Tier A"], ["tier", "B", "Tier B"], ["research", "NEEDS_REVIEW", "Needs review"], ["research", "VERIFIED", "Verified"], ["reverify", "1", "Re-verify due"]].map(([k, v, l]) => (
          <Link key={l} href={withParams(base, { market: market.key === "all" ? "all" : market.key, tier: sp.tier, research: sp.research, reverify: sp.reverify }, { [k!]: sp[k!] === v ? null : v! })} className={cn("rounded-full px-3 py-1.5 text-[12.5px]", sp[k!] === v ? "bg-gold-300 text-ink-950" : "bg-ivory-200 text-stone-600 hover:bg-ivory-300")}>{l}</Link>
        ))}
      </div>
      {market.key === "adjacent" && <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-600">These projects are outside the agreed markets. They stay here for your decision and are not used in campaigns until you approve the scope.</p>}
      {projects.length ? (
        <TableShell>
          <thead className="border-b border-ink-900/5 bg-ivory-50/60">
            <tr><Th>Project</Th><Th>Tier</Th><Th>Research</Th><Th>Legal / lifecycle</Th><Th>Demand</Th><Th>Last verified</Th><Th>Public</Th></tr>
          </thead>
          <tbody className="divide-y divide-ink-900/5">
            {projects.map((p) => (
              <tr key={p.id} className="align-top transition hover:bg-ivory-50">
                <td className="max-w-[320px] px-4 py-4">
                  <Link href={`/admin/projects/${p.id}`} className="font-medium text-ink-900 hover:underline">{p.name}</Link>
                  <p className="text-[12.5px] text-stone-500">{p.developer.name} · {p.location.name}{p.segment === "COMMERCIAL" ? " · Commercial" : ""}{p.dealType !== "SALE" ? ` · ${p.dealType === "RENT" ? "Rental" : "Pre-leased"}` : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.isDemo && <Badge tone="muted">Demo</Badge>}
                    {p.conflictFlag && <Badge tone="danger"><AlertTriangle className="size-3" /> Conflict</Badge>}
                  </div>
                </td>
                <td className="px-4 py-4">{p.tier ? <LabelBadge map={TIER} value={p.tier} /> : <span className="text-[12px] text-stone-400">Not tiered</span>}</td>
                <td className="px-4 py-4"><LabelBadge map={RESEARCH_STATUS} value={p.researchStatus} /><p className="mt-1 text-[11.5px] text-stone-500">{p._count.sources} source{p._count.sources === 1 ? "" : "s"}</p></td>
                <td className="max-w-[300px] px-4 py-4">
                  <div className="flex flex-wrap gap-1">{p.lifecycleStages.length ? p.lifecycleStages.map((s) => <LabelBadge key={s} map={LIFECYCLE} value={s} />) : <LabelBadge map={PROJECT_STATUS} value={p.status} />}</div>
                  <p className="mt-1 line-clamp-2 text-[11.5px] text-stone-500">{p.reraNumber ? `RERA ${p.reraNumber} · ` : ""}{p.reraStatusText ?? ""}</p>
                </td>
                <td className="num px-4 py-4 text-[13px] text-ink-900">{p._count.interests}<span className="text-stone-500"> buyers</span>{p._count.campaigns ? <p className="text-[11.5px] text-stone-500">{p._count.campaigns} campaign(s)</p> : null}</td>
                <td className="px-4 py-4 text-[12.5px] text-stone-600">{p.lastVerifiedAt ? <><span className={needsReverification(p.lastVerifiedAt) ? "text-amber-600" : ""}>{relativeTime(p.lastVerifiedAt)}</span><p className="text-[11px] text-stone-400">{formatDate(p.lastVerifiedAt)}</p></> : <span className="text-stone-400">Never</span>}</td>
                <td className="px-4 py-4">{p.isPublished ? <Badge tone="positive">Live</Badge> : <LabelBadge map={APPROVAL} value={p.approvalStatus} />}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      ) : (
        <EmptyState title="No projects here yet" body="Add a project or import research records." action={<ButtonLink href="/admin/projects/new">New project</ButtonLink>} />
      )}
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-stone-500"><ExternalLink className="size-3.5" /> Research guide and excluded leads: see <code className="rounded bg-ivory-200 px-1">docs/RESEARCH.md</code>.</p>
    </div>
  );
}
