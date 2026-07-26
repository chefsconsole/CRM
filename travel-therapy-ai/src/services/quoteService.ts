import { ItineraryModel, LeadModel, QuoteModel, type QuoteDoc } from "../db/models/index.js";
import { env } from "../config/env.js";

export interface CreateQuoteInput {
  itineraryId: string;
  perPerson: number;
  travelers?: number;
  currency?: string;
  inclusions?: string[];
  exclusions?: string[];
  terms?: string;
  validDays?: number;
}

/** Human-friendly, unique quote reference like TT-2026-0042. */
async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await QuoteModel.countDocuments({
    reference: new RegExp(`^TT-${year}-`),
  });
  const seq = String(count + 1).padStart(4, "0");
  return `TT-${year}-${seq}`;
}

export async function createQuoteFromItinerary(input: CreateQuoteInput): Promise<QuoteDoc> {
  const itinerary = await ItineraryModel.findById(input.itineraryId);
  if (!itinerary) throw new Error(`Itinerary not found: ${input.itineraryId}`);

  const travelers = input.travelers ?? itinerary.travelers ?? 2;
  const total = input.perPerson * travelers;
  const validDays = input.validDays ?? 14;

  const quote = await QuoteModel.create({
    lead: itinerary.lead,
    customer: itinerary.customer,
    itinerary: itinerary._id,
    reference: await nextReference(),
    currency: input.currency ?? itinerary.costing?.currency ?? env.company.currency,
    perPerson: input.perPerson,
    travelers,
    total,
    inclusions: input.inclusions ?? [],
    exclusions: input.exclusions ?? [],
    terms: input.terms,
    status: "draft",
    validUntil: new Date(Date.now() + validDays * 86_400_000),
  });

  // Advance the lead to proposal stage.
  await LeadModel.findByIdAndUpdate(itinerary.lead, { status: "proposal_sent" });

  return quote;
}
