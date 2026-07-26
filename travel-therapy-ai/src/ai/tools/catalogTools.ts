import type { Tool } from "../types.js";
import { ActivityModel, SupplierModel } from "../../db/models/index.js";

/**
 * Read-only catalog tools. The Itinerary Generator uses these to ground plans
 * in real inventory when it exists, and to suggest hotels from preferred
 * suppliers. When the catalog is empty the agent falls back to its own
 * knowledge — the tools simply return an empty list.
 */

export const searchActivitiesTool: Tool = {
  definition: {
    name: "search_activities",
    description:
      "Search the bookable activity catalog for a destination. Returns real inventory to build " +
      "the day-by-day plan from. An empty result means we have no catalog entries there yet — " +
      "use your own knowledge of the destination in that case.",
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string" },
        category: {
          type: "string",
          enum: ["sightseeing", "adventure", "dining", "wellness", "cultural", "nightlife", "transfer", "other"],
        },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["destination"],
    },
  },
  handler: async (input) => {
    const query: Record<string, unknown> = {
      destination: new RegExp(`^${escapeRegex(input.destination as string)}`, "i"),
    };
    if (input.category) query.category = input.category;
    const activities = await ActivityModel.find(query)
      .limit(Math.min(Number(input.limit ?? 20), 50))
      .lean();
    return activities.map((a) => ({
      name: a.name,
      category: a.category,
      description: a.description,
      durationHours: a.durationHours,
      priceFrom: a.priceFrom,
      currency: a.currency,
    }));
  },
};

export const searchSuppliersTool: Tool = {
  definition: {
    name: "search_suppliers",
    description:
      "Search suppliers (hotels, DMCs, transfers, activity providers) for a destination, " +
      "optionally filtered by type. Prefer suppliers flagged `preferred`.",
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string" },
        type: {
          type: "string",
          enum: ["hotel", "dmc", "transfer", "activity", "cruise", "air", "insurance", "other"],
        },
        limit: { type: "number" },
      },
      required: ["destination"],
    },
  },
  handler: async (input) => {
    const query: Record<string, unknown> = {
      destination: new RegExp(`^${escapeRegex(input.destination as string)}`, "i"),
    };
    if (input.type) query.type = input.type;
    const suppliers = await SupplierModel.find(query)
      .sort({ preferred: -1, rating: -1 })
      .limit(Math.min(Number(input.limit ?? 15), 40))
      .lean();
    return suppliers.map((s) => ({
      name: s.name,
      type: s.type,
      rating: s.rating,
      preferred: s.preferred,
      contact: { email: s.contact?.email, whatsapp: s.contact?.whatsapp },
    }));
  },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const catalogTools: Tool[] = [searchActivitiesTool, searchSuppliersTool];
