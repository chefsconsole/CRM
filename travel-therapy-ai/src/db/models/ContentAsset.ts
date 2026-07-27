import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * ContentAsset = a single piece of generated marketing content in the content
 * library (a reel script, caption, blog, ad copy, image prompt, SEO page).
 * The Social/Marketing/Ad/SEO agents write to this; humans approve & publish.
 */
const contentAssetSchema = new Schema(
  {
    kind: {
      type: String,
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
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    channel: { type: String }, // instagram, blog, email...
    tags: { type: [String], default: [] },

    campaign: { type: Types.ObjectId, ref: "Campaign", index: true },

    status: {
      type: String,
      enum: ["draft", "approved", "scheduled", "published"],
      default: "draft",
      index: true,
    },
    createdBy: { type: String }, // agent name
  },
  { timestamps: true }
);

export type ContentAsset = InferSchemaType<typeof contentAssetSchema>;
export type ContentAssetDoc = HydratedDocument<ContentAsset>;
export const ContentAssetModel = model("ContentAsset", contentAssetSchema);
