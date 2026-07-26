import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Interaction = an inbound or outbound touch on a channel (a DM, a comment, an
 * email, a WhatsApp reply). This is the raw event log the Instagram / Email /
 * WhatsApp agents read from and write to.
 */
const interactionSchema = new Schema(
  {
    customer: { type: Types.ObjectId, ref: "Customer", index: true },
    lead: { type: Types.ObjectId, ref: "Lead", index: true },

    channel: {
      type: String,
      enum: ["instagram", "facebook", "whatsapp", "email", "website", "sms"],
      required: true,
    },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    kind: {
      type: String,
      enum: ["dm", "comment", "story_reply", "mention", "email", "message", "form", "call"],
      default: "message",
    },

    text: { type: String, required: true },
    externalId: { type: String }, // provider message id, for idempotency
    handledBy: { type: String }, // agent name that produced an outbound reply

    createdAtSource: { type: Date }, // timestamp from the provider, if given
  },
  { timestamps: true }
);

interactionSchema.index({ channel: 1, externalId: 1 }, { unique: true, sparse: true });

export type Interaction = InferSchemaType<typeof interactionSchema>;
export type InteractionDoc = HydratedDocument<Interaction>;
export const InteractionModel = model("Interaction", interactionSchema);
