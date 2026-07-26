import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Activity = a bookable experience in a destination (tour, dinner, transfer,
 * excursion). This is the catalog the Itinerary Generator draws from when it
 * has real inventory; when empty, the agent falls back to its own knowledge.
 */
const activitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    destination: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ["sightseeing", "adventure", "dining", "wellness", "cultural", "nightlife", "transfer", "other"],
      default: "sightseeing",
    },
    description: { type: String },
    durationHours: { type: Number },
    priceFrom: { type: Number }, // per person, in catalog currency
    currency: { type: String, default: "INR" },
    supplier: { type: String }, // free-text or supplier name
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

activitySchema.index({ destination: 1, category: 1 });

export type Activity = InferSchemaType<typeof activitySchema>;
export type ActivityDoc = HydratedDocument<Activity>;
export const ActivityModel = model("Activity", activitySchema);
