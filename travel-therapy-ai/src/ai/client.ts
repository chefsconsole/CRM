import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

let client: Anthropic | null = null;

/**
 * Lazily construct the Anthropic client so the rest of the app (DB, API routes)
 * can boot without a key. The key is only required the moment an agent runs.
 */
export function getAnthropic(): Anthropic {
  if (client) return client;
  if (!env.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env (or run `ant auth login`) before invoking an AI employee."
    );
  }
  client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}
