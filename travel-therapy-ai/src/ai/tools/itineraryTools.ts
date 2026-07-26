import type { Tool } from "../types.js";
import { saveItinerary } from "../../services/itineraryService.js";
import { createQuoteFromItinerary } from "../../services/quoteService.js";

/**
 * Tools that let the Itinerary Generator and Quotation Agent persist their
 * output as first-class CRM records (rather than returning loose text).
 */

export const saveItineraryTool: Tool = {
  definition: {
    name: "save_itinerary",
    description:
      "Persist a complete day-by-day itinerary for the current lead. Provide the full plan: " +
      "summary, highlights, an array of days (each with a title, description, activities, meals, " +
      "and optional hotel suggestion), and a costing breakdown. Returns the itineraryId.",
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        customerId: { type: "string" },
        destination: { type: "string" },
        nights: { type: "number" },
        travelers: { type: "number" },
        summary: { type: "string" },
        highlights: { type: "array", items: { type: "string" } },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "number" },
              title: { type: "string" },
              description: { type: "string" },
              city: { type: "string" },
              hotelSuggestion: { type: "string" },
              activities: { type: "array", items: { type: "string" } },
              meals: { type: "array", items: { type: "string" } },
            },
            required: ["day", "title", "description"],
          },
        },
        costing: {
          type: "object",
          properties: {
            currency: { type: "string" },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: { label: { type: "string" }, amount: { type: "number" } },
                required: ["label", "amount"],
              },
            },
            perPerson: { type: "number" },
            total: { type: "number" },
          },
        },
      },
      required: ["destination", "nights", "summary", "days"],
    },
  },
  handler: async (input, ctx) => {
    const itinerary = await saveItinerary({
      leadId: (input.leadId as string) ?? ctx.leadId,
      customerId: (input.customerId as string) ?? ctx.customerId,
      destination: input.destination as string,
      nights: input.nights as number,
      travelers: input.travelers as number | undefined,
      summary: input.summary as string,
      highlights: (input.highlights as string[]) ?? [],
      days: (input.days as any[]) ?? [],
      costing: input.costing as any,
    });
    ctx.scratch.itineraryId = itinerary.id;
    return { itineraryId: itinerary.id, total: itinerary.costing?.total };
  },
};

export const createQuoteTool: Tool = {
  definition: {
    name: "create_quote",
    description:
      "Turn a saved itinerary into a priced, sendable quote with a reference number. Provide the " +
      "itineraryId, per-person price, traveler count, inclusions and exclusions. Returns the quote " +
      "reference and total.",
    input_schema: {
      type: "object",
      properties: {
        itineraryId: { type: "string" },
        perPerson: { type: "number" },
        travelers: { type: "number" },
        currency: { type: "string" },
        inclusions: { type: "array", items: { type: "string" } },
        exclusions: { type: "array", items: { type: "string" } },
        terms: { type: "string" },
        validDays: { type: "number", description: "Days the quote stays valid (default 14)" },
      },
      required: ["perPerson"],
    },
  },
  handler: async (input, ctx) => {
    const itineraryId = (input.itineraryId as string) ?? (ctx.scratch.itineraryId as string);
    if (!itineraryId) throw new Error("No itineraryId — save the itinerary first");
    const quote = await createQuoteFromItinerary({
      itineraryId,
      perPerson: input.perPerson as number,
      travelers: input.travelers as number | undefined,
      currency: input.currency as string | undefined,
      inclusions: (input.inclusions as string[]) ?? [],
      exclusions: (input.exclusions as string[]) ?? [],
      terms: input.terms as string | undefined,
      validDays: input.validDays as number | undefined,
    });
    return { quoteId: quote.id, reference: quote.reference, total: quote.total };
  },
};

export const itineraryTools: Tool[] = [saveItineraryTool, createQuoteTool];
