import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageHeader({ title, subtitle, actions, crumbs }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-[12.5px] text-stone-500">
            {crumbs.map((c) => (
              <span key={c.href} className="flex items-center gap-1">
                <Link href={c.href} className="hover:text-ink-900">{c.label}</Link>
                <ChevronRight className="size-3" />
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-serif text-4xl leading-tight text-ink-900 md:text-[44px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
