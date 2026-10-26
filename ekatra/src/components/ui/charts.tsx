// Minimal, single-series charts. One hue, direct labels, native hover titles, table-friendly.
import Link from "next/link";
import { cn } from "@/lib/cn";

export function BarList({ data, format = (v) => v.toLocaleString("en-IN"), hrefFor, className, unit }: { data: { label: string; value: number }[]; format?: (v: number) => string; hrefFor?: (label: string) => string; className?: string; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-6 text-center text-sm text-stone-500">No data yet</p>;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {data.map((d) => {
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-stone-700">{d.label}</span>
              <span className="num shrink-0 font-semibold text-ink-900">{format(d.value)}{unit ? <span className="ml-1 text-[11px] font-normal text-stone-500">{unit}</span> : null}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-900/[0.05]">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-700" style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
          </>
        );
        return (
          <li key={d.label} title={`${d.label}: ${format(d.value)}`}>
            {hrefFor ? <Link href={hrefFor(d.label)} className="block rounded-lg transition hover:opacity-80">{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}

export function Columns({ data, height = 140, format = (v) => String(v) }: { data: { label: string; value: number }[]; height?: number; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex min-w-0 items-end gap-1.5 overflow-hidden" style={{ height: height + 36 }} role="img" aria-label={data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}>
      {data.map((d, i) => (
        <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${d.label}: ${format(d.value)}`}>
          <span className={cn("num text-[11.5px] font-semibold", i === data.length - 1 ? "text-ink-900" : "text-stone-500 opacity-0 transition group-hover:opacity-100")}>{format(d.value)}</span>
          <div className={cn("w-full max-w-10 min-w-1 rounded-t-[4px] transition-all duration-700", i === data.length - 1 ? "bg-ink-900" : "bg-ink-900/15 group-hover:bg-ink-900/30")} style={{ height: Math.max(3, (d.value / max) * height) }} />
          <span className="truncate text-[10.5px] text-stone-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function SplitBar({ parts, format }: { parts: { label: string; value: number; tone: "ink" | "gold" | "muted" }[]; format: (v: number) => string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const bg = { ink: "bg-ink-900", gold: "bg-gold-400", muted: "bg-ink-900/10" };
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => <div key={p.label} title={`${p.label}: ${format(p.value)}`} className={cn("h-full first:rounded-l-full last:rounded-r-full", bg[p.tone])} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-stone-600"><span className={cn("size-2.5 rounded-sm", bg[p.tone])} />{p.label} <span className="num font-semibold text-ink-900">{format(p.value)}</span></li>
        ))}
      </ul>
    </div>
  );
}
