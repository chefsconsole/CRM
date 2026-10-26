import Link from "next/link";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Card, CardHeader } from "@/components/ui/card";
import { LabelBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { LEAD_STAGE, PRIORITY, VISIT_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, formatTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { scheduleVisitAction, taskAction, visitOutcomeAction } from "./actions";

export const metadata = { title: "Follow-ups" };

export default async function FollowUps({ searchParams }: { searchParams: Promise<{ month?: string; view?: string; new?: string; buyer?: string; mine?: string }> }) {
  const user = await requirePermission("visits:read");
  const sp = await searchParams;
  const w = can(user.role, "visits:write");
  const mine = user.role === "SALES_REP" || sp.mine === "1";
  const now = new Date();
  const [y, m] = (sp.month ?? `${now.getFullYear()}-${now.getMonth() + 1}`).split("-").map(Number) as [number, number];
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const scope = mine ? { assignedToId: user.id } : {};
  const [due, visits, requested, tasks, buyers, projects, reps] = await Promise.all([
    can(user.role, "buyers:read") ? db.buyer.findMany({ where: { anonymizedAt: null, nextFollowUpAt: { lte: end }, stage: { notIn: ["CONVERTED", "LOST"] }, ...scope }, orderBy: [{ priority: "asc" }, { nextFollowUpAt: "asc" }], take: 50, select: { id: true, fullName: true, priority: true, stage: true, nextFollowUpAt: true, assignedTo: { select: { name: true } } } }) : [],
    db.siteVisit.findMany({ where: { scheduledAt: { gte: monthStart, lt: monthEnd }, ...scope }, orderBy: { scheduledAt: "asc" }, include: { buyer: { select: { id: true, fullName: true } }, project: { select: { name: true } }, assignedTo: { select: { name: true } } } }),
    db.siteVisit.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "asc" }, include: { buyer: { select: { id: true, fullName: true } }, project: { select: { id: true, name: true } } } }),
    db.task.findMany({ where: { status: "OPEN", ...(mine ? { assigneeId: user.id } : {}) }, orderBy: { dueAt: "asc" }, include: { assignee: { select: { name: true } }, buyer: { select: { id: true, fullName: true } } } }),
    w ? db.buyer.findMany({ where: { anonymizedAt: null, stage: { notIn: ["CONVERTED", "LOST"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : [],
    w ? db.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    db.user.findMany({ where: { active: true, role: { in: ["SALES_REP", "OPERATIONS_MANAGER", "SUPER_ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const days = new Date(y, m, 0).getDate();
  const lead = (monthStart.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => (i - lead >= 0 && i - lead < days ? i - lead + 1 : null));
  const prev = `${m === 1 ? y - 1 : y}-${m === 1 ? 12 : m - 1}`;
  const next = `${m === 12 ? y + 1 : y}-${m === 12 ? 1 : m + 1}`;
  const view = sp.view === "list" ? "list" : "calendar";
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Follow-ups" subtitle="Buyer follow-ups, site visits and tasks in one place. Visit times are checked for clashes per representative (with a 30-minute travel buffer) and per buyer." actions={user.role !== "SALES_REP" ? <Link href={`/admin/follow-ups?mine=${mine ? "0" : "1"}`} className="rounded-full border border-ink-900/10 bg-white px-4 py-2 text-[13px] font-medium">{mine ? "Show everyone" : "Only mine"}</Link> : undefined} />
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
              <div className="flex items-center gap-2">
                <Link href={`/admin/follow-ups?month=${prev}&view=${view}`} aria-label="Previous month" className="grid size-9 place-items-center rounded-full border border-ink-900/10"><ChevronLeft className="size-4" /></Link>
                <h2 className="min-w-40 text-center font-serif text-2xl text-ink-900">{monthStart.toLocaleString("en-IN", { month: "long", year: "numeric" })}</h2>
                <Link href={`/admin/follow-ups?month=${next}&view=${view}`} aria-label="Next month" className="grid size-9 place-items-center rounded-full border border-ink-900/10"><ChevronRight className="size-4" /></Link>
              </div>
              <div className="flex rounded-full border border-ink-900/10 p-1 text-[13px]">
                {["calendar", "list"].map((v) => <Link key={v} href={`/admin/follow-ups?month=${y}-${m}&view=${v}`} className={cn("rounded-full px-3 py-1.5 capitalize", view === v ? "bg-ink-900 text-white" : "text-stone-600")}>{v}</Link>)}
              </div>
            </div>
            {view === "calendar" ? (
              <div className="p-4">
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-stone-500">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((day, i) => {
                    const dv = day ? visits.filter((v) => v.scheduledAt && v.scheduledAt.getDate() === day) : [];
                    const today = day === now.getDate() && m === now.getMonth() + 1 && y === now.getFullYear();
                    return (
                      <div key={i} className={cn("min-h-24 rounded-xl p-1.5 text-left", day ? "bg-ivory-50" : "", today && "ring-2 ring-gold-400")}>
                        {day && <p className={cn("num mb-1 text-[12px] font-semibold", today ? "text-gold-700" : "text-stone-500")}>{day}</p>}
                        <div className="space-y-1">
                          {dv.slice(0, 3).map((v) => <Link key={v.id} href={`/admin/buyers/${v.buyer.id}`} title={`${v.buyer.fullName} · ${v.project.name} · ${v.assignedTo?.name ?? ""}`} className={cn("block truncate rounded-md px-1.5 py-0.5 text-[10.5px]", v.status === "CANCELLED" ? "bg-stone-300/30 text-stone-400 line-through" : v.status === "COMPLETED" ? "bg-sage-50 text-sage-600" : "bg-ink-900 text-ivory-100")}>{formatTime(v.scheduledAt)} {v.buyer.fullName.split(" ")[0]}</Link>)}
                          {dv.length > 3 && <p className="text-[10px] text-stone-500">+{dv.length - 3} more</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-ink-900/5 p-4">
                {visits.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
                    <div><Link href={`/admin/buyers/${v.buyer.id}`} className="font-medium text-ink-900 hover:underline">{v.buyer.fullName}</Link><p className="text-[12px] text-stone-500">{v.project.name} · {formatDateTime(v.scheduledAt)} · {v.assignedTo?.name ?? "Unassigned"}{v.meetingPoint ? ` · ${v.meetingPoint}` : ""}</p>{v.outcome && <p className="text-[12px] text-stone-600">“{v.outcome}”</p>}</div>
                    {w ? (
                      <ActionForm action={visitOutcomeAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="visitId" value={v.id} />
                        <Select name="status" defaultValue={v.status} className="w-36 py-1.5 text-[12.5px]">{Object.entries(VISIT_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</Select>
                        <Input name="outcome" defaultValue={v.outcome ?? ""} placeholder="Outcome" className="w-44 py-1.5 text-[12.5px]" />
                        <SubmitButton size="sm" variant="outline">Save</SubmitButton>
                      </ActionForm>
                    ) : <LabelBadge map={VISIT_STATUS} value={v.status} />}
                  </li>
                ))}
                {!visits.length && <li className="py-10 text-center text-sm text-stone-500">No visits this month.</li>}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={`Buyer follow-ups due (${due.length})`} subtitle="Today and overdue, highest priority first" />
            <ul className="divide-y divide-ink-900/5 px-4 pb-4">
              {due.map((b) => (
                <li key={b.id}><Link href={`/admin/buyers/${b.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-ivory-100"><Avatar name={b.fullName} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink-900">{b.fullName}</span><span className="block text-[12px] text-stone-500">{LEAD_STAGE[b.stage].label} · {b.assignedTo?.name ?? "Unassigned"}</span></span><LabelBadge map={PRIORITY} value={b.priority} /><span className={cn("w-24 text-right text-[12px]", b.nextFollowUpAt && b.nextFollowUpAt < now ? "text-clay-600" : "text-stone-500")}>{relativeTime(b.nextFollowUpAt)}</span></Link></li>
              ))}
              {!due.length && <li className="py-8 text-center text-sm text-stone-500">All caught up.</li>}
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
                  <Field label="Date & time"><Input type="datetime-local" name="scheduledAt" /></Field>
                  <Field label="Duration"><Select name="durationMins" defaultValue="60">{[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}</Select></Field>
                </div>
                <Field label="Representative"><Select name="assignedToId" defaultValue={user.role === "SALES_REP" ? user.id : ""}><option value="">Unassigned</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
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
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Tasks</h3>
            <ul className="mt-3 space-y-1.5">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2">
                  {w && <ActionForm action={taskAction}><input type="hidden" name="taskId" value={t.id} /><button aria-label={`Complete ${t.title}`} className="mt-0.5 grid size-5 place-items-center rounded-md border border-ink-900/20 hover:bg-sage-50"><Check className="size-3 text-sage-600 opacity-0 hover:opacity-100" /></button></ActionForm>}
                  <div className="text-[13px]"><p className="text-ink-900">{t.title}</p><p className={cn("text-[11.5px]", t.dueAt && t.dueAt < now ? "text-clay-600" : "text-stone-500")}>{t.dueAt ? relativeTime(t.dueAt) : "No due date"} · {t.assignee?.name ?? "—"}{t.buyer ? ` · ${t.buyer.fullName}` : ""}</p></div>
                </li>
              ))}
              {!tasks.length && <li className="text-[13px] text-stone-500">No open tasks.</li>}
            </ul>
            {w && (
              <ActionForm action={taskAction} resetOnSuccess className="mt-4 space-y-2">
                <Input name="title" placeholder="New task…" />
                <div className="grid grid-cols-2 gap-2"><Input type="date" name="dueAt" aria-label="Due date" /><Select name="assigneeId" defaultValue={user.id}>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
                <SubmitButton size="sm">Add task</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
