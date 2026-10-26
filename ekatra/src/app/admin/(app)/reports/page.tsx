import type { Prisma } from "@prisma/client";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { BarList, Columns } from "@/components/ui/charts";
import { Field, Input, Select } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { INTENT, LEAD_STAGE, LEAD_STAGES } from "@/lib/labels";
import { COMMIT_OPTIONS, POSSESSION_OPTIONS } from "@/lib/domain/timelines";
import { formatBhk, formatINR, percent } from "@/lib/format";
import { sumPayments } from "@/lib/domain/commission";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("analytics:view");
  const sp = await searchParams;
  const to = sp.to ? new Date(`${sp.to}T23:59:59`) : new Date();
  const from = sp.from ? new Date(sp.from) : new Date(to.getTime() - 180 * 864e5);
  const interestScope: Prisma.ProjectInterestWhereInput = {
    ...(sp.project ? { projectId: sp.project } : {}),
    ...(sp.developer ? { project: { developerId: sp.developer } } : {}),
    ...(sp.location ? { project: { locationId: sp.location, ...(sp.developer ? { developerId: sp.developer } : {}) } } : {}),
  };
  const where: Prisma.BuyerWhereInput = {
    anonymizedAt: null,
    createdAt: { gte: from, lte: to },
    ...(Object.keys(interestScope).length ? { interests: { some: interestScope } } : {}),
    ...(sp.campaign ? { campaignMemberships: { some: { campaignId: sp.campaign } } } : {}),
  };
  const [buyers, locations, projects, developers, campaigns] = await Promise.all([
    db.buyer.findMany({ where, select: { id: true, createdAt: true, stage: true, leadSource: true, priority: true, interests: { where: { status: "ACTIVE", ...interestScope }, select: { configurations: true, project: { select: { location: { select: { name: true } } } } } }, requirements: { where: { status: "ACTIVE" }, take: 1, orderBy: { updatedAt: "desc" }, select: { commitWithinDays: true, possessionWaitMonths: true, intents: true } } } }),
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.developer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.campaign.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const count = <T,>(arr: T[], key: (x: T) => string | string[] | null | undefined) => {
    const m = new Map<string, number>();
    for (const x of arr) for (const k of [key(x)].flat()) if (k) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const months: { label: string; value: number }[] = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ label: d.toLocaleString("en-IN", { month: "short" }), value: buyers.filter((b) => b.createdAt.getFullYear() === d.getFullYear() && b.createdAt.getMonth() === d.getMonth()).length });
  }
  const converted = buyers.filter((b) => b.stage === "CONVERTED").length;
  const commercial = can(user.role, "commercial:read");
  const payments = commercial ? await db.commissionPayment.findMany({ where: { receivedAt: { gte: from, lte: to } } }) : [];
  const commissions = commercial ? await db.commission.findMany({ where: { status: { notIn: ["CANCELLED", "NOT_ELIGIBLE"] } }, include: { payments: true } }) : [];
  const outstanding = commissions.reduce((s, c) => s + Math.max(0, c.amountEarned - sumPayments(c.payments)), 0);
  const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Reports" subtitle="Simple, filterable reports computed from saved records." actions={can(user.role, "buyers:export") ? <a href={`/api/admin/export/buyers?format=xlsx${sp.project ? `&project=${sp.project}` : ""}`} className={buttonClass("outline")}><Download className="size-4" /> Export buyers</a> : undefined} />
      <form className="mb-6 grid gap-3 rounded-3xl border border-ink-900/[0.07] bg-white p-4 shadow-soft sm:grid-cols-3 lg:grid-cols-7 lg:items-end">
        <Field label="From"><Input type="date" name="from" defaultValue={d(from)} /></Field>
        <Field label="To"><Input type="date" name="to" defaultValue={d(to)} /></Field>
        <Field label="Location"><Select name="location" defaultValue={sp.location ?? ""}><option value="">All</option>{locations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Project"><Select name="project" defaultValue={sp.project ?? ""}><option value="">All</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Developer"><Select name="developer" defaultValue={sp.developer ?? ""}><option value="">All</option>{developers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Campaign"><Select name="campaign" defaultValue={sp.campaign ?? ""}><option value="">All</option>{campaigns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <button className={buttonClass("primary", "md", "h-[42px]")}>Apply</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Inquiries in period", buyers.length], ["Converted", converted], ["Conversion rate", buyers.length ? percent(converted / buyers.length, 1) : "—"], ["Priority A", buyers.filter((b) => b.priority === "A").length]].map(([l, v]) => <Card key={l as string} className="p-5"><p className="text-[12px] text-stone-500">{l}</p><p className="num mt-1 text-3xl font-semibold text-ink-900">{v}</p></Card>)}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card><CardHeader title="Monthly inquiries" /><div className="p-6"><Columns data={months} /></div></Card>
        <Card><CardHeader title="Lead funnel" subtitle="Current stage of buyers in this period" /><div className="p-6"><BarList data={LEAD_STAGES.map((s) => ({ label: LEAD_STAGE[s].label, value: buyers.filter((b) => b.stage === s).length }))} /></div></Card>
        <Card><CardHeader title="Lead sources" /><div className="p-6"><BarList data={count(buyers, (b) => b.leadSource)} /></div></Card>
        <Card><CardHeader title="Demand by location" /><div className="p-6"><BarList data={count(buyers, (b) => [...new Set(b.interests.map((i) => i.project.location.name))]).slice(0, 8)} /></div></Card>
        <Card><CardHeader title="Demand by configuration" /><div className="p-6"><BarList data={count(buyers, (b) => [...new Set(b.interests.flatMap((i) => i.configurations))].map(formatBhk))} /></div></Card>
        <Card><CardHeader title="Looking for" /><div className="p-6"><BarList data={count(buyers, (b) => b.requirements[0]?.intents.map((i) => INTENT[i].short))} /></div></Card>
        <Card><CardHeader title="Could commit within" /><div className="p-6"><BarList data={COMMIT_OPTIONS.map((o) => ({ label: o.label, value: buyers.filter((b) => b.requirements[0]?.commitWithinDays === o.days).length })).filter((x) => x.value)} /></div></Card>
        <Card><CardHeader title="Possession — willing to wait" /><div className="p-6"><BarList data={POSSESSION_OPTIONS.map((o) => ({ label: o.label, value: buyers.filter((b) => b.requirements[0]?.possessionWaitMonths === o.months).length })).filter((x) => x.value)} /></div></Card>
        {commercial && (
          <Card><CardHeader title="Commission" subtitle="Received in period vs outstanding overall" /><div className="space-y-3 p-6"><p className="num font-serif text-3xl text-ink-900">{formatINR(payments.reduce((s, p) => s + p.amount, 0))}</p><p className="text-[12.5px] text-stone-500">received in period</p><p className="num text-lg font-semibold text-ink-900">{formatINR(outstanding)} <span className="text-[12.5px] font-normal text-stone-500">outstanding</span></p><a href="/api/admin/export/commissions" className="inline-block text-[13px] text-gold-700 underline">Download statement</a></div></Card>
        )}
      </div>
      <p className="mt-6 text-[11.5px] text-stone-400">Filters: {q || "none"}.</p>
    </div>
  );
}
