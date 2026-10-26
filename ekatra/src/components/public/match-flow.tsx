"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Briefcase, Building, Check, Home, KeyRound, Loader2, Store, TrendingUp, Landmark, MapPin, Sparkles, SlidersHorizontal, ShieldCheck, Train } from "lucide-react";
import { OptionTile, StepProgress, StepTitle, fieldClass, stepVariants } from "./steps";
import { PropertyImage } from "../ui/property-image";
import { formatBhk, formatINR, formatPriceRange } from "@/lib/format";
import { BOOKING_OPTIONS, COMMIT_OPTIONS, POSSESSION_OPTIONS } from "@/lib/domain/timelines";
import { CONSENT_TEXT } from "@/lib/validation";
import { cn } from "@/lib/cn";

type Intent = "RES_SELF_USE" | "RES_INVESTMENT" | "COM_OFFICE" | "COM_RETAIL" | "COM_INVESTMENT" | "PRE_LEASED" | "RENT_RESIDENTIAL" | "RENT_COMMERCIAL";
const INTENTS: { k: Intent; t: string; h: string; icon: React.ReactNode }[] = [
  { k: "RES_SELF_USE", t: "A home to live in", h: "Buy for your family", icon: <Home className="size-5" /> },
  { k: "RES_INVESTMENT", t: "A home as an investment", h: "Buy for rent or growth", icon: <TrendingUp className="size-5" /> },
  { k: "RENT_RESIDENTIAL", t: "A home to rent", h: "Monthly rental", icon: <KeyRound className="size-5" /> },
  { k: "COM_OFFICE", t: "Office to buy", h: "Offices & business premises", icon: <Briefcase className="size-5" /> },
  { k: "COM_RETAIL", t: "Shop or showroom to buy", h: "High-street retail", icon: <Store className="size-5" /> },
  { k: "PRE_LEASED", t: "Pre-leased investment", h: "Already tenanted, earning rent", icon: <Landmark className="size-5" /> },
  { k: "COM_INVESTMENT", t: "Commercial investment", h: "Units bought for income", icon: <Building className="size-5" /> },
  { k: "RENT_COMMERCIAL", t: "Office or shop to rent", h: "Lease commercial space", icon: <KeyRound className="size-5" /> },
];
const STAGES = [["NEW_LAUNCH", "New launch / upcoming"], ["PRE_LAUNCH", "Pre-launch"], ["UNDER_CONSTRUCTION", "Under construction"], ["READY_TO_MOVE", "Ready to move"]] as const;
const SITUATIONS = [["READY_TO_PURCHASE", "Ready to purchase"], ["COMPARING_SHORTLIST", "Comparing a few shortlisted projects"], ["WAITING_FOR_PRICE", "Waiting for better pricing"], ["WAITING_FOR_FUNDS", "Waiting for funds"], ["WAITING_FOR_LOAN", "Waiting for a home loan"], ["SELLING_ANOTHER_PROPERTY", "Selling another property first"], ["WAITING_FOR_EXISTING_POSSESSION", "Waiting for possession of an existing home"], ["EXPLORING", "Exploring without a fixed timeline"]] as const;

type Loc = { id: string; name: string; region: string | null };
type Match = { propertyId: string; slug: string; name: string; image: string | null; location: string; developer: string; dealType: string; score: number; eligible: boolean; priceMin: number | null; priceMax: number | null; rentMin: number | null; rentMax: number | null; bhks: number[]; grossYield: number | null; factors: { key: string; label: string; status: string; detail: string }[] };

type R = {
  intents: Intent[];
  stagePreferences: string[];
  primaryLocationId: string | null;
  secondaryLocationId: string | null;
  acceptableLocationIds: string[];
  transport: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetStretch: number | null;
  rentMin: number | null;
  rentMax: number | null;
  loanRequired: "YES" | "NO" | "UNDECIDED";
  fundingStatus: "READY" | "LOAN_IN_PROCESS" | "EXPLORING_FINANCE" | "NOT_ASSESSED";
  configurations: number[];
  propertyTypes: string[];
  carpetMin: number | null;
  parkingNeeded: number | null;
  mustHaves: string[];
  commitWithinDays: number | null;
  bookingWithinDays: number | null;
  situation: string;
  possessionWaitMonths: number | null;
  moveInBy: string | null;
  minGrossYieldPct: number | null;
  essentials: string;
};
const INITIAL: R = { intents: [], stagePreferences: [], primaryLocationId: null, secondaryLocationId: null, acceptableLocationIds: [], transport: [], budgetMin: null, budgetMax: null, budgetStretch: null, rentMin: null, rentMax: null, loanRequired: "UNDECIDED", fundingStatus: "NOT_ASSESSED", configurations: [], propertyTypes: [], carpetMin: null, parkingNeeded: null, mustHaves: [], commitWithinDays: null, bookingWithinDays: null, situation: "EXPLORING", possessionWaitMonths: null, moveInBy: null, minGrossYieldPct: null, essentials: "" };

const BUY_RES = [[null, 7.5e6], [7.5e6, 1e7], [1e7, 1.5e7], [1.5e7, 2e7], [2e7, 3e7], [3e7, 5e7], [5e7, null]] as const;
const BUY_COM = [[null, 1.5e7], [1.5e7, 3e7], [3e7, 5e7], [5e7, 1e8], [1e8, null]] as const;
const RENT = [[null, 4e4], [4e4, 7.5e4], [7.5e4, 1.5e5], [1.5e5, 5e5], [5e5, null]] as const;
const bandLabel = (a: number | null, b: number | null, mo = "") => (a === null ? `Up to ${formatINR(b)}${mo}` : b === null ? `${formatINR(a)}+${mo}` : `${formatINR(a)} – ${formatINR(b)}${mo}`);

export function MatchFlow({ locations }: { locations: Loc[] }) {
  const [r, setR] = useState<R>(INITIAL);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"questions" | "results" | "contact" | "done">("questions");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (p: Partial<R>) => setR((x) => ({ ...x, ...p }));
  const toggle = <K extends keyof R>(k: K, v: R[K] extends (infer T)[] ? T : never) => setR((x) => { const arr = x[k] as unknown[]; return { ...x, [k]: arr.includes(v) ? arr.filter((y) => y !== v) : [...arr, v] }; });

  const rental = r.intents.length > 0 && r.intents.every((x) => x.startsWith("RENT"));
  const commercial = r.intents.some((x) => x.startsWith("COM") || x === "PRE_LEASED" || x === "RENT_COMMERCIAL");
  const residential = r.intents.some((x) => x.startsWith("RES") || x === "RENT_RESIDENTIAL");
  const steps = useMemo(() => ["what", "where", "budget", "home", "when", ...(rental ? ["movein"] : ["possession"])], [rental]);
  const step = steps[i]!;

  function next() {
    if (step === "what" && !r.intents.length) return setErr("Choose at least one option.");
    if (step === "where" && !r.primaryLocationId) return setErr("Choose your preferred location.");
    setErr(null);
    if (i === steps.length - 1) return preview();
    setDir(1);
    setI(i + 1);
  }
  function back() {
    setErr(null);
    setDir(-1);
    setI(Math.max(0, i - 1));
  }
  function payload() {
    return { ...r, essentials: r.essentials || null, moveInBy: r.moveInBy || null };
  }
  async function preview() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/match/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      const d = (await res.json()) as { matches?: Match[]; error?: string };
      if (!res.ok) throw new Error(d.error);
      setMatches(d.matches ?? []);
      setPhase("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Could not load matches.");
    } finally {
      setLoading(false);
    }
  }

  const locName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "";
  const regions = [...new Set(locations.map((l) => l.region ?? "Mumbai"))];

  if (phase === "results" && matches) return <Results matches={matches} r={r} locName={locName} onAdjust={(s) => { setPhase("questions"); setI(Math.max(0, steps.indexOf(s))); }} onSave={() => setPhase("contact")} />;
  if (phase === "contact" || phase === "done") return <ContactStep r={r} payload={payload} done={phase === "done"} onDone={() => setPhase("done")} onBack={() => setPhase("results")} />;

  return (
    <div className="mx-auto max-w-3xl">
      <StepProgress step={i} total={steps.length} label="About 2 minutes" />
      <div className="relative mt-8 min-h-[440px]">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={step} custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {step === "what" && (
              <>
                <StepTitle eyebrow="Step one" title="What are you looking for?" hint="Choose everything that applies — each gets its own questions." />
                <div className="grid gap-3 sm:grid-cols-2">{INTENTS.map((x) => <OptionTile key={x.k} multi icon={x.icon} title={x.t} hint={x.h} selected={r.intents.includes(x.k)} onClick={() => toggle("intents", x.k)} />)}</div>
                {residential && !rental && (
                  <div className="mt-7">
                    <p className="mb-3 text-[14px] font-medium text-ink-900">Which project stages interest you?</p>
                    <div className="flex flex-wrap gap-2">{STAGES.map(([k, l]) => <Pill key={k} on={r.stagePreferences.includes(k)} onClick={() => toggle("stagePreferences", k)}>{l}</Pill>)}</div>
                  </div>
                )}
              </>
            )}
            {step === "where" && (
              <>
                <StepTitle eyebrow="Location" title="Where would you like to be?" hint="We only suggest areas you choose — never assume you'd consider a place just because it's nearby." />
                {regions.map((reg) => (
                  <div key={reg} className="mb-5">
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-stone-500">{reg}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {locations.filter((l) => (l.region ?? "Mumbai") === reg).map((l) => {
                        const role = r.primaryLocationId === l.id ? "1st choice" : r.secondaryLocationId === l.id ? "2nd choice" : r.acceptableLocationIds.includes(l.id) ? "Also OK" : null;
                        return (
                          <button key={l.id} type="button" onClick={() => {
                            if (!r.primaryLocationId) set({ primaryLocationId: l.id });
                            else if (r.primaryLocationId === l.id) set({ primaryLocationId: r.secondaryLocationId, secondaryLocationId: null });
                            else if (!r.secondaryLocationId && !r.acceptableLocationIds.includes(l.id)) set({ secondaryLocationId: l.id });
                            else if (r.secondaryLocationId === l.id) set({ secondaryLocationId: null });
                            else toggle("acceptableLocationIds", l.id);
                          }} aria-pressed={!!role} className={cn("flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-[14px] transition", role ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/10 bg-white text-ink-900 hover:border-ink-900/30")}>
                            <span className="flex items-center gap-2"><MapPin className={cn("size-4", role ? "text-gold-300" : "text-gold-600")} />{l.name}</span>
                            {role && <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gold-300">{role}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-[12.5px] text-stone-500">Tap once for your first choice, then your second; any more are marked “also OK”. Tap again to remove.</p>
                <p className="mb-2 mt-6 text-[14px] font-medium text-ink-900">Important connections <span className="font-normal text-stone-500">(optional)</span></p>
                <div className="flex flex-wrap gap-2">{["Metro", "Suburban rail", "Western Express Highway", "Business district", "Good schools"].map((t) => <Pill key={t} on={r.transport.includes(t)} onClick={() => toggle("transport", t)}><Train className="size-3.5" />{t}</Pill>)}</div>
              </>
            )}
            {step === "budget" && (
              <>
                <StepTitle eyebrow="Budget" title={rental ? "What monthly rent works for you?" : "What's your budget?"} hint="It stays private. A budget is never treated as proof of purchasing capacity." />
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {(rental ? RENT : commercial && !residential ? BUY_COM : BUY_RES).map(([a, b]) => {
                    const on = rental ? r.rentMin === a && r.rentMax === b : r.budgetMin === a && r.budgetMax === b;
                    return <OptionTile key={`${a}-${b}`} selected={on} onClick={() => (rental ? set({ rentMin: a, rentMax: b }) : set({ budgetMin: a, budgetMax: b, budgetStretch: b ? Math.round(b * 1.1) : null }))} title={bandLabel(a, b, rental ? " / month" : "")} />;
                  })}
                </div>
                {!rental && (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label className="text-[13px] font-medium text-stone-700">Or enter an exact maximum (₹)<input inputMode="numeric" value={r.budgetMax ?? ""} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); set({ budgetMax: n || null }); }} className={cn(fieldClass, "mt-1.5")} placeholder="25000000" /></label>
                    <label className="text-[13px] font-medium text-stone-700">Stretch budget, if any (₹)<input inputMode="numeric" value={r.budgetStretch ?? ""} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); set({ budgetStretch: n || null }); }} className={cn(fieldClass, "mt-1.5")} /></label>
                  </div>
                )}
                {!rental && (
                  <>
                    <p className="mb-2 mt-6 text-[14px] font-medium text-ink-900">Home loan needed?</p>
                    <div className="flex flex-wrap gap-2">{([["YES", "Yes"], ["NO", "No"], ["UNDECIDED", "Undecided"]] as const).map(([k, l]) => <Pill key={k} on={r.loanRequired === k} onClick={() => set({ loanRequired: k })}>{l}</Pill>)}</div>
                    <p className="mb-2 mt-5 text-[14px] font-medium text-ink-900">Funding status <span className="font-normal text-stone-500">(optional)</span></p>
                    <div className="flex flex-wrap gap-2">{([["READY", "Ready"], ["LOAN_IN_PROCESS", "Loan process underway"], ["EXPLORING_FINANCE", "Exploring financing"], ["NOT_ASSESSED", "Not yet assessed"]] as const).map(([k, l]) => <Pill key={k} on={r.fundingStatus === k} onClick={() => set({ fundingStatus: k })}>{l}</Pill>)}</div>
                  </>
                )}
              </>
            )}
            {step === "home" && (
              <>
                <StepTitle eyebrow="Requirements" title={residential ? "What kind of space?" : "What kind of commercial space?"} />
                {residential && <div className="flex flex-wrap gap-2">{[0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map((b) => <Pill key={b} on={r.configurations.includes(b)} onClick={() => toggle("configurations", b)}>{b === 0 ? "Studio" : b === 5 ? "5+ BHK" : formatBhk(b)}</Pill>)}</div>}
                {commercial && <div className={cn("flex flex-wrap gap-2", residential && "mt-4")}>{[["OFFICE", "Office"], ["RETAIL_SHOP", "Retail shop"], ["SHOWROOM", "Showroom"], ["COWORKING", "Managed office"], ["BUSINESS_PREMISES", "Business premises"]].map(([k, l]) => <Pill key={k} on={r.propertyTypes.includes(k!)} onClick={() => toggle("propertyTypes", k!)}>{l}</Pill>)}</div>}
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <label className="text-[13px] font-medium text-stone-700">Minimum carpet area (sq ft)<input inputMode="numeric" value={r.carpetMin ?? ""} onChange={(e) => set({ carpetMin: Number(e.target.value.replace(/\D/g, "")) || null })} className={cn(fieldClass, "mt-1.5")} /></label>
                  <label className="text-[13px] font-medium text-stone-700">Car parks needed<input inputMode="numeric" value={r.parkingNeeded ?? ""} onChange={(e) => set({ parkingNeeded: Number(e.target.value.replace(/\D/g, "")) || null })} className={cn(fieldClass, "mt-1.5")} /></label>
                  {r.intents.includes("PRE_LEASED") && <label className="text-[13px] font-medium text-stone-700">Minimum gross yield %<input inputMode="decimal" value={r.minGrossYieldPct ?? ""} onChange={(e) => set({ minGrossYieldPct: Number(e.target.value) || null })} className={cn(fieldClass, "mt-1.5")} /></label>}
                </div>
                <p className="mb-2 mt-6 text-[14px] font-medium text-ink-900">Which of these are non-negotiable?</p>
                <div className="flex flex-wrap gap-2">{[["location", "Location"], ["budget", "Budget"], ["configuration", "Configuration"], ["carpet", "Carpet area"], ["possession", "Possession timing"], ["parking", "Parking"]].map(([k, l]) => <Pill key={k} on={r.mustHaves.includes(k!)} onClick={() => toggle("mustHaves", k!)}>{l}</Pill>)}</div>
                <label className="mt-6 block text-[13px] font-medium text-stone-700">Anything else essential? <span className="font-normal text-stone-400">(floor, view, vastu, terrace…)</span><textarea value={r.essentials} onChange={(e) => set({ essentials: e.target.value.slice(0, 500) })} rows={3} className={cn(fieldClass, "mt-1.5")} /></label>
              </>
            )}
            {step === "when" && (
              <>
                <StepTitle eyebrow="Timing" title={rental ? "How soon could you sign a lease?" : "If we find the right property and negotiate suitable terms, how soon could you commit?"} hint="Separate from when you need possession — and never a commitment." />
                <div className="grid gap-2.5 sm:grid-cols-2">{COMMIT_OPTIONS.map((o) => <OptionTile key={o.days} selected={r.commitWithinDays === o.days} onClick={() => set({ commitWithinDays: o.days })} title={o.label} />)}</div>
                {!rental && (
                  <>
                    <p className="mb-2 mt-6 text-[14px] font-medium text-ink-900">How soon could you make a booking payment if you decide to proceed?</p>
                    <div className="flex flex-wrap gap-2">{BOOKING_OPTIONS.map((o) => <Pill key={o.days} on={r.bookingWithinDays === o.days} onClick={() => set({ bookingWithinDays: o.days })}>{o.label}</Pill>)}</div>
                  </>
                )}
                <p className="mb-2 mt-6 text-[14px] font-medium text-ink-900">Which best describes you right now?</p>
                <div className="flex flex-wrap gap-2">{SITUATIONS.map(([k, l]) => <Pill key={k} on={r.situation === k} onClick={() => set({ situation: k })}>{l}</Pill>)}</div>
              </>
            )}
            {step === "possession" && (
              <>
                <StepTitle eyebrow="Possession" title="How long are you comfortable waiting for possession?" hint="You might book within weeks and still be happy to wait three years — that's fine." />
                <div className="grid gap-2.5 sm:grid-cols-3">{POSSESSION_OPTIONS.map((o) => <OptionTile key={o.months} selected={r.possessionWaitMonths === o.months} onClick={() => set({ possessionWaitMonths: o.months })} title={o.label} />)}</div>
              </>
            )}
            {step === "movein" && (
              <>
                <StepTitle eyebrow="Move-in" title="When do you need to move in?" />
                <input type="date" value={r.moveInBy ?? ""} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ moveInBy: e.target.value || null })} className={cn(fieldClass, "max-w-xs")} aria-label="Move-in date" />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {err && <p role="alert" className="mt-4 rounded-2xl bg-clay-50 px-4 py-3 text-[13px] text-clay-600">{err}</p>}
      <div className="sticky bottom-0 -mx-5 mt-8 flex items-center justify-between gap-3 border-t border-ink-900/5 bg-ivory-50/90 px-5 py-4 backdrop-blur-xl md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <button type="button" onClick={back} disabled={i === 0} className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-[14px] font-medium text-stone-600 disabled:opacity-0"><ArrowLeft className="size-4" /> Back</button>
        <button type="button" onClick={next} disabled={loading} className={cn("inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-medium transition", i === steps.length - 1 ? "bg-gradient-to-b from-gold-300 to-gold-500 font-semibold text-ink-950 shadow-glow" : "bg-ink-900 text-white hover:bg-ink-800")}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : i === steps.length - 1 ? <Sparkles className="size-4" /> : null}
          {i === steps.length - 1 ? "See my matches" : "Continue"} {i < steps.length - 1 && <ArrowRight className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className={cn("inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] transition", on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/12 bg-white text-stone-700 hover:border-ink-900/30")}>{children}</button>;
}

function ScoreRing({ score, eligible }: { score: number; eligible: boolean }) {
  const c = 2 * Math.PI * 22;
  return (
    <div className="relative grid size-14 shrink-0 place-items-center">
      <svg width="56" height="56" className="-rotate-90"><circle cx="28" cy="28" r="22" fill="none" stroke="rgb(10 19 34 / 0.08)" strokeWidth="5" /><motion.circle cx="28" cy="28" r="22" fill="none" stroke={eligible ? "#b8975c" : "#a04a35"} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} /></svg>
      <span className="num absolute text-[13px] font-semibold text-ink-900">{score}%</span>
    </div>
  );
}

function Results({ matches, r, locName, onAdjust, onSave }: { matches: Match[]; r: R; locName: (id: string | null) => string; onAdjust: (step: string) => void; onSave: () => void }) {
  const strong = matches.filter((m) => m.eligible && m.score >= 60);
  const partial = matches.filter((m) => !(m.eligible && m.score >= 60) && m.score >= 30);
  return (
    <div>
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-gold-700">Your matches</p>
          <h2 className="display mt-3 text-5xl text-ink-900 md:text-6xl">{strong.length ? <>{strong.length} {strong.length === 1 ? "property fits" : "properties fit"} <span className="italic">your brief.</span></> : <>No strong fits <span className="italic">yet.</span></>}</h2>
          <p className="mt-3 max-w-xl text-[14.5px] text-stone-600">Scores weigh location, budget, configuration, carpet area, possession and stage — and any must-have you marked. Unknown details count as “requires confirmation”, never as a match.</p>
        </div>
        <button onClick={onSave} className="inline-flex h-14 shrink-0 items-center gap-2 rounded-full bg-ink-900 px-7 text-[15px] font-medium text-white"><Sparkles className="size-4 text-gold-300" /> Save & get a callback</button>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-3xl border border-ink-900/[0.07] bg-white p-3 text-[13px]">
        <SlidersHorizontal className="ml-2 size-4 text-stone-400" />
        {[["what", r.intents.length ? `${r.intents.length} type(s)` : "Type"], ["where", locName(r.primaryLocationId) || "Location"], ["budget", r.budgetMax ? `≤ ${formatINR(r.budgetMax)}` : r.rentMax ? `≤ ${formatINR(r.rentMax)}/mo` : "Budget"], ["home", r.configurations.length ? r.configurations.map(formatBhk).join(", ") : "Space"], ["when", r.commitWithinDays ? COMMIT_OPTIONS.find((o) => o.days === r.commitWithinDays)?.label ?? "Timing" : "Timing"], ["possession", r.possessionWaitMonths !== null ? POSSESSION_OPTIONS.find((o) => o.months === r.possessionWaitMonths)?.label ?? "Possession" : "Possession"]].map(([k, l]) => (
          <button key={k} onClick={() => onAdjust(k!)} className="rounded-full bg-ivory-100 px-3 py-1.5 font-medium text-ink-900 hover:bg-ivory-200">{l} <span className="text-stone-400">· edit</span></button>
        ))}
      </div>
      {[["Strong matches", strong], ["Partial matches — worth a look", partial]].map(([title, list]) => (list as Match[]).length > 0 && (
      <section key={title as string} className="mt-8">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-500">{title as string}</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(list as Match[]).map((m, i) => (
          <motion.article key={m.propertyId} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn("overflow-hidden rounded-[28px] border bg-white shadow-soft", m.eligible ? "border-ink-900/[0.07]" : "border-clay-600/20 opacity-80")}>
            <div className="flex gap-4 p-4">
              <PropertyImage src={m.image} alt={m.name} seed={m.slug} className="size-28 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="eyebrow truncate text-stone-500">{m.developer} · {m.location}</p><Link href={`/properties/${m.slug}`} className="mt-1 block truncate font-serif text-2xl text-ink-900 hover:underline">{m.name}</Link></div>
                  <ScoreRing score={m.score} eligible={m.eligible} />
                </div>
                <p className="num text-[14px] font-semibold text-ink-900">{m.dealType === "RENT" ? `${formatPriceRange(m.rentMin, m.rentMax)} / mo` : formatPriceRange(m.priceMin, m.priceMax)} <span className="text-[11.5px] font-normal text-stone-500">indicative{m.grossYield ? ` · est. gross yield ${m.grossYield}%` : ""}</span></p>
              </div>
            </div>
            <ul className="space-y-1.5 border-t border-ink-900/5 px-5 py-4 text-[13px]">
              {m.factors.map((f) => (
                <li key={f.key} className="flex items-start gap-2">
                  <span className={cn("mt-1 size-2 shrink-0 rounded-full", f.status === "match" ? "bg-sage-600" : f.status === "partial" ? "bg-amber-600" : f.status === "unknown" ? "bg-stone-400" : "bg-clay-600")} />
                  <span><span className="font-medium text-ink-900">{f.label}:</span> <span className="text-stone-600">{f.detail}</span></span>
                </li>
              ))}
              {!m.eligible && <li className="pt-1 text-[12px] font-medium text-clay-600">Fails one of your non-negotiables.</li>}
            </ul>
          </motion.article>
        ))}
      </div>
      </section>
      ))}
      {!strong.length && !partial.length && <div className="mt-8 rounded-3xl border border-dashed border-ink-900/15 p-10 text-center"><p className="font-serif text-3xl text-ink-900">Nothing listed fits yet.</p><p className="mt-2 text-stone-500">Save your requirement — we&apos;ll call you when a suitable project or group appears.</p></div>}
      <p className="mt-6 flex items-start gap-2 text-[12px] text-stone-500"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> A match is a starting point, not a guarantee of suitability. Prices are indicative. Nothing you entered has been saved yet.</p>
    </div>
  );
}

function ContactStep({ payload, done, onDone, onBack }: { r: R; payload: () => unknown; done: boolean; onDone: () => void; onBack: () => void }) {
  const [f, setF] = useState({ fullName: "", phone: "", email: "", consentContact: false, consentShare: false, consentUpdates: false, consentWhatsApp: false });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<string | null>(null);
  if (done)
    return (
      <div className="mx-auto max-w-xl text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.4 }} className="mx-auto grid size-20 place-items-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 shadow-glow"><Check className="size-10 text-ink-950" /></motion.div>
        <h2 className="display mt-8 text-5xl text-ink-900">Requirement saved.</h2>
        <p className="mt-4 text-[15px] text-stone-600">Our team will call you to refine it. When a compatible buying group forms, we&apos;ll let you know. You can update your preferences any time from your account.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/properties" className="rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-white">Explore properties</Link><Link href="/account" className="rounded-full border border-ink-900/15 px-6 py-3 text-sm font-medium">My account</Link></div>
      </div>
    );
  async function submit() {
    const e: Record<string, string> = {};
    if (f.fullName.trim().length < 2) e.fullName = "Please enter your full name.";
    if (!/^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, "").replace(/^(91|0)/, ""))) e.phone = "Please enter a valid 10-digit Indian mobile number.";
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Please enter a valid email address.";
    if (!f.consentContact) e.consentContact = "We need your permission to contact you.";
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setServer(null);
    const req = payload() as R;
    const res = await fetch("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, email: f.email || null, source: "Website — match flow", requirement: req, locationIds: [req.primaryLocationId, req.secondaryLocationId, ...req.acceptableLocationIds].filter(Boolean), configurations: req.configurations, budgetMin: req.budgetMin, budgetMax: req.budgetMax }) }).catch(() => null);
    const d = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fieldErrors?: Record<string, string> }) : { error: "Network error — your answers are kept." };
    setBusy(false);
    if (res?.ok && d.ok) onDone();
    else {
      setServer(d.error ?? "Something went wrong.");
      if (d.fieldErrors) setErr(d.fieldErrors);
    }
  }
  return (
    <div className="mx-auto max-w-xl">
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-stone-500"><ArrowLeft className="size-4" /> Back to matches</button>
      <StepTitle eyebrow="Last step" title="Save your requirement" hint="We'll call you to refine it and keep you posted on suitable buying groups." />
      <div className="space-y-4">
        <label className="block text-[13px] font-medium text-stone-700">Full name<input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoComplete="name" className={cn(fieldClass, "mt-1.5")} aria-invalid={!!err.fullName} />{err.fullName && <span role="alert" className="mt-1 block text-[12.5px] text-clay-600">{err.fullName}</span>}</label>
        <label className="block text-[13px] font-medium text-stone-700">Mobile number<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" autoComplete="tel-national" placeholder="98200 12345" className={cn(fieldClass, "mt-1.5")} aria-invalid={!!err.phone} />{err.phone && <span role="alert" className="mt-1 block text-[12.5px] text-clay-600">{err.phone}</span>}</label>
        <label className="block text-[13px] font-medium text-stone-700">Email <span className="font-normal text-stone-400">(optional — to sign in and update preferences)</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" className={cn(fieldClass, "mt-1.5")} aria-invalid={!!err.email} />{err.email && <span role="alert" className="mt-1 block text-[12.5px] text-clay-600">{err.email}</span>}</label>
        {([["consentContact", CONSENT_TEXT.CONTACT_ABOUT_INQUIRY, true], ["consentShare", CONSENT_TEXT.SHARE_WITH_DEVELOPER, false], ["consentUpdates", CONSENT_TEXT.MARKETING_UPDATES, false], ["consentWhatsApp", CONSENT_TEXT.WHATSAPP_MESSAGES, false]] as const).map(([k, t, req]) => (
          <label key={k} className={cn("flex cursor-pointer gap-3 rounded-2xl border bg-white p-4 text-[13px] leading-relaxed text-stone-700", f[k] ? "border-ink-900" : "border-ink-900/10")}><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="mt-0.5 size-4 shrink-0 accent-ink-900" /><span>{t}{req && <span className="text-gold-700"> (required)</span>}</span></label>
        ))}
        {err.consentContact && <p role="alert" className="text-[12.5px] text-clay-600">{err.consentContact}</p>}
      </div>
      {server && <p role="alert" className="mt-4 rounded-2xl bg-clay-50 px-4 py-3 text-[13px] text-clay-600">{server}</p>}
      <button onClick={submit} disabled={busy} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 text-[15px] font-semibold text-ink-950 shadow-glow disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save my requirement</button>
      <p className="mt-3 text-center text-[12px] text-stone-500">Read our <Link href="/legal/privacy" className="underline">privacy notice</Link>. Your details are never shown to other buyers.</p>
    </div>
  );
}
