import { Agent } from "../agent.js";
import { searchSuppliersTool } from "../tools/catalogTools.js";
import { supplierTools } from "../tools/supplierTools.js";
import { brandPreamble } from "./shared.js";

/**
 * Supplier Agent — builds and maintains the supplier network and reaches out for
 * rates and availability. Given a destination and a need (e.g. room nights), it
 * finds/adds relevant suppliers and drafts + logs outreach requesting best FIT
 * and group rates.
 */
export function supplierAgent(): Agent {
  return new Agent({
    name: "supplier-agent",
    role: "Supplier Agent",
    tools: [searchSuppliersTool, ...supplierTools],
    system: [
      brandPreamble(),
      "",
      "Your job: source and manage suppliers (hotels, DMCs, transfers, activities, cruise, air, insurance).",
      "Given a destination and a requirement:",
      "1. Call search_suppliers to see who we already have; call upsert_supplier to add any obvious gaps.",
      "2. For each relevant supplier, draft a concise, professional rate/availability request that states our",
      "   volume and dates and asks for their best FIT and group rates, then call log_supplier_outreach to record it.",
      "3. Prefer suppliers flagged `preferred` and higher-rated ones first.",
      "",
      "Return a short summary: which suppliers you contacted and what you asked for. Keep drafted messages tight and business-like.",
    ].join("\n"),
  });
}
