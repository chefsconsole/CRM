// CSV import/export for our own inventory. Columns are documented in docs/INVENTORY_IMPORT.md.

import { z } from "zod";
import { parseISTInput, toISTDateInput } from "./time";

export const INVENTORY_COLUMNS = [
  "reference", "project_name", "developer_name", "micro_market", "unit_number", "configuration", "bhk", "carpet_area_sqft", "floor", "facing", "parking", "furnishing",
  "possession_details", "asking_price_inr", "asking_includes", "asking_excludes", "asking_extra_costs_inr",
  "builder_quote_inr", "builder_quote_date", "builder_quote_source", "builder_quote_evidence", "builder_quote_config", "builder_quote_carpet_sqft", "builder_quote_floor", "builder_quote_includes", "builder_quote_excludes", "builder_extra_costs_inr",
  "availability", "owner_source", "contact_name", "contact_phone", "contact_email", "commercial_terms", "last_verified_date", "confidentiality", "next_follow_up_date", "notes",
] as const;

/** Minimal RFC-4180 parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Rupee amounts as people type them in India: "21500000", "2,15,00,000", "₹2.15 Cr", "85 L", "85 lakh".
 * Returns NaN for anything else so validation can report it.
 */
export function parseRupees(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const s = String(v).toLowerCase().replace(/[₹,\s]|rs\.?|inr/g, "");
  const m = /^(\d+(?:\.\d+)?)(cr|crore|crores|l|lac|lacs|lakh|lakhs|k)?$/.exec(s);
  if (!m) return Number.NaN;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  if (unit.startsWith("c")) return Math.round(n * 1e7);
  if (unit.startsWith("l")) return Math.round(n * 1e5);
  if (unit === "k") return Math.round(n * 1e3);
  return n;
}

/** Dates as YYYY-MM-DD, or day-first DD/MM/YYYY and DD-MM-YYYY (as Excel exports them in India). */
export function parseSheetDate(v: unknown): Date | null | "invalid" {
  if (v === "" || v == null) return null;
  const s = String(v).trim();
  const dm = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  const iso = dm ? `${dm[3]}-${dm[2]!.padStart(2, "0")}-${dm[1]!.padStart(2, "0")}` : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "invalid";
  const d = parseISTInput(iso);
  if (!d) return "invalid";
  // Reject impossible dates such as 31/02/2026, which JavaScript would silently roll over.
  if (toISTDateInput(d) !== iso) return "invalid";
  return d;
}

const money = z.preprocess(parseRupees, z.number({ invalid_type_error: "Amount must be a number, e.g. 21500000 or 2.15 Cr" }).positive().nullable());
const num = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(/[,\s]/g, ""))), z.number().nonnegative().nullable());
const date = z.preprocess((v) => parseSheetDate(v), z.union([z.date(), z.null(), z.literal("invalid")]).refine((d) => d !== "invalid", "Invalid date (use YYYY-MM-DD or DD/MM/YYYY)").transform((d) => (d instanceof Date ? d : null)));
const text = (max = 300) => z.preprocess((v) => (v === "" || v == null ? null : String(v).trim()), z.string().max(max).nullable());

export const inventoryRowSchema = z.object({
  reference: z.string().trim().min(1, "reference is required").max(40),
  projectName: z.string().trim().min(1, "project_name is required").max(120),
  developerName: text(120),
  microMarket: z.string().trim().min(1, "micro_market is required").max(60),
  unitNumber: text(40),
  configuration: z.string().trim().min(1, "configuration is required").max(40),
  bhk: num,
  carpetArea: num,
  floor: text(20),
  facing: text(40),
  parking: text(80),
  furnishing: text(60),
  possessionDetails: text(200),
  askingPrice: z.preprocess((v) => parseRupees(v) ?? Number.NaN, z.number({ invalid_type_error: "asking_price_inr must be a number, e.g. 21500000 or 2.15 Cr" }).positive("asking_price_inr is required")),
  askingIncludes: text(),
  askingExcludes: text(),
  askingExtraCosts: money,
  builderQuote: money,
  builderQuoteDate: date,
  builderQuoteSource: text(200),
  builderQuoteEvidence: text(500),
  builderQuoteConfig: text(40),
  builderQuoteCarpet: num,
  builderQuoteFloor: text(20),
  builderQuoteIncludes: text(),
  builderQuoteExcludes: text(),
  builderExtraCosts: money,
  availability: z.preprocess((v) => (v ? String(v).trim().toUpperCase().replace(/\s+/g, "_") : "UNCONFIRMED"), z.enum(["AVAILABLE", "ON_HOLD", "UNDER_NEGOTIATION", "SOLD", "WITHDRAWN", "UNCONFIRMED"])),
  ownerSource: text(120),
  contactName: text(80),
  contactPhone: text(20),
  contactEmail: text(120),
  commercialTerms: text(500),
  lastVerifiedAt: date,
  confidentiality: z.preprocess((v) => (v ? String(v).trim().toUpperCase().replace(/\s+/g, "_") : "INTERNAL"), z.enum(["PUBLIC_WHEN_APPROVED", "INTERNAL", "RESTRICTED"])),
  nextFollowUpAt: date,
  notes: text(1000),
});
export type InventoryRow = z.infer<typeof inventoryRowSchema>;

const KEY: Record<(typeof INVENTORY_COLUMNS)[number], keyof InventoryRow> = {
  reference: "reference", project_name: "projectName", developer_name: "developerName", micro_market: "microMarket", unit_number: "unitNumber", configuration: "configuration", bhk: "bhk",
  carpet_area_sqft: "carpetArea", floor: "floor", facing: "facing", parking: "parking", furnishing: "furnishing", possession_details: "possessionDetails", asking_price_inr: "askingPrice",
  asking_includes: "askingIncludes", asking_excludes: "askingExcludes", asking_extra_costs_inr: "askingExtraCosts", builder_quote_inr: "builderQuote", builder_quote_date: "builderQuoteDate",
  builder_quote_source: "builderQuoteSource", builder_quote_evidence: "builderQuoteEvidence", builder_quote_config: "builderQuoteConfig", builder_quote_carpet_sqft: "builderQuoteCarpet", builder_quote_floor: "builderQuoteFloor",
  builder_quote_includes: "builderQuoteIncludes", builder_quote_excludes: "builderQuoteExcludes", builder_extra_costs_inr: "builderExtraCosts", availability: "availability", owner_source: "ownerSource",
  contact_name: "contactName", contact_phone: "contactPhone", contact_email: "contactEmail", commercial_terms: "commercialTerms", last_verified_date: "lastVerifiedAt", confidentiality: "confidentiality",
  next_follow_up_date: "nextFollowUpAt", notes: "notes",
};

export interface ParsedRow {
  line: number;
  row?: InventoryRow;
  errors: string[];
}

const REQUIRED = ["reference", "project_name", "micro_market", "configuration", "asking_price_inr"];
const MAX_ROWS = 1000;

/** Parses and validates every line, keeping line numbers. Unknown columns are reported, not silently ignored. */
export function parseInventoryCsv(text: string): { rows: ParsedRow[]; fileErrors: string[]; unknownColumns: string[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { rows: [], fileErrors: ["The file is empty."], unknownColumns: [] };
  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], fileErrors: [`Missing required columns: ${missing.join(", ")}. Download the template to see the expected headers.`], unknownColumns: [] };
  const dupHeaders = header.filter((h, i) => h && header.indexOf(h) !== i);
  if (dupHeaders.length) return { rows: [], fileErrors: [`Column(s) appear twice: ${[...new Set(dupHeaders)].join(", ")}`], unknownColumns: [] };
  if (rows.length - 1 > MAX_ROWS) return { rows: [], fileErrors: [`Import at most ${MAX_ROWS} rows at a time.`], unknownColumns: [] };
  const unknownColumns = header.filter((h) => h && !(h in KEY));
  const out: ParsedRow[] = rows.slice(1).map((cells, i) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      const k = KEY[h as keyof typeof KEY];
      if (k) obj[k] = cells[idx] ?? "";
    });
    const r = inventoryRowSchema.safeParse(obj);
    return r.success ? { line: i + 2, row: r.data, errors: [] } : { line: i + 2, errors: r.error.issues.map((x) => x.message) };
  });
  return { rows: out, fileErrors: [], unknownColumns };
}

export type ImportAction = "CREATE" | "UPDATE" | "SKIP_DUPLICATE" | "ERROR";

export interface PlannedRow {
  line: number;
  action: ImportAction;
  reference: string | null;
  summary: string;
  messages: string[];
  row?: InventoryRow;
  existingId?: string;
}

export interface ExistingUnitKey {
  id: string;
  reference: string;
  projectName: string;
  unitNumber: string | null;
}

const unitKey = (project: string, unit: string | null) => (unit ? `${project.trim().toLowerCase()}|${unit.toLowerCase().replace(/[^a-z0-9]/g, "")}` : null);

/**
 * Decides what would happen to every row — nothing is written here. Duplicates are detected by
 * reference and by project + unit number, both within the file and against saved units.
 */
export function planInventoryImport(parsed: ParsedRow[], existing: ExistingUnitKey[], opts: { updateExisting: boolean }): PlannedRow[] {
  const byRef = new Map(existing.map((e) => [e.reference.toLowerCase(), e]));
  const byUnit = new Map<string, ExistingUnitKey>();
  for (const e of existing) {
    const k = unitKey(e.projectName, e.unitNumber);
    if (k) byUnit.set(k, e);
  }
  const seenRef = new Map<string, number>();
  const seenUnit = new Map<string, number>();
  return parsed.map((p) => {
    if (!p.row) return { line: p.line, action: "ERROR", reference: null, summary: "", messages: p.errors };
    const r = p.row;
    const summary = `${r.projectName}${r.unitNumber ? ` · ${r.unitNumber}` : ""} · ${r.configuration} · ${r.microMarket}`;
    const ref = r.reference.toLowerCase();
    const uk = unitKey(r.projectName, r.unitNumber);
    const messages: string[] = [];
    if (seenRef.has(ref)) return { line: p.line, action: "ERROR", reference: r.reference, summary, messages: [`Reference repeats line ${seenRef.get(ref)}`] };
    if (uk && seenUnit.has(uk)) return { line: p.line, action: "ERROR", reference: r.reference, summary, messages: [`Same project and unit as line ${seenUnit.get(uk)}`] };
    seenRef.set(ref, p.line);
    if (uk) seenUnit.set(uk, p.line);
    const sameRef = byRef.get(ref);
    const sameUnit = uk ? byUnit.get(uk) : undefined;
    if (sameUnit && (!sameRef || sameUnit.id !== sameRef.id)) {
      return { line: p.line, action: "SKIP_DUPLICATE", reference: r.reference, summary, messages: [`This unit already exists as ${sameUnit.reference}`], existingId: sameUnit.id };
    }
    if (sameRef) {
      if (!opts.updateExisting) return { line: p.line, action: "SKIP_DUPLICATE", reference: r.reference, summary, messages: ["Reference already saved — tick “update existing” to refresh it"], existingId: sameRef.id };
      return { line: p.line, action: "UPDATE", reference: r.reference, summary, messages: ["Updates the saved unit (approval and publication are not changed)"], row: r, existingId: sameRef.id };
    }
    if (r.builderQuote && !r.builderQuoteDate) messages.push("Builder quote has no date — it won't be used for comparison");
    if (r.availability === "UNCONFIRMED") messages.push("Availability unconfirmed");
    return { line: p.line, action: "CREATE", reference: r.reference, summary, messages, row: r };
  });
}

/** Back-compat helper: valid rows and errors only. */
export function rowsFromCsv(text: string): { valid: InventoryRow[]; errors: { line: number; message: string }[] } {
  const { rows, fileErrors } = parseInventoryCsv(text);
  if (fileErrors.length) return { valid: [], errors: fileErrors.map((m) => ({ line: 1, message: m })) };
  const plan = planInventoryImport(rows, [], { updateExisting: false });
  return {
    valid: plan.filter((p) => p.action === "CREATE").map((p) => p.row!),
    errors: plan.filter((p) => p.action === "ERROR").map((p) => ({ line: p.line, message: p.messages.join("; ") })),
  };
}
