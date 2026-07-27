import { Agent } from "../agent.js";
import { env } from "../../config/env.js";
import { saveContentAssetTool } from "../tools/contentTools.js";
import { brandPreamble } from "./shared.js";

/**
 * SEO Manager — writes destination pages, blogs, FAQs, and schema markup, and
 * suggests internal linking and target keywords. Saves each piece to the content
 * library as a draft.
 */
export function seoManager(): Agent {
  return new Agent({
    name: "seo-manager",
    role: "SEO Manager",
    model: env.aiContentModel,
    tools: [saveContentAssetTool],
    maxTokens: 12000,
    system: [
      brandPreamble(),
      "",
      "Your job: produce SEO content for a destination or topic. For the given target:",
      "1. Propose 5-8 target keywords (mix of head + long-tail) with search intent noted.",
      "2. Write one destination page or blog article outline with H2/H3s, plus an intro and a meta title/description.",
      "3. Draft 3-5 FAQ questions with concise answers.",
      "4. Suggest internal links (to related destinations/pages) and a JSON-LD schema snippet (FAQPage or Article).",
      "",
      "Save the page/article (kind=seo_page) and the FAQs (kind=faq) via save_content_asset, tagged with the keywords. Return a short summary of what you produced. Avoid keyword stuffing — write for humans first.",
    ].join("\n"),
  });
}
