"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { BuyerRow } from "@/lib/queries/buyers";
import { Badge, LabelBadge } from "../ui/badge";
import { Avatar } from "../ui/misc";
import { ActionForm, SubmitButton } from "./action-form";
import { bulkAction } from "@/app/admin/(app)/buyers/actions";
import { INTEREST_TIER, LEAD_STAGE, LEAD_STAGES, PRIORITY } from "@/lib/labels";
import { formatBhkList, formatBudgetRange, formatINR, relativeTime } from "@/lib/format";
import { commitLabel } from "@/lib/domain/timelines";
import { cn } from "@/lib/cn";

export function BuyerTable({ rows, head, canWrite, reps, campaigns }: { rows: BuyerRow[]; head: React.ReactNode; canWrite: boolean; reps: { value: string; label: string }[]; campaigns: { value: string; label: string }[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [op, setOp] = useState("stage");
  const all = rows.length > 0 && sel.length === rows.length;
  const now = new Date();
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-3xl border border-ink-900/[0.07] bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="border-b border-ink-900/5 bg-ivory-50/60">
              <tr>
                {canWrite && (
                  <th className="w-10 px-4"><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} className="size-4 accent-ink-900" /></th>
                )}
                {head}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-900/5">
              {rows.map((r) => {
                const req = r.requirements[0];
                const rental = req?.intents.every((i) => i.startsWith("RENT"));
                const overdue = r.nextFollowUpAt && r.nextFollowUpAt < now;
                return (
                  <tr key={r.id} className={cn("transition hover:bg-ivory-50", sel.includes(r.id) && "bg-gold-200/20")}>
                    {canWrite && <td className="px-4"><input type="checkbox" aria-label={`Select ${r.fullName}`} checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} className="size-4 accent-ink-900" /></td>}
                    <td className="px-4 py-3">
                      <Link href={`/admin/buyers/${r.id}`} className="flex items-center gap-3">
                        <Avatar name={r.fullName} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink-900 hover:underline">{r.fullName}</span>
                          <span className="num block truncate text-[12px] text-stone-500">{r.phoneDisplay}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3"><LabelBadge map={PRIORITY} value={r.priority} /></td>
                    <td className="px-4 py-3"><LabelBadge map={LEAD_STAGE} value={r.stage} /></td>
                    <td className="max-w-[220px] px-4 py-3">
                      {r.interests[0] ? (
                        <span className="block truncate text-[13px] text-ink-900">{r.interests[0].project.name}{r._count.interests > 1 ? <span className="text-stone-400"> +{r._count.interests - 1}</span> : null}</span>
                      ) : <span className="text-[13px] text-stone-400">General</span>}
                      <span className="block text-[11.5px] text-stone-500">{r.interests[0] ? INTEREST_TIER[r.interests[0].tier].label : req?.intents.length ? req.intents[0]!.replace(/_/g, " ").toLowerCase() : ""}{req?.configurations.length ? ` · ${formatBhkList(req.configurations)}` : ""}</span>
                    </td>
                    <td className="num px-4 py-3 text-[13px] text-ink-900">{rental ? (req?.rentMax ? `≤ ${formatINR(req.rentMax)}/mo` : "—") : formatBudgetRange(r.budgetMin, r.budgetMax)}</td>
                    <td className="px-4 py-3 text-[12.5px] text-stone-600">{commitLabel(req?.commitWithinDays)}</td>
                    <td className="px-4 py-3 text-[12.5px] text-stone-600">{r.assignedTo?.name ?? <span className="text-stone-400">Unassigned</span>}</td>
                    <td className={cn("px-4 py-3 text-[12.5px]", overdue ? "font-medium text-clay-600" : "text-stone-600")}>{r.nextFollowUpAt ? relativeTime(r.nextFollowUpAt) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <AnimatePresence>
        {sel.length > 0 && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="sticky bottom-4 z-20 mt-4 flex justify-center">
            <ActionForm action={bulkAction} onSuccess={() => setSel([])} className="flex flex-wrap items-center gap-2 rounded-full bg-ink-900 p-2 pl-5 text-sm text-white shadow-lift">
              {sel.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
              <Badge tone="gold">{sel.length} selected</Badge>
              <select name="op" value={op} onChange={(e) => setOp(e.target.value)} className="h-9 rounded-full bg-white/10 px-3 text-white" aria-label="Bulk action">
                <option value="stage" className="text-ink-900">Move to stage</option>
                <option value="assign" className="text-ink-900">Assign to</option>
                <option value="campaign" className="text-ink-900">Add to campaign</option>
                <option value="followup" className="text-ink-900">Set follow-up date</option>
              </select>
              {op === "stage" && <select name="value" className="h-9 rounded-full bg-white/10 px-3" aria-label="Stage">{LEAD_STAGES.map((s) => <option key={s} value={s} className="text-ink-900">{LEAD_STAGE[s].label}</option>)}</select>}
              {op === "assign" && <select name="value" className="h-9 rounded-full bg-white/10 px-3" aria-label="Representative"><option value="" className="text-ink-900">Unassigned</option>{reps.map((r) => <option key={r.value} value={r.value} className="text-ink-900">{r.label}</option>)}</select>}
              {op === "campaign" && <select name="value" className="h-9 max-w-56 rounded-full bg-white/10 px-3" aria-label="Campaign">{campaigns.map((r) => <option key={r.value} value={r.value} className="text-ink-900">{r.label}</option>)}</select>}
              {op === "followup" && <input type="date" name="value" required className="h-9 rounded-full bg-white/10 px-3 text-white [color-scheme:dark]" aria-label="Follow-up date" />}
              <SubmitButton variant="gold" size="sm" pendingLabel="Applying…">Apply</SubmitButton>
              <button type="button" onClick={() => setSel([])} className="px-3 text-[13px] text-ink-300 hover:text-white">Cancel</button>
            </ActionForm>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
