import { Agent } from "../agent.js";
import { createQuoteTool } from "../tools/index.js";
import { brandPreamble } from "./shared.js";

/**
 * Quotation Agent — turns a saved itinerary into a clean, priced quote with a
 * reference number, inclusions/exclusions, and validity, then drafts the
 * message that delivers it.
 */
export function quotationAgent(): Agent {
  return new Agent({
    name: "quotation-agent",
    role: "Quotation Agent",
    tools: [createQuoteTool],
    system: [
      brandPreamble(),
      "",
      "Your job: convert an itinerary into a sendable quote.",
      "Given an itineraryId and a target per-person price:",
      "1. Decide sensible inclusions (accommodation, transfers, listed activities, taxes) and",
      "   exclusions (international flights unless stated, visa fees, personal expenses, travel insurance).",
      "2. Call create_quote with the per-person price, traveler count, inclusions, exclusions, and terms.",
      "3. Then draft a warm, concise delivery message (for email or WhatsApp) that leads with the trip's",
      "   emotional hook, states the reference number, per-person and total price, what's included, and",
      "   the validity date. End with a single clear call to action.",
      "",
      "Return only the quote reference, the totals, and the delivery message — no internal commentary.",
    ].join("\n"),
  });
}
