"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LayoutGrid, List, Map as MapIcon, SlidersHorizontal, X, Search, ArrowUpRight, Info } from "lucide-react";
import type { ProjectCard } from "@/lib/queries/public";
import { ProjectCardView, ProjectRow, priceLine, typeLine } from "./project-card";
import { PropertyImage } from "../ui/property-image";
import { EmptyState } from "../ui/misc";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";

const PropertyMap = dynamic(() => import("./property-map"), { ssr: false, loading: () => <div className="skeleton size-full rounded-none" /> });

type Opt = { value: string; label: string };
export interface DiscoveryOptions {
  locations: Opt[];
  developers: Opt[];
}

const MODES = [
  { value: "homes", label: "Homes" },
  { value: "commercial", label: "Commercial" },
  { value: "pre-leased", label: "Pre-leased" },
  { value: "rent-homes", label: "Rent homes" },
  { value: "rent-commercial", label: "Rent offices & shops" },
];
const STATUSES = [
  { value: "ANNOUNCED", label: "Announced" },
  { value: "PRE_LAUNCH", label: "Pre-launch" },
  { value: "NEW_LAUNCH", label: "New launch" },
  { value: "UNDER_CONSTRUCTION", label: "Under construction" },
  { value: "NEARING_POSSESSION", label: "Nearing possession" },
  { value: "READY_TO_MOVE", label: "Ready to move" },
];
const BUY_BUDGETS = [5e6, 7.5e6, 1e7, 1.5e7, 2e7, 3e7, 5e7, 1e8, 2e8];
const RENT_BUDGETS = [25000, 50000, 75000, 1e5, 2e5, 5e5, 1e6];

export function Discovery({ cards, options, mode, view }: { cards: ProjectCard[]; options: DiscoveryOptions; mode: string; view: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [active, setActive] = useState<string | null>(null);
  const rent = mode.startsWith("rent");
  const residential = mode === "homes" || mode === "rent-homes";

  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);

  function set(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) v ? next.set(k, v) : next.delete(k);
    start(() => router.push(`${path}?${next}`, { scroll: false }));
  }
  const toggleList = (key: string, v: string) => {
    const cur = (sp.get(key) ?? "").split(",").filter(Boolean);
    set({ [key]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(",") || null });
  };
  const activeCount = ["location", "developer", "status", "bhk", "min", "max", "carpet", "possession", "groups", "benefits", "q"].filter((k) => sp.get(k)).length;
  const budgets = rent ? RENT_BUDGETS : BUY_BUDGETS;

  const filters = (
    <div className="flex flex-col gap-6">
      <FilterGroup title="Location">
        <select value={sp.get("location") ?? ""} onChange={(e) => set({ location: e.target.value || null })} className="w-full rounded-xl border border-ink-900/10 bg-white px-3 py-2.5 text-sm" aria-label="Location">
          <option value="">All of Mumbai</option>
          {options.locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </FilterGroup>
      <FilterGroup title={rent ? "Monthly rent" : "Budget"}>
        <div className="grid grid-cols-2 gap-2">
          <select value={sp.get("min") ?? ""} onChange={(e) => set({ min: e.target.value || null })} className="rounded-xl border border-ink-900/10 bg-white px-3 py-2.5 text-sm" aria-label="Minimum">
            <option value="">No min</option>
            {budgets.map((b) => <option key={b} value={b}>{formatINR(b)}</option>)}
          </select>
          <select value={sp.get("max") ?? ""} onChange={(e) => set({ max: e.target.value || null })} className="rounded-xl border border-ink-900/10 bg-white px-3 py-2.5 text-sm" aria-label="Maximum">
            <option value="">No max</option>
            {budgets.map((b) => <option key={b} value={b}>{formatINR(b)}</option>)}
          </select>
        </div>
      </FilterGroup>
      {residential && (
        <FilterGroup title="Configuration">
          <div className="flex flex-wrap gap-2">
            {["1", "1.5", "2", "2.5", "3", "4", "5"].map((b) => (
              <Chip key={b} on={(sp.get("bhk") ?? "").split(",").includes(b)} onClick={() => toggleList("bhk", b)}>{b === "5" ? "5+ BHK" : `${b} BHK`}</Chip>
            ))}
          </div>
        </FilterGroup>
      )}
      <FilterGroup title="Minimum carpet area">
        <select value={sp.get("carpet") ?? ""} onChange={(e) => set({ carpet: e.target.value || null })} className="w-full rounded-xl border border-ink-900/10 bg-white px-3 py-2.5 text-sm" aria-label="Minimum carpet area">
          <option value="">Any size</option>
          {[400, 600, 800, 1000, 1500, 2000, 3000].map((a) => <option key={a} value={a}>{a.toLocaleString("en-IN")}+ sq ft</option>)}
        </select>
      </FilterGroup>
      {!rent && mode !== "pre-leased" && (
        <>
          <FilterGroup title="Project status">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <Chip key={s.value} on={(sp.get("status") ?? "").split(",").includes(s.value)} onClick={() => toggleList("status", s.value)}>{s.label}</Chip>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup title="Possession by">
            <select value={sp.get("possession") ?? ""} onChange={(e) => set({ possession: e.target.value || null })} className="w-full rounded-xl border border-ink-900/10 bg-white px-3 py-2.5 text-sm" aria-label="Possession by">
              <option value="">Any time</option>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </FilterGroup>
        </>
      )}
      <FilterGroup title="Developer">
        <select value={sp.get("developer") ?? ""} onChange={(e) => set({ developer: e.target.value || null })} className="w-full rounded-xl border border-ink-900/10 bg-white px-3 py-2.5 text-sm" aria-label="Developer">
          <option value="">All developers</option>
          {options.developers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </FilterGroup>
      <FilterGroup title="Collective buying">
        <div className="flex flex-col gap-2.5">
          <Toggle on={sp.get("groups") === "1"} onClick={() => set({ groups: sp.get("groups") === "1" ? null : "1" })}>Has an open buying group</Toggle>
          <Toggle on={sp.get("benefits") === "1"} onClick={() => set({ benefits: sp.get("benefits") === "1" ? null : "1" })}>Benefits confirmed by developer</Toggle>
        </div>
      </FilterGroup>
    </div>
  );

  const points = cards.filter((c) => c.lat && c.lng).map((c) => ({ id: c.id, slug: c.slug, lat: c.lat!, lng: c.lng!, name: c.name, label: c.dealType === "RENT" ? (c.rentMin ? `${formatINR(c.rentMin, { digits: 1 })}/mo` : c.name) : c.priceMin ? formatINR(c.priceMin, { digits: 2 }) : c.name }));
  const selected = cards.find((c) => c.id === active) ?? null;

  return (
    <div className="mx-auto max-w-[1400px] px-5 md:px-10">
      {/* Mode tabs */}
      <div className="-mx-5 overflow-x-auto px-5 scrollbar-none md:mx-0 md:px-0">
        <div className="inline-flex gap-1 rounded-full border border-ink-900/[0.07] bg-white p-1 shadow-soft" role="tablist" aria-label="Property type">
          {MODES.map((m) => (
            <button key={m.value} role="tab" aria-selected={mode === m.value} onClick={() => set({ mode: m.value, bhk: null, min: null, max: null, status: null, possession: null })} className={cn("relative whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-medium transition", mode === m.value ? "text-ivory-50" : "text-stone-600 hover:text-ink-900")}>
              {mode === m.value && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-ink-900" transition={{ type: "spring", bounce: 0.15, duration: 0.5 }} />}
              <span className="relative">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="sticky top-[72px] z-30 -mx-5 mt-6 flex flex-wrap items-center gap-3 border-b border-ink-900/[0.06] bg-ivory-50/90 px-5 py-3 backdrop-blur-xl md:mx-0 md:rounded-2xl md:border md:px-3">
        <form onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }} className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-ink-900/10 bg-white px-4">
          <Search className="size-4 shrink-0 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, developer or area" className="h-10 min-w-0 flex-1 bg-transparent text-sm focus:outline-none" aria-label="Search" />
          {q && <button type="button" onClick={() => { setQ(""); set({ q: null }); }} aria-label="Clear search"><X className="size-4 text-stone-400" /></button>}
        </form>
        <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-full border border-ink-900/10 bg-white px-4 text-sm font-medium lg:hidden">
          <SlidersHorizontal className="size-4" /> Filters {activeCount > 0 && <span className="num grid size-5 place-items-center rounded-full bg-ink-900 text-[11px] text-white">{activeCount}</span>}
        </button>
        <select value={sp.get("sort") ?? "featured"} onChange={(e) => set({ sort: e.target.value === "featured" ? null : e.target.value })} className="h-10 rounded-full border border-ink-900/10 bg-white px-4 text-sm" aria-label="Sort">
          <option value="featured">Featured</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="possession">Earliest possession</option>
          <option value="demand">Most buyer demand</option>
          <option value="newest">Newest</option>
        </select>
        <div className="flex rounded-full border border-ink-900/10 bg-white p-1" role="group" aria-label="View">
          {[
            { v: "grid", icon: LayoutGrid, l: "Grid" },
            { v: "list", icon: List, l: "List" },
            { v: "map", icon: MapIcon, l: "Map" },
          ].map(({ v, icon: I, l }) => (
            <button key={v} onClick={() => set({ view: v === "grid" ? null : v })} aria-pressed={view === v} aria-label={`${l} view`} className={cn("grid size-8 place-items-center rounded-full transition", view === v ? "bg-ink-900 text-white" : "text-stone-500 hover:text-ink-900")}>
              <I className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-[160px] max-h-[calc(100vh-180px)] overflow-y-auto pb-10 pr-2 scrollbar-none">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-900">Filters</p>
              {activeCount > 0 && <Link href={`${path}?mode=${mode}`} className="text-[12.5px] text-gold-700 underline-offset-4 hover:underline">Clear all</Link>}
            </div>
            {filters}
          </div>
        </aside>

        <section aria-live="polite" className={cn("min-w-0 transition-opacity", pending && "opacity-50")}>
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <p className="text-sm text-stone-500"><span className="num font-semibold text-ink-900">{cards.length}</span> {cards.length === 1 ? "listing" : "listings"}</p>
            <p className="flex items-center gap-1.5 text-[12px] text-stone-500"><Info className="size-3.5" /> Prices are indicative, not offers</p>
          </div>
          {!cards.length ? (
            <EmptyState title="No listings match these filters" body="Try widening your budget or location — or tell us your requirement and we'll alert you when something fits." action={<div className="flex flex-wrap justify-center gap-2"><Link href={`${path}?mode=${mode}`} className="rounded-full border border-ink-900/15 px-4 py-2 text-sm">Clear filters</Link><Link href="/match" className="rounded-full bg-ink-900 px-4 py-2 text-sm text-white">Register my requirement</Link></div>} />
          ) : view === "map" ? (
            <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
              <div className="order-2 flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1 scrollbar-none xl:order-1">
                {cards.map((c) => (
                  <button key={c.id} onMouseEnter={() => setActive(c.id)} onFocus={() => setActive(c.id)} onClick={() => setActive(c.id)} className={cn("flex gap-3 rounded-2xl border bg-white p-2.5 text-left transition", active === c.id ? "border-gold-500 shadow-glow" : "border-ink-900/[0.07] hover:border-ink-900/20")}>
                    <PropertyImage src={c.image} alt={c.name} seed={c.slug} className="size-20 shrink-0 rounded-xl" />
                    <div className="min-w-0 py-0.5">
                      <p className="truncate font-serif text-xl text-ink-900">{c.name}</p>
                      <p className="truncate text-[12px] text-stone-500">{c.location.name} · {typeLine(c)}</p>
                      <p className="num mt-1 text-[15px] font-semibold text-ink-900">{priceLine(c)}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="relative order-1 h-[60vh] overflow-hidden rounded-[28px] border border-ink-900/[0.07] xl:order-2 xl:h-[70vh]">
                <PropertyMap points={points} activeId={active} onSelect={setActive} />
                <p className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full bg-white/90 px-3 py-1.5 text-[11.5px] text-stone-600 shadow-soft backdrop-blur">Markers show approximate, neighbourhood-level locations</p>
                <AnimatePresence>
                  {selected && (
                    <motion.div key={selected.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="absolute inset-x-3 bottom-3 z-[500] sm:left-auto sm:w-[340px]">
                      <div className="overflow-hidden rounded-3xl bg-white shadow-lift">
                        <div className="relative h-32">
                          <PropertyImage src={selected.image} alt={selected.name} seed={selected.slug} className="size-full" />
                          <button onClick={() => setActive(null)} aria-label="Close preview" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/90"><X className="size-4" /></button>
                        </div>
                        <div className="p-4">
                          <p className="eyebrow text-stone-500">{selected.developer.name}</p>
                          <p className="font-serif text-2xl text-ink-900">{selected.name}</p>
                          <p className="num mt-1 font-semibold text-ink-900">{priceLine(selected)} <span className="text-[11px] font-normal text-stone-500">indicative</span></p>
                          <Link href={`/properties/${selected.slug}`} className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-ink-900 py-2.5 text-sm font-medium text-white">View details <ArrowUpRight className="size-4" /></Link>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : view === "list" ? (
            <div className="flex flex-col gap-3">{cards.map((c) => <ProjectRow key={c.id} c={c} />)}</div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards.map((c, i) => <ProjectCardView key={c.id} c={c} priority={i < 3} />)}</div>
          )}
        </section>
      </div>

      {/* Mobile filter sheet */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-[70] bg-ink-950/40 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div role="dialog" aria-modal="true" aria-label="Filters" className="fixed inset-x-0 bottom-0 z-[71] max-h-[85vh] overflow-y-auto rounded-t-[32px] bg-ivory-50 p-6 pb-28 lg:hidden" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", bounce: 0, duration: 0.45 }}>
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-ink-900/15" />
              <div className="mb-6 flex items-center justify-between"><p className="font-serif text-3xl">Filters</p><button onClick={() => setOpen(false)} aria-label="Close filters" className="grid size-10 place-items-center rounded-full bg-white"><X className="size-5" /></button></div>
              {filters}
              <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-ink-900/5 bg-ivory-50 p-4">
                <Link href={`${path}?mode=${mode}`} onClick={() => setOpen(false)} className="flex-1 rounded-full border border-ink-900/15 py-3 text-center text-sm font-medium">Clear</Link>
                <button onClick={() => setOpen(false)} className="flex-[2] rounded-full bg-ink-900 py-3 text-sm font-medium text-white">Show {cards.length} listings</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-stone-500">{title}</legend>
      {children}
    </fieldset>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition", on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white text-stone-600 hover:border-ink-900/30")}>
      {children}
    </button>
  );
}
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} role="switch" aria-checked={on} className="flex items-center justify-between gap-3 text-left text-[13px] text-stone-700">
      {children}
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition", on ? "bg-ink-900" : "bg-ink-900/15")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}
