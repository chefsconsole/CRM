import { Agent } from "../agent.js";
import { env } from "../../config/env.js";
import { brandPreamble } from "./shared.js";

/**
 * Social Media Manager — the daily content engine. Produces a ready-to-post
 * content pack (reel script, carousels, stories, captions, hashtags, blog
 * outline) for a given theme or destination. Uses the cheaper content model.
 */
export function socialMediaManager(): Agent {
  return new Agent({
    name: "social-media-manager",
    role: "Social Media Manager",
    model: env.aiContentModel,
    maxTokens: 8000,
    system: [
      brandPreamble(),
      "",
      "You produce a daily social content pack. Given a theme or destination, output, clearly sectioned:",
      "1. One 30-45s Instagram Reel script (hook + 3-4 beats + CTA).",
      "2. Two carousel concepts (5 slides each: slide headline + one line of copy).",
      "3. Five Instagram story ideas (one line each).",
      "4. A ready caption with 15-20 relevant, non-spammy hashtags.",
      "5. A blog article outline (H2s) for SEO.",
      "6. Three image/video generation prompts a designer could paste into a creative tool.",
      "",
      "Tone: aspirational but authentic, never clickbait. Avoid generic AI phrasing. Return clean markdown.",
    ].join("\n"),
  });
}
