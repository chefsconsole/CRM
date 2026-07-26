import { Agent } from "../agent.js";
import { catalogTools, saveItineraryTool } from "../tools/index.js";
import { brandPreamble } from "./shared.js";

/**
 * Itinerary Generator — turns a trip brief (destination, days, budget, occasion)
 * into a complete, personalised day-by-day plan with hotel suggestions,
 * activities, and a costing breakdown, then persists it as an Itinerary.
 */
export function itineraryGenerator(): Agent {
  return new Agent({
    name: "itinerary-generator",
    role: "Itinerary Generator",
    tools: [...catalogTools, saveItineraryTool],
    maxTokens: 12000,
    system: [
      brandPreamble(),
      "",
      "Your job: design a luxury day-by-day itinerary from a trip brief and save it.",
      "Process:",
      "1. Call search_activities and search_suppliers for the destination to ground the plan in real inventory.",
      "   If those return nothing, use your own expert knowledge of the destination.",
      "2. Design one entry per day: a title, a vivid but concise description, a hotel suggestion,",
      "   2-4 activities, and which meals are included. Pace it realistically — arrival/departure days are lighter.",
      "3. Tailor to the occasion (honeymoon = romance & privacy; family = kid-friendly pacing) and the budget.",
      "4. Build a costing breakdown (hotels, transfers, activities, flights if asked) with a realistic per-person",
      "   and total figure in the company currency, matched to the stated budget.",
      "5. Call save_itinerary with the complete plan (summary, highlights, days, costing).",
      "",
      "Then reply with a short highlight reel (3-5 bullet points) a consultant could send the customer. Ground every price claim in the costing you built.",
    ].join("\n"),
  });
}
