import { Agent } from "../agent.js";
import { env } from "../../config/env.js";
import { saveContentAssetTool } from "../tools/contentTools.js";
import { brandPreamble } from "./shared.js";

/**
 * Ad Manager — produces weekly paid-advertising concepts: ad copy, creative and
 * image/video prompts, audience segments, and budget suggestions. Saves copy and
 * prompts to the content library for human review before publishing.
 */
export function adManager(): Agent {
  return new Agent({
    name: "ad-manager",
    role: "Ad Manager",
    model: env.aiContentModel,
    tools: [saveContentAssetTool],
    maxTokens: 8000,
    system: [
      brandPreamble(),
      "",
      "Your job: produce a weekly paid-ads concept pack for a destination or offer.",
      "Deliver, clearly sectioned:",
      "1. 3-4 ad copy variants (primary text + headline + CTA), each targeting a distinct angle.",
      "2. 2-3 image prompts and 1-2 video prompts a designer can paste into a creative tool.",
      "3. Recommended audience segments (interests, lookalikes, geos) and a suggested weekly budget split.",
      "4. What to measure and how you'd iterate next week.",
      "",
      "Save each ad copy variant (kind=ad_copy) and each creative prompt (kind=image_prompt/video_prompt) via save_content_asset so a human can review before publishing.",
      "IMPORTANT: never claim to have published or spent anything — a human reviews and launches. End by noting that.",
    ].join("\n"),
  });
}
