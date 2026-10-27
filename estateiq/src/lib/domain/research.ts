// Evidence rules for project research. A record existing in the database proves nothing: every
// material fact needs a source, statuses need the right kind of evidence, and approval for
// publication is blocked until a person has resolved every gap.

import type { LifecycleStage, SourceType, SourceVerdict } from "@prisma/client";

export interface SourceLike {
  factKey: string;
  sourceType: SourceType;
  verdict: SourceVerdict;
  url: string | null;
  claim: string;
  checkedAt: Date;
}

export interface ResearchProjectLike {
  name: string;
  developerName: string;
  addressLine: string | null;
  officialWebsite: string | null;
  reraNumber: string | null;
  reraUrl: string | null;
  declaredCompletionDate: Date | null;
  possessionDate: Date | null;
  officialPriceText: string | null;
  priceSourceUrl: string | null;
  priceSourceDate: Date | null;
  configurations: { label: string; carpetAreaMin: number | null; priceMin: number | null; priceVerification: string }[];
  lifecycleStages: LifecycleStage[];
  conflictFlag: boolean;
  researchStatus: string;
  outstandingChecks: string[];
  accessLimitations: string | null;
}

export type EvidenceStatus = "OFFICIAL" | "ANNOUNCED" | "SECONDARY" | "CONFLICT" | "UNSOURCED" | "NOT_RECORDED";

export interface EvidenceRow {
  key: string;
  label: string;
  value: string | null;
  status: EvidenceStatus;
  sources: SourceLike[];
  /** What would make this fact acceptable for publication. */
  need: string;
}

/** Fact keys used in the research audit trail. */
export const FACT_KEYS = ["promoter", "location", "official_url", "rera", "configurations", "carpet_area", "completion", "possession", "price", "announcement", "launch", "status", "bookings", "construction", "oc_status", "inventory", "land", "litigation", "other"] as const;

const OFFICIAL_TYPES: SourceType[] = ["OFFICIAL_DEVELOPER", "MAHARERA", "COMPANY_FILING", "GOVERNMENT"];

function grade(sources: SourceLike[]): EvidenceStatus {
  if (!sources.length) return "UNSOURCED";
  if (sources.some((s) => s.verdict === "CONFLICT")) return "CONFLICT";
  if (sources.some((s) => s.verdict === "CONFIRMED_OFFICIAL" && OFFICIAL_TYPES.includes(s.sourceType))) return "OFFICIAL";
  if (sources.some((s) => s.verdict === "DEVELOPER_ANNOUNCED" || (s.verdict === "CONFIRMED_OFFICIAL" && s.sourceType === "INTERNAL"))) return "ANNOUNCED";
  if (sources.some((s) => s.verdict === "SECONDARY_ONLY")) return "SECONDARY";
  return "UNSOURCED";
}

const pick = (sources: SourceLike[], keys: string[]) => sources.filter((s) => keys.includes(s.factKey));
const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Material facts and how well each is supported. */
export function evidenceCoverage(p: ResearchProjectLike, sources: SourceLike[]): EvidenceRow[] {
  const carpet = p.configurations.filter((c) => c.carpetAreaMin);
  const priced = p.configurations.filter((c) => c.priceMin);
  const rows: Omit<EvidenceRow, "status">[] = [
    { key: "promoter", label: "Official name & developer", value: `${p.name} — ${p.developerName}`, sources: pick(sources, ["promoter", "announcement", "rera", "existence"]), need: "The developer's own page, a filing or the MahaRERA record naming the project and promoter" },
    { key: "location", label: "Exact location", value: p.addressLine, sources: pick(sources, ["location", "rera"]), need: "Address from the MahaRERA record or the developer" },
    { key: "official_url", label: "Official developer URL", value: p.officialWebsite, sources: pick(sources, ["official_url", "announcement"]), need: "Confirm the page belongs to the developer" },
    { key: "rera", label: "MahaRERA registration", value: p.reraNumber, sources: pick(sources, ["rera"]), need: "The MahaRERA record itself (source type MahaRERA, confirmed), with its URL" },
    { key: "configurations", label: "Configurations", value: p.configurations.map((c) => c.label).join(", ") || null, sources: pick(sources, ["configurations", "units", "rera"]), need: "MahaRERA unit summary or the developer's brochure" },
    { key: "carpet_area", label: "Carpet areas", value: carpet.length ? `${carpet.length} configuration(s) with carpet area` : null, sources: pick(sources, ["carpet_area", "configurations", "rera"]), need: "RERA carpet areas from MahaRERA or the developer" },
    { key: "completion", label: "Declared completion date", value: fmtDate(p.declaredCompletionDate) ?? fmtDate(p.possessionDate), sources: pick(sources, ["completion"]), need: "The completion date declared on MahaRERA" },
    { key: "price", label: "Price", value: p.officialPriceText ?? (priced.length ? `${priced.length} configuration(s) priced` : null), sources: [...pick(sources, ["price"]), ...(p.priceSourceUrl ? [{ factKey: "price", sourceType: "OFFICIAL_DEVELOPER" as SourceType, verdict: "DEVELOPER_ANNOUNCED" as SourceVerdict, url: p.priceSourceUrl, claim: "Price source recorded on the project", checkedAt: p.priceSourceDate ?? new Date(0) }] : [])], need: "A dated price sheet or official price page" },
  ];
  return rows.map((r) => ({ ...r, status: r.value ? grade(r.sources) : "NOT_RECORDED" }));
}

/** Which evidence each lifecycle status needs. These statuses are not interchangeable. */
export const STAGE_EVIDENCE: Record<LifecycleStage, { factKeys: string[]; types: SourceType[]; verdicts: SourceVerdict[]; need: string } | null> = {
  ANNOUNCED_BY_DEVELOPER: { factKeys: ["announcement", "status"], types: ["OFFICIAL_DEVELOPER", "COMPANY_FILING"], verdicts: ["CONFIRMED_OFFICIAL", "DEVELOPER_ANNOUNCED"], need: "A developer announcement or stock-exchange filing" },
  UPCOMING: { factKeys: ["announcement", "status"], types: ["OFFICIAL_DEVELOPER", "COMPANY_FILING", "NEWS", "INTERNAL"], verdicts: ["CONFIRMED_OFFICIAL", "DEVELOPER_ANNOUNCED", "SECONDARY_ONLY"], need: "Any dated source saying the project is planned" },
  PRE_LAUNCH_MARKETING: { factKeys: ["status", "announcement"], types: ["OFFICIAL_DEVELOPER", "INTERNAL", "PORTAL", "NEWS"], verdicts: ["CONFIRMED_OFFICIAL", "DEVELOPER_ANNOUNCED", "SECONDARY_ONLY"], need: "Evidence of pre-launch / EOI activity" },
  MAHARERA_REGISTERED: { factKeys: ["rera"], types: ["MAHARERA"], verdicts: ["CONFIRMED_OFFICIAL"], need: "The MahaRERA record (checked on maharera.maharashtra.gov.in)" },
  OFFICIAL_LAUNCH: { factKeys: ["launch", "status", "announcement"], types: ["OFFICIAL_DEVELOPER", "COMPANY_FILING"], verdicts: ["CONFIRMED_OFFICIAL"], need: "The developer's launch announcement" },
  BOOKINGS_OPEN: { factKeys: ["bookings", "status"], types: ["OFFICIAL_DEVELOPER", "INTERNAL"], verdicts: ["CONFIRMED_OFFICIAL"], need: "Developer sales team or official page confirming bookings" },
  UNDER_CONSTRUCTION: { factKeys: ["construction", "status"], types: ["MAHARERA", "OFFICIAL_DEVELOPER", "INTERNAL"], verdicts: ["CONFIRMED_OFFICIAL"], need: "MahaRERA progress report, developer update or a dated site visit" },
  COMPLETED_OC_RECEIVED: { factKeys: ["oc_status"], types: ["GOVERNMENT", "MAHARERA", "OFFICIAL_DEVELOPER"], verdicts: ["CONFIRMED_OFFICIAL"], need: "Occupation certificate or MahaRERA completion record" },
  SOLD_OUT: { factKeys: ["inventory", "status"], types: ["OFFICIAL_DEVELOPER", "INTERNAL", "MAHARERA"], verdicts: ["CONFIRMED_OFFICIAL", "DEVELOPER_ANNOUNCED"], need: "Developer confirmation that no inventory remains" },
  INVENTORY_CONFIRMED: { factKeys: ["inventory"], types: ["OFFICIAL_DEVELOPER", "INTERNAL"], verdicts: ["CONFIRMED_OFFICIAL"], need: "Developer sales team confirming available units, with the date" },
  INVENTORY_NOT_CONFIRMED: null,
};

export interface StageCheck {
  stage: LifecycleStage;
  supported: boolean;
  need: string | null;
}

export function stageChecks(stages: LifecycleStage[], sources: SourceLike[]): StageCheck[] {
  return stages.map((stage) => {
    const rule = STAGE_EVIDENCE[stage];
    if (!rule) return { stage, supported: true, need: null };
    const ok = sources.some((s) => rule.factKeys.includes(s.factKey) && rule.types.includes(s.sourceType) && rule.verdicts.includes(s.verdict));
    return { stage, supported: ok, need: ok ? null : rule.need };
  });
}

/** Statuses that cannot be true together ("contradiction") and compliance red flags ("compliance"). */
export function lifecycleProblems(stages: LifecycleStage[]): { kind: "contradiction" | "compliance"; message: string }[] {
  const has = (s: LifecycleStage) => stages.includes(s);
  const out: { kind: "contradiction" | "compliance"; message: string }[] = [];
  const c = (message: string) => out.push({ kind: "contradiction", message });
  if (has("INVENTORY_CONFIRMED") && has("INVENTORY_NOT_CONFIRMED")) c("Inventory can't be both confirmed and not confirmed.");
  if (has("INVENTORY_CONFIRMED") && has("SOLD_OUT")) c("Inventory confirmed and sold out contradict each other.");
  if (has("UPCOMING") && (has("OFFICIAL_LAUNCH") || has("BOOKINGS_OPEN") || has("UNDER_CONSTRUCTION") || has("COMPLETED_OC_RECEIVED"))) c("“Upcoming” means not yet launched — remove it once the project has launched.");
  if (has("COMPLETED_OC_RECEIVED") && has("UNDER_CONSTRUCTION")) c("A project can't be both under construction and completed.");
  if ((has("BOOKINGS_OPEN") || has("OFFICIAL_LAUNCH")) && !has("MAHARERA_REGISTERED")) out.push({ kind: "compliance", message: "Bookings or a launch without a verified MahaRERA registration is a compliance red flag — verify registration first." });
  return out;
}

export const RESEARCH_NOT_VERIFIED = "Research status is not “Verified”.";

/** Everything that must be resolved before a person can approve the project for publication. */
export function approvalBlockers(p: ResearchProjectLike, sources: SourceLike[]): string[] {
  const out: string[] = [];
  if (p.researchStatus !== "VERIFIED") out.push(RESEARCH_NOT_VERIFIED);
  const cov = evidenceCoverage(p, sources);
  for (const r of cov) {
    if (r.status === "UNSOURCED") out.push(`${r.label} is recorded without a source.`);
    if (r.status === "CONFLICT") out.push(`${r.label}: sources conflict.`);
  }
  const rera = cov.find((r) => r.key === "rera")!;
  if (rera.status !== "OFFICIAL") out.push("MahaRERA registration must be confirmed on the official MahaRERA record.");
  if (!p.reraUrl || !/maharera/i.test(p.reraUrl)) out.push("Add the MahaRERA record URL.");
  for (const s of stageChecks(p.lifecycleStages, sources)) if (!s.supported) out.push(`Status “${s.stage}” needs: ${s.need}.`);
  out.push(...lifecycleProblems(p.lifecycleStages).map((x) => x.message));
  if (p.conflictFlag) out.push("The conflict flag is still set.");
  if (p.outstandingChecks.length) out.push(`${p.outstandingChecks.length} outstanding check(s) remain.`);
  if (!p.lifecycleStages.length) out.push("No lifecycle status recorded.");
  return [...new Set(out)];
}
