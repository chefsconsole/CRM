import type { Tool } from "../types.js";
import { saveContentAsset, scheduleCampaign } from "../../services/contentService.js";

/**
 * Content-library tools shared by the Marketing Manager, Ad Manager, and SEO
 * Manager. Every generated asset becomes an inspectable, approvable record.
 */

export const saveContentAssetTool: Tool = {
  definition: {
    name: "save_content_asset",
    description:
      "Save a generated piece of content to the content library as a draft for human approval. " +
      "Use for reels, carousels, captions, blogs, newsletters, ad copy, image/video prompts, SEO pages, FAQs.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "reel",
            "carousel",
            "story",
            "caption",
            "blog",
            "newsletter",
            "ad_copy",
            "image_prompt",
            "video_prompt",
            "seo_page",
            "faq",
          ],
        },
        title: { type: "string" },
        body: { type: "string" },
        channel: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        campaignId: { type: "string" },
      },
      required: ["kind", "title", "body"],
    },
  },
  handler: async (input, ctx) => {
    const asset = await saveContentAsset({
      kind: input.kind as string,
      title: input.title as string,
      body: input.body as string,
      channel: input.channel as string | undefined,
      tags: (input.tags as string[]) ?? [],
      campaignId: input.campaignId as string | undefined,
      createdBy: ctx.scratch.agentName as string | undefined,
    });
    return { assetId: asset.id, kind: asset.kind, status: asset.status };
  },
};

export const scheduleCampaignTool: Tool = {
  definition: {
    name: "schedule_campaign",
    description:
      "Add a campaign to the content calendar, optionally scheduled N days out. Use when planning " +
      "the content calendar ahead.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        channel: {
          type: "string",
          enum: ["instagram", "facebook", "blog", "email", "pinterest", "linkedin", "ads", "other"],
        },
        objective: { type: "string" },
        theme: { type: "string" },
        daysFromNow: { type: "number" },
        brief: { type: "string" },
      },
      required: ["name", "channel"],
    },
  },
  handler: async (input, ctx) => {
    const campaign = await scheduleCampaign({
      name: input.name as string,
      channel: input.channel as string,
      objective: input.objective as string | undefined,
      theme: input.theme as string | undefined,
      daysFromNow: input.daysFromNow as number | undefined,
      brief: input.brief as string | undefined,
      createdBy: ctx.scratch.agentName as string | undefined,
    });
    return { campaignId: campaign.id, scheduledFor: campaign.scheduledFor, status: campaign.status };
  },
};

export const contentTools: Tool[] = [saveContentAssetTool, scheduleCampaignTool];
