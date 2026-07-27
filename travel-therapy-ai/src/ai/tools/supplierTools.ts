import type { Tool } from "../types.js";
import { SupplierModel } from "../../db/models/index.js";

/**
 * Supplier tools for the Supplier Agent: maintain the supplier database and
 * record rate/availability outreach. (Sending the actual email/WhatsApp is a
 * provider integration; here we persist the drafted message on the supplier.)
 */

export const upsertSupplierTool: Tool = {
  definition: {
    name: "upsert_supplier",
    description:
      "Add or update a supplier (hotel, DMC, transfer, activity, cruise, air, insurance) in the " +
      "database. Matches on name + destination. Use for building out coverage in a destination.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: {
          type: "string",
          enum: ["hotel", "dmc", "transfer", "activity", "cruise", "air", "insurance", "other"],
        },
        destination: { type: "string" },
        country: { type: "string" },
        email: { type: "string" },
        whatsapp: { type: "string" },
        website: { type: "string" },
        contactPerson: { type: "string" },
        rating: { type: "number" },
        preferred: { type: "boolean" },
        notes: { type: "string" },
      },
      required: ["name", "type", "destination"],
    },
  },
  handler: async (input) => {
    const supplier = await SupplierModel.findOneAndUpdate(
      { name: input.name as string, destination: input.destination as string },
      {
        name: input.name,
        type: input.type,
        destination: input.destination,
        country: input.country,
        rating: input.rating,
        preferred: input.preferred,
        notes: input.notes,
        contact: {
          email: input.email,
          whatsapp: input.whatsapp,
          website: input.website,
          contactPerson: input.contactPerson,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return { supplierId: supplier.id, name: supplier.name, type: supplier.type };
  },
};

export const logSupplierOutreachTool: Tool = {
  definition: {
    name: "log_supplier_outreach",
    description:
      "Record a rate/availability request drafted and sent to a supplier. Provide the supplierId " +
      "(from upsert_supplier or search_suppliers) and the message body. Tracks the request so we " +
      "can follow up on no-replies.",
    input_schema: {
      type: "object",
      properties: {
        supplierId: { type: "string" },
        channel: { type: "string", enum: ["email", "whatsapp", "other"] },
        message: { type: "string" },
      },
      required: ["supplierId", "message"],
    },
  },
  handler: async (input) => {
    const supplier = await SupplierModel.findByIdAndUpdate(
      input.supplierId as string,
      {
        $push: {
          outreach: {
            channel: (input.channel as string) ?? "email",
            message: input.message,
            sentAt: new Date(),
            status: "sent",
          },
        },
      },
      { new: true }
    );
    if (!supplier) throw new Error(`Supplier not found: ${input.supplierId}`);
    return { supplierId: supplier.id, outreachCount: supplier.outreach.length };
  },
};

export const supplierTools: Tool[] = [upsertSupplierTool, logSupplierOutreachTool];
