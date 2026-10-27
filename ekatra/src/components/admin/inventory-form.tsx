import type { InventoryUnit } from "@prisma/client";
import { toISTDateInput } from "@/lib/time";
import { Field, Input, Select, Textarea } from "../ui/field";
import { AVAILABILITY, CONFIDENTIALITY } from "@/lib/labels";

const d = toISTDateInput;

export function InventoryFields({ u, projects, markets, showContacts = true }: { u?: InventoryUnit | null; projects: { id: string; name: string }[]; markets: string[]; showContacts?: boolean }) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-4 font-serif text-xl text-ink-900">Unit</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Private reference" required hint="Your own code, e.g. EIQ-BW-001"><Input name="reference" defaultValue={u?.reference ?? ""} required /></Field>
          <Field label="Project name" required className="sm:col-span-2"><Input name="projectName" defaultValue={u?.projectName ?? ""} required /></Field>
          <Field label="Link to project record"><Select name="projectId" defaultValue={u?.projectId ?? ""}><option value="">Not linked</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Developer"><Input name="developerName" defaultValue={u?.developerName ?? ""} /></Field>
          <Field label="Locality" required><Input name="microMarket" list="markets" defaultValue={u?.microMarket ?? ""} required /><datalist id="markets">{markets.map((m) => <option key={m} value={m} />)}</datalist></Field>
          <Field label="Unit number"><Input name="unitNumber" defaultValue={u?.unitNumber ?? ""} /></Field>
          <Field label="Configuration" required><Input name="configuration" defaultValue={u?.configuration ?? ""} placeholder="2 BHK" required /></Field>
          <Field label="BHK (number)"><Input name="bhk" inputMode="decimal" defaultValue={u?.bhk ?? ""} /></Field>
          <Field label="Carpet area (sq ft)"><Input name="carpetArea" inputMode="numeric" defaultValue={u?.carpetArea ?? ""} /></Field>
          <Field label="Floor"><Input name="floor" defaultValue={u?.floor ?? ""} /></Field>
          <Field label="Facing"><Input name="facing" defaultValue={u?.facing ?? ""} /></Field>
          <Field label="Parking"><Input name="parking" defaultValue={u?.parking ?? ""} /></Field>
          <Field label="Furnishing"><Input name="furnishing" defaultValue={u?.furnishing ?? ""} /></Field>
          <Field label="Possession details" className="sm:col-span-2"><Input name="possessionDetails" defaultValue={u?.possessionDetails ?? ""} /></Field>
        </div>
      </section>
      <section>
        <h3 className="mb-1 font-serif text-xl text-ink-900">Price & comparison</h3>
        <p className="mb-4 text-[12.5px] text-stone-500">A difference is only calculated when the developer quote is current (under 90 days), dated, sourced and like-for-like (same configuration, carpet within 5%) — and only presented as a saving after a manager reviews the evidence.</p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Asking price (₹)" required><Input name="askingPrice" inputMode="numeric" defaultValue={u?.askingPrice ?? ""} required /></Field>
          <Field label="Asking includes"><Input name="askingIncludes" defaultValue={u?.askingIncludes ?? ""} placeholder="1 car park, GST" /></Field>
          <Field label="Asking excludes"><Input name="askingExcludes" defaultValue={u?.askingExcludes ?? ""} placeholder="Stamp duty, registration" /></Field>
          <Field label="Est. extra costs on ours (₹)" hint="Leave empty if unknown"><Input name="askingExtraCosts" inputMode="numeric" defaultValue={u?.askingExtraCosts ?? ""} /></Field>
          <Field label="Builder quote (₹)"><Input name="builderQuote" inputMode="numeric" defaultValue={u?.builderQuote ?? ""} /></Field>
          <Field label="Quote date"><Input type="date" name="builderQuoteDate" defaultValue={d(u?.builderQuoteDate)} /></Field>
          <Field label="Quote source" className="sm:col-span-2"><Input name="builderQuoteSource" defaultValue={u?.builderQuoteSource ?? ""} placeholder="Developer sales office cost sheet, 12 Oct 2026" /></Field>
          <Field label="Quote evidence" className="sm:col-span-2" hint="URL of the cost sheet, or upload it under Photos & documents"><Input name="builderQuoteEvidence" defaultValue={u?.builderQuoteEvidence ?? ""} placeholder="https://… or doc:… (set automatically on upload)" /></Field>
          <Field label="Quote configuration"><Input name="builderQuoteConfig" defaultValue={u?.builderQuoteConfig ?? ""} /></Field>
          <Field label="Quote carpet (sq ft)"><Input name="builderQuoteCarpet" inputMode="numeric" defaultValue={u?.builderQuoteCarpet ?? ""} /></Field>
          <Field label="Quote floor"><Input name="builderQuoteFloor" defaultValue={u?.builderQuoteFloor ?? ""} /></Field>
          <Field label="Est. extra costs on quote (₹)" hint="Floor rise, PLC, dev charges…"><Input name="builderExtraCosts" inputMode="numeric" defaultValue={u?.builderExtraCosts ?? ""} /></Field>
          <Field label="Quote includes" className="sm:col-span-2"><Input name="builderQuoteIncludes" defaultValue={u?.builderQuoteIncludes ?? ""} /></Field>
          <Field label="Quote excludes" className="sm:col-span-2"><Input name="builderQuoteExcludes" defaultValue={u?.builderQuoteExcludes ?? ""} /></Field>
        </div>
      </section>
      <section>
        <h3 className="mb-4 font-serif text-xl text-ink-900">Availability, source & terms</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Availability"><Select name="availability" defaultValue={u?.availability ?? "UNCONFIRMED"}>{Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          <Field label="Last verified"><Input type="date" name="lastVerifiedAt" defaultValue={d(u?.lastVerifiedAt)} /></Field>
          <Field label="Next follow-up"><Input type="date" name="nextFollowUpAt" defaultValue={d(u?.nextFollowUpAt)} /></Field>
          <Field label="Confidentiality"><Select name="confidentiality" defaultValue={u?.confidentiality ?? "INTERNAL"}>{Object.entries(CONFIDENTIALITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          {showContacts && (
            <>
              <Field label="Owner / authorised source"><Input name="ownerSource" defaultValue={u?.ownerSource ?? ""} /></Field>
              <Field label="Contact person"><Input name="contactName" defaultValue={u?.contactName ?? ""} /></Field>
              <Field label="Contact phone"><Input name="contactPhone" defaultValue={u?.contactPhone ?? ""} /></Field>
              <Field label="Contact email"><Input name="contactEmail" defaultValue={u?.contactEmail ?? ""} /></Field>
              <Field label="Commission / commercial terms" className="sm:col-span-4"><Textarea name="commercialTerms" defaultValue={u?.commercialTerms ?? ""} /></Field>
            </>
          )}
          <Field label="Notes" className="sm:col-span-4"><Textarea name="notes" defaultValue={u?.notes ?? ""} /></Field>
        </div>
      </section>
    </div>
  );
}
