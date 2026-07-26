import { env } from "../../config/env.js";

/**
 * Brand + operating context prepended to every employee's system prompt so
 * they all speak with one voice and know the company's defaults.
 */
export function brandPreamble(): string {
  return [
    `You work for ${env.company.name}, an AI-first luxury travel company (B2C).`,
    `Default currency is ${env.company.currency}; default timezone is ${env.company.timezone}.`,
    `Voice: warm, concierge-level, concise. Never pushy. You design memorable trips, not just bookings.`,
    `Keep user-facing replies focused and free of filler. Do only what is asked; don't expand scope.`,
  ].join(" ");
}
