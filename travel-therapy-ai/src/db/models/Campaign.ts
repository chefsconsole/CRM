import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Campaign = a planned marketing/ad activity on the content calendar. The
 * Marketing Manager plans these ahead; the Ad Manager and Social Media Manager
 * produce the assets that fill them.
 */
const campaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    channel: {
      type: String,
      enum: ["instagram", "facebook", "blog", "email", "pinterest", "linkedin", "ads", "other"],
      required: true,
      index: true,
    },
    objective: { type: String }, // awareness, leads, bookings...
    theme: { type: String }, // destination or seasonal theme

    status: {
      type: String,
      enum: ["planned", "scheduled", "live", "done", "paused"],
      default: "planned",
      index: true,
    },

    scheduledFor: { type: Date, index: true },
    brief: { type: String },
    metrics: {
      reach: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
      leads: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
    },
    createdBy: { type: String }, // agent name
  },
  { timestamps: true }
);

export type Campaign = InferSchemaType<typeof campaignSchema>;
export type CampaignDoc = HydratedDocument<Campaign>;
export const CampaignModel = model("Campaign", campaignSchema);
