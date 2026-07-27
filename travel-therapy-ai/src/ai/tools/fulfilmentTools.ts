import type { Tool } from "../types.js";
import { TripModel } from "../../db/models/index.js";
import { createTripFromQuote } from "../../services/bookingService.js";
import { createInvoice, recordPayment } from "../../services/paymentService.js";

/**
 * Post-sale tools: turn an accepted quote into a trip, raise invoices, record
 * payments, and attach travel documents.
 */

export const createTripTool: Tool = {
  definition: {
    name: "create_trip_from_quote",
    description:
      "Convert an accepted quote into a confirmed trip. Advances the quote to accepted, the lead to " +
      "won, and the customer to the 'customer' lifecycle. Optionally set start/end dates (ISO).",
    input_schema: {
      type: "object",
      properties: {
        quoteId: { type: "string" },
        startDate: { type: "string", description: "ISO date" },
        endDate: { type: "string", description: "ISO date" },
      },
      required: ["quoteId"],
    },
  },
  handler: async (input, ctx) => {
    const trip = await createTripFromQuote({
      quoteId: input.quoteId as string,
      startDate: input.startDate ? new Date(input.startDate as string) : undefined,
      endDate: input.endDate ? new Date(input.endDate as string) : undefined,
    });
    ctx.scratch.tripId = trip.id;
    return { tripId: trip.id, destination: trip.destination, total: trip.totalValue };
  },
};

export const createInvoiceTool: Tool = {
  definition: {
    name: "create_invoice",
    description: "Raise an invoice against a trip (deposit, balance, or full). Amount in trip currency.",
    input_schema: {
      type: "object",
      properties: {
        tripId: { type: "string" },
        amount: { type: "number" },
        kind: { type: "string", enum: ["deposit", "balance", "full"] },
        dueInDays: { type: "number" },
      },
      required: ["amount"],
    },
  },
  handler: async (input, ctx) => {
    const invoice = await createInvoice({
      tripId: (input.tripId as string) ?? (ctx.scratch.tripId as string),
      amount: input.amount as number,
      kind: input.kind as "deposit" | "balance" | "full" | undefined,
      dueInDays: input.dueInDays as number | undefined,
    });
    return { invoiceId: invoice.id, reference: invoice.reference, dueDate: invoice.dueDate };
  },
};

export const recordPaymentTool: Tool = {
  definition: {
    name: "record_payment",
    description: "Mark an invoice as paid and credit the customer's lifetime value.",
    input_schema: {
      type: "object",
      properties: {
        invoiceId: { type: "string" },
        method: { type: "string", description: "card, upi, bank_transfer..." },
      },
      required: ["invoiceId"],
    },
  },
  handler: async (input) => {
    const invoice = await recordPayment({
      invoiceId: input.invoiceId as string,
      method: input.method as string | undefined,
    });
    return { invoiceId: invoice.id, status: invoice.status, paidAt: invoice.paidAt };
  },
};

export const addTravelDocumentTool: Tool = {
  definition: {
    name: "add_travel_document",
    description: "Attach a travel document (voucher, ticket, visa, insurance, invoice) to a trip.",
    input_schema: {
      type: "object",
      properties: {
        tripId: { type: "string" },
        name: { type: "string" },
        kind: {
          type: "string",
          enum: ["voucher", "ticket", "itinerary", "visa", "insurance", "invoice", "other"],
        },
        url: { type: "string" },
      },
      required: ["name"],
    },
  },
  handler: async (input, ctx) => {
    const tripId = (input.tripId as string) ?? (ctx.scratch.tripId as string);
    if (!tripId) throw new Error("No tripId in context");
    const trip = await TripModel.findByIdAndUpdate(
      tripId,
      { $push: { travelDocuments: { name: input.name, kind: (input.kind as string) ?? "other", url: input.url } } },
      { new: true }
    );
    if (!trip) throw new Error(`Trip not found: ${tripId}`);
    return { tripId: trip.id, documents: trip.travelDocuments.length };
  },
};

export const fulfilmentTools: Tool[] = [
  createTripTool,
  createInvoiceTool,
  recordPaymentTool,
  addTravelDocumentTool,
];
