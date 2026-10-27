"use client";

import { useState } from "react";
import { Building2, MapPin, Users2 } from "lucide-react";
import { Field, Input, Select } from "../ui/field";
import { cn } from "@/lib/cn";

type Scope = "PROJECT" | "LOCALITY" | "SEGMENT";
const SCOPES: { key: Scope; label: string; hint: string; Icon: typeof Building2 }[] = [
  { key: "PROJECT", label: "A project", hint: "Gather buyers for one project to take to its developer.", Icon: Building2 },
  { key: "LOCALITY", label: "A locality", hint: "e.g. Borivali West · 2 BHK · ₹1.5–2 Cr — before choosing a project.", Icon: MapPin },
  { key: "SEGMENT", label: "A buyer segment", hint: "Start from a saved buyer filter (e.g. ready-to-move investors).", Icon: Users2 },
];

/** Choose what the campaign is about. Only the inputs for the chosen type are shown and sent. */
export function CampaignScopePicker({ projects, locations, segments, defaults }: { projects: { id: string; label: string }[]; locations: { id: string; name: string }[]; segments: { id: string; name: string }[]; defaults?: { scope?: Scope; projectId?: string } }) {
  const [scope, setScope] = useState<Scope>(defaults?.scope ?? "PROJECT");
  return (
    <div className="space-y-4">
      <input type="hidden" name="scope" value={scope} />
      <div className="grid gap-3 sm:grid-cols-3">
        {SCOPES.map((s) => (
          <button key={s.key} type="button" onClick={() => setScope(s.key)} aria-pressed={scope === s.key} className={cn("rounded-2xl border p-4 text-left transition", scope === s.key ? "border-ink-900 bg-ink-900 text-ivory-100" : "border-ink-900/10 bg-white hover:border-ink-900/30")}>
            <s.Icon className={cn("size-5", scope === s.key ? "text-gold-300" : "text-gold-600")} />
            <p className={cn("mt-2 text-[14px] font-medium", scope === s.key ? "text-ivory-50" : "text-ink-900")}>{s.label}</p>
            <p className={cn("mt-0.5 text-[12px]", scope === s.key ? "text-ink-300" : "text-stone-500")}>{s.hint}</p>
          </button>
        ))}
      </div>
      {scope === "PROJECT" && (
        <Field label="Project"><Select name="projectId" defaultValue={defaults?.projectId ?? ""}><option value="">Choose…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
      )}
      {scope === "LOCALITY" && (
        <Field label="Localities">
          <div className="flex flex-wrap gap-1.5">
            {locations.map((l) => <label key={l.id} className="cursor-pointer"><input type="checkbox" name="locationIds" value={l.id} className="peer sr-only" /><span className="inline-block rounded-full border border-ink-900/12 px-3 py-1.5 text-[12.5px] text-stone-600 peer-checked:border-ink-900 peer-checked:bg-ink-900 peer-checked:text-white">{l.name}</span></label>)}
          </div>
        </Field>
      )}
      {scope === "SEGMENT" && (
        <Field label="Saved buyer segment" hint={segments.length ? undefined : "Save a filter on the Buyers page first."}><Select name="segmentId" defaultValue=""><option value="">Choose…</option>{segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      )}
      {scope !== "PROJECT" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Budget from (₹)" hint="Optional. 1.5 Cr = 15000000"><Input name="budgetMin" inputMode="numeric" placeholder="15000000" /></Field>
          <Field label="Budget up to (₹)"><Input name="budgetMax" inputMode="numeric" placeholder="20000000" /></Field>
        </div>
      )}
    </div>
  );
}
