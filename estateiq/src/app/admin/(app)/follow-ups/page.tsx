import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { FollowUpRow } from "@/components/admin/follow-up-row";
import { Card, CardHeader } from "@/components/ui/card";
import { LabelBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { VISIT_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { istDay, istMonthStart, istParts } from "@/lib/time";
import { cn } from "@/lib/cn";
import { createFollowUpAction, scheduleVisitAction, visitOutcomeAction } from "./actions";

export const metadata = { title: "Follow-ups" };

const BUCKETS = { overdue: "Overdue", today: "Due today", upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled" } as const;
type Bucket = keyof typeof BUCKETS;
const TYPES = { all: "Everything", buyer: "Buyers", developer: "Developers", inventory: "Inventory", negotiation: "Negotiations", general: "General" } as const;
type Kind = keyof typeof TYPES;

export default async function FollowUps({ searchParams }: { searchParams: Promise<{ view?: string; bucket?: string; type?: string; mine?: string; month?: string; buyer?: string }> }) {
  const user = await requirePermission("visits:read");
  const sp = await searchParams;
  const w = can(user.role, "visits:write");
  const mine = user.role === "SALES_REP" || sp.mine === "1";
  const view = sp.view === "visits" ? "visits" : "followups";
  const bucket: Bucket = (sp.bucket as Bucket) in BUCKETS ? (sp.bucket as Bucket) : "overdue";
  const kind: Kind = (sp.type as Kind) in TYPES ? (sp.type as Kind) : "all";
  const now = new Date();
  const { start, end } = istDay(now);
  const manager = ["SUPER_ADMIN", "OPERATIONS_MANAGER"].includes(user.role);

  // What this role may see at all.
  const visible: Prisma.TaskWhereInput[] = [
    ...(can(user.role, "buyers:read") ? [] : [{ buyerId: null }]),
    ...(can(user.role, "commercial:read") ? [] : [{ negotiationId: null }]),
    ...(manager ? [] : [{ OR: [{ inventoryUnitId: null }, { inventoryUnit: { confidentiality: { not: "RESTRICTED" as const } } }] }]),
    ...(mine ? [{ assigneeId: user.id }] : []),
  ];
  const kindWhere: Record<Kind, Prisma.TaskWhereInput> = {
    all: {},
    buyer: { buyerId: { not: null } },
    developer: { developerId: { not: null }, negotiationId: null },
    inventory: { inventoryUnitId: { not: null } },
    negotiation: { negotiationId: { not: null } },
    general: { buyerId: null, developerId: null, inventoryUnitId: null, negotiationId: null },
  };
  const bucketWhere: Record<Bucket, Prisma.TaskWhereInput> = {
    overdue: { status: "OPEN", dueAt: { lt: start } },
    today: { status: "OPEN", dueAt: { gte: start, lt: end } },
    upcoming: { status: "OPEN", OR: [{ dueAt: { gte: end } }, { dueAt: null }] },
    completed: { status: "DONE", completedAt: { gte: new Date(now.getTime() - 30 * 864e5) } },
    cancelled: { status: "CANCELLED", cancelledAt: { gte: new Date(now.getTime() - 30 * 864e5) } },
  };
  const base: Prisma.TaskWhereInput = { AND: [...visible, kindWhere[kind]] };
  const include = {
    assignee: { select: { name: true } },
    buyer: { select: { id: true, fullName: true, priority: true } },
    developer: { select: { id: true, name: true } },
    inventoryUnit: { select: { id: true, reference: true, projectName: true } },
    negotiation: { select: { id: true, title: true } },
  } as const;
  const orderBy: Prisma.TaskOrderByWithRelationInput[] = bucket === "completed" ? [{ completedAt: "desc" }] : bucket === "cancelled" ? [{ cancelledAt: "desc" }] : [{ dueAt: { sort: "asc", nulls: "last" } }];
  const [counts, rows, startCandidates] = await Promise.all([
    Promise.all((Object.keys(BUCKETS) as Bucket[]).map(async (k) => [k, await db.task.count({ where: { AND: [base, bucketWhere[k]] } })] as const)),
    db.task.findMany({ where: { AND: [base, bucketWhere[bucket]] }, orderBy, take: 150, include }),
    db.task.findMany({ where: { AND: [base, { status: "OPEN", dueAt: { lt: end } }] }, orderBy: [{ dueAt: "asc" }], take: 200, include }),
  ]);
  // Most urgent: buyer priority A first (then B, C, D; non-buyer items rank as B), then the longest overdue.
  const rank = (t: (typeof startCandidates)[number]) => ({ A: 0, B: 1, C: 2, D: 3 } as Record<string, number>)[t.buyer?.priority ?? "B"] ?? 1;
  const startHere = [...startCandidates].sort((a, b) => rank(a) - rank(b) || (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0))[0] ?? null;
  const count = Object.fromEntries(counts) as Record<Bucket, number>;
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const cur: Record<string, string | undefined> = { bucket: sp.bucket, type: sp.type, mine: sp.mine, view: sp.view };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) q.set(k, v);
    return `/admin/follow-ups${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Follow-ups"
        subtitle="Every next step for buyers, developers, inventory and negotiations in one place. Times are India Standard Time."
        actions={user.role !== "SALES_REP" ? <Link href={href({ mine: mine ? null : "1" })} className="rounded-full border border-ink-900/10 bg-white px-4 py-2 text-[13px] font-medium">{mine ? "Show everyone" : "Only mine"}</Link> : undefined}
      />
      <div className="mb-5 inline-flex gap-1 rounded-full border border-ink-900/[0.07] bg-white p-1 shadow-soft">
        <Link href={href({ view: null })} className={cn("rounded-full px-4 py-2 text-[13px] font-medium", view === "followups" ? "bg-ink-900 text-white" : "text-stone-600")}>Follow-up centre</Link>
        <Link href={href({ view: "visits" })} className={cn("rounded-full px-4 py-2 text-[13px] font-medium", view === "visits" ? "bg-ink-900 text-white" : "text-stone-600")}>Site visits</Link>
      </div>

      {view === "followups" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            {startHere && (
              <Card className="overflow-hidden">
                <p className="flex items-center gap-2 bg-ink-900 px-5 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300"><Sparkles className="size-3.5" /> Start here — most urgent next step</p>
                <ul><FollowUpRow t={startHere} canWrite={w} highlight /></ul>
              </Card>
            )}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(BUCKETS) as Bucket[]).map((k) => (
                <Link key={k} href={href({ bucket: k === "overdue" ? null : k })} className={cn("rounded-full border px-4 py-2 text-[13px]", bucket === k ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white text-stone-700")}>
                  {BUCKETS[k]} <span className={cn("num ml-1", k === "overdue" && count.overdue && bucket !== k ? "font-semibold text-clay-600" : "opacity-60")}>{count[k]}</span>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TYPES) as Kind[]).filter((k) => (k !== "negotiation" || can(user.role, "commercial:read")) && (k !== "buyer" || can(user.role, "buyers:read"))).map((k) => (
                <Link key={k} href={href({ type: k === "all" ? null : k })} className={cn("rounded-full px-3 py-1.5 text-[12.5px]", kind === k ? "bg-gold-300 text-ink-950" : "bg-ivory-200 text-stone-600")}>{TYPES[k]}</Link>
              ))}
            </div>
            <Card>
              <ul className="divide-y divide-ink-900/5">
                {rows.map((t) => <FollowUpRow key={t.id} t={t} canWrite={w} />)}
              </ul>
              {!rows.length && <p className="px-6 py-12 text-center text-sm text-stone-500">{bucket === "overdue" ? "Nothing overdue — well done." : bucket === "today" ? "Nothing else due today." : "Nothing here."}</p>}
              {rows.length === 150 && <p className="border-t border-ink-900/5 px-6 py-3 text-[12px] text-stone-500">Showing the first 150.</p>}
            </Card>
          </div>
          <div className="space-y-5">
            {w && (
              <Card className="p-6">
                <h3 className="font-semibold text-ink-900">New follow-up</h3>
                <p className="mt-1 text-[12px] text-stone-500">For a buyer, developer, unit or negotiation, open its page and use “Schedule follow-up” there so it stays linked. Use this for general tasks.</p>
                <ActionForm action={createFollowUpAction} resetOnSuccess className="mt-3 space-y-2">
                  <Input name="title" placeholder="Next action (e.g. Send Borivali shortlist to Riya)" />
                  <Input type="datetime-local" name="dueAt" aria-label="Due (IST)" />
                  <Textarea name="notes" placeholder="Notes (optional)" rows={2} />
                  <SubmitButton size="sm">Add</SubmitButton>
                </ActionForm>
              </Card>
            )}
            <Card className="p-6 text-[13px] text-stone-600">
              <h3 className="font-semibold text-ink-900">How follow-ups work</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Overdue = due before today (IST). Due today = any time today.</li>
                <li>Setting “Next follow-up” on a buyer, developer or unit creates or moves its follow-up here.</li>
                <li>Mark done with what happened — and add the next date in the same step.</li>
                <li>Completed and cancelled show the last 30 days.</li>
              </ul>
            </Card>
          </div>
        </div>
      ) : (
        <Visits sp={sp} userId={user.id} role={user.role} canWrite={w} mine={mine} />
      )}
    </div>
  );
}

async function Visits({ sp, userId, role, canWrite: w, mine }: { sp: { month?: string; buyer?: string }; userId: string; role: string; canWrite: boolean; mine: boolean }) {
  const now = new Date();
  const today = istParts(now);
  const [y, m] = (sp.month ?? `${today.y}-${today.m}`).split("-").map(Number) as [number, number];
  const monthStart = istMonthStart(y, m);
  const monthEnd = istMonthStart(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
  const scope = mine ? { assignedToId: userId } : {};
  const [visits, requested, buyers, projects, reps] = await Promise.all([
    db.siteVisit.findMany({ where: { scheduledAt: { gte: monthStart, lt: monthEnd }, ...scope }, orderBy: { scheduledAt: "asc" }, include: { buyer: { select: { id: true, fullName: true } }, project: { select: { name: true } }, assignedTo: { select: { name: true } } } }),
    db.siteVisit.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "asc" }, include: { buyer: { select: { id: true, fullName: true } }, project: { select: { id: true, name: true } } } }),
    w ? db.buyer.findMany({ where: { anonymizedAt: null, stage: { notIn: ["CONVERTED", "LOST"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : [],
    w ? db.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    db.user.findMany({ where: { active: true, role: { in: ["SALES_REP", "OPERATIONS_MANAGER", "SUPER_ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (istParts(monthStart).weekday + 6) % 7;
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => (i - lead >= 0 && i - lead < days ? i - lead + 1 : null));
  const prev = `${m === 1 ? y - 1 : y}-${m === 1 ? 12 : m - 1}`;
  const next = `${m === 12 ? y + 1 : y}-${m === 12 ? 1 : m + 1}`;
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(monthStart);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
            <div className="flex items-center gap-2">
              <Link href={`/admin/follow-ups?view=visits&month=${prev}`} aria-label="Previous month" className="grid size-9 place-items-center rounded-full border border-ink-900/10"><ChevronLeft className="size-4" /></Link>
              <h2 className="min-w-40 text-center font-serif text-2xl text-ink-900">{monthLabel}</h2>
              <Link href={`/admin/follow-ups?view=visits&month=${next}`} aria-label="Next month" className="grid size-9 place-items-center rounded-full border border-ink-900/10"><ChevronRight className="size-4" /></Link>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-stone-500">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                const dv = day ? visits.filter((v) => v.scheduledAt && istParts(v.scheduledAt).day === day) : [];
                const isToday = day === today.day && m === today.m && y === today.y;
                return (
                  <div key={i} className={cn("min-h-24 rounded-xl p-1.5 text-left", day ? "bg-ivory-50" : "", isToday && "ring-2 ring-gold-400")}>
                    {day && <p className={cn("num mb-1 text-[12px] font-semibold", isToday ? "text-gold-700" : "text-stone-500")}>{day}</p>}
                    <div className="space-y-1">
                      {dv.slice(0, 3).map((v) => <Link key={v.id} href={`/admin/buyers/${v.buyer.id}`} title={`${v.buyer.fullName} · ${v.project.name} · ${v.assignedTo?.name ?? ""}`} className={cn("block truncate rounded-md px-1.5 py-0.5 text-[10.5px]", v.status === "CANCELLED" ? "bg-stone-300/30 text-stone-400 line-through" : v.status === "COMPLETED" ? "bg-sage-50 text-sage-600" : "bg-ink-900 text-ivory-100")}>{formatTime(v.scheduledAt)} {v.buyer.fullName.split(" ")[0]}</Link>)}
                      {dv.length > 3 && <p className="text-[10px] text-stone-500">+{dv.length - 3} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={`Visits this month (${visits.length})`} />
          <ul className="divide-y divide-ink-900/5 p-4">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
                <div><Link href={`/admin/buyers/${v.buyer.id}`} className="font-medium text-ink-900 hover:underline">{v.buyer.fullName}</Link><p className="text-[12px] text-stone-500">{v.project.name} · {formatDateTime(v.scheduledAt)} · {v.assignedTo?.name ?? "Unassigned"}{v.meetingPoint ? ` · ${v.meetingPoint}` : ""}</p>{v.outcome && <p className="text-[12px] text-stone-600">“{v.outcome}”</p>}</div>
                {w ? (
                  <ActionForm action={visitOutcomeAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="visitId" value={v.id} />
                    <Select name="status" defaultValue={v.status} className="w-36 py-1.5 text-[12.5px]">{Object.entries(VISIT_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</Select>
                    <Input name="outcome" defaultValue={v.outcome ?? ""} placeholder="Outcome" className="w-44 py-1.5 text-[12.5px]" />
                    <Input type="datetime-local" name="nextFollowUpAt" aria-label="Next follow-up (IST)" className="w-48 py-1.5 text-[12.5px]" />
                    <SubmitButton size="sm" variant="outline">Save</SubmitButton>
                  </ActionForm>
                ) : <LabelBadge map={VISIT_STATUS} value={v.status} />}
              </li>
            ))}
            {!visits.length && <li className="py-10 text-center text-sm text-stone-500">No visits this month.</li>}
          </ul>
        </Card>
      </div>
      <div className="space-y-5">
        {w && (
          <Card className="p-6" id="schedule">
            <h3 className="font-semibold text-ink-900">Schedule a site visit</h3>
            <ActionForm action={scheduleVisitAction} className="mt-4 space-y-3">
              <Field label="Buyer"><Select name="buyerId" defaultValue={sp.buyer ?? ""}><option value="">Choose…</option>{buyers.map((b) => <option key={b.id} value={b.id}>{b.fullName}</option>)}</Select></Field>
              <Field label="Project"><Select name="projectId" defaultValue=""><option value="">Choose…</option>{projects.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date & time (IST)"><Input type="datetime-local" name="scheduledAt" /></Field>
                <Field label="Duration"><Select name="durationMins" defaultValue="60">{[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}</Select></Field>
              </div>
              <Field label="Representative"><Select name="assignedToId" defaultValue={role === "SALES_REP" ? userId : ""}><option value="">Unassigned</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
              <Field label="Meeting point"><Input name="meetingPoint" placeholder="Site sales office" /></Field>
              <Field label="Status"><Select name="status" defaultValue="SCHEDULED"><option value="SCHEDULED">Scheduled</option><option value="CONFIRMED">Confirmed</option></Select></Field>
              <Field label="Notes"><Textarea name="notes" /></Field>
              <Checkbox name="force" label="Schedule anyway if there is a clash" />
              <SubmitButton className="w-full">Save visit</SubmitButton>
            </ActionForm>
          </Card>
        )}
        <Card className="p-6">
          <h3 className="font-semibold text-ink-900">Visit requests from buyers ({requested.length})</h3>
          <ul className="mt-3 space-y-2">
            {requested.map((r) => <li key={r.id} className="rounded-xl bg-gold-200/30 px-3 py-2.5 text-[13px]"><Link href={`/admin/buyers/${r.buyer.id}`} className="font-medium text-ink-900 hover:underline">{r.buyer.fullName}</Link><p className="text-[12px] text-stone-600">{r.project.name} · {r.preferredWindow ?? "Any time"} · requested {formatDate(r.createdAt)}</p>{r.notes && <p className="text-[12px] text-stone-500">“{r.notes}”</p>}</li>)}
            {!requested.length && <li className="text-[13px] text-stone-500">No pending requests.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
