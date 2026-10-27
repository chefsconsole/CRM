import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function Kpi({ label, value, hint, href, accent, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; accent?: boolean; icon?: React.ReactNode }) {
  const body = (
    <div className={cn("group relative h-full overflow-hidden rounded-3xl border p-5 transition-all duration-300", accent ? "border-ink-900 bg-ink-900 text-ivory-50 shadow-lift" : "border-ink-900/[0.07] bg-white shadow-soft hover:-translate-y-0.5 hover:shadow-lift")}>
      {accent && <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gold-400/20 blur-2xl" />}
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-[12.5px] font-medium", accent ? "text-ink-300" : "text-stone-500")}>{label}</p>
        {href ? <ArrowUpRight className={cn("size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5", accent ? "text-gold-300" : "text-stone-400")} /> : icon}
      </div>
      <p className={cn("num mt-3 text-[34px] font-semibold leading-none tracking-tight", accent ? "text-ivory-50" : "text-ink-900")}>{value}</p>
      {hint && <p className={cn("mt-2 text-[12px]", accent ? "text-ink-300" : "text-stone-500")}>{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
