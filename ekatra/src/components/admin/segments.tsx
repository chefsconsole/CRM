"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, Trash2, Plus } from "lucide-react";
import { ActionForm, SubmitButton } from "./action-form";
import { deleteSegmentAction, saveSegmentAction } from "@/app/admin/(app)/buyers/actions";
import { cn } from "@/lib/cn";

export function SegmentsPanel({ presets, saved, active, query, canDeleteIds }: { presets: { id: string; name: string; description: string }[]; saved: { id: string; name: string }[]; active?: string; query: string; canDeleteIds: string[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="rounded-3xl border border-ink-900/[0.07] bg-white p-3 shadow-soft">
      <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Saved views</p>
      <ul className="space-y-0.5">
        <li><Link href="/admin/buyers" className={cn("block rounded-xl px-3 py-2 text-[13px]", !active && !query ? "bg-ink-900 text-white" : "text-stone-700 hover:bg-ivory-100")}>All buyers</Link></li>
        {presets.map((p) => (
          <li key={p.id}><Link href={`/admin/buyers?segment=${p.id}`} title={p.description} className={cn("block rounded-xl px-3 py-2 text-[13px]", active === p.id ? "bg-ink-900 text-white" : "text-stone-700 hover:bg-ivory-100")}>{p.name}</Link></li>
        ))}
      </ul>
      {saved.length > 0 && (
        <>
          <p className="px-3 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Team segments</p>
          <ul className="space-y-0.5">
            {saved.map((s) => (
              <li key={s.id} className="group flex items-center">
                <Link href={`/admin/buyers?segment=${s.id}`} className={cn("flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-[13px]", active === s.id ? "bg-ink-900 text-white" : "text-stone-700 hover:bg-ivory-100")}><Bookmark className="size-3.5" />{s.name}</Link>
                {canDeleteIds.includes(s.id) && (
                  <form action={deleteSegmentAction.bind(null, s.id)}><button aria-label={`Delete ${s.name}`} className="grid size-8 place-items-center rounded-lg text-stone-400 opacity-0 hover:text-clay-600 group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></button></form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 border-t border-ink-900/5 pt-3">
        {adding ? (
          <ActionForm action={saveSegmentAction} onSuccess={() => setAdding(false)} className="space-y-2 px-1">
            <input type="hidden" name="query" value={query} />
            <input name="name" required maxLength={60} placeholder="e.g. Borivali 2 BHK — ready" className="w-full rounded-xl border border-ink-900/10 px-3 py-2 text-[13px]" aria-label="Segment name" />
            <div className="flex gap-2"><SubmitButton size="sm">Save current filters</SubmitButton><button type="button" onClick={() => setAdding(false)} className="text-[12.5px] text-stone-500">Cancel</button></div>
          </ActionForm>
        ) : (
          <button onClick={() => setAdding(true)} disabled={!query} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-gold-700 hover:bg-ivory-100 disabled:opacity-40" title={query ? "Save the current filters as a reusable segment" : "Apply some filters first"}><Plus className="size-3.5" /> Save current filters</button>
        )}
      </div>
    </div>
  );
}
