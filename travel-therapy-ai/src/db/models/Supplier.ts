import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Supplier = a hotel, DMC, transfer company, activity provider, cruise line,
 * air consolidator, or insurance partner. The Supplier Agent maintains this
 * database and contacts them for rates and availability.
 */
const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["hotel", "dmc", "transfer", "activity", "cruise", "air", "insurance", "other"],
      required: true,
      index: true,
    },
    destination: { type: String, index: true }, // primary city/region served
    country: { type: String },

    contact: {
      email: { type: String, lowercase: true, trim: true },
      phone: { type: String },
      whatsapp: { type: String },
      website: { type: String },
      contactPerson: { type: String },
    },

    rating: { type: Number, min: 0, max: 5 },
    preferred: { type: Boolean, default: false },
    responseRate: { type: Number, default: 0 }, // 0-100, learned over time
    notes: { type: String },
    tags: { type: [String], default: [] },

    // Rate/availability requests the Supplier Agent has sent, and their status.
    outreach: {
      type: [
        new Schema(
          {
            channel: { type: String, enum: ["email", "whatsapp", "other"], default: "email" },
            message: { type: String, required: true },
            sentAt: { type: Date, default: Date.now },
            status: { type: String, enum: ["sent", "replied", "no_reply"], default: "sent" },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export type Supplier = InferSchemaType<typeof supplierSchema>;
export type SupplierDoc = HydratedDocument<Supplier>;
export const SupplierModel = model("Supplier", supplierSchema);
