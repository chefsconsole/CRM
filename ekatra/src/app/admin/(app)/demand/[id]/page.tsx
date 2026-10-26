import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { computeCampaignMetrics, demandGrowth, publicDemandLabel, publicGroupStage } from "@/lib/domain/demand";
import { isLiveConfirmed, effectiveBenefitStatus } from "@/lib/domain/benefits";
import { loadCampaignMembers } from "@/lib/services/campaigns";
import { piiView } from "@/lib/queries/buyers";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { CampaignFields } from "@/components/admin/campaign-fields";
import { TierSelect } from "@/components/admin/buyer-widgets";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { ProgressRing } from "@/components/ui/motion";
import { BarList, Columns } from "@/components/ui/charts";
import { BENEFIT_STATUS, CAMPAIGN_STATUS, INTEREST_TIER, PUBLIC_STAGE, TIMELINE } from "@/lib/labels";
import { formatBhk, formatBudgetRange, formatDate, formatDateTime, formatINR } from "@/lib/format";
import { commitLabel } from "@/lib/domain/timelines";
import { benefitAction, logOutreachAction, memberAction, notifyMembersAction, updateCampaignAction } from "../actions";

export const metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("demand:read");
  const { id } = await params;
  const c = await db.campaign.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, slug: true, isPublished: true, developer: { select: { id: true, name: true } }, location: { select: { name: true } } } },
      benefits: { orderBy: { createdAt: "asc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 40, include: { actor: { select: { name: true } } } },
      negotiations: { select: { id: true, title: true, status: true } },
    },
  });
  if (!c) notFound();
  const w = can(user.role, "demand:write");
  const commercial = can(user.role, "commercial:write");
  const members = await loadCampaignMembers(c.id);
  const m = computeCampaignMetrics(members, c);
  const now = new Date();
  const weeks = Array.from({ length: 10 }, (_, i) => new Date(now.getTime() - (9 - i) * 7 * 864e5));
  const growth = demandGrowth(members, c, weeks);
  const [rows, users, candidates] = await Promise.all([
    db.campaignMember.findMany({
      where: { campaignId: c.id },
      orderBy: { joinedAt: "desc" },
      include: { buyer: { select: { id: true, fullName: true, phoneNormalized: can(user.role, "buyers:pii"), priority: true, stage: true, anonymizedAt: true, interests: { where: { projectId: c.projectId }, select: { id: true, tier: true, configurations: true, budgetMin: true, budgetMax: true, status: true } }, requirements: { where: { status: "ACTIVE" }, take: 1, orderBy: { updatedAt: "desc" }, select: { commitWithinDays: true } } } } },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.buyer.findMany({ where: { anonymizedAt: null, campaignMemberships: { none: { campaignId: c.id } }, OR: [{ interests: { some: { projectId: c.projectId } } }, { locationPreferences: { some: { location: { name: c.project.location.name } } } }] }, orderBy: { fullName: "asc" }, take: 200, select: { id: true, fullName: true } }),
  ]);
  const v = piiView(user);
  const live = c.benefits.some((b) => isLiveConfirmed(b));
  const pub = publicDemandLabel(m.registered, c.visibility);

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        crumbs={[{ href: "/admin/demand", label: "Demand Studio" }]}
        title={c.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Link href={`/admin/projects/${c.project.id}?tab=demand`} className="underline-offset-4 hover:underline">{c.project.name}</Link> · {c.project.developer.name} <LabelBadge map={CAMPAIGN_STATUS} value={c.status} /> {c.isPublic ? <Badge tone="neutral">Public: {PUBLIC_STAGE[publicGroupStage(c.status, live)].label}{pub ? ` · shows “${pub.value} ${pub.caption}”` : " · counts private"}</Badge> : <Badge tone="muted">Internal only</Badge>}</span>}
      />
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card className="flex items-center gap-6 p-6">
          <ProgressRing value={m.progress} size={120} stroke={8} label={<span className="text-center"><span className="num block font-serif text-3xl text-ink-900">{Math.round(m.progress * 100)}%</span><span className="text-[11px] text-stone-500">of target</span></span>} />
          <div>
            <p className="num font-serif text-4xl text-ink-900">{m.counting}<span className="text-2xl text-stone-400"> / {c.targetBuyers}</span></p>
            <p className="text-[12.5px] text-stone-500">counting buyers ({c.countingTiers.map((t) => INTEREST_TIER[t].label.toLowerCase()).join(", ")})</p>
            <p className="mt-1 text-[12.5px] text-stone-500">{m.remaining ? `${m.remaining} more needed` : "Target reached — ready for a developer discussion (no terms are guaranteed)."}</p>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["Unique registered", m.registered], ["Qualified", m.qualified], ["Committed", m.committed], ["Site visits requested", m.visitRequests], ["Verified leads", m.tierCounts.VERIFIED_LEAD], ["Interest only", m.tierCounts.EXPRESSION_OF_INTEREST], ["Qualified demand", formatINR(m.combinedBudgetQualified)], ["Counting demand", formatINR(m.combinedBudgetCounting)]].map(([l, val]) => (
            <Card key={l as string} className="p-4"><p className="text-[12px] text-stone-500">{l}</p><p className="num mt-1 whitespace-nowrap text-xl font-semibold text-ink-900">{val}</p></Card>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-stone-500">Demand values are the lower bound of stated budgets, each buyer counted once — not committed purchases.</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-4">
        <Card className="p-6"><h3 className="mb-4 text-[13px] font-semibold text-ink-900">By configuration</h3><BarList data={m.byConfig.map((x) => ({ label: formatBhk(x.bhk), value: x.buyers }))} /></Card>
        <Card className="p-6"><h3 className="mb-4 text-[13px] font-semibold text-ink-900">By budget band</h3><BarList data={m.byBudgetBand.filter((b) => b.buyers).map((b) => ({ label: b.label, value: b.buyers }))} /></Card>
        <Card className="p-6"><h3 className="mb-4 text-[13px] font-semibold text-ink-900">Purchase timeline</h3><BarList data={Object.entries(m.byTimeline).filter(([, n]) => n).map(([k, n]) => ({ label: TIMELINE[k as keyof typeof TIMELINE], value: n }))} /></Card>
        <Card className="p-6"><h3 className="mb-4 text-[13px] font-semibold text-ink-900">Counting buyers over time</h3><Columns height={100} data={growth.map((g) => ({ label: `${g.date.getDate()}/${g.date.getMonth() + 1}`, value: g.count }))} /></Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title={`Members (${rows.length})`} subtitle="Change interest level as you verify each buyer. Withdrawn interest no longer counts." />
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-[0.08em] text-stone-500"><th className="px-4 py-2">Buyer</th><th className="px-4 py-2">Wants</th><th className="px-4 py-2">Budget</th><th className="px-4 py-2">Could commit</th><th className="px-4 py-2">Interest level</th><th className="px-4 py-2" /></tr></thead>
              <tbody className="divide-y divide-ink-900/5">
                {rows.map((r) => {
                  const i = r.buyer.interests[0];
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5"><Link href={`/admin/buyers/${r.buyer.id}`} className="font-medium text-ink-900 hover:underline">{r.buyer.fullName}</Link><p className="num text-[11.5px] text-stone-500">{v.phone(r.buyer.phoneNormalized)} · joined {formatDate(r.joinedAt)}</p></td>
                      <td className="px-4 py-2.5 text-[13px]">{i ? i.configurations.map(formatBhk).join(", ") : "—"}</td>
                      <td className="num px-4 py-2.5 text-[13px]">{i ? formatBudgetRange(i.budgetMin, i.budgetMax) : "—"}</td>
                      <td className="px-4 py-2.5 text-[12.5px] text-stone-600">{commitLabel(r.buyer.requirements[0]?.commitWithinDays)}</td>
                      <td className="px-4 py-2.5">{i ? (i.status === "ACTIVE" ? <TierSelect interestId={i.id} tier={i.tier} disabled={!can(user.role, "buyers:write")} /> : <Badge tone="muted">Withdrawn</Badge>) : "—"}</td>
                      <td className="px-4 py-2.5 text-right">{w && <ActionForm action={memberAction}><input type="hidden" name="campaignId" value={c.id} /><input type="hidden" name="buyerId" value={r.buyer.id} /><input type="hidden" name="op" value="remove" /><button className="text-[12px] text-stone-400 hover:text-clay-600">Remove</button></ActionForm>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <p className="px-4 py-8 text-center text-sm text-stone-500">No members yet.</p>}
          </div>
          {w && (
            <ActionForm action={memberAction} className="flex flex-wrap items-end gap-3 border-t border-ink-900/5 p-6">
              <input type="hidden" name="campaignId" value={c.id} />
              <Field label="Add a buyer" className="min-w-64 flex-1"><Select name="buyerId" defaultValue=""><option value="">Choose (interested in this project or area)…</option>{candidates.map((b) => <option key={b.id} value={b.id}>{b.fullName}</option>)}</Select></Field>
              <SubmitButton variant="outline">Add</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Benefits</h3>
            <p className="mt-1 text-[12px] text-stone-500">Shown publicly only when confirmed by the developer and still valid.</p>
            <ul className="mt-3 space-y-2">
              {c.benefits.map((b) => (
                <li key={b.id} className="rounded-xl bg-ivory-100 px-3 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium text-ink-900">{b.title}</span><LabelBadge map={BENEFIT_STATUS} value={effectiveBenefitStatus(b)} /></div>
                  <p className="text-[12px] text-stone-500">{b.confirmedBy ? `By ${b.confirmedBy} · ` : ""}{b.validUntil ? `valid until ${formatDate(b.validUntil)}` : "no expiry set"}</p>
                </li>
              ))}
              {!c.benefits.length && <li className="text-[13px] text-stone-500">None recorded.</li>}
            </ul>
            {commercial && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-medium text-gold-700">+ Record a benefit</summary>
                <ActionForm action={benefitAction} resetOnSuccess className="mt-3 space-y-3">
                  <input type="hidden" name="campaignId" value={c.id} />
                  <Field label="Benefit"><Input name="title" placeholder="Floor-rise waiver up to 10th floor" /></Field>
                  <Field label="Status"><Select name="status" defaultValue="UNDER_NEGOTIATION">{Object.entries(BENEFIT_STATUS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</Select></Field>
                  <Field label="Confirmed by (name & role)"><Input name="confirmedBy" /></Field>
                  <Field label="Evidence"><Input name="evidenceNote" placeholder="Signed letter dated…, on file" /></Field>
                  <Field label="Valid until"><Input type="date" name="validUntil" /></Field>
                  <Field label="Conditions"><Textarea name="description" /></Field>
                  <SubmitButton size="sm">Save benefit</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Developer outreach log</h3>
            {c.negotiations.map((n) => <Link key={n.id} href={`/admin/negotiations/${n.id}`} className="mt-2 block rounded-xl bg-gold-200/40 px-3 py-2 text-[13px] font-medium text-gold-700">Negotiation: {n.title} →</Link>)}
            {w && (
              <ActionForm action={logOutreachAction} resetOnSuccess className="mt-3 space-y-2">
                <input type="hidden" name="campaignId" value={c.id} />
                <Select name="kind" defaultValue="Developer outreach">{["Developer outreach", "Developer meeting", "Proposal sent", "Developer response", "Note"].map((k) => <option key={k}>{k}</option>)}</Select>
                <Textarea name="body" placeholder="Who, what was presented, what was asked…" />
                <SubmitButton size="sm">Log</SubmitButton>
              </ActionForm>
            )}
            <ol className="mt-4 space-y-3">
              {c.activities.map((a) => <li key={a.id} className="text-[13px]"><p className="font-medium text-ink-900">{a.title}</p>{a.body && <p className="text-stone-600">{a.body}</p>}<p className="text-[11px] text-stone-400">{formatDateTime(a.createdAt)}{a.actor ? ` · ${a.actor.name}` : ""}</p></li>)}
            </ol>
          </Card>
          {w && (
            <Card className="p-6">
              <h3 className="font-semibold text-ink-900">Email a confirmed update</h3>
              <p className="mt-1 text-[12px] text-stone-500">Sent only to members who opted in to updates. Never send unconfirmed offers.</p>
              <ActionForm action={notifyMembersAction} resetOnSuccess className="mt-3 space-y-2">
                <input type="hidden" name="campaignId" value={c.id} />
                <Input name="subject" placeholder="Subject" />
                <Textarea name="body" placeholder="The confirmed update…" />
                <Checkbox name="confirmedOnly" label="This update contains only information confirmed by the developer." />
                <SubmitButton size="sm">Send update</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>

      {w && (
        <Card className="mt-5 p-6 md:p-8">
          <h3 className="mb-5 font-serif text-2xl text-ink-900">Campaign settings</h3>
          <ActionForm action={updateCampaignAction} className="space-y-4">
            <input type="hidden" name="campaignId" value={c.id} />
            <Field label="Status" className="max-w-xs"><Select name="status" defaultValue={c.status}>{Object.entries(CAMPAIGN_STATUS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</Select></Field>
            <CampaignFields c={c} users={users} />
            <SubmitButton>Save settings</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
