"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import type { LeadStage, Priority } from "@prisma/client";
import { LEAD_STAGE, LEAD_STAGES } from "@/lib/labels";
import { moveStageAction } from "@/app/admin/(app)/buyers/actions";
import { formatBudgetRange } from "@/lib/format";
import { cn } from "@/lib/cn";

type Card = { id: string; fullName: string; stage: LeadStage; priority: Priority; budgetMin: number | null; budgetMax: number | null; project: string | null; owner: string | null };

export function Pipeline({ cards, canWrite }: { cards: Card[]; canWrite: boolean }) {
  const [items, setOptimistic] = useOptimistic(cards, (state: Card[], m: { id: string; stage: LeadStage }) => state.map((c) => (c.id === m.id ? { ...c, stage: m.stage } : c)));
  const [, start] = useTransition();
  const [over, setOver] = useState<LeadStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const move = (id: string, stage: LeadStage) =>
    start(async () => {
      setOptimistic({ id, stage });
      const r = await moveStageAction(id, stage);
      setError(r?.error ?? null);
    });
  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-clay-50 px-4 py-2 text-sm text-clay-600">{error}</p>}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        {LEAD_STAGES.map((s) => {
          const col = items.filter((c) => c.stage === s);
          return (
            <section
              key={s}
              aria-label={LEAD_STAGE[s].label}
              onDragOver={(e) => { if (canWrite) { e.preventDefault(); setOver(s); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, s); }}
              className={cn("flex w-[268px] shrink-0 flex-col rounded-3xl border p-2 transition", over === s ? "border-gold-500 bg-gold-200/30" : "border-ink-900/[0.06] bg-ivory-50/70")}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <p className="text-[13px] font-semibold text-ink-900">{LEAD_STAGE[s].label}</p>
                <span className="num rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-500 shadow-soft">{col.length}</span>
              </header>
              <div className="flex min-h-24 flex-col gap-2">
                {col.map((c) => (
                  <article key={c.id} draggable={canWrite} onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)} className="group rounded-2xl border border-ink-900/[0.06] bg-white p-3.5 shadow-soft transition hover:shadow-lift active:cursor-grabbing">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/admin/buyers/${c.id}`} className="truncate text-[13.5px] font-medium text-ink-900 hover:underline">{c.fullName}</Link>
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[10.5px] font-bold", c.priority === "A" ? "bg-ink-900 text-gold-300" : "bg-ivory-200 text-stone-600")}>{c.priority}</span>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-stone-500">{c.project ?? "General requirement"}</p>
                    <p className="num mt-2 text-[12.5px] font-medium text-ink-800">{formatBudgetRange(c.budgetMin, c.budgetMax)}</p>
                    {canWrite && (
                      <select value={c.stage} onChange={(e) => move(c.id, e.target.value as LeadStage)} className="mt-2 w-full rounded-lg border border-ink-900/10 bg-ivory-50 px-2 py-1 text-[11.5px] text-stone-600 md:hidden" aria-label={`Move ${c.fullName}`}>
                        {LEAD_STAGES.map((x) => <option key={x} value={x}>{LEAD_STAGE[x].label}</option>)}
                      </select>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
