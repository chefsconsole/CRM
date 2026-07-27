import {
  QuoteModel,
  ItineraryModel,
  LeadModel,
  CustomerModel,
  TripModel,
  type TripDoc,
} from "../db/models/index.js";

/**
 * Convert an accepted quote into a confirmed Trip, advancing every related
 * record: quote → accepted, lead → won, customer → customer lifecycle.
 */
export async function createTripFromQuote(input: {
  quoteId: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<TripDoc> {
  const quote = await QuoteModel.findById(input.quoteId);
  if (!quote) throw new Error(`Quote not found: ${input.quoteId}`);

  const itinerary = await ItineraryModel.findById(quote.itinerary).lean();

  const trip = await TripModel.create({
    customer: quote.customer,
    lead: quote.lead,
    quote: quote._id,
    itinerary: quote.itinerary,
    destination: itinerary?.destination ?? "TBD",
    nights: itinerary?.nights,
    travelers: quote.travelers,
    startDate: input.startDate,
    endDate: input.endDate,
    status: "booked",
    totalValue: quote.total,
    currency: quote.currency,
    // Seed the booking checklist from the itinerary's day plan.
    bookings: [
      { type: "hotel", status: "pending" },
      { type: "transfer", status: "pending" },
      { type: "activity", status: "pending" },
    ],
  });

  quote.status = "accepted";
  await quote.save();
  await LeadModel.findByIdAndUpdate(quote.lead, { status: "won" });
  await CustomerModel.findByIdAndUpdate(quote.customer, { lifecycle: "customer" });

  return trip;
}
