/**
 * Zero-setup, end-to-end demo of the Travel Therapy backbone.
 *
 *   npm run demo
 *
 * Spins up an in-memory MongoDB (no install, no Atlas), then drives the whole
 * NON-AI backbone deterministically so you can verify it works without an
 * Anthropic API key: customer de-duplication, itinerary + quote persistence,
 * the booking flow (trip + deposit invoice), and the scheduler's automated
 * follow-ups (which fall back to templates when no API key is set).
 *
 * Database, in order of preference:
 *   1. DEMO_MONGODB_URI env var (a real Mongo — local mongod or a free Atlas
 *      cluster). Use this when the in-memory binary can't be downloaded.
 *   2. An in-memory MongoDB (mongodb-memory-server) — zero setup, but it
 *      downloads a mongod binary on first run, so it needs open network.
 *
 * If ANTHROPIC_API_KEY is set, it also runs one live agent as a bonus.
 */
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../src/db/connect.js";
import {
  SupplierModel,
  ActivityModel,
  CustomerModel,
  LeadModel,
  QuoteModel,
  TripModel,
  PaymentModel,
  InteractionModel,
} from "../src/db/models/index.js";
import { findOrCreateCustomer } from "../src/services/leadService.js";
import { saveItinerary } from "../src/services/itineraryService.js";
import { createQuoteFromItinerary } from "../src/services/quoteService.js";
import { createTripFromQuote } from "../src/services/bookingService.js";
import { createInvoice } from "../src/services/paymentService.js";
import { runSchedulerTick } from "../src/scheduler/index.js";
import { getAgent } from "../src/ai/registry.js";
import { newContext } from "../src/ai/types.js";
import { env } from "../src/config/env.js";
import { formatMoney } from "../src/utils/money.js";

function h(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

async function main() {
  // Prefer a real Mongo if one is provided; otherwise spin up an in-memory one.
  let mem: { stop: () => Promise<unknown> } | null = null;
  if (process.env.DEMO_MONGODB_URI) {
    console.log(`Using DEMO_MONGODB_URI (${process.env.DEMO_MONGODB_URI.replace(/\/\/[^@]*@/, "//***@")})`);
    await connectDb(process.env.DEMO_MONGODB_URI);
  } else {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    mem = server;
    await connectDb(server.getUri());
  }

  try {
    // --- 1. Seed catalog ---
    h("1. Seed supplier & activity catalog");
    await SupplierModel.insertMany([
      { name: "The Ubud Sanctuary", type: "hotel", destination: "Bali", country: "Indonesia", rating: 5, preferred: true },
      { name: "Bali Bliss DMC", type: "dmc", destination: "Bali", country: "Indonesia", rating: 4.7, preferred: true },
    ]);
    await ActivityModel.insertMany([
      { name: "Private Ubud Rice Terrace Trek", destination: "Bali", category: "adventure", priceFrom: 6000 },
      { name: "Uluwatu Cliffside Dinner", destination: "Bali", category: "dining", priceFrom: 9000 },
    ]);
    console.log(`   suppliers: ${await SupplierModel.countDocuments()}, activities: ${await ActivityModel.countDocuments()}`);

    // --- 2. De-duplication: same person, three channels, ONE customer ---
    h("2. Cross-channel de-duplication (the anti-duplicate-leads guarantee)");
    const c1 = await findOrCreateCustomer({ platform: "instagram", handle: "@aisha", name: "Aisha" });
    const c2 = await findOrCreateCustomer({ platform: "instagram", handle: "@aisha", email: "aisha@example.com" });
    const c3 = await findOrCreateCustomer({ platform: "whatsapp", handle: "+91-99999", email: "aisha@example.com" });
    console.log(`   3 inbound touches → customers created: ${await CustomerModel.countDocuments()} (expected 1)`);
    console.log(`   same id across channels: ${c1.id === c2.id && c2.id === c3.id}`);

    // --- 3. Lead → itinerary → quote ---
    h("3. Capture a lead, generate an itinerary, and quote it");
    const lead = await LeadModel.create({
      customer: c1.id,
      source: "instagram",
      destination: "Bali",
      month: "December",
      nights: 6,
      travelers: 2,
      budget: 200000,
      occasion: "honeymoon",
      status: "qualified",
      score: 80,
    });
    const itinerary = await saveItinerary({
      leadId: lead.id,
      customerId: c1.id,
      destination: "Bali",
      nights: 6,
      travelers: 2,
      summary: "6-night Bali honeymoon — Ubud jungle then Uluwatu clifftops.",
      highlights: ["Private pool villa", "Cliffside sunset dinner", "Couples spa ritual"],
      days: [
        { day: 1, title: "Arrival in Ubud", description: "Private transfer, villa check-in, evening at leisure.", activities: [] },
        { day: 2, title: "Rice terraces & spa", description: "Sunrise trek then a couples spa ritual.", activities: ["Private Ubud Rice Terrace Trek"] },
        { day: 6, title: "Departure", description: "Leisurely breakfast and airport transfer.", activities: [] },
      ],
      costing: { currency: "INR", perPerson: 95000, total: 190000, lines: [
        { label: "Hotels", amount: 110000 }, { label: "Transfers", amount: 20000 }, { label: "Activities", amount: 60000 },
      ] },
    });
    const quote = await createQuoteFromItinerary({
      itineraryId: itinerary.id,
      perPerson: 95000,
      travelers: 2,
      inclusions: ["6 nights accommodation", "All transfers", "Listed activities", "Daily breakfast"],
      exclusions: ["International flights", "Visa", "Travel insurance"],
    });
    console.log(`   itinerary days: ${itinerary.days.length}, quote ${quote.reference} total ${formatMoney(quote.total)}`);
    console.log(`   lead advanced to: ${(await LeadModel.findById(lead.id))!.status} (expected proposal_sent)`);

    // --- 4. Booking flow: accept the quote → trip + deposit invoice ---
    h("4. Customer accepts → booking flow (deterministic, no LLM in the money path)");
    const trip = await createTripFromQuote({ quoteId: quote.id });
    const invoice = await createInvoice({ tripId: trip.id, amount: Math.round(quote.total * 0.25), kind: "deposit", dueInDays: 7 });
    console.log(`   trip ${trip.id} status=${trip.status}, deposit invoice ${invoice.reference} ${formatMoney(invoice.amount)}`);
    console.log(`   quote now: ${(await QuoteModel.findById(quote.id))!.status}, lead now: ${(await LeadModel.findById(lead.id))!.status}`);

    // --- 5. Scheduler: make items due, run one pass ---
    h("5. Scheduler sweep — automated follow-ups & reminders (template fallback, no key)");
    const past = new Date(Date.now() - 86_400_000);
    await LeadModel.create({ customer: c1.id, source: "website", destination: "Japan", status: "qualifying", score: 40, nextFollowUpAt: past });
    await QuoteModel.findByIdAndUpdate(quote.id, { status: "sent", nextFollowUpAt: past, validUntil: new Date(Date.now() + 5 * 86_400_000) });
    await PaymentModel.findByIdAndUpdate(invoice.id, { nextReminderAt: past });
    const summary = await runSchedulerTick();
    console.log(`   drafted → leads:${summary.leads} quotes:${summary.quotes} invoices:${summary.invoices}`);
    for (const d of summary.drafted) console.log(`     [${d.type}/${d.channel}] ${d.message.slice(0, 90)}…`);

    // --- 6. Final CRM state ---
    h("6. Resulting CRM state");
    console.log({
      customers: await CustomerModel.countDocuments(),
      leads: await LeadModel.countDocuments(),
      quotes: await QuoteModel.countDocuments(),
      trips: await TripModel.countDocuments(),
      payments: await PaymentModel.countDocuments(),
      interactions: await InteractionModel.countDocuments(),
    });

    // --- 7. Bonus: a live agent, only if a key is configured ---
    h("7. Live agent (only if ANTHROPIC_API_KEY is set)");
    if (env.anthropicApiKey) {
      const ctx = newContext();
      const res = await getAgent("travel-consultant").run(
        "One-line pitch for a 6-night Bali honeymoon in December, budget ₹2L for two.",
        ctx
      );
      console.log(`   travel-consultant: ${res.text}`);
    } else {
      console.log("   skipped — set ANTHROPIC_API_KEY to see the AI employees run.");
    }

    console.log("\n\x1b[32m✓ Demo complete — the full backbone ran end-to-end.\x1b[0m");
  } finally {
    await disconnectDb();
    await mongoose.disconnect().catch(() => {});
    if (mem) await mem.stop();
  }
}

main().catch((err) => {
  console.error("demo failed:", err);
  process.exit(1);
});
