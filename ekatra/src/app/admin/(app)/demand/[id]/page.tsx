import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lightbulb, MapPin, Building2, Users2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { CampaignFields, CampaignScopeFields } from "@/components/admin/campaign-fields";
import { TierSelect } from "@/components/admin/buyer-widgets";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { ProgressRing } from "@/components/ui/motion";
import { BarList } from "@/components/ui/charts";
import { BENEFIT_STATUS, CAMPAIGN_STATUS, FUNDING, INTEREST_TIER, PRIORITY, PUBLIC_STAGE, VISIBILITY } from "@/lib/labels";
import { isLiveConfirmed, effectiveBenefitStatus } from "@/lib/domain/benefits";
import { publicDemandLabel, publicGroupStage } from "@/lib/domain/demand";
import { campaignInsights, explainMatch } from "@/lib/domain/campaign-insights";
import { loadCampaignDemand } from "@/lib/services/campaigns";
import { formatBhk, formatBudgetRange, formatDate, formatDateTime } from "@/lib/format";
import { commitLabel } from "@/lib/domain/timelines";
import { dueBucket, istDay } from "@/lib/time";
import { cn } from "@/lib/cn";
import { addMembersAction, benefitAction, logOutreachAction, memberAction, notifyMembersAction, updateCampaignAction } from "../actions";

export const metadata = { title: "Campaign" };

const FIT_LABEL = { FITS: "Fits", STRETCH: "With stretch", OUTSIDE: "Outside", UNKNOWN: "Not known" } as const;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("demand:read");
  const { id } = await params;
  const exists = await db.campaign.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();
  const { campaign: base, criteria, members, candidates } = await loadCampaignDemand(id);
  const [c, users, locations, segments] = await Promise.all([
    db.campaign.findUniqueOrThrow({
      where: { id },
      include: {
        benefits: { orderBy: { createdAt: "asc" } },
        activities: { orderBy: { createdAt: "desc" }, take: 40, include: { actor: { select: { name: true } } } },
        negotiations: { select: { id: true, title: true, status: true } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.savedSegment.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const w = can(user.role, "demand:write");
  const commercial = can(user.role, "commercial:write");
  const today = istDay();
  const ins = campaignInsights(members, criteria, { dayStart: today.start, dayEnd: today.end, candidates: candidates.length, status: c.status, localityLabel: criteria.localities.join(", ") });
  const live = c.benefits.some((b) => isLiveConfirmed(b));
  const pub = publicDemandLabel(ins.interested, c.visibility);
  const scopeLine =
    base.scope === "PROJECT" ? <><Building2 className="size-4" /> <Link href={`/admin/projects/${base.project?.id}?tab=demand`} className="underline-offset-4 hover:underline">{base.project?.name}</Link> · {base.project?.location.name}</>
    : base.scope === "LOCALITY" ? <><MapPin className="size-4" /> {criteria.localities.join(", ")}</>
    : <><Users2 className="size-4" /> Segment: {base.segment?.name ?? "deleted segment"}</>;
  const band = criteria.budgetMin !== null || criteria.budgetMax !== null ? formatBudgetRange(criteria.budgetMin, criteria.budgetMax) : null;

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        crumbs={[{ href: "/admin/demand", label: "Demand Studio" }]}
        title={c.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{scopeLine}{criteria.configs.length ? ` · ${criteria.configs.map(formatBhk).join(", ")}` : ""}{band ? ` · ${band}` : ""} <LabelBadge map={CAMPAIGN_STATUS} value={c.status} /> {c.isPublic && base.scope === "PROJECT" ? <Badge tone="neutral">Public: {PUBLIC_STAGE[publicGroupStage(c.status, live)].label}{pub ? ` · shows “${pub.value} ${pub.caption}”` : " · counts private"}</Badge> : <Badge tone="muted">Internal only</Badge>}</span>}
      />

      <div className="grid gap-4 xl:grid-cols-[auto_1fr]">
        <Card className="flex items-center gap-6 p-6">
          <ProgressRing value={ins.progress} size={120} stroke={8} label={<span className="text-center"><span className="num block font-serif text-3xl text-ink-900">{Math.round(ins.progress * 100)}%</span><span className="text-[11px] text-stone-500">of target</span></span>} />
          <div>
            <p className="num font-serif text-4xl text-ink-900">{ins.counting}<span className="text-2xl text-stone-400"> / {c.targetBuyers}</span></p>
            <p className="text-[12.5px] text-stone-500">buyers counting toward target</p>
            <p className="mt-2 max-w-56 text-[11.5px] text-stone-500">Counts: {c.countingTiers.map((t) => INTEREST_TIER[t].label).join(", ")}. Each buyer counted once.</p>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label="Unique interested buyers" value={ins.interested} sub="Counted once, withdrawn excluded" strong />
          <Kpi label="Financially qualified" value={ins.qualified} sub={`${ins.committed} committed`} />
          <Kpi label="Ready within 30 days" value={ins.ready30} sub={`${ins.readyUnknown} not stated`} />
          <Kpi label="Budget fits" value={ins.budget.FITS + ins.budget.STRETCH} sub={`vs ${ins.budget.basis}`} />
          <Kpi label="Follow-ups due" value={ins.followUpsDue} sub={`${ins.followUpsOverdue} overdue`} tone={ins.followUpsOverdue ? "danger" : ins.followUpsDue ? "warning" : undefined} />
          <Kpi label="Casual enquiries" value={ins.casual} sub="Not counted as committed" />
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-1">
          <h3 className="flex items-center gap-2 font-semibold text-ink-900"><Lightbulb className="size-4 text-gold-600" /> Suggested next action</h3>
          <ol className="mt-3 space-y-3">
            {ins.nextActions.map((a, i) => (
              <li key={a.title} className={cn("rounded-2xl px-4 py-3", i === 0 ? "bg-ink-900 text-ivory-100" : "bg-ivory-100")}>
                <p className={cn("text-[14px] font-medium", i === 0 ? "text-ivory-50" : "text-ink-900")}>{a.title}</p>
                <p className={cn("mt-0.5 text-[12px]", i === 0 ? "text-ink-300" : "text-stone-500")}>Why: {a.why}</p>
              </li>
            ))}
            {!ins.nextActions.length && <li className="text-[13px] text-stone-500">Nothing urgent — keep collecting demand.</li>}
          </ol>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-ink-900">Financing readiness</h3>
          <BarList className="mt-4" data={Object.entries(ins.financing).filter(([, n]) => n).map(([k, n]) => ({ label: FUNDING[k as keyof typeof FUNDING], value: n }))} />
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-ink-900">Budget fit <span className="text-[12px] font-normal text-stone-500">vs {ins.budget.basis}</span></h3>
          <BarList className="mt-4" data={(["FITS", "STRETCH", "OUTSIDE", "UNKNOWN"] as const).filter((k) => ins.budget[k]).map((k) => ({ label: FIT_LABEL[k], value: ins.budget[k] }))} />
          <p className="mt-3 text-[11.5px] text-stone-500">Readiness: {Object.entries(ins.tierCounts).map(([k, n]) => `${INTEREST_TIER[k as keyof typeof INTEREST_TIER].label} ${n}`).join(" · ")}</p>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title={`Members (${members.length})`} subtitle={base.scope === "PROJECT" ? "Interest level is per project. Change it only with evidence (e.g. verified contact, loan sanction, booking)." : "Readiness is derived from each buyer's verified contact, financing and stage — conservative by design."} />
            <ul className="divide-y divide-ink-900/5">
              {members.map((m) => {
                const why = explainMatch(m, criteria);
                const due = dueBucket(m.nextFollowUpAt);
                return (
                  <li key={m.buyerId} className={cn("px-6 py-3.5", !m.active && "opacity-50")}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
                      <span className="min-w-44 flex-1"><Link href={`/admin/buyers/${m.buyerId}`} className="font-medium text-ink-900 hover:underline">{m.name}</Link> <LabelBadge map={PRIORITY} value={m.priority as keyof typeof PRIORITY} /></span>
                      <span className="num whitespace-nowrap text-stone-700">{formatBudgetRange(m.budgetMin, m.budgetMax)}</span>
                      <span className="whitespace-nowrap text-[12.5px] text-stone-600">{commitLabel(m.commitWithinDays)}</span>
                      <span className={cn("whitespace-nowrap text-[12.5px]", due === "OVERDUE" ? "font-medium text-clay-600" : due === "TODAY" ? "font-medium text-amber-600" : "text-stone-600")}>{m.nextFollowUpAt ? `Follow-up ${formatDate(m.nextFollowUpAt)}` : "No follow-up"}</span>
                      <span>{!m.active ? <Badge tone="muted">Withdrawn</Badge> : base.scope === "PROJECT" && m.interestId ? <TierSelect interestId={m.interestId} tier={m.tier} disabled={!can(user.role, "buyers:write")} /> : <LabelBadge map={INTEREST_TIER} value={m.tier} />}</span>
                      {w && <ActionForm action={memberAction}><input type="hidden" name="campaignId" value={c.id} /><input type="hidden" name="buyerId" value={m.buyerId} /><input type="hidden" name="op" value="remove" /><button className="text-[12px] text-stone-400 hover:text-clay-600">Remove</button></ActionForm>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-[11px] uppercase tracking-[0.08em] text-stone-400">Why</span>
                      {why.reasons.map((r) => <span key={r} className="rounded-full bg-sage-50 px-2 py-0.5 text-[11px] text-sage-600">{r}</span>)}
                      {why.misses.map((r) => <span key={r} className="rounded-full bg-clay-50 px-2 py-0.5 text-[11px] text-clay-600">{r}</span>)}
                      <span className="ml-auto text-[11px] text-stone-400">joined {formatDate(m.joinedAt)} · {m.joinedVia}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div>
              {!members.length && <p className="px-4 py-8 text-center text-sm text-stone-500">No members yet — review the matching buyers below.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title={`Matching buyers not in this campaign (${candidates.length})`} subtitle="Each one is listed with the reasons they match. Nobody is added until you tick them." />
            {candidates.length ? (
              <ActionForm action={addMembersAction} resetOnSuccess className="p-4">
                <input type="hidden" name="campaignId" value={c.id} />
                <ul className="divide-y divide-ink-900/5">
                  {candidates.map((b) => (
                    <li key={b.buyerId}>
                      <label className="flex cursor-pointer flex-wrap items-start gap-3 py-2.5">
                        {w && <input type="checkbox" name="buyerIds" value={b.buyerId} className="mt-1 size-4 accent-ink-900" />}
                        <span className="min-w-40 flex-1"><Link href={`/admin/buyers/${b.buyerId}`} className="text-[13px] font-medium text-ink-900 hover:underline">{b.name}</Link> <LabelBadge map={PRIORITY} value={b.priority as keyof typeof PRIORITY} /> <LabelBadge map={INTEREST_TIER} value={b.tier} /></span>
                        <span className="flex max-w-xl flex-1 flex-wrap gap-1">{b.why.reasons.map((r) => <span key={r} className="rounded-full bg-sage-50 px-2 py-0.5 text-[11px] text-sage-600">{r}</span>)}{b.why.misses.map((r) => <span key={r} className="rounded-full bg-clay-50 px-2 py-0.5 text-[11px] text-clay-600">{r}</span>)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {w && <SubmitButton size="sm" variant="outline">Add ticked buyers</SubmitButton>}
              </ActionForm>
            ) : <p className="p-6 text-[13px] text-stone-500">No other buyers match these criteria right now.</p>}
          </Card>
        </div>

        <div className="space-y-5">
          {base.scope === "PROJECT" && (
            <Card className="p-6">
              <h3 className="font-semibold text-ink-900">Benefits</h3>
              <p className="mt-1 text-[12px] text-stone-500">Confirmed only with written evidence, the exact terms and a validity date. Shown publicly only while valid.</p>
              <ul className="mt-3 space-y-2">
                {c.benefits.map((b) => (
                  <li key={b.id} className="rounded-xl bg-ivory-100 px-3 py-2.5 text-[13px]">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium text-ink-900">{b.title}</span><LabelBadge map={BENEFIT_STATUS} value={effectiveBenefitStatus(b)} /></div>
                    {b.description && <p className="mt-0.5 text-[12px] text-stone-600">{b.description}</p>}
                    <p className="text-[12px] text-stone-500">{b.confirmedBy ? `By ${b.confirmedBy} · ` : ""}{b.validUntil ? `valid until ${formatDate(b.validUntil)}` : "no validity date"}{b.evidenceNote ? ` · evidence: ${b.evidenceNote}` : ""}</p>
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
                    <Field label="Exact terms & conditions"><Textarea name="description" /></Field>
                    <Field label="Confirmed by (name & role at developer)"><Input name="confirmedBy" /></Field>
                    <Field label="Written evidence"><Input name="evidenceNote" placeholder="Signed letter dated…, saved under Developer → Documents" /></Field>
                    <Field label="Valid until"><Input type="date" name="validUntil" /></Field>
                    <SubmitButton size="sm">Save benefit</SubmitButton>
                  </ActionForm>
                </details>
              )}
            </Card>
          )}
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Activity & developer outreach</h3>
            {c.negotiations.map((n) => <Link key={n.id} href={`/admin/negotiations/${n.id}`} className="mt-2 flex items-center justify-between rounded-xl bg-gold-200/40 px-3 py-2 text-[13px] font-medium text-gold-700">Negotiation: {n.title} <ArrowRight className="size-3.5" /></Link>)}
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
            {base.scope !== "PROJECT" && <CampaignScopeFields scope={base.scope} c={c} locations={locations} segments={segments} locked />}
            <CampaignFields c={c} users={users} allowPublic={base.scope === "PROJECT"} />
            <SubmitButton>Save settings</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, strong, tone }: { label: string; value: number; sub: string; strong?: boolean; tone?: "warning" | "danger" }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3.5", strong ? "border-ink-900 bg-ink-900 text-ivory-100" : "border-ink-900/[0.07] bg-white")}>
      <p className={cn("text-[11.5px]", strong ? "text-ink-300" : "text-stone-500")}>{label}</p>
      <p className={cn("num mt-1 font-serif text-3xl", strong ? "text-ivory-50" : tone === "danger" ? "text-clay-600" : tone === "warning" ? "text-amber-600" : "text-ink-900")}>{value}</p>
      <p className={cn("text-[11px]", strong ? "text-ink-400" : "text-stone-500")}>{sub}</p>
    </div>
  );
}
