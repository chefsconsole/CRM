import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProjectCard, PublicGroup } from "@/lib/queries/public";
import { ProgressRing } from "../ui/motion";
import { PUBLIC_STAGE } from "@/lib/labels";
import { formatBhk, formatINR } from "@/lib/format";
import { PropertyImage } from "../ui/property-image";

export function GroupCard({ group, project }: { group: PublicGroup; project: ProjectCard }) {
  const stage = PUBLIC_STAGE[group.stage];
  const maxCfg = Math.max(1, ...(group.byConfig?.map((c) => c.buyers) ?? [1]));
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[28px] bg-ink-900 text-ivory-100 shadow-lift">
      <Link href={`/properties/${project.slug}#group`} className="absolute inset-0 z-10" aria-label={`Join ${group.headline}`} />
      <div className="relative h-36 overflow-hidden">
        <PropertyImage src={project.image} alt={project.name} seed={project.slug} className="size-full opacity-60 transition duration-[1.2s] group-hover:scale-105 group-hover:opacity-75" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-900/10 to-ink-900" />
        <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-ink-900/60 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
          <span className={`size-1.5 rounded-full ${group.stage === "BENEFITS_CONFIRMED" ? "bg-emerald-300" : group.stage === "NEGOTIATING" ? "bg-gold-300" : "animate-pulse bg-sky-300"}`} />
          {stage.label}
        </span>
      </div>
      <div className="relative -mt-8 flex flex-1 flex-col px-6 pb-6">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow text-gold-300/90">{project.name}</p>
            <h3 className="mt-2 font-serif text-[28px] leading-[1.05] text-ivory-50">{group.headline}</h3>
          </div>
          {group.progress !== null ? (
            <ProgressRing value={group.progress} light size={68} label={<span className="num text-[13px] font-semibold text-ivory-50">{Math.round(group.progress * 100)}%</span>} />
          ) : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="num text-3xl font-semibold text-ivory-50">{group.demand?.value ?? "—"}</p>
            <p className="text-[12px] text-ink-300">{group.demand?.caption ?? "Counts kept private"}</p>
          </div>
          <div>
            <p className="num text-lg font-semibold text-ivory-50">{project.priceMin ? formatINR(project.priceMin) : "On request"}</p>
            <p className="text-[12px] text-ink-300">Indicative prices from</p>
          </div>
        </div>
        {group.byConfig && group.byConfig.length > 0 && (
          <div className="mt-4 space-y-2">
            {group.byConfig.map((c) => (
              <div key={c.bhk} className="flex items-center gap-3 text-[12px]">
                <span className="w-14 text-ink-300">{formatBhk(c.bhk)}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${(c.buyers / maxCfg) * 100}%` }} />
                </span>
                <span className="num w-16 text-right text-ivory-100">{c.buyers} {c.buyers === 1 ? "buyer" : "buyers"}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between pt-6">
          <span className="text-[13px] font-medium text-gold-200">Join this group</span>
          <span className="grid size-10 place-items-center rounded-full bg-gold-300 text-ink-950 transition-transform duration-500 group-hover:translate-x-1">
            <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
