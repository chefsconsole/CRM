import Link from "next/link";
import { ArrowUpRight, MapPin, Users, Sparkle } from "lucide-react";
import type { ProjectCard as Card } from "@/lib/queries/public";
import { PropertyImage } from "../ui/property-image";
import { Badge } from "../ui/badge";
import { PROJECT_STATUS, PUBLIC_STAGE, VERIFICATION } from "@/lib/labels";
import { formatArea, formatBhkList, formatINR, formatMonth, formatPriceRange } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CompareToggle } from "./compare";

const TYPE_LABEL: Record<string, string> = {
  OFFICE: "Office", RETAIL_SHOP: "Retail", SHOWROOM: "Showroom", COWORKING: "Managed office", BUSINESS_PREMISES: "Business premises", WAREHOUSE: "Warehouse", PLOT: "Plot", VILLA: "Villa", PENTHOUSE: "Penthouse", DUPLEX: "Duplex", APARTMENT: "Apartments",
};

export function priceLine(c: Card) {
  if (c.dealType === "RENT") return c.rentMin ? `${formatPriceRange(c.rentMin, c.rentMax)} / mo` : "Rent on request";
  return formatPriceRange(c.priceMin, c.priceMax);
}

export function typeLine(c: Card) {
  if (c.segment === "COMMERCIAL") return TYPE_LABEL[c.propertyType] ?? "Commercial";
  return c.bhks.length ? formatBhkList(c.bhks) : TYPE_LABEL[c.propertyType];
}

export function ProjectCardView({ c, priority, className }: { c: Card; priority?: boolean; className?: string }) {
  const g = c.groups[0];
  const status = PROJECT_STATUS[c.status];
  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-[28px] border border-ink-900/[0.07] bg-white shadow-soft transition-all duration-500 ease-[var(--ease-lux)] hover:-translate-y-1 hover:shadow-lift", className)}>
      <Link href={`/properties/${c.slug}`} className="absolute inset-0 z-10" aria-label={`${c.name} by ${c.developer.name}`} />
      <div className="relative aspect-[4/3] overflow-hidden">
        <PropertyImage src={c.image} alt={c.name} seed={c.slug} priority={priority} className="size-full transition-transform duration-[1.4s] ease-[var(--ease-lux)] group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/55 via-transparent to-transparent" />
        <div className="absolute left-4 right-16 top-4 flex flex-wrap gap-1.5">
          <Badge tone="neutral" className="bg-white/90 text-ink-900 backdrop-blur">{c.dealType === "RENT" ? "For rent" : c.dealType === "PRE_LEASED" ? "Pre-leased" : status.label}</Badge>
          {c.hasLiveBenefit && <Badge tone="gold" className="bg-gold-300/95 text-ink-950"><Sparkle className="size-3" /> Benefits confirmed</Badge>}
        </div>
        <div className="absolute right-4 top-4 z-20">
          <CompareToggle slug={c.slug} name={c.name} />
        </div>
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between text-white">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-white/90"><MapPin className="size-3.5" /> {c.location.name}</p>
          {c.grossYield !== null && <span className="rounded-full bg-black/40 px-2.5 py-1 text-[11.5px] font-medium backdrop-blur">Est. gross yield {c.grossYield}%</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-stone-500">{c.developer.name}</p>
            <h3 className="mt-1.5 truncate font-serif text-[26px] leading-tight text-ink-900">{c.name}</h3>
          </div>
          <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-full border border-ink-900/10 text-ink-900 transition-all duration-500 group-hover:rotate-45 group-hover:border-ink-900 group-hover:bg-ink-900 group-hover:text-white">
            <ArrowUpRight className="size-4" />
          </span>
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-ink-900/[0.06] pt-4">
          <div>
            <p className="num text-[19px] font-semibold tracking-tight text-ink-900">{priceLine(c)}</p>
            <p className="mt-0.5 text-[11.5px] text-stone-500" title={VERIFICATION.INDICATIVE.hint}>Indicative · {typeLine(c)}{c.areaMin ? ` · ${formatArea(c.areaMin, c.areaMax)} carpet` : ""}</p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[12px]">
          {g && g.demand ? (
            <span className="flex items-center gap-1.5 font-medium text-ink-800">
              <Users className="size-3.5 text-gold-600" />
              <span className="num">{g.demand.value}</span> {g.demand.caption}
              <span className="text-stone-400">· {PUBLIC_STAGE[g.stage].label}</span>
            </span>
          ) : g ? (
            <span className="flex items-center gap-1.5 text-stone-500"><Users className="size-3.5" /> Buying group open</span>
          ) : (
            <span className="text-stone-500">{c.dealType === "SALE" && c.possessionDate ? `Possession ${formatMonth(c.possessionDate)} (indicative)` : c.availableFrom ? `Available ${formatMonth(c.availableFrom)}` : "Details on request"}</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProjectRow({ c }: { c: Card }) {
  return (
    <article className="group relative grid grid-cols-[96px_1fr] gap-4 rounded-3xl border border-ink-900/[0.07] bg-white p-3 shadow-soft transition hover:shadow-lift sm:grid-cols-[160px_1fr_auto] sm:items-center">
      <Link href={`/properties/${c.slug}`} className="absolute inset-0 z-10" aria-label={c.name} />
      <PropertyImage src={c.image} alt={c.name} seed={c.slug} className="aspect-square rounded-2xl sm:aspect-[4/3]" />
      <div className="min-w-0">
        <p className="eyebrow text-stone-500">{c.developer.name} · {c.location.name}</p>
        <h3 className="mt-1 truncate font-serif text-2xl text-ink-900">{c.name}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-stone-600">
          <Badge tone={PROJECT_STATUS[c.status].tone}>{PROJECT_STATUS[c.status].label}</Badge>
          <span>{typeLine(c)}</span>
          {c.areaMin && <span>· {formatArea(c.areaMin, c.areaMax)}</span>}
          {c.possessionDate && c.dealType === "SALE" && <span>· Possession {formatMonth(c.possessionDate)}</span>}
        </div>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-4 border-t border-ink-900/5 pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:pr-3 sm:text-right">
        <p className="num text-lg font-semibold text-ink-900">{priceLine(c)}</p>
        <p className="text-[11.5px] text-stone-500">{c.groups[0]?.demand ? `${c.groups[0].demand.value} ${c.groups[0].demand.caption}` : "Indicative"}</p>
      </div>
    </article>
  );
}

export function formatCrShort(v: number | null) {
  return v ? formatINR(v) : "—";
}
