import Link from "next/link";
import { Building2, CalendarClock, Gem, Handshake, User } from "lucide-react";
import { ActionForm, SubmitButton } from "./action-form";
import { Badge } from "../ui/badge";
import { Input } from "../ui/field";
import { formatDateTime, relativeTime } from "@/lib/format";
import { dueBucket } from "@/lib/time";
import { cn } from "@/lib/cn";
import { cancelFollowUpAction, completeFollowUpAction, rescheduleFollowUpAction } from "@/app/admin/(app)/follow-ups/actions";
import { DUE_LABEL, DUE_TONE } from "./follow-up-list";

export interface FollowUpRowData {
  id: string;
  title: string;
  dueAt: Date | null;
  status: "OPEN" | "DONE" | "CANCELLED";
  notes: string | null;
  outcome: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  assignee: { name: string } | null;
  buyer: { id: string; fullName: string; priority: string } | null;
  developer: { id: string; name: string } | null;
  inventoryUnit: { id: string; reference: string; projectName: string } | null;
  negotiation: { id: string; title: string } | null;
}

export function followUpSubject(t: FollowUpRowData): { kind: string; label: string; href: string | null; Icon: typeof User } {
  if (t.negotiation) return { kind: "Negotiation", label: t.negotiation.title, href: `/admin/negotiations/${t.negotiation.id}`, Icon: Handshake };
  if (t.inventoryUnit) return { kind: "Inventory", label: `${t.inventoryUnit.reference} · ${t.inventoryUnit.projectName}`, href: `/admin/inventory/${t.inventoryUnit.id}`, Icon: Gem };
  if (t.buyer) return { kind: "Buyer", label: t.buyer.fullName, href: `/admin/buyers/${t.buyer.id}`, Icon: User };
  if (t.developer) return { kind: "Developer", label: t.developer.name, href: `/admin/developers/${t.developer.id}`, Icon: Building2 };
  return { kind: "General", label: "General task", href: null, Icon: CalendarClock };
}

/** One follow-up: what to do, for whom, when (IST) — and the buttons to close it out. */
export function FollowUpRow({ t, canWrite, highlight }: { t: FollowUpRowData; canWrite: boolean; highlight?: boolean }) {
  const subj = followUpSubject(t);
  const b = dueBucket(t.dueAt);
  return (
    <li className={cn("px-5 py-3.5", highlight && "bg-ink-900 text-ivory-100")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", highlight ? "bg-white/10 text-gold-300" : "bg-ivory-100 text-gold-700")}><subj.Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[14px] font-medium", highlight ? "text-ivory-50" : "text-ink-900")}>{t.title}</p>
          <p className={cn("text-[12.5px]", highlight ? "text-ink-300" : "text-stone-500")}>
            {subj.kind}: {subj.href ? <Link href={subj.href} className={cn("underline-offset-2 hover:underline", highlight ? "text-ivory-100" : "text-ink-800")}>{subj.label}</Link> : subj.label}
            {t.buyer ? ` · Priority ${t.buyer.priority}` : ""}{t.assignee ? ` · ${t.assignee.name}` : ""}
          </p>
          {t.notes && <p className={cn("mt-0.5 text-[12px]", highlight ? "text-ink-300" : "text-stone-500")}>{t.notes}</p>}
          {t.status !== "OPEN" && <p className="mt-0.5 text-[12px] text-stone-500">{t.status === "DONE" ? "Done" : "Cancelled"} {formatDateTime(t.completedAt ?? t.cancelledAt)}{t.outcome ? ` — ${t.outcome}` : ""}</p>}
        </div>
        <div className="text-right">
          {t.status === "OPEN" ? <Badge tone={highlight ? "gold" : DUE_TONE[b]}>{DUE_LABEL[b]}</Badge> : <Badge tone={t.status === "DONE" ? "positive" : "muted"}>{t.status === "DONE" ? "Completed" : "Cancelled"}</Badge>}
          <p className={cn("num mt-1 text-[12px]", highlight ? "text-ink-300" : "text-stone-500")}>{t.dueAt ? formatDateTime(t.dueAt) : "No date"}</p>
          {t.status === "OPEN" && t.dueAt && <p className={cn("text-[11.5px]", b === "OVERDUE" ? "text-clay-600" : highlight ? "text-ink-400" : "text-stone-400")}>{relativeTime(t.dueAt)}</p>}
        </div>
      </div>
      {canWrite && t.status === "OPEN" && (
        <details className="mt-2 pl-11">
          <summary className={cn("cursor-pointer text-[12.5px] font-medium", highlight ? "text-gold-300" : "text-gold-700")}>Done / move / cancel</summary>
          <div className={cn("mt-2 grid gap-2 rounded-2xl p-3 md:grid-cols-3", highlight ? "bg-white/5" : "bg-ivory-100")}>
            <ActionForm action={completeFollowUpAction} className="space-y-1.5 md:col-span-1">
              <input type="hidden" name="taskId" value={t.id} />
              <Input name="outcome" placeholder="What happened?" />
              <Input type="datetime-local" name="nextDueAt" aria-label="Next follow-up (optional, IST)" />
              <SubmitButton size="sm">Mark done</SubmitButton>
            </ActionForm>
            <ActionForm action={rescheduleFollowUpAction} className="space-y-1.5">
              <input type="hidden" name="taskId" value={t.id} />
              <Input type="datetime-local" name="dueAt" aria-label="New date (IST)" />
              <SubmitButton size="sm" variant="outline">Reschedule</SubmitButton>
            </ActionForm>
            <ActionForm action={cancelFollowUpAction} className="space-y-1.5">
              <input type="hidden" name="taskId" value={t.id} />
              <Input name="reason" placeholder="Why cancel?" />
              <SubmitButton size="sm" variant="ghost">Cancel follow-up</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
    </li>
  );
}
