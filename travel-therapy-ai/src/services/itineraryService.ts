import { ItineraryModel, LeadModel, type ItineraryDoc } from "../db/models/index.js";
import { env } from "../config/env.js";

export interface SaveItineraryInput {
  leadId?: string;
  customerId?: string;
  destination: string;
  nights: number;
  travelers?: number;
  summary: string;
  highlights?: string[];
  days: Array<{
    day: number;
    title: string;
    description: string;
    city?: string;
    hotelSuggestion?: string;
    activities?: string[];
    meals?: string[];
  }>;
  costing?: {
    currency?: string;
    lines?: Array<{ label: string; amount: number }>;
    perPerson?: number;
    total?: number;
  };
}

export async function saveItinerary(input: SaveItineraryInput): Promise<ItineraryDoc> {
  let { leadId, customerId } = input;

  // If we have a lead but not a customer, resolve the customer from it.
  if (leadId && !customerId) {
    const lead = await LeadModel.findById(leadId).lean();
    if (lead) customerId = String(lead.customer);
  }
  if (!leadId || !customerId) {
    throw new Error("saveItinerary requires both a leadId and a customerId in context");
  }

  const currency = input.costing?.currency ?? env.company.currency;
  const total =
    input.costing?.total ??
    (input.costing?.perPerson ? input.costing.perPerson * (input.travelers ?? 2) : undefined);

  const itinerary = await ItineraryModel.create({
    lead: leadId,
    customer: customerId,
    destination: input.destination,
    nights: input.nights,
    travelers: input.travelers ?? 2,
    summary: input.summary,
    highlights: input.highlights ?? [],
    days: input.days,
    costing: {
      currency,
      lines: input.costing?.lines ?? [],
      perPerson: input.costing?.perPerson,
      total,
    },
  });

  return itinerary;
}
