import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Itinerary = the day-by-day travel plan generated for a lead. Produced by the
 * Itinerary Generator agent and rendered into quotes / PDFs / WhatsApp messages.
 */
const daySchema = new Schema(
  {
    day: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    city: { type: String },
    hotelSuggestion: { type: String },
    activities: { type: [String], default: [] },
    meals: { type: [String], default: [] }, // e.g. ["breakfast", "dinner"]
  },
  { _id: false }
);

const costLineSchema = new Schema(
  {
    label: { type: String, required: true }, // "Hotels", "Transfers", "Activities"
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const itinerarySchema = new Schema(
  {
    lead: { type: Types.ObjectId, ref: "Lead", required: true, index: true },
    customer: { type: Types.ObjectId, ref: "Customer", required: true, index: true },

    destination: { type: String, required: true },
    nights: { type: Number, required: true },
    travelers: { type: Number, default: 2 },
    summary: { type: String, required: true },
    highlights: { type: [String], default: [] },

    days: { type: [daySchema], default: [] },

    costing: {
      currency: { type: String, default: "INR" },
      lines: { type: [costLineSchema], default: [] },
      perPerson: { type: Number },
      total: { type: Number },
    },

    version: { type: Number, default: 1 },
    generatedBy: { type: String, default: "itinerary-generator" },
  },
  { timestamps: true }
);

export type Itinerary = InferSchemaType<typeof itinerarySchema>;
export type ItineraryDoc = HydratedDocument<Itinerary>;
export const ItineraryModel = model("Itinerary", itinerarySchema);
