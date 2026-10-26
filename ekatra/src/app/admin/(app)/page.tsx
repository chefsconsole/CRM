import Link from "next/link";
import { ArrowRight, Sparkles, PhoneCall, Target, Handshake, ShieldAlert, Building2, CalendarDays, Lightbulb } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDashboard } from "@/lib/queries/dashboard";
import { runSweep } from "@/lib/services/sweep";
import { Kpi } from "@/components/admin/kpi";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { BarList, Columns, SplitBar } from "@/components/ui/charts";
import { ProgressBar } from "@/components/ui/motion";
import { EmptyState, Avatar } from "@/components/ui/misc";
import { CAMPAIGN_STATUS, LEAD_STAGE, PRIORITY } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR, relativeTime } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePermission("dashboard:view");
  const { denied } = await searchParams;
  await runSweep().catch(() => undefined);
  const d = await getDashboard(user);
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const top = d.opportunities[0];
  const commercial = can(user.role, "commercial:read");

  return (
    <div className="mx-auto max-w-[1500px]">
      {denied && <p role="alert" className="mb-6 rounded-2xl border border-amber-600/20 bg-amber-50 px-4 py-3 text-sm text-amber-600">You don&apos;t have access to that section. Ask a Super Administrator if you need it.</p>}
      <div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-stone-500">{formatDate(new Date())}</p>
          <h1 className="font-serif text-4xl text-ink-900 md:text-5xl">{greeting}, {user.name.split(" ")[0]}.</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <Link href="/admin/buyers?segment=due-today" className="rounded-full border border-ink-900/10 bg-white px-3.5 py-2 font-medium text-ink-900 hover:border-ink-900/30">Today&apos;s follow-ups</Link>
          <Link href="/admin/buyers?segment=ready-30" className="rounded-full border border-ink-900/10 bg-white px-3.5 py-2 font-medium text-ink-900 hover:border-ink-900/30">Ready ≤ 30 days</Link>
          <Link href="/admin/demand" className="rounded-full bg-ink-900 px-3.5 py-2 font-medium text-white">Demand Studio</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Kpi accent label="Hot buyers (Priority A)" value={d.kpis.hotBuyers} hint="Ready, defined, compatible" href="/admin/buyers?priority=A" />
        <Kpi label="Ready within 30 days" value={d.kpis.ready30} hint="Stated commitment window" href="/admin/buyers?segment=ready-30" />
        <Kpi label="New inquiries · 7 days" value={d.kpis.newInquiries} href="/admin/buyers?sort=newest" />
        <Kpi label="Qualified buyers" value={d.kpis.qualified} hint="Financially qualified or committed" href="/admin/buyers?tier=FINANCIALLY_QUALIFIED,COMMITTED" />
        <Kpi label="Follow-ups due" value={d.kpis.followUpsDueCount} hint="Today or overdue" href="/admin/follow-ups" />
        <Kpi label="Active buying campaigns" value={d.kpis.activeCampaigns} href="/admin/demand" />
        {commercial ? <Kpi label="Developer negotiations" value={d.kpis.negotiationsActive} hint="Open" href="/admin/developers?tab=negotiations" /> : <Kpi label="Buyer–property matches" value={d.kpis.strongMatches} hint="Eligible, score ≥ 70" />}
        {commercial ? <Kpi label="Outstanding commission" value={formatINR(d.commission?.outstanding ?? 0)} hint={`Received ${formatINR(d.commission?.received ?? 0)}`} href="/admin/commissions" /> : <Kpi label="Available flats" value={d.kpis.inventoryAvailable} href="/admin/inventory" />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:mt-4 md:grid-cols-5 md:gap-4">
        <MiniStat label="Verified projects" value={d.kpis.projectsVerified} href="/admin/projects?research=VERIFIED" />
        <MiniStat label="Awaiting review" value={d.kpis.projectsReview} href="/admin/projects?research=NEEDS_REVIEW" warn={d.kpis.projectsReview > 0} />
        <MiniStat label="Tier A opportunities" value={d.kpis.tierA} href="/admin/projects?tier=A" />
        <MiniStat label="Available flats" value={d.kpis.inventoryAvailable} href="/admin/inventory?availability=AVAILABLE" />
        <MiniStat label="Strong buyer–property matches" value={d.kpis.strongMatches} href="/admin/buyers?priority=A,B" />
      </div>

      {/* Signature: opportunity */}
      <section className="mt-8 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {top ? (
          <div className="grain relative overflow-hidden rounded-[32px] bg-ink-900 p-7 text-ivory-100 shadow-lift md:p-9">
            <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-gold-400/15 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow flex items-center gap-2 text-gold-300"><Sparkles className="size-3.5" /> Top opportunity</p>
                <span className="num rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-ink-300" title={top.scoreParts.map((p) => `${p.label}: ${p.points}`).join("\n")}>Score {top.score}</span>
              </div>
              <h2 className="mt-4 font-serif text-3xl leading-tight text-ivory-50 md:text-[40px]">{top.title}</h2>
              <div className="mt-7 grid grid-cols-2 gap-5 border-y border-white/10 py-6 sm:grid-cols-4">
                <Big label="Interested buyers" value={top.interested} />
                <Big label="Qualified buyers" value={top.qualified} />
                <Big label="Ready ≤ 30 days" value={top.ready30} />
                <Big label="Indicative demand" value={formatINR(top.indicativeDemand, { digits: 0 })} />
              </div>
              <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-300">Recommended next action</p>
              <p className="mt-2 text-lg text-ivory-50">{top.actions[0]}</p>
              {top.actions.length > 1 && <ul className="mt-3 space-y-1 text-[13px] text-ink-300">{top.actions.slice(1, 3).map((a) => <li key={a}>· {a}</li>)}</ul>}
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href={`/admin/projects/${top.projectId}?tab=demand`} className="inline-flex items-center gap-2 rounded-full bg-gold-300 px-5 py-2.5 text-sm font-semibold text-ink-950">Open demand summary <ArrowRight className="size-4" /></Link>
                <p className="text-[11.5px] text-ink-400">Demand value = sum of stated budgets (lower bound), each buyer counted once — not committed purchases.</p>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="No demand recorded yet" body="Opportunities appear once buyers register interest in projects." />
        )}
        <Card className="p-1">
          <CardHeader title="Other opportunities" subtitle="Ranked by qualified demand, readiness and developer relationship" action={<Link href="/admin/demand" className="text-[12.5px] font-medium text-gold-700">Demand Studio →</Link>} />
          <ul className="mt-3 divide-y divide-ink-900/5 px-2 pb-2">
            {d.opportunities.slice(1).map((o) => (
              <li key={o.projectId}>
                <Link href={`/admin/projects/${o.projectId}?tab=demand`} className="block rounded-2xl px-4 py-3.5 transition hover:bg-ivory-100">
                  <div className="flex items-center justify-between gap-3"><p className="truncate font-medium text-ink-900">{o.title}</p><span className="num shrink-0 text-[12px] text-stone-500">{o.score}</span></div>
                  <p className="num mt-0.5 text-[12.5px] text-stone-500">{o.interested} interested · {o.qualified} qualified · {o.ready30} ready ≤30d · {formatINR(o.indicativeDemand, { digits: 1 })}</p>
                  <p className="mt-1 truncate text-[12.5px] text-gold-700">→ {o.actions[0]}</p>
                </Link>
              </li>
            ))}
            {d.opportunities.length < 2 && <li className="px-4 py-6 text-sm text-stone-500">More opportunities appear as demand grows.</li>}
          </ul>
        </Card>
      </section>

      {/* Recommendations + follow-ups */}
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Smart recommendations" subtitle="Explainable suggestions from your saved data" action={<Lightbulb className="size-4 text-gold-600" />} />
          <div className="space-y-1 p-3">
            <Rec icon={<Target className="size-4" />} q="Which campaign should I focus on?" a={d.campaigns[0] ? `${d.campaigns[0].name} — ${Math.round(d.campaigns[0].metrics.progress * 100)}% of target, ${d.campaigns[0].metrics.qualified} qualified.` : "No active campaigns."} href={d.campaigns[0] ? `/admin/demand/${d.campaigns[0].id}` : "/admin/demand"} />
            <Rec icon={<PhoneCall className="size-4" />} q="Which buyers should I contact today?" a={d.followUpsDue.length ? `${d.followUpsDue.slice(0, 3).map((b) => b.fullName).join(", ")}${d.followUpsDue.length > 3 ? ` and ${d.followUpsDue.length - 3} more` : ""} — follow-ups due, highest priority first.` : "No follow-ups due today."} href="/admin/buyers?segment=due-today" />
            <Rec icon={<Building2 className="size-4" />} q="Which projects fit the most qualified buyers?" a={d.projectsFittingQualified.length ? d.projectsFittingQualified.map((p) => `${p.name} (${p.buyers})`).join(" · ") : "Not enough qualified buyers with defined requirements yet."} href={d.projectsFittingQualified[0] ? `/admin/projects/${d.projectsFittingQualified[0].id}?tab=matches` : "/admin/projects"} />
            <Rec icon={<Handshake className="size-4" />} q="Which developer needs a follow-up?" a={d.developerFollowUps.length ? d.developerFollowUps.map((x) => `${x.name} (${relativeTime(x.nextFollowUpAt)})`).join(" · ") : "No developer follow-ups due this week."} href={d.developerFollowUps[0] ? `/admin/developers/${d.developerFollowUps[0].id}` : "/admin/developers"} />
            <Rec icon={<ShieldAlert className="size-4" />} q="Which project prices need verification?" a={d.needsReverify.length ? `${d.needsReverify.map((p) => p.name).join(", ")} — not verified in 45+ days.` : `All published projects verified recently. ${d.kpis.projectsReview} research record(s) await review.`} href="/admin/projects?reverify=1" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Today’s follow-ups" subtitle="Due today or overdue, highest priority first" action={<Link href="/admin/follow-ups" className="text-[12.5px] font-medium text-gold-700">All →</Link>} />
          {d.followUpsDue.length ? (
            <ul className="mt-2 divide-y divide-ink-900/5 px-3 pb-3">
              {d.followUpsDue.map((b) => (
                <li key={b.id}>
                  <Link href={`/admin/buyers/${b.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-ivory-100">
                    <Avatar name={b.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{b.fullName}</p>
                      <p className="truncate text-[12px] text-stone-500">{b.interests[0]?.project.name ?? "General requirement"} · {LEAD_STAGE[b.stage].label}</p>
                    </div>
                    <LabelBadge map={PRIORITY} value={b.priority} />
                    <span className={`hidden text-[12px] sm:block ${b.nextFollowUpAt && b.nextFollowUpAt < new Date() ? "text-clay-600" : "text-stone-500"}`}>{relativeTime(b.nextFollowUpAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-stone-500">You&apos;re all caught up.</p>
          )}
        </Card>
      </section>

      {/* Campaigns + charts */}
      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Campaigns approaching target" subtitle="Unique counting buyers ÷ target" action={<Link href="/admin/demand" className="text-[12.5px] font-medium text-gold-700">Demand Studio →</Link>} />
          <ul className="space-y-4 p-6">
            {d.campaigns.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link href={`/admin/demand/${c.id}`} className="group block">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-ink-900 group-hover:underline">{c.name}</p>
                    <div className="flex shrink-0 items-center gap-2"><LabelBadge map={CAMPAIGN_STATUS} value={c.status} /><span className="num text-[12.5px] text-stone-600">{c.metrics.counting}/{c.targetBuyers}</span></div>
                  </div>
                  <ProgressBar value={c.metrics.progress} />
                </Link>
              </li>
            ))}
            {!d.campaigns.length && <li className="text-sm text-stone-500">No active campaigns.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Upcoming site visits" action={<CalendarDays className="size-4 text-stone-400" />} />
          <ul className="space-y-2 p-4">
            {d.upcomingVisits.map((v) => (
              <li key={v.id} className="rounded-2xl bg-ivory-100 px-4 py-3">
                <p className="text-sm font-medium text-ink-900">{v.buyer.fullName}</p>
                <p className="text-[12px] text-stone-500">{v.project.name} · {formatDateTime(v.scheduledAt)}</p>
              </li>
            ))}
            {!d.upcomingVisits.length && <li className="px-2 py-6 text-center text-sm text-stone-500">No visits scheduled.</li>}
          </ul>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Monthly inquiries" subtitle="New buyer records, last 6 months" />
          <div className="p-6"><Columns data={d.charts.monthly} /></div>
        </Card>
        <Card>
          <CardHeader title="Buyer demand by location" subtitle="Unique buyers with active interest" />
          <div className="p-6"><BarList data={d.charts.demandByLocation} /></div>
        </Card>
        {d.commission ? (
          <Card>
            <CardHeader title="Commission" subtitle="From commission records; each transaction counted once" />
            <div className="space-y-5 p-6">
              <p className="num font-serif text-4xl text-ink-900">{formatINR(d.commission.expected)}<span className="ml-2 font-sans text-[12px] text-stone-500">expected</span></p>
              <SplitBar format={(v) => formatINR(v)} parts={[{ label: "Received", value: d.commission.received, tone: "ink" }, { label: "Outstanding", value: d.commission.outstanding, tone: "gold" }]} />
              {d.commission.disputed > 0 && <Badge tone="danger">Disputed {formatINR(d.commission.disputed)}</Badge>}
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Lead pipeline" />
            <div className="p-6"><BarList data={Object.entries(LEAD_STAGE).map(([k, v]) => ({ label: v.label, value: d.charts.stageCount[k] ?? 0 }))} /></div>
          </Card>
        )}
      </section>
    </div>
  );
}

function Big({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="num whitespace-nowrap font-serif text-3xl text-ivory-50 md:text-4xl">{value}</p>
      <p className="mt-1 text-[12px] text-ink-300">{label}</p>
    </div>
  );
}
function MiniStat({ label, value, href, warn }: { label: string; value: number; href: string; warn?: boolean }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-900/[0.07] bg-white/70 px-4 py-3 transition hover:bg-white">
      <span className="text-[12.5px] text-stone-600">{label}</span>
      <span className={`num text-lg font-semibold ${warn ? "text-amber-600" : "text-ink-900"}`}>{value}</span>
    </Link>
  );
}
function Rec({ icon, q, a, href }: { icon: React.ReactNode; q: string; a: string; href: string }) {
  return (
    <Link href={href} className="flex gap-3 rounded-2xl p-3 transition hover:bg-ivory-100">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-gold-200/60 text-gold-700">{icon}</span>
      <span className="min-w-0"><span className="block text-[13px] font-semibold text-ink-900">{q}</span><span className="block text-[13px] leading-relaxed text-stone-600">{a}</span></span>
    </Link>
  );
}
