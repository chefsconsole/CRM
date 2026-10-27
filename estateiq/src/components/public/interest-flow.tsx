"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Loader2, PhoneCall, ShieldCheck, X, Building2, Clock, Hourglass } from "lucide-react";
import { OptionTile, StepProgress, StepTitle, fieldClass, stepVariants } from "./steps";
import { formatBhk, formatINR } from "@/lib/format";
import { COMMIT_OPTIONS, POSSESSION_OPTIONS, BOOKING_OPTIONS } from "@/lib/domain/timelines";
import { CONSENT_TEXT } from "@/lib/validation";
import { cn } from "@/lib/cn";

export interface InterestProject {
  id: string;
  name: string;
  segment: "RESIDENTIAL" | "COMMERCIAL";
  dealType: "SALE" | "RENT" | "PRE_LEASED";
  locationId: string;
  bhks: number[];
  priceMin: number | null;
  priceMax: number | null;
  groupName?: string | null;
}

type State = {
  configs: number[];
  budgetMin: number | null;
  budgetMax: number | null;
  commit: number | null;
  booking: number | null;
  wait: number | null;
  requirements: string;
  fullName: string;
  phone: string;
  email: string;
  consentContact: boolean;
  consentShare: boolean;
  consentUpdates: boolean;
  consentWhatsApp: boolean;
};

const EMPTY: State = { configs: [], budgetMin: null, budgetMax: null, commit: null, booking: null, wait: null, requirements: "", fullName: "", phone: "", email: "", consentContact: false, consentShare: false, consentUpdates: false, consentWhatsApp: false };

function budgetBands(min: number | null, max: number | null) {
  const lo = min ?? 5e6;
  const hi = max ?? lo * 1.6;
  const steps = [0.85, 1, 1.15, 1.35].map((f) => Math.round((lo * f) / 1e6) * 1e6);
  const out: { label: string; min: number | null; max: number | null }[] = [];
  out.push({ label: `Up to ${formatINR(steps[1]!)}`, min: null, max: steps[1]! });
  out.push({ label: `${formatINR(steps[1]!)} – ${formatINR(steps[3]!)}`, min: steps[1]!, max: steps[3]! });
  out.push({ label: `${formatINR(steps[3]!)} – ${formatINR(Math.max(hi, steps[3]! * 1.3))}`, min: steps[3]!, max: Math.round(Math.max(hi, steps[3]! * 1.3) / 1e6) * 1e6 });
  out.push({ label: `Above ${formatINR(Math.round(Math.max(hi, steps[3]! * 1.3) / 1e6) * 1e6)}`, min: Math.round(Math.max(hi, steps[3]! * 1.3) / 1e6) * 1e6, max: null });
  return out;
}

export function InterestFlow({ project, open, onClose }: { project: InterestProject; open: boolean; onClose: () => void }) {
  const hasConfigs = project.segment === "RESIDENTIAL" && project.bhks.length > 0;
  const steps = useMemo(() => [...(hasConfigs ? ["config"] : []), "budget", "timeline", "needs", "contact", "consent"] as const, [hasConfigs]);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [s, setS] = useState<State>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ token: string; campaign: string | null } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const draftKey = `ek-draft-${project.id}`;

  // Restore / autosave non-contact answers for this browser session only.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) setS((x) => ({ ...x, ...JSON.parse(raw) }));
    } catch {}
  }, [draftKey]);
  useEffect(() => {
    try {
      const { fullName: _a, phone: _b, email: _c, ...rest } = s;
      sessionStorage.setItem(draftKey, JSON.stringify(rest));
    } catch {}
  }, [s, draftKey]);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", on);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", on);
    };
  }, [open, onClose]);

  const step = steps[i]!;
  const set = (p: Partial<State>) => setS((x) => ({ ...x, ...p }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === "config" && !s.configs.length) e.configs = "Choose at least one configuration.";
    if (step === "contact") {
      if (s.fullName.trim().length < 2) e.fullName = "Please enter your full name.";
      const digits = s.phone.replace(/\D/g, "").replace(/^(91|0)/, "");
      if (!/^[6-9]\d{9}$/.test(digits)) e.phone = "Please enter a valid 10-digit Indian mobile number.";
      if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) e.email = "Please enter a valid email address.";
    }
    if (step === "consent" && !s.consentContact) e.consentContact = "We need your permission to contact you about this inquiry.";
    setErrors(e);
    return !Object.keys(e).length;
  }
  const go = (d: number) => {
    if (d > 0 && !validate()) return;
    setDir(d);
    setI((x) => Math.min(steps.length - 1, Math.max(0, x + d)));
  };

  async function submit() {
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          configurations: s.configs,
          budgetMin: s.budgetMin,
          budgetMax: s.budgetMax,
          timeline: s.commit === null ? "EXPLORING" : s.commit <= 90 ? "IMMEDIATE" : s.commit <= 180 ? "WITHIN_6_MONTHS" : s.commit <= 365 ? "WITHIN_12_MONTHS" : s.commit < 9999 ? "BEYOND_12_MONTHS" : "EXPLORING",
          requirements: s.requirements || null,
          fullName: s.fullName,
          phone: s.phone,
          email: s.email || null,
          consentContact: s.consentContact,
          consentShare: s.consentShare,
          consentUpdates: s.consentUpdates,
          consentWhatsApp: s.consentWhatsApp,
          source: "Website — project page",
          website: (document.getElementById("ek-hp") as HTMLInputElement | null)?.value ?? "",
          requirement: {
            intents: project.dealType === "RENT" ? [project.segment === "COMMERCIAL" ? "RENT_COMMERCIAL" : "RENT_RESIDENTIAL"] : project.dealType === "PRE_LEASED" ? ["PRE_LEASED"] : project.segment === "COMMERCIAL" ? ["COM_OFFICE"] : ["RES_SELF_USE"],
            primaryLocationId: project.locationId,
            configurations: s.configs,
            budgetMin: s.budgetMin,
            budgetMax: s.budgetMax,
            commitWithinDays: s.commit,
            bookingWithinDays: s.booking,
            possessionWaitMonths: s.wait,
            situation: s.commit !== null && s.commit <= 30 ? "READY_TO_PURCHASE" : s.commit !== null && s.commit <= 90 ? "COMPARING_SHORTLIST" : "EXPLORING",
            essentials: s.requirements || null,
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; followToken?: string; campaign?: string | null };
      if (!res.ok || !data.ok) {
        setServerError(data.error ?? "Something went wrong.");
        if (data.fieldErrors) setErrors(data.fieldErrors);
        return;
      }
      try { sessionStorage.removeItem(draftKey); } catch {}
      setDone({ token: data.followToken ?? "", campaign: data.campaign ?? null });
    } catch {
      setServerError("Network error — your answers are kept. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const bands = budgetBands(project.priceMin, project.priceMax);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/50 backdrop-blur-sm md:items-center md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Register interest in ${project.name}`}
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.12, duration: 0.6 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[94svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[32px] bg-ivory-50 shadow-lift md:rounded-[32px]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-ink-900/5 px-6 py-4 md:px-8">
              <div className="min-w-0"><p className="eyebrow text-stone-500">Register interest</p><p className="truncate font-serif text-xl text-ink-900">{project.name}</p></div>
              <button onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow-soft"><X className="size-5" /></button>
            </div>
            {done ? (
              <Confirmation project={project} token={done.token} campaign={done.campaign} onClose={onClose} />
            ) : (
              <>
                <div className="px-6 pt-5 md:px-8"><StepProgress step={i} total={steps.length} /></div>
                <div className="relative flex-1 overflow-y-auto px-6 py-6 md:px-8">
                  <input id="ek-hp" name="website" tabIndex={-1} autoComplete="off" className="absolute left-[-9999px]" aria-hidden />
                  <AnimatePresence mode="wait" custom={dir}>
                    <motion.div key={step} custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                      {step === "config" && (
                        <>
                          <StepTitle title="Which home suits you?" hint="Choose one or more." />
                          <div className="grid gap-3 sm:grid-cols-2" role="group">
                            {project.bhks.map((b) => <OptionTile key={b} multi icon={<Building2 className="size-5" />} selected={s.configs.includes(b)} onClick={() => set({ configs: s.configs.includes(b) ? s.configs.filter((x) => x !== b) : [...s.configs, b] })} title={formatBhk(b)} />)}
                          </div>
                          {errors.configs && <p role="alert" className="mt-3 text-[13px] text-clay-600">{errors.configs}</p>}
                        </>
                      )}
                      {step === "budget" && (
                        <>
                          <StepTitle title="What's your budget?" hint={project.priceMin ? `Indicative prices here start around ${formatINR(project.priceMin)} — not an offer.` : "Share a range — it stays private."} />
                          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                            {bands.map((b) => <OptionTile key={b.label} selected={s.budgetMin === b.min && s.budgetMax === b.max} onClick={() => set({ budgetMin: b.min, budgetMax: b.max })} title={b.label} />)}
                            <OptionTile selected={s.budgetMin === null && s.budgetMax === null} onClick={() => set({ budgetMin: null, budgetMax: null })} title="Prefer not to say" />
                          </div>
                          <p className="mt-4 text-[12.5px] text-stone-500">Your budget is never shown to other buyers or published.</p>
                        </>
                      )}
                      {step === "timeline" && (
                        <>
                          <StepTitle title="If the terms are right, how soon could you commit?" hint="This is separate from when you need possession." />
                          <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup">
                            {COMMIT_OPTIONS.map((o) => <OptionTile key={o.days} icon={<Clock className="size-4" />} selected={s.commit === o.days} onClick={() => set({ commit: o.days })} title={o.label} />)}
                          </div>
                          <p className="mb-3 mt-6 text-[14px] font-medium text-ink-900">How soon could you make a booking payment if you decide to proceed?</p>
                          <div className="flex flex-wrap gap-2">
                            {BOOKING_OPTIONS.map((o) => <button key={o.days} type="button" onClick={() => set({ booking: o.days })} aria-pressed={s.booking === o.days} className={cn("rounded-full border px-3.5 py-2 text-[13px] transition", s.booking === o.days ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/12 bg-white text-stone-700 hover:border-ink-900/30")}>{o.label}</button>)}
                          </div>
                          <p className="mt-4 text-[12.5px] text-stone-500">Optional, and never a commitment.</p>
                        </>
                      )}
                      {step === "needs" && (
                        <>
                          <StepTitle title="How long can you wait for possession?" />
                          <div className="flex flex-wrap gap-2">
                            {POSSESSION_OPTIONS.map((o) => <button key={o.months} type="button" onClick={() => set({ wait: o.months })} aria-pressed={s.wait === o.months} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] transition", s.wait === o.months ? "border-ink-900 bg-ink-900 text-white" : "border-ink-900/12 bg-white text-stone-700 hover:border-ink-900/30")}><Hourglass className="size-3.5" />{o.label}</button>)}
                          </div>
                          <label htmlFor="req" className="mb-2 mt-7 block text-[14px] font-medium text-ink-900">Preferred floor, view or anything essential?</label>
                          <textarea id="req" value={s.requirements} onChange={(e) => set({ requirements: e.target.value.slice(0, 600) })} rows={4} className={fieldClass} placeholder="e.g. High floor, park-facing, two car parks" />
                        </>
                      )}
                      {step === "contact" && (
                        <>
                          <StepTitle title="How can we reach you?" hint="Only our team sees these details." />
                          <div className="space-y-4">
                            <div><label htmlFor="fn" className="mb-1.5 block text-[13px] font-medium text-stone-700">Full name</label><input id="fn" value={s.fullName} onChange={(e) => set({ fullName: e.target.value })} autoComplete="name" className={fieldClass} aria-invalid={!!errors.fullName} />{errors.fullName && <p role="alert" className="mt-1.5 text-[12.5px] text-clay-600">{errors.fullName}</p>}</div>
                            <div><label htmlFor="ph" className="mb-1.5 block text-[13px] font-medium text-stone-700">Mobile number</label><div className="flex"><span className="grid place-items-center rounded-l-2xl border border-r-0 border-ink-900/12 bg-ivory-100 px-4 text-[15px] text-stone-600">+91</span><input id="ph" value={s.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" autoComplete="tel-national" placeholder="98200 12345" className={cn(fieldClass, "rounded-l-none")} aria-invalid={!!errors.phone} /></div>{errors.phone && <p role="alert" className="mt-1.5 text-[12.5px] text-clay-600">{errors.phone}</p>}</div>
                            <div><label htmlFor="em" className="mb-1.5 block text-[13px] font-medium text-stone-700">Email <span className="font-normal text-stone-400">(optional — lets you sign in later)</span></label><input id="em" type="email" value={s.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" className={fieldClass} aria-invalid={!!errors.email} />{errors.email && <p role="alert" className="mt-1.5 text-[12.5px] text-clay-600">{errors.email}</p>}</div>
                          </div>
                        </>
                      )}
                      {step === "consent" && (
                        <>
                          <StepTitle title="A few permissions" hint="Registering is free and does not commit you to buy." />
                          <div className="space-y-3">
                            {([["consentContact", CONSENT_TEXT.CONTACT_ABOUT_INQUIRY, true], ["consentShare", CONSENT_TEXT.SHARE_WITH_DEVELOPER, false], ["consentUpdates", CONSENT_TEXT.MARKETING_UPDATES, false], ["consentWhatsApp", CONSENT_TEXT.WHATSAPP_MESSAGES, false]] as const).map(([k, text, req]) => (
                              <label key={k} className={cn("flex cursor-pointer gap-3 rounded-2xl border bg-white p-4 text-[13.5px] leading-relaxed text-stone-700 transition", s[k] ? "border-ink-900" : "border-ink-900/10")}>
                                <input type="checkbox" checked={s[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<State>)} className="mt-1 size-4 shrink-0 accent-ink-900" />
                                <span>{text}{req && <span className="text-gold-700"> (required)</span>}</span>
                              </label>
                            ))}
                          </div>
                          {errors.consentContact && <p role="alert" className="mt-3 text-[13px] text-clay-600">{errors.consentContact}</p>}
                          <p className="mt-4 flex items-start gap-2 text-[12px] text-stone-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-sage-600" /> Joining a buying group does not guarantee a discount, allocation or transaction. See our <a href="/legal/privacy" target="_blank" className="underline">privacy notice</a>.</p>
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  {serverError && <p role="alert" className="mt-5 rounded-2xl bg-clay-50 px-4 py-3 text-[13px] text-clay-600">{serverError}</p>}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-ink-900/5 bg-white/70 px-6 py-4 backdrop-blur md:px-8">
                  <button type="button" onClick={() => go(-1)} disabled={i === 0} className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-[14px] font-medium text-stone-600 disabled:opacity-0"><ArrowLeft className="size-4" /> Back</button>
                  {i < steps.length - 1 ? (
                    <button type="button" onClick={() => go(1)} className="inline-flex h-12 items-center gap-2 rounded-full bg-ink-900 px-7 text-[15px] font-medium text-white transition hover:bg-ink-800">Continue <ArrowRight className="size-4" /></button>
                  ) : (
                    <button type="button" onClick={submit} disabled={submitting} className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-7 text-[15px] font-semibold text-ink-950 disabled:opacity-60">{submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Register my interest</button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Confirmation({ project, token, campaign, onClose }: { project: InterestProject; token: string; campaign: string | null; onClose: () => void }) {
  const [kind, setKind] = useState<"SITE_VISIT" | "CALLBACK" | null>(null);
  const [date, setDate] = useState(() => new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10));
  const [win, setWin] = useState("Morning (10 am – 1 pm)");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function book() {
    setState("sending");
    const r = await fetch("/api/visit-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, projectId: project.id, preferredDate: date, preferredWindow: win, kind }) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as { error?: string }) : { error: "Network error" };
    if (r?.ok) setState("sent");
    else {
      setState("error");
      setMsg(d.error ?? "Could not send.");
    }
  }
  return (
    <div className="overflow-y-auto px-6 py-8 md:px-10 md:py-10">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.4 }} className="grid size-16 place-items-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-glow"><Check className="size-8" /></motion.div>
      <h2 className="mt-6 font-serif text-4xl text-ink-900">You&apos;re registered.</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-stone-600">Thank you. Your interest in <strong className="text-ink-900">{project.name}</strong> is recorded{campaign ? <> and you&apos;ve joined the <strong className="text-ink-900">{campaign}</strong></> : null}. A member of our team will call you to understand your requirement.</p>
      <ul className="mt-6 space-y-2 text-[13.5px] text-stone-600">
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-sage-600" /> Your details are private and never shown to other buyers.</li>
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-sage-600" /> Registering does not commit you to buy.</li>
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-sage-600" /> Any benefit is shared only once the developer confirms it.</li>
      </ul>
      <div className="mt-8 rounded-3xl border border-ink-900/[0.07] bg-white p-5">
        {state === "sent" ? (
          <p className="flex items-center gap-2 text-[14px] font-medium text-sage-600"><CalendarCheck className="size-5" /> Request received — we&apos;ll confirm the time with you.</p>
        ) : (
          <>
            <p className="text-[14px] font-medium text-ink-900">Would you like a callback or a site visit?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <OptionTile selected={kind === "CALLBACK"} onClick={() => setKind("CALLBACK")} icon={<PhoneCall className="size-4" />} title="Request a callback" />
              <OptionTile selected={kind === "SITE_VISIT"} onClick={() => setKind("SITE_VISIT")} icon={<CalendarCheck className="size-4" />} title="Book a site visit" />
            </div>
            {kind && (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-[12.5px] text-stone-600">Preferred date<input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={cn(fieldClass, "mt-1 py-2.5")} /></label>
                <label className="text-[12.5px] text-stone-600">Time<select value={win} onChange={(e) => setWin(e.target.value)} className={cn(fieldClass, "mt-1 py-2.5")}>{["Morning (10 am – 1 pm)", "Afternoon (1 – 4 pm)", "Evening (4 – 7 pm)"].map((w) => <option key={w}>{w}</option>)}</select></label>
                <button onClick={book} disabled={state === "sending"} className="h-12 rounded-full bg-ink-900 px-5 text-sm font-medium text-white disabled:opacity-60">{state === "sending" ? "Sending…" : "Request"}</button>
              </div>
            )}
            {state === "error" && <p className="mt-3 text-[13px] text-clay-600">{msg}</p>}
          </>
        )}
      </div>
      <button onClick={onClose} className="mt-6 text-[14px] font-medium text-stone-600 underline-offset-4 hover:underline">Back to the project</button>
    </div>
  );
}
