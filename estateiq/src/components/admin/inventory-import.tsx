"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, SkipForward, XCircle } from "lucide-react";
import type { ActionState } from "@/lib/action";
import type { ImportPreview } from "@/app/admin/(app)/inventory/actions";
import { buttonClass } from "../ui/button";
import { Badge } from "../ui/badge";
import { StateMessage } from "./action-form";
import { cn } from "@/lib/cn";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

const ACTION_META = {
  CREATE: { label: "New", tone: "positive" as const, icon: CheckCircle2 },
  UPDATE: { label: "Update", tone: "info" as const, icon: RefreshCw },
  SKIP_DUPLICATE: { label: "Duplicate — skipped", tone: "warning" as const, icon: SkipForward },
  ERROR: { label: "Error", tone: "danger" as const, icon: XCircle },
};

/** Two-step import: preview every row, then confirm. Nothing is saved until confirmation. */
export function InventoryImport({ preview, confirm }: { preview: Action; confirm: Action }) {
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [state, setState] = useState<ActionState>(null);
  const [filter, setFilter] = useState<keyof typeof ACTION_META | "ALL">("ALL");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const formFor = () => {
    const f = new FormData();
    if (file) f.set("file", file);
    if (updateExisting) f.set("updateExisting", "on");
    return f;
  };
  const check = () =>
    start(async () => {
      setState(null);
      const r = await preview(null, formFor());
      if (r?.ok) setResult(r.data as ImportPreview);
      else {
        setResult(null);
        setState(r);
      }
    });
  const save = () =>
    start(async () => {
      if (!result) return;
      const f = formFor();
      f.set("expectCreate", String(result.counts.CREATE));
      f.set("expectUpdate", String(result.counts.UPDATE));
      const r = await confirm(null, f);
      setState(r);
      if (r?.ok) {
        setResult(null);
        setFile(null);
        if (input.current) input.current.value = "";
      }
    });

  const rows = result?.plan.filter((p) => filter === "ALL" || p.action === filter) ?? [];
  const saving = result ? result.counts.CREATE + result.counts.UPDATE : 0;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-ink-900/[0.07] bg-white p-6 md:p-8">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-900/20 bg-ivory-50 px-6 py-10 text-center hover:bg-ivory-100">
          <FileSpreadsheet className="size-7 text-gold-600" />
          <span className="text-[14px] font-medium text-ink-900">{file ? file.name : "Choose your inventory CSV"}</span>
          <span className="text-[12.5px] text-stone-500">{file ? `${(file.size / 1024).toFixed(1)} KB · choose again to replace` : "Excel: File → Save As → CSV UTF-8. Up to 1,000 rows, 2 MB."}</span>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setState(null);
            }}
          />
        </label>
        <label className="mt-4 flex items-start gap-3 text-[13px] text-stone-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-ink-900" checked={updateExisting} onChange={(e) => { setUpdateExisting(e.target.checked); setResult(null); }} />
          <span>Update units that already exist with the same reference <span className="text-stone-500">(approval and publication status are never changed by an import; a changed price sends the comparison back for review)</span></span>
        </label>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={!file || pending} onClick={check} className={buttonClass(result ? "outline" : "primary")}>
            {pending && !result ? <Loader2 className="size-4 animate-spin" /> : null} {result ? "Check again" : "Check file"}
          </button>
        </div>
        <StateMessage state={state} />
      </div>

      {result && (
        <div className="rounded-3xl border border-ink-900/[0.07] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-900/5 p-6">
            <div>
              <h3 className="font-serif text-2xl text-ink-900">Preview</h3>
              <p className="text-[13px] text-stone-500">Nothing has been saved yet.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["ALL", "CREATE", "UPDATE", "SKIP_DUPLICATE", "ERROR"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-full border px-3 py-1.5 text-[12.5px]", filter === k ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white text-stone-700")}>
                  {k === "ALL" ? "All" : ACTION_META[k].label} <span className="num opacity-60">{k === "ALL" ? result.plan.length : result.counts[k]}</span>
                </button>
              ))}
            </div>
          </div>
          {result.unknownColumns.length > 0 && <p className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-600"><AlertTriangle className="size-4" /> Ignored unknown column(s): {result.unknownColumns.join(", ")}</p>}
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="sticky top-0 bg-ivory-50 text-left text-[11px] uppercase tracking-[0.08em] text-stone-500"><tr><th className="px-6 py-2">Line</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Notes</th></tr></thead>
              <tbody className="divide-y divide-ink-900/5 align-top">
                {rows.map((p) => {
                  const m = ACTION_META[p.action];
                  return (
                    <tr key={p.line}>
                      <td className="num px-6 py-2.5 text-stone-500">{p.line}</td>
                      <td className="px-3 py-2.5"><Badge tone={m.tone}><m.icon className="size-3" /> {m.label}</Badge></td>
                      <td className="px-3 py-2.5 font-medium text-ink-900">{p.reference ?? "—"}</td>
                      <td className="px-3 py-2.5 text-stone-700">{p.summary || "—"}</td>
                      <td className={cn("px-3 py-2.5", p.action === "ERROR" ? "text-clay-600" : "text-stone-500")}>{p.messages.join("; ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <p className="px-6 py-8 text-center text-sm text-stone-500">No rows in this view.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-900/5 p-6">
            <p className="text-[13px] text-stone-600">
              <strong className="text-ink-900">{result.counts.CREATE}</strong> new · <strong className="text-ink-900">{result.counts.UPDATE}</strong> updates will be saved. {result.counts.SKIP_DUPLICATE + result.counts.ERROR} row(s) will not.
            </p>
            <button type="button" disabled={!saving || pending} onClick={save} className={buttonClass("primary")}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Confirm import of {saving} row{saving === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
      {state?.ok && <Link href="/admin/inventory" className={buttonClass("outline")}>View inventory</Link>}
    </div>
  );
}
