"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";

type Opt = { value: string; label: string };

const STAGES: Opt[] = [
  ["NEW_INQUIRY", "New inquiry"], ["CONTACT_PENDING", "Contact pending"], ["CONTACTED", "Contacted"], ["QUALIFIED", "Qualified"], ["VISIT_SCHEDULED", "Visit scheduled"], ["VISIT_COMPLETED", "Visit completed"], ["NEGOTIATION_FOLLOWUP", "Negotiation"], ["BOOKING_IN_PROGRESS", "Booking"], ["CONVERTED", "Converted"], ["LOST", "Lost"],
].map(([value, label]) => ({ value: value!, label: label! }));
const INTENTS: Opt[] = [
  ["RES_SELF_USE", "Home (self-use)"], ["RES_INVESTMENT", "Home (investment)"], ["COM_OFFICE", "Office purchase"], ["COM_RETAIL", "Retail purchase"], ["COM_INVESTMENT", "Commercial investment"], ["PRE_LEASED", "Pre-leased"], ["RENT_RESIDENTIAL", "Rent home"], ["RENT_COMMERCIAL", "Rent commercial"],
].map(([value, label]) => ({ value: value!, label: label! }));
const TIERS: Opt[] = [["EXPRESSION_OF_INTEREST", "Interest only"], ["VERIFIED_LEAD", "Verified lead"], ["FINANCIALLY_QUALIFIED", "Qualified"], ["COMMITTED", "Committed"]].map(([value, label]) => ({ value: value!, label: label! }));

export function BuyerFilterBar({ locations, projects, reps }: { locations: Opt[]; projects: Opt[]; reps: Opt[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(() => ["stage", "loc", "bhk", "intent", "commit", "wait", "budgetAbove", "budgetBelow", "tier", "project", "assigned", "upcoming"].some((k) => sp.get(k)));
  const [q, setQ] = useState(sp.get("q") ?? "");

  function set(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    next.delete("segment");
    next.delete("page");
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    start(() => router.push(`${path}?${next}`));
  }
  const toggle = (k: string, v: string) => {
    const cur = (sp.get(k) ?? "").split(",").filter(Boolean);
    set({ [k]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(",") || null });
  };
  const has = (k: string, v: string) => (sp.get(k) ?? "").split(",").includes(v);

  return (
    <div className={cn("rounded-3xl border border-ink-900/[0.07] bg-white p-3 shadow-soft transition-opacity", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }} className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full bg-ivory-100 px-4">
          <Search className="size-4 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email or project" className="h-10 flex-1 bg-transparent text-sm focus:outline-none" aria-label="Search buyers" />
          {q && <button type="button" onClick={() => { setQ(""); set({ q: null }); }} aria-label="Clear"><X className="size-4 text-stone-400" /></button>}
        </form>
        <div className="flex gap-1" role="group" aria-label="Priority">
          {["A", "B", "C", "D"].map((p) => (
            <button key={p} onClick={() => toggle("priority", p)} aria-pressed={has("priority", p)} className={cn("h-10 w-10 rounded-full text-[13px] font-semibold transition", has("priority", p) ? "bg-ink-900 text-gold-300" : "bg-ivory-100 text-stone-600 hover:bg-ivory-200")} title={`Priority ${p}`}>{p}</button>
          ))}
        </div>
        <select value={sp.get("commit") ?? ""} onChange={(e) => set({ commit: e.target.value || null })} className="h-10 rounded-full bg-ivory-100 px-4 text-sm" aria-label="Ready to commit within">
          <option value="">Any readiness</option>
          {[7, 15, 30, 45, 60, 90, 180, 365].map((d) => <option key={d} value={d}>Ready ≤ {d} days</option>)}
        </select>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn("flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium", open ? "bg-ink-900 text-white" : "bg-ivory-100 text-ink-900")}><SlidersHorizontal className="size-4" /> More filters</button>
        {[...sp.keys()].some((k) => !["sort", "page", "view"].includes(k)) && <button onClick={() => start(() => router.push(`${path}${sp.get("view") ? `?view=${sp.get("view")}` : ""}`))} className="h-10 rounded-full px-3 text-[13px] text-gold-700 hover:underline">Clear all</button>}
      </div>
      {open && (
        <div className="mt-3 grid gap-4 border-t border-ink-900/5 px-1 pt-4 md:grid-cols-2 xl:grid-cols-4">
          <Group title="Stage">
            <div className="flex flex-wrap gap-1.5">{STAGES.map((s) => <Chip key={s.value} on={has("stage", s.value)} onClick={() => toggle("stage", s.value)}>{s.label}</Chip>)}</div>
          </Group>
          <Group title="Looking for">
            <div className="flex flex-wrap gap-1.5">{INTENTS.map((s) => <Chip key={s.value} on={has("intent", s.value)} onClick={() => toggle("intent", s.value)}>{s.label}</Chip>)}</div>
          </Group>
          <Group title="Configuration">
            <div className="flex flex-wrap gap-1.5">{["1", "1.5", "2", "2.5", "3", "4", "5"].map((b) => <Chip key={b} on={has("bhk", b)} onClick={() => toggle("bhk", b)}>{b === "5" ? "5+" : b} BHK</Chip>)}</div>
          </Group>
          <Group title="Interest level">
            <div className="flex flex-wrap gap-1.5">{TIERS.map((s) => <Chip key={s.value} on={has("tier", s.value)} onClick={() => toggle("tier", s.value)}>{s.label}</Chip>)}</div>
          </Group>
          <Group title="Location">
            <select value={(sp.get("loc") ?? "").split(",")[0] ?? ""} onChange={(e) => set({ loc: e.target.value || null })} className="h-10 w-full rounded-xl border border-ink-900/10 bg-white px-3 text-sm" aria-label="Location">
              <option value="">Any location</option>
              {locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Group>
          <Group title="Project interest">
            <select value={sp.get("project") ?? ""} onChange={(e) => set({ project: e.target.value || null })} className="h-10 w-full rounded-xl border border-ink-900/10 bg-white px-3 text-sm" aria-label="Project">
              <option value="">Any project</option>
              {projects.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Group>
          <Group title="Budget (stated maximum)">
            <div className="grid grid-cols-2 gap-2">
              <select value={sp.get("budgetAbove") ?? ""} onChange={(e) => set({ budgetAbove: e.target.value || null })} className="h-10 rounded-xl border border-ink-900/10 bg-white px-3 text-sm" aria-label="Budget at least">
                <option value="">At least…</option>
                {[5e6, 1e7, 1.5e7, 2e7, 3e7, 5e7, 1e8].map((v) => <option key={v} value={v}>≥ {formatINR(v)}</option>)}
              </select>
              <select value={sp.get("budgetBelow") ?? ""} onChange={(e) => set({ budgetBelow: e.target.value || null })} className="h-10 rounded-xl border border-ink-900/10 bg-white px-3 text-sm" aria-label="Budget at most">
                <option value="">At most…</option>
                {[7.5e6, 1e7, 1.5e7, 2e7, 3e7, 5e7].map((v) => <option key={v} value={v}>≤ {formatINR(v)}</option>)}
              </select>
            </div>
          </Group>
          <Group title="Possession wait & owner">
            <div className="grid grid-cols-2 gap-2">
              <select value={sp.get("wait") ?? ""} onChange={(e) => set({ wait: e.target.value || null })} className="h-10 rounded-xl border border-ink-900/10 bg-white px-3 text-sm" aria-label="Willing to wait at least">
                <option value="">Any wait</option>
                {[12, 18, 24, 36, 48].map((m) => <option key={m} value={m}>Waits ≥ {m / 12} yr{m > 12 ? "s" : ""}</option>)}
              </select>
              <select value={sp.get("assigned") ?? ""} onChange={(e) => set({ assigned: e.target.value || null })} className="h-10 rounded-xl border border-ink-900/10 bg-white px-3 text-sm" aria-label="Assigned to">
                <option value="">Anyone</option>
                <option value="me">Assigned to me</option>
                <option value="none">Unassigned</option>
                {reps.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <label className="mt-2 flex items-center gap-2 text-[13px] text-stone-600"><input type="checkbox" checked={sp.get("upcoming") === "1"} onChange={() => set({ upcoming: sp.get("upcoming") === "1" ? null : "1" })} className="accent-ink-900" /> Waiting for new launches</label>
            <label className="mt-1 flex items-center gap-2 text-[13px] text-stone-600"><input type="checkbox" checked={sp.get("due") === "1"} onChange={() => set({ due: sp.get("due") === "1" ? null : "1" })} className="accent-ink-900" /> Follow-up due</label>
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">{title}</legend>
      {children}
    </fieldset>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className={cn("rounded-full border px-2.5 py-1 text-[12px] font-medium transition", on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 text-stone-600 hover:border-ink-900/30")}>{children}</button>;
}
