import Link from "next/link";
import { cn } from "@/lib/cn";

export function Tabs({ base, tabs, active }: { base: string; tabs: { key: string; label: string; count?: number }[]; active: string }) {
  return (
    <div className="-mx-1 mb-6 overflow-x-auto px-1 scrollbar-none">
      <nav className="inline-flex gap-1 rounded-full border border-ink-900/[0.07] bg-white p-1 shadow-soft" aria-label="Sections">
        {tabs.map((t) => (
          <Link key={t.key} href={`${base}?tab=${t.key}`} aria-current={active === t.key ? "page" : undefined} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition", active === t.key ? "bg-ink-900 text-white" : "text-stone-600 hover:text-ink-900")}>
            {t.label}
            {t.count !== undefined && <span className="num ml-1.5 opacity-60">{t.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
