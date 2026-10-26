import type { Campaign } from "@prisma/client";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/field";
import { INTEREST_TIER } from "@/lib/labels";
import { DEFAULT_COUNTING_TIERS } from "@/lib/domain/demand";

export function CampaignFields({ c, users, defaults }: { c?: Campaign | null; users: { id: string; name: string }[]; defaults?: { name?: string; focus?: number[] } }) {
  const counting = c?.countingTiers ?? DEFAULT_COUNTING_TIERS;
  const focus = c?.focusConfigs ?? defaults?.focus ?? [];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Campaign name" className="sm:col-span-2"><Input name="name" defaultValue={c?.name ?? defaults?.name ?? ""} placeholder="Borivali West — Project A 2 BHK group" /></Field>
      <Field label="Target buyers"><Input name="targetBuyers" inputMode="numeric" defaultValue={c?.targetBuyers ?? 15} /></Field>
      <Field label="Target date"><Input type="date" name="targetDate" defaultValue={c?.targetDate ? c.targetDate.toISOString().slice(0, 10) : ""} /></Field>
      <Field label="Counts toward target" className="sm:col-span-2" hint="Expressions of interest alone usually should not count.">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(INTEREST_TIER).map(([k, v]) => (
            <label key={k} className="cursor-pointer"><input type="checkbox" name="countingTiers" value={k} defaultChecked={counting.includes(k as never)} className="peer sr-only" /><span className="inline-block rounded-full border border-ink-900/12 px-3 py-1.5 text-[12.5px] text-stone-600 peer-checked:border-ink-900 peer-checked:bg-ink-900 peer-checked:text-white">{v.label}</span></label>
          ))}
        </div>
      </Field>
      <Field label="Focus configurations (optional)" className="sm:col-span-2">
        <div className="flex flex-wrap gap-1.5">
          {[1, 1.5, 2, 2.5, 3, 4, 5].map((b) => (
            <label key={b} className="cursor-pointer"><input type="checkbox" name="focusConfigs" value={b} defaultChecked={focus.includes(b)} className="peer sr-only" /><span className="inline-block rounded-full border border-ink-900/12 px-3 py-1.5 text-[12.5px] text-stone-600 peer-checked:border-ink-900 peer-checked:bg-ink-900 peer-checked:text-white">{b === 5 ? "5+" : b} BHK</span></label>
          ))}
        </div>
      </Field>
      <Field label="Owner"><Select name="ownerId" defaultValue={c?.ownerId ?? ""}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      <Field label="Public buyer counts"><Select name="visibility" defaultValue={c?.visibility ?? "APPROXIMATE"}><option value="EXACT">Exact</option><option value="APPROXIMATE">Approximate (5+, 10+…)</option><option value="PRIVATE">Private</option></Select></Field>
      <Field label="Public headline"><Input name="headline" defaultValue={c?.headline ?? ""} placeholder="Borivali West — 2 BHK Buying Group" /></Field>
      <div className="flex items-end pb-2"><Checkbox name="isPublic" defaultChecked={c?.isPublic ?? false} label="Show this group on the public website" /></div>
      <Field label="Public note" className="sm:col-span-2"><Textarea name="publicNote" defaultValue={c?.publicNote ?? "Joining expresses interest only. It does not commit you to buy, and reaching the target does not guarantee a discount or allocation."} /></Field>
    </div>
  );
}
