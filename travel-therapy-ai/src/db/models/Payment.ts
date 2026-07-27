import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Payment = an invoice raised against a trip, and the record of it being paid.
 * The Finance/booking flow raises these; the scheduler chases overdue ones.
 */
const paymentSchema = new Schema(
  {
    customer: { type: Types.ObjectId, ref: "Customer", required: true, index: true },
    trip: { type: Types.ObjectId, ref: "Trip", index: true },
    quote: { type: Types.ObjectId, ref: "Quote" },

    reference: { type: String, required: true, unique: true }, // INV-2026-0042
    kind: { type: String, enum: ["deposit", "balance", "full"], default: "deposit" },

    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },

    status: {
      type: String,
      enum: ["due", "paid", "overdue", "refunded", "cancelled"],
      default: "due",
      index: true,
    },

    dueDate: { type: Date, index: true },
    paidAt: { type: Date },
    method: { type: String }, // card, upi, bank_transfer...
    nextReminderAt: { type: Date, index: true },
  },
  { timestamps: true }
);

export type Payment = InferSchemaType<typeof paymentSchema>;
export type PaymentDoc = HydratedDocument<Payment>;
export const PaymentModel = model("Payment", paymentSchema);
