import type { Task } from "@prisma/client";
import { CalendarClock } from "lucide-react";
import { ActionForm, SubmitButton } from "./action-form";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input, Select } from "../ui/field";
import { formatDateTime } from "@/lib/format";
import { dueBucket } from "@/lib/time";
import { cancelFollowUpAction, completeFollowUpAction, createFollowUpAction, rescheduleFollowUpAction } from "@/app/admin/(app)/follow-ups/actions";

type Link = { buyerId?: string; developerId?: string; inventoryUnitId?: string; negotiationId?: string };
type Row = Task & { assignee: { name: string } | null };

export const DUE_TONE = { OVERDUE: "danger", TODAY: "warning", UPCOMING: "neutral", UNSCHEDULED: "muted" } as const;
export const DUE_LABEL = { OVERDUE: "Overdue", TODAY: "Due today", UPCOMING: "Upcoming", UNSCHEDULED: "No date" } as const;

/** Follow-ups attached to one record, with done / reschedule / cancel and a quick "schedule next". */
export function FollowUpList({ title, tasks, link, users, canWrite, defaultTitle }: { title: string; tasks: Row[]; link: Link; users: { id: string; name: string }[]; canWrite: boolean; defaultTitle: string }) {
  const open = tasks.filter((t) => t.status === "OPEN");
  const closed = tasks.filter((t) => t.status !== "OPEN").slice(0, 5);
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-ink-900"><CalendarClock className="size-4 text-gold-600" /> {title}</h3>
      <ul className="mt-3 space-y-2">
        {open.map((t) => {
          const b = dueBucket(t.dueAt);
          return (
            <li key={t.id} className="rounded-xl bg-ivory-100 px-3 py-2.5 text-[13px]">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-ink-900">{t.title}</span>
                <Badge tone={DUE_TONE[b]}>{DUE_LABEL[b]}</Badge>
              </div>
              <p className="text-[12px] text-stone-500">{t.dueAt ? formatDateTime(t.dueAt) : "No date"}{t.assignee ? ` · ${t.assignee.name}` : ""}</p>
              {canWrite && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[12px] font-medium text-gold-700">Update</summary>
                  <ActionForm action={completeFollowUpAction} resetOnSuccess className="mt-2 space-y-2">
                    <input type="hidden" name="taskId" value={t.id} />
                    <Input name="outcome" placeholder="What happened?" />
                    <div className="grid grid-cols-[1fr_auto] gap-2"><Input type="datetime-local" name="nextDueAt" aria-label="Next follow-up (optional)" /><SubmitButton size="sm">Done</SubmitButton></div>
                    <p className="text-[11px] text-stone-500">Add a date to schedule the next follow-up in the same step (IST).</p>
                  </ActionForm>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <ActionForm action={rescheduleFollowUpAction} className="flex gap-1"><input type="hidden" name="taskId" value={t.id} /><Input type="datetime-local" name="dueAt" aria-label="New date" /><SubmitButton size="sm" variant="outline">Move</SubmitButton></ActionForm>
                    <ActionForm action={cancelFollowUpAction} className="flex gap-1"><input type="hidden" name="taskId" value={t.id} /><Input name="reason" placeholder="Reason" /><SubmitButton size="sm" variant="ghost">Cancel</SubmitButton></ActionForm>
                  </div>
                </details>
              )}
            </li>
          );
        })}
        {!open.length && <li className="text-[13px] text-stone-500">No open follow-ups.</li>}
      </ul>
      {closed.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-ink-900/5 pt-3 text-[12px] text-stone-500">
          {closed.map((t) => <li key={t.id}><span className={t.status === "DONE" ? "text-sage-600" : "text-stone-400"}>{t.status === "DONE" ? "Done" : "Cancelled"}</span> · {t.title}{t.outcome ? ` — ${t.outcome}` : ""} · {formatDateTime(t.completedAt ?? t.cancelledAt)}</li>)}
        </ul>
      )}
      {canWrite && (
        <ActionForm action={createFollowUpAction} resetOnSuccess className="mt-4 space-y-2 border-t border-ink-900/5 pt-4">
          {Object.entries(link).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <Input name="title" defaultValue={defaultTitle} aria-label="Next action" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="datetime-local" name="dueAt" aria-label="Due (IST)" />
            <Select name="assigneeId" defaultValue="" aria-label="Assign to"><option value="">Me</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          </div>
          <SubmitButton size="sm" variant="outline">Schedule follow-up</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );
}
