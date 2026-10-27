// Structured requirement fields — shared by "new buyer" and the profile editor. Plain form controls (server-rendered).
import type { BuyerRequirement } from "@prisma/client";
import { toISTDateInput } from "@/lib/time";
import { Field, Input, Select, Textarea } from "../ui/field";
import { INTENT, SITUATION, FUNDING_STATUS, LOAN, PROPERTY_TYPE } from "@/lib/labels";
import { BOOKING_OPTIONS, COMMIT_OPTIONS, POSSESSION_OPTIONS } from "@/lib/domain/timelines";

const BHK = [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5];
const STAGES = [["ANNOUNCED", "Announced"], ["PRE_LAUNCH", "Pre-launch"], ["NEW_LAUNCH", "New launch"], ["UNDER_CONSTRUCTION", "Under construction"], ["READY_TO_MOVE", "Ready to move"]];
const MUST = [["location", "Location"], ["budget", "Budget"], ["configuration", "Configuration"], ["carpet", "Carpet area"], ["possession", "Possession"], ["parking", "Parking"]];

function Checks({ name, options, selected }: { name: string; options: [string, string][]; selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <label key={v} className="cursor-pointer">
          <input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)} className="peer sr-only" />
          <span className="inline-block rounded-full border border-ink-900/12 px-3 py-1.5 text-[12.5px] text-stone-600 transition peer-checked:border-ink-900 peer-checked:bg-ink-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold-400">{l}</span>
        </label>
      ))}
    </div>
  );
}

export function RequirementFields({ r, locations }: { r?: Partial<BuyerRequirement> | null; locations: { id: string; name: string }[] }) {
  const locOpts = (
    <>
      <option value="">—</option>
      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </>
  );
  return (
    <div className="space-y-6">
      <Field label="Looking for">
        <Checks name="intents" options={Object.entries(INTENT).map(([k, v]) => [k, v.short])} selected={r?.intents ?? ["RES_SELF_USE"]} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred location"><Select name="primaryLocationId" defaultValue={r?.primaryLocationId ?? ""}>{locOpts}</Select></Field>
        <Field label="Second preference"><Select name="secondaryLocationId" defaultValue={r?.secondaryLocationId ?? ""}>{locOpts}</Select></Field>
      </div>
      <Field label="Other acceptable locations" hint="Only areas the buyer explicitly accepts — never inferred from proximity.">
        <Checks name="acceptableLocationIds" options={locations.map((l) => [l.id, l.name])} selected={r?.acceptableLocationIds ?? []} />
      </Field>
      <Field label="Configuration"><Checks name="configurations" options={BHK.map((b) => [String(b), b === 0 ? "Studio" : b === 5 ? "5+ BHK" : `${b} BHK`])} selected={(r?.configurations ?? []).map(String)} /></Field>
      <Field label="Property formats (optional)"><Checks name="propertyTypes" options={Object.entries(PROPERTY_TYPE) as [string, string][]} selected={r?.propertyTypes ?? []} /></Field>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Budget min (₹)"><Input name="budgetMin" inputMode="numeric" defaultValue={r?.budgetMin ?? ""} placeholder="15000000" /></Field>
        <Field label="Budget max (₹)"><Input name="budgetMax" inputMode="numeric" defaultValue={r?.budgetMax ?? ""} /></Field>
        <Field label="Ideal (₹)"><Input name="budgetIdeal" inputMode="numeric" defaultValue={r?.budgetIdeal ?? ""} /></Field>
        <Field label="Stretch (₹)"><Input name="budgetStretch" inputMode="numeric" defaultValue={r?.budgetStretch ?? ""} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Rent min (₹/mo)"><Input name="rentMin" inputMode="numeric" defaultValue={r?.rentMin ?? ""} /></Field>
        <Field label="Rent max (₹/mo)"><Input name="rentMax" inputMode="numeric" defaultValue={r?.rentMax ?? ""} /></Field>
        <Field label="Move-in by"><Input name="moveInBy" type="date" defaultValue={toISTDateInput(r?.moveInBy)} /></Field>
        <Field label="Down payment (₹)"><Input name="downPayment" inputMode="numeric" defaultValue={r?.downPayment ?? ""} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Could commit within" hint="If the right property and terms are found"><Select name="commitWithinDays" defaultValue={r?.commitWithinDays ?? ""}><option value="">Not shared</option>{COMMIT_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}</Select></Field>
        <Field label="Booking payment within"><Select name="bookingWithinDays" defaultValue={r?.bookingWithinDays ?? ""}><option value="">Not shared</option>{BOOKING_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}</Select></Field>
        <Field label="Possession — can wait"><Select name="possessionWaitMonths" defaultValue={r?.possessionWaitMonths ?? ""}><option value="">Not shared</option>{POSSESSION_OPTIONS.map((o) => <option key={o.months} value={o.months}>{o.label}</option>)}</Select></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Situation"><Select name="situation" defaultValue={r?.situation ?? "EXPLORING"}>{Object.entries(SITUATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Home loan"><Select name="loanRequired" defaultValue={r?.loanRequired ?? "UNDECIDED"}>{Object.entries(LOAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Funding status" hint="As stated — not proof of capacity"><Select name="fundingStatus" defaultValue={r?.fundingStatus ?? "NOT_ASSESSED"}>{Object.entries(FUNDING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
      <Field label="Preferred project stage"><Checks name="stagePreferences" options={STAGES as [string, string][]} selected={r?.stagePreferences ?? []} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Min carpet (sq ft)"><Input name="carpetMin" inputMode="numeric" defaultValue={r?.carpetMin ?? ""} /></Field>
        <Field label="Parking needed"><Input name="parkingNeeded" inputMode="numeric" defaultValue={r?.parkingNeeded ?? ""} /></Field>
        <Field label="Min gross yield % (investors)"><Input name="minGrossYieldPct" inputMode="decimal" defaultValue={r?.minGrossYieldPct ?? ""} /></Field>
      </div>
      <Field label="Non-negotiables" hint="A property failing one of these is never shown as a strong match."><Checks name="mustHaves" options={MUST as [string, string][]} selected={r?.mustHaves ?? []} /></Field>
      <Field label="Other essential requirements"><Textarea name="essentials" defaultValue={r?.essentials ?? ""} placeholder="East-facing, high floor, near a school…" /></Field>
    </div>
  );
}
