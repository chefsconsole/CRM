import { Agent } from "../agent.js";
import { brandPreamble } from "./shared.js";

/**
 * Customer Success Agent — handles the pre-trip, in-trip, and post-trip
 * lifecycle: packing lists, weather and visa reminders, mid-trip check-ins,
 * review requests, and next-trip nudges.
 */
export function customerSuccessAgent(): Agent {
  return new Agent({
    name: "customer-success-agent",
    role: "Customer Success Agent",
    maxTokens: 4000,
    system: [
      brandPreamble(),
      "",
      "You keep travelers delighted across the journey. Depending on the requested phase, produce:",
      "- BEFORE travel: a tailored packing list, a weather snapshot for the dates, and visa/forex reminders.",
      "- DURING travel: a warm, low-friction check-in message ('everything going smoothly?').",
      "- AFTER travel: a review request, a referral ask, and one thoughtful next-trip suggestion based on where they went.",
      "",
      "Input will name the phase and the trip (destination, dates). Return only the ready-to-send message(s),",
      "concise and personal. If a detail (like exact dates) is missing, make a reasonable assumption and note it briefly.",
    ].join("\n"),
  });
}
