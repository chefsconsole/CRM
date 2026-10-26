"use client";

// Compare list is a per-visitor convenience kept in the browser — not business data.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GitCompareArrows, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Item = { slug: string; name: string };
const KEY = "ek-compare";
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cacheVal: Item[] = [];

function read(): Item[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cacheRaw) {
      cacheRaw = raw;
      cacheVal = raw ? (JSON.parse(raw) as Item[]) : [];
    }
  } catch {
    cacheVal = [];
  }
  return cacheVal;
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const EMPTY: Item[] = [];

export function useCompare() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function CompareToggle({ slug, name }: { slug: string; name: string }) {
  const items = useCompare();
  const on = items.some((i) => i.slug === slug);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        write(on ? items.filter((i) => i.slug !== slug) : [...items.filter((i) => i.slug !== slug), { slug, name }].slice(-3));
      }}
      aria-pressed={on}
      title={on ? "Remove from comparison" : "Add to comparison (up to 3)"}
      className={cn("grid size-9 place-items-center rounded-full backdrop-blur transition", on ? "bg-gold-300 text-ink-950" : "bg-white/85 text-ink-900 hover:bg-white")}
    >
      <GitCompareArrows className="size-4" />
    </button>
  );
}

export function CompareTray() {
  const items = useCompare();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-white/10 bg-ink-900/95 p-1.5 pl-4 text-sm text-ivory-100 shadow-lift backdrop-blur scrollbar-none">
            <span className="hidden shrink-0 text-ink-300 sm:inline">Compare</span>
            {items.map((i) => (
              <span key={i.slug} className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1 text-[12.5px]">
                {i.name}
                <button aria-label={`Remove ${i.name}`} onClick={() => write(items.filter((x) => x.slug !== i.slug))} className="grid size-5 place-items-center rounded-full hover:bg-white/15"><X className="size-3" /></button>
              </span>
            ))}
            <Link href={`/compare?p=${items.map((i) => i.slug).join(",")}`} className="shrink-0 rounded-full bg-gold-300 px-4 py-1.5 text-[13px] font-semibold text-ink-950">
              Compare {items.length}
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
