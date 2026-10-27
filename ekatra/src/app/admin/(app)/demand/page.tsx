import Link from "next/link";
import { Plus, Sparkles, Users, ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { campaignInsights, uniqueAcrossCampaigns } from "@/lib/domain/campaign-insights";
import { loadCampaignDemand } from "@/lib/services/campaigns";
import { istDay } from "@/lib/time";
import { projectOpportunities, suggestedGroups } from "@/lib/queries/dashboard";
import { PageHeader } from "@/components/admin/page-header";
import { TableShell, Th } from "@/components/admin/table";
import { Card } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/motion";
import { EmptyState } from "@/components/ui/misc";
import { CAMPAIGN_STATUS, VISIBILITY } from "@/lib/labels";
import { formatDate, formatINR } from "@/lib/format";

export const metadata = { title: "Demand Studio" };

export default async function DemandStudio() {
  const user = await requirePermission("demand:read");
  const [campaigns, opps, groups] = await Promise.all([
    db.campaign.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }], include: { project: { select: { id: true, name: true, location: { select: { name: true } } } }, owner: { select: { name: true } } } }),
    projectOpportunities(6),
    suggestedGroups(6),
  ]);
  const today = istDay();
  const rows = await Promise.all(campaigns.map(async (c) => {
    const d = await loadCampaignDemand(c.id, { candidates: false });
    return { c, criteria: d.criteria, m: campaignInsights(d.members, d.criteria, { dayStart: today.start, dayEnd: today.end, status: c.status }) };
  }));
  const active = rows.filter((r) => !["CLOSED", "PAUSED"].includes(r.c.status));
  const overlap = uniqueAcrossCampaigns((await db.campaignMember.findMany({ where: { campaignId: { in: active.map((r) => r.c.id) }, buyer: { anonymizedAt: null } }, select: { campaignId: true, buyerId: true } })));
  const w = can(user.role, "demand:write");
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Demand Studio" subtitle="Aggregate demand first. Negotiate second. Every buyer is counted once per campaign; interest, qualification and commitment are always shown separately." actions={w ? <ButtonLink href="/admin/demand/new"><Plus className="size-4" /> New campaign</ButtonLink> : undefined} />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-ink-900 px-5 py-4 text-ivory-100"><p className="text-[12px] text-ink-300">Unique buyers in active campaigns</p><p className="num mt-1 font-serif text-4xl text-ivory-50">{overlap.uniqueBuyers}</p><p className="text-[11.5px] text-ink-400">Each person counted once across all campaigns</p></div>
        <div className="rounded-2xl border border-ink-900/[0.07] bg-white px-5 py-4"><p className="text-[12px] text-stone-500">Campaign memberships</p><p className="num mt-1 font-serif text-4xl text-ink-900">{overlap.memberships}</p><p className="text-[11.5px] text-stone-500">{overlap.inMultiple} buyer(s) appear in more than one campaign</p></div>
        <div className="rounded-2xl border border-ink-900/[0.07] bg-white px-5 py-4"><p className="text-[12px] text-stone-500">Active campaigns</p><p className="num mt-1 font-serif text-4xl text-ink-900">{active.length}</p><p className="text-[11.5px] text-stone-500">{active.filter((r) => r.c.scope !== "PROJECT").length} locality / segment</p></div>
      </div>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-500"><Sparkles className="size-4 text-gold-600" /> Negotiation opportunities</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {opps.map((o, i) => (
            <Link key={o.projectId} href={`/admin/projects/${o.projectId}?tab=demand`} className={`group flex flex-col rounded-[28px] p-6 transition hover:-translate-y-0.5 ${i === 0 ? "bg-ink-900 text-ivory-100 shadow-lift" : "border border-ink-900/[0.07] bg-white shadow-soft hover:shadow-lift"}`}>
              <p className={`eyebrow ${i === 0 ? "text-gold-300" : "text-gold-700"}`}>Opportunity · score {o.score}</p>
              <h3 className={`mt-2 font-serif text-2xl leading-tight ${i === 0 ? "text-ivory-50" : "text-ink-900"}`}>{o.title}</h3>
              <div className="num mt-4 grid grid-cols-4 gap-2 text-center">
                {[["Interested", o.interested], ["Qualified", o.qualified], ["≤30 days", o.ready30], ["In price", o.withinBudget]].map(([l, v]) => <div key={l as string}><p className={`text-2xl font-semibold ${i === 0 ? "text-ivory-50" : "text-ink-900"}`}>{v}</p><p className={`text-[10.5px] ${i === 0 ? "text-ink-300" : "text-stone-500"}`}>{l}</p></div>)}
              </div>
              <p className={`mt-4 text-[13px] ${i === 0 ? "text-ivory-100" : "text-stone-700"}`}>→ {o.actions[0]}</p>
              <p className={`mt-auto pt-4 text-[11px] ${i === 0 ? "text-ink-400" : "text-stone-400"}`}>{formatINR(o.indicativeDemand)} stated budgets · not commitments</p>
            </Link>
          ))}
          {!opps.length && <EmptyState className="md:col-span-3" title="No demand yet" body="Opportunities appear as buyers register interest." />}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-500"><Users className="size-4 text-gold-600" /> Suggested buying groups</h2>
        <p className="mb-4 text-[13px] text-stone-500">Compatible buyers not yet in a campaign for that configuration — same project, configuration, budget band, commitment window and possession tolerance. Review before creating; nobody is added automatically.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.key} className="flex flex-col p-5">
              <p className="font-medium text-ink-900">{g.title}</p>
              <p className="num mt-1 text-[12.5px] text-stone-500">{g.buyerIds.length} buyers · {g.qualified} qualified · {g.ready30} ready ≤30d · {g.fundingReady} funding ready</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">{g.reasons.map((r) => <li key={r} className="rounded-full bg-ivory-100 px-2.5 py-1 text-[11.5px] text-stone-600">{r}</li>)}</ul>
              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="num text-[12px] text-stone-500">{formatINR(g.indicativeDemand)} stated</span>
                {w && <Link href={`/admin/demand/new?project=${g.projectId}&bhk=${g.bhk}&buyers=${g.buyerIds.join(",")}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-gold-700 hover:underline">Review & create <ArrowRight className="size-3.5" /></Link>}
              </div>
            </Card>
          ))}
          {!groups.length && <p className="text-sm text-stone-500 md:col-span-3">No new compatible clusters of 3+ buyers right now.</p>}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-500">Campaigns</h2>
        {rows.length ? (
          <TableShell>
            <thead className="border-b border-ink-900/5 bg-ivory-50/60"><tr><Th>Campaign</Th><Th>Progress</Th><Th>Unique buyers</Th><Th>Qualified</Th><Th>Ready ≤30d</Th><Th>Budget fits</Th><Th>Follow-ups due</Th><Th>Next action</Th><Th>Status</Th></tr></thead>
            <tbody className="divide-y divide-ink-900/5">
              {rows.map(({ c, criteria, m }) => (
                <tr key={c.id} className="hover:bg-ivory-50">
                  <td className="px-4 py-3"><Link href={`/admin/demand/${c.id}`} className="font-medium text-ink-900 hover:underline">{c.name}</Link><p className="text-[12px] text-stone-500">{c.scope === "PROJECT" ? c.project?.name : c.scope === "LOCALITY" ? `Locality · ${criteria.localities.join(", ")}` : "Buyer segment"} · {c.owner?.name ?? "No owner"} {c.isPublic && c.scope === "PROJECT" ? <Badge tone="neutral">{VISIBILITY[c.visibility].label}</Badge> : null}</p></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><ProgressRing value={m.progress} size={44} stroke={4} label={<span className="num text-[10.5px] font-semibold">{Math.round(m.progress * 100)}%</span>} /><span className="num text-[12.5px] text-stone-600">{m.counting}/{c.targetBuyers}</span></div></td>
                  <td className="num px-4 py-3 font-semibold text-ink-900">{m.interested}<p className="text-[11px] font-normal text-stone-500">{m.casual} casual</p></td>
                  <td className="num px-4 py-3">{m.qualified}</td>
                  <td className="num px-4 py-3">{m.ready30}</td>
                  <td className="num px-4 py-3">{m.budget.FITS + m.budget.STRETCH}<p className="text-[11px] text-stone-500">{m.budget.UNKNOWN ? `${m.budget.UNKNOWN} unknown` : ""}</p></td>
                  <td className={`num px-4 py-3 ${m.followUpsOverdue ? "font-medium text-clay-600" : ""}`}>{m.followUpsDue}</td>
                  <td className="max-w-64 px-4 py-3 text-[12.5px] text-stone-700">{m.nextActions[0]?.title ?? "—"}</td>
                  <td className="px-4 py-3"><LabelBadge map={CAMPAIGN_STATUS} value={c.status} /><p className="mt-1 text-[11px] text-stone-500">{c.targetDate ? `by ${formatDate(c.targetDate)}` : ""}</p></td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : <EmptyState title="No campaigns yet" action={w ? <ButtonLink href="/admin/demand/new">Create the first campaign</ButtonLink> : undefined} />}
      </section>
    </div>
  );
}
