"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export function OptionTile({ selected, onClick, title, hint, icon, multi }: { selected: boolean; onClick: () => void; title: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; multi?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left transition-all duration-300",
        selected ? "border-ink-900 shadow-[0_0_0_1px_var(--color-ink-900),0_12px_30px_-16px_rgb(10_19_34/0.5)]" : "border-ink-900/10 hover:-translate-y-0.5 hover:border-ink-900/30 hover:shadow-soft",
      )}
    >
      {icon && <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl transition", selected ? "bg-ink-900 text-gold-300" : "bg-ivory-100 text-gold-700")}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium text-ink-900">{title}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] text-stone-500">{hint}</span>}
      </span>
      <span className={cn("grid size-5 shrink-0 place-items-center border transition", multi ? "rounded-md" : "rounded-full", selected ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/20")}>
        {selected && <Check className="size-3" />}
      </span>
    </button>
  );
}

export function StepProgress({ step, total, label }: { step: number; total: number; label?: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-stone-500">
        <span>Step {step + 1} of {total}</span>
        {label && <span>{label}</span>}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-ink-900/[0.07]">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" animate={{ width: `${((step + 1) / total) * 100}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

export const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

export function StepTitle({ eyebrow, title, hint }: { eyebrow?: string; title: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="eyebrow mb-2 text-gold-700">{eyebrow}</p>}
      <h2 className="font-serif text-[32px] leading-[1.05] text-ink-900 md:text-[40px]">{title}</h2>
      {hint && <p className="mt-2 text-[14px] text-stone-500">{hint}</p>}
    </div>
  );
}

export const fieldClass = "w-full rounded-2xl border border-ink-900/12 bg-white px-4 py-3.5 text-[15px] text-ink-900 placeholder:text-stone-400 focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-300/30";
