"use client";

import { useState, useTransition } from "react";
import type { InterestTier } from "@prisma/client";
import { INTEREST_TIER, INTEREST_TIERS } from "@/lib/labels";
import { setTierAction, withdrawInterestAction } from "@/app/admin/(app)/buyers/actions";
import { cn } from "@/lib/cn";

export function TierSelect({ interestId, tier, disabled }: { interestId: string; tier: InterestTier; disabled?: boolean }) {
  const [value, setValue] = useState(tier);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <select
        value={value}
        disabled={disabled || pending}
        onChange={(e) => {
          const t = e.target.value as InterestTier;
          setValue(t);
          start(async () => {
            const r = await setTierAction(interestId, t);
            if (r?.error) { setErr(r.error); setValue(tier); }
          });
        }}
        className={cn("rounded-full border border-ink-900/10 bg-white px-3 py-1.5 text-[12.5px]", pending && "opacity-50")}
        aria-label="Interest tier"
        title={INTEREST_TIER[value].hint}
      >
        {INTEREST_TIERS.map((t) => <option key={t} value={t}>{INTEREST_TIER[t].label}</option>)}
      </select>
      {err && <span className="mt-1 text-[11px] text-clay-600">{err}</span>}
    </span>
  );
}

export function WithdrawButton({ interestId, active }: { interestId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(async () => { await withdrawInterestAction(interestId); })} className="text-[12px] text-stone-500 underline-offset-4 hover:text-ink-900 hover:underline disabled:opacity-50">
      {active ? "Mark withdrawn" : "Reactivate"}
    </button>
  );
}

export function Disclosure({ label, children, defaultOpen }: { label: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-[13px] font-medium text-gold-700 hover:underline">{label}</button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
