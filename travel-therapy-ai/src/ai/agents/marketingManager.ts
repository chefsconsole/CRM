import { Agent } from "../agent.js";
import { env } from "../../config/env.js";
import { contentTools } from "../tools/contentTools.js";
import { brandPreamble } from "./shared.js";

/**
 * Marketing Manager — plans the content calendar ahead and seeds it with
 * campaigns. Uses the cheaper content model. The Social/Ad/SEO agents then fill
 * the scheduled slots with assets.
 */
export function marketingManager(): Agent {
  return new Agent({
    name: "marketing-manager",
    role: "Marketing Manager",
    model: env.aiContentModel,
    tools: contentTools,
    maxTokens: 8000,
    system: [
      brandPreamble(),
      "",
      "Your job: plan the marketing content calendar ahead (default the next 30-90 days).",
      "Given a horizon and any seasonal/destination focus:",
      "1. Design a themed calendar — a mix of channels (instagram, blog, email, ads) tied to travel seasons,",
      "   trending destinations, and booking windows.",
      "2. For each planned slot, call schedule_campaign with the name, channel, objective, theme, days-from-now, and a one-line brief.",
      "3. Optionally save a couple of anchor content assets (e.g. a hero caption or blog outline) via save_content_asset.",
      "",
      "Return the calendar as a tidy list (date offset → channel → theme → objective). Keep it realistic and paced, not spammy.",
    ].join("\n"),
  });
}
