"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, MapPin, Search, Building2, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

type Loc = { slug: string; name: string; parent?: string | null; count: number };

const TABS = [
  { mode: "homes", label: "Buy a home" },
  { mode: "commercial", label: "Commercial" },
  { mode: "pre-leased", label: "Pre-leased" },
  { mode: "rent-homes", label: "Rent" },
] as const;

const BUDGETS: Record<string, { label: string; value: string }[]> = {
  homes: [
    { label: "Any budget", value: "" },
    { label: "Up to ₹75 L", value: "7500000" },
    { label: "Up to ₹1 Cr", value: "10000000" },
    { label: "Up to ₹1.5 Cr", value: "15000000" },
    { label: "Up to ₹2 Cr", value: "20000000" },
    { label: "Up to ₹3 Cr", value: "30000000" },
    { label: "Up to ₹5 Cr", value: "50000000" },
  ],
  commercial: [
    { label: "Any budget", value: "" },
    { label: "Up to ₹2 Cr", value: "20000000" },
    { label: "Up to ₹5 Cr", value: "50000000" },
    { label: "Up to ₹10 Cr", value: "100000000" },
  ],
  "pre-leased": [
    { label: "Any budget", value: "" },
    { label: "Up to ₹4 Cr", value: "40000000" },
    { label: "Up to ₹8 Cr", value: "80000000" },
  ],
  "rent-homes": [
    { label: "Any rent", value: "" },
    { label: "Up to ₹50k / mo", value: "50000" },
    { label: "Up to ₹1 L / mo", value: "100000" },
    { label: "Up to ₹2 L / mo", value: "200000" },
  ],
};

const CONFIGS: Record<string, { label: string; value: string }[]> = {
  homes: [
    { label: "Any size", value: "" },
    { label: "1 BHK", value: "1" },
    { label: "2 BHK", value: "2" },
    { label: "3 BHK", value: "3" },
    { label: "4 BHK+", value: "4" },
  ],
  "rent-homes": [
    { label: "Any size", value: "" },
    { label: "1 BHK", value: "1" },
    { label: "2 BHK", value: "2" },
    { label: "3 BHK", value: "3" },
  ],
};

export function HeroSearch({ locations }: { locations: Loc[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<(typeof TABS)[number]["mode"]>("homes");
  const [query, setQuery] = useState("");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [open, setOpen] = useState(false);
  const [bhk, setBhk] = useState("");
  const [budget, setBudget] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    setBudget("");
    setBhk("");
  }, [mode]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((l) => !q || l.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, locations]);

  function go(e?: React.FormEvent) {
    e?.preventDefault();
    const sp = new URLSearchParams({ mode });
    if (loc) sp.set("location", loc.slug);
    else if (query.trim()) sp.set("q", query.trim());
    if (bhk) sp.set("bhk", bhk);
    if (budget) sp.set("max", budget);
    router.push(`/properties?${sp}`);
  }

  const configs = CONFIGS[mode];
  return (
    <div className="w-full max-w-4xl">
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 scrollbar-none" role="tablist" aria-label="What are you looking for">
        {TABS.map((t) => (
          <button
            key={t.mode}
            role="tab"
            aria-selected={mode === t.mode}
            onClick={() => setMode(t.mode)}
            className={cn("relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition", mode === t.mode ? "text-ink-950" : "text-ivory-100/80 hover:text-white")}
          >
            {mode === t.mode && <motion.span layoutId="hero-tab" className="absolute inset-0 rounded-full bg-ivory-50" transition={{ type: "spring", bounce: 0.18, duration: 0.6 }} />}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>
      <form onSubmit={go} className="relative flex flex-col gap-1 rounded-[28px] bg-white p-2 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)] md:flex-row md:items-center md:rounded-full">
        <div ref={boxRef} className="relative flex-[1.6]">
          <label className="flex items-center gap-3 rounded-full px-4 py-2.5 transition hover:bg-ivory-100">
            <MapPin className="size-5 shrink-0 text-gold-600" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Where</span>
              <input
                value={loc ? loc.name : query}
                onChange={(e) => {
                  setLoc(null);
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="Borivali West, Powai, BKC…"
                className="w-full bg-transparent text-[15px] font-medium text-ink-900 placeholder:font-normal placeholder:text-stone-400 focus:outline-none"
                aria-label="Location or project"
                aria-expanded={open}
                aria-controls="hero-locs"
                role="combobox"
                autoComplete="off"
              />
            </span>
          </label>
          <AnimatePresence>
            {open && results.length > 0 && (
              <motion.ul
                id="hero-locs"
                role="listbox"
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2 }}
                className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 max-h-80 overflow-auto rounded-3xl border border-ink-900/5 bg-white p-2 shadow-lift md:right-auto md:w-[420px]"
              >
                {results.map((l) => (
                  <li key={l.slug} role="option" aria-selected={loc?.slug === l.slug}>
                    <button
                      type="button"
                      onClick={() => {
                        setLoc(l);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-ivory-100"
                    >
                      <span className="grid size-9 place-items-center rounded-xl bg-ivory-200 text-gold-700"><MapPin className="size-4" /></span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-ink-900">{l.name}</span>
                        <span className="block text-[12px] text-stone-500">{l.parent ?? "Mumbai"}</span>
                      </span>
                      <span className="num text-[12px] text-stone-500">{l.count} {l.count === 1 ? "listing" : "listings"}</span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
        <div className="mx-1 hidden h-10 w-px bg-ink-900/10 md:block" />
        {configs ? (
          <label className="flex flex-1 items-center gap-3 rounded-full px-4 py-2.5 transition hover:bg-ivory-100">
            <Building2 className="size-5 shrink-0 text-gold-600" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Size</span>
              <select value={bhk} onChange={(e) => setBhk(e.target.value)} className="w-full cursor-pointer appearance-none bg-transparent text-[15px] font-medium text-ink-900 focus:outline-none" aria-label="Configuration">
                {configs.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </span>
          </label>
        ) : null}
        <div className="mx-1 hidden h-10 w-px bg-ink-900/10 md:block" />
        <label className="flex flex-1 items-center gap-3 rounded-full px-4 py-2.5 transition hover:bg-ivory-100">
          <Wallet className="size-5 shrink-0 text-gold-600" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Budget</span>
            <select value={budget} onChange={(e) => setBudget(e.target.value)} className="w-full cursor-pointer appearance-none bg-transparent text-[15px] font-medium text-ink-900 focus:outline-none" aria-label="Budget">
              {(BUDGETS[mode] ?? BUDGETS.homes)!.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </span>
        </label>
        <button type="submit" className="flex h-14 items-center justify-center gap-2 rounded-full bg-ink-900 px-7 text-[15px] font-medium text-white transition hover:bg-ink-800 md:h-[60px]">
          <Search className="size-[18px]" /> Search
        </button>
      </form>
      <a href="/match" className="group mt-5 inline-flex items-center gap-2 text-[14px] text-ivory-100/85 transition hover:text-white">
        <span className="rounded-full bg-gold-300/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold-200">New</span>
        Not sure where to start? Get matched in 2 minutes
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </a>
    </div>
  );
}
