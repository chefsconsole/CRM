import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Quote = a priced proposal sent to a customer, derived from an itinerary.
 * The Quotation Agent creates these; follow-up automation chases them.
 */
const quoteSchema = new Schema(
  {
    lead: { type: Types.ObjectId, ref: "Lead", required: true, index: true },
    customer: { type: Types.ObjectId, ref: "Customer", required: true, index: true },
    itinerary: { type: Types.ObjectId, ref: "Itinerary", required: true },

    reference: { type: String, required: true, unique: true }, // e.g. TT-2026-0042

    currency: { type: String, default: "INR" },
    perPerson: { type: Number, required: true },
    travelers: { type: Number, default: 2 },
    total: { type: Number, required: true },

    inclusions: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },
    terms: { type: String },

    status: {
      type: String,
      enum: ["draft", "sent", "viewed", "accepted", "declined", "expired"],
      default: "draft",
      index: true,
    },

    validUntil: { type: Date },
    sentAt: { type: Date },
    nextFollowUpAt: { type: Date, index: true },
  },
  { timestamps: true }
);

export type Quote = InferSchemaType<typeof quoteSchema>;
export type QuoteDoc = HydratedDocument<Quote>;
export const QuoteModel = model("Quote", quoteSchema);
