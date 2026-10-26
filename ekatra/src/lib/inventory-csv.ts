// CSV import/export for our own inventory. Columns are documented in docs/INVENTORY_IMPORT.md.

import { z } from "zod";

export const INVENTORY_COLUMNS = [
  "reference", "project_name", "developer_name", "micro_market", "unit_number", "configuration", "bhk", "carpet_area_sqft", "floor", "facing", "parking", "furnishing",
  "possession_details", "asking_price_inr", "asking_includes", "asking_excludes", "asking_extra_costs_inr",
  "builder_quote_inr", "builder_quote_date", "builder_quote_source", "builder_quote_config", "builder_quote_carpet_sqft", "builder_quote_floor", "builder_quote_includes", "builder_quote_excludes", "builder_extra_costs_inr",
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

const money = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(/[,₹\s]/g, ""))), z.number().positive().nullable());
const num = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(/[,\s]/g, ""))), z.number().nonnegative().nullable());
const date = z.preprocess((v) => (v === "" || v == null ? null : new Date(String(v))), z.date().nullable().refine((d) => !d || !Number.isNaN(d.getTime()), "Invalid date (use YYYY-MM-DD)"));
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
  askingPrice: z.preprocess((v) => Number(String(v ?? "").replace(/[,₹\s]/g, "")), z.number({ invalid_type_error: "asking_price_inr must be a number" }).positive("asking_price_inr is required")),
  askingIncludes: text(),
  askingExcludes: text(),
  askingExtraCosts: money,
  builderQuote: money,
  builderQuoteDate: date,
  builderQuoteSource: text(200),
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
  builder_quote_source: "builderQuoteSource", builder_quote_config: "builderQuoteConfig", builder_quote_carpet_sqft: "builderQuoteCarpet", builder_quote_floor: "builderQuoteFloor",
  builder_quote_includes: "builderQuoteIncludes", builder_quote_excludes: "builderQuoteExcludes", builder_extra_costs_inr: "builderExtraCosts", availability: "availability", owner_source: "ownerSource",
  contact_name: "contactName", contact_phone: "contactPhone", contact_email: "contactEmail", commercial_terms: "commercialTerms", last_verified_date: "lastVerifiedAt", confidentiality: "confidentiality",
  next_follow_up_date: "nextFollowUpAt", notes: "notes",
};

export function rowsFromCsv(text: string): { valid: InventoryRow[]; errors: { line: number; message: string }[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { valid: [], errors: [{ line: 1, message: "The file is empty." }] };
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const missing = ["reference", "project_name", "micro_market", "configuration", "asking_price_inr"].filter((c) => !header.includes(c));
  if (missing.length) return { valid: [], errors: [{ line: 1, message: `Missing required columns: ${missing.join(", ")}` }] };
  const valid: InventoryRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((cells, i) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      const k = KEY[h as keyof typeof KEY];
      if (k) obj[k] = cells[idx] ?? "";
    });
    const r = inventoryRowSchema.safeParse(obj);
    if (!r.success) errors.push({ line: i + 2, message: r.error.issues.map((x) => x.message).join("; ") });
    else if (seen.has(r.data.reference)) errors.push({ line: i + 2, message: `Duplicate reference ${r.data.reference} in file` });
    else {
      seen.add(r.data.reference);
      valid.push(r.data);
    }
  });
  return { valid, errors };
}
