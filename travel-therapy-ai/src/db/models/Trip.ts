import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Trip = a confirmed booking, created when a quote is accepted. Tracks the
 * individual supplier bookings and the travel documents issued to the customer.
 */
const bookingSchema = new Schema(
  {
    type: { type: String, enum: ["hotel", "transfer", "activity", "flight", "cruise", "insurance", "other"], required: true },
    supplier: { type: String },
    reference: { type: String },
    status: { type: String, enum: ["pending", "requested", "confirmed", "cancelled"], default: "pending" },
    amount: { type: Number },
  },
  { _id: false }
);

const travelDocSchema = new Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ["voucher", "ticket", "itinerary", "visa", "insurance", "invoice", "other"], default: "other" },
    url: { type: String },
  },
  { _id: false }
);

const tripSchema = new Schema(
  {
    customer: { type: Types.ObjectId, ref: "Customer", required: true, index: true },
    lead: { type: Types.ObjectId, ref: "Lead", index: true },
    quote: { type: Types.ObjectId, ref: "Quote" },
    itinerary: { type: Types.ObjectId, ref: "Itinerary" },

    destination: { type: String, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    nights: { type: Number },
    travelers: { type: Number, default: 2 },

    status: {
      type: String,
      enum: ["booked", "in_progress", "completed", "cancelled"],
      default: "booked",
      index: true,
    },

    bookings: { type: [bookingSchema], default: [] },
    travelDocuments: { type: [travelDocSchema], default: [] },
    totalValue: { type: Number },
    currency: { type: String, default: "INR" },
  },
  { timestamps: true }
);

export type Trip = InferSchemaType<typeof tripSchema>;
export type TripDoc = HydratedDocument<Trip>;
export const TripModel = model("Trip", tripSchema);
