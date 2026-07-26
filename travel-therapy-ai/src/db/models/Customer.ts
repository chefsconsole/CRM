import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Customer = the single, de-duplicated profile for a person, no matter how many
 * channels they reached us through (Instagram, WhatsApp, website form, email).
 * The Lead Manager agent merges inbound signals into one Customer.
 */
const socialHandleSchema = new Schema(
  {
    platform: {
      type: String,
      enum: ["instagram", "facebook", "whatsapp", "email", "website", "referral", "other"],
      required: true,
    },
    handle: { type: String, required: true }, // @user, phone, email, or form id
  },
  { _id: false }
);

const customerSchema = new Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true, sparse: true },
    phone: { type: String, trim: true, index: true, sparse: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },

    handles: { type: [socialHandleSchema], default: [] },

    // Preferences learned over time, used to personalise itineraries.
    preferences: {
      travelStyle: { type: String }, // luxury, honeymoon, family, adventure...
      interests: { type: [String], default: [] },
      dietary: { type: [String], default: [] },
      notes: { type: String },
    },

    lifecycle: {
      type: String,
      enum: ["lead", "opportunity", "customer", "repeat", "lost"],
      default: "lead",
      index: true,
    },

    tags: { type: [String], default: [] },
    lifetimeValue: { type: Number, default: 0 }, // sum of paid invoices
  },
  { timestamps: true }
);

// A handle uniquely resolves to at most one customer — the anti-duplicate index.
customerSchema.index({ "handles.platform": 1, "handles.handle": 1 });

export type Customer = InferSchemaType<typeof customerSchema>;
export type CustomerDoc = HydratedDocument<Customer>;
export const CustomerModel = model("Customer", customerSchema);
