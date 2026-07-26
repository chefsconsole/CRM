import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Lead = an inbound intent to travel, attached to a Customer. One customer can
 * have many leads over time (a Bali honeymoon this year, a Japan trip next).
 */
const leadSchema = new Schema(
  {
    customer: { type: Types.ObjectId, ref: "Customer", required: true, index: true },

    source: {
      type: String,
      enum: ["instagram", "facebook", "whatsapp", "website", "email", "referral", "ad", "other"],
      required: true,
      index: true,
    },
    campaign: { type: String }, // ad/campaign id, if attributable

    // What we know about the desired trip (partial is normal early on).
    destination: { type: String },
    month: { type: String }, // "2026-09" or "September"
    nights: { type: Number },
    travelers: { type: Number },
    departureCity: { type: String },
    budget: { type: Number },
    occasion: { type: String }, // honeymoon, anniversary, family holiday...

    status: {
      type: String,
      enum: ["new", "qualifying", "qualified", "proposal_sent", "won", "lost", "nurture"],
      default: "new",
      index: true,
    },

    // Free-form summary of the enquiry, written by the Lead Manager agent.
    summary: { type: String },
    score: { type: Number, default: 0 }, // 0-100 qualification score

    lastContactedAt: { type: Date },
    nextFollowUpAt: { type: Date, index: true },
  },
  { timestamps: true }
);

export type Lead = InferSchemaType<typeof leadSchema>;
export type LeadDoc = HydratedDocument<Lead>;
export const LeadModel = model("Lead", leadSchema);
