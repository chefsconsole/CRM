import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function withParams(base: string, current: Record<string, string | undefined>, patch: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(patch)) (v ? sp.set(k, v) : sp.delete(k));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export function SortTh({ label, field, base, params, className }: { label: string; field: string; base: string; params: Record<string, string | undefined>; className?: string }) {
  const [cur, dir] = (params.sort ?? "").split(":");
  const active = cur === field;
  const next = active && dir === "asc" ? `${field}:desc` : `${field}:asc`;
  return (
    <th scope="col" className={cn("px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-stone-500", className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={withParams(base, params, { sort: next, page: null })} className="inline-flex items-center gap-1 hover:text-ink-900">
        {label}
        {active && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Link>
    </th>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={cn("px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-stone-500", className)}>{children}</th>;
}

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-3xl border border-ink-900/[0.07] bg-white shadow-soft", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Pagination({ base, params, page, pageSize, total }: { base: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-4 text-[12.5px] text-stone-500">{total} {total === 1 ? "record" : "records"}</p>;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-[13px] text-stone-600">
      <p>
        <span className="num font-medium text-ink-900">{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)}</span> of <span className="num">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Link aria-disabled={page <= 1} href={withParams(base, params, { page: String(page - 1) })} className={cn("grid size-9 place-items-center rounded-full border border-ink-900/10 bg-white", page <= 1 && "pointer-events-none opacity-40")} aria-label="Previous page"><ChevronLeft className="size-4" /></Link>
        <span className="num px-3">Page {page} / {pages}</span>
        <Link aria-disabled={page >= pages} href={withParams(base, params, { page: String(page + 1) })} className={cn("grid size-9 place-items-center rounded-full border border-ink-900/10 bg-white", page >= pages && "pointer-events-none opacity-40")} aria-label="Next page"><ChevronRight className="size-4" /></Link>
      </div>
    </div>
  );
}
