import { cn } from "@/lib/cn";
import { Badge } from "./badge";
import { VERIFICATION } from "@/lib/labels";
import type { DataVerification } from "@prisma/client";
import { formatDate } from "@/lib/format";

export function EmptyState({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-3xl border border-dashed border-ink-900/15 bg-ivory-100/50 px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-white text-gold-600 shadow-soft">{icon}</div>}
      <p className="font-serif text-2xl text-ink-900">{title}</p>
      {body && <p className="mt-2 max-w-sm text-sm text-stone-500">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Verified({ v, at, className }: { v: DataVerification; at?: Date | null; className?: string }) {
  const m = VERIFICATION[v];
  return (
    <Badge tone={m.tone} title={`${m.hint ?? ""}${at ? ` Last checked ${formatDate(at)}.` : ""}`} className={className}>
      {v === "VERIFIED" ? "✓ " : ""}
      {m.label}
    </Badge>
  );
}

export function Stat({ label, value, sub, className, accent }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string; accent?: boolean }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[12px] font-medium text-stone-500">{label}</p>
      <p className={cn("num mt-1 truncate text-2xl font-semibold tracking-tight", accent ? "text-gold-600" : "text-ink-900")}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-stone-500">{sub}</p>}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.split(/\s+/).filter(Boolean);
  const ini = parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  const hue = [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 4;
  const bg = ["bg-ink-800 text-gold-300", "bg-gold-200 text-gold-700", "bg-sky-50 text-sky-600", "bg-sage-50 text-sage-600"][hue];
  return <span className={cn("inline-grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", bg, className)}>{ini}</span>;
}

export function Disclaimer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11.5px] leading-relaxed text-stone-500", className)}>{children}</p>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-ink-900/10 bg-white px-1.5 py-0.5 font-mono text-[10px] text-stone-500 shadow-[0_1px_0_rgb(10_19_34/0.08)]">{children}</kbd>;
}
