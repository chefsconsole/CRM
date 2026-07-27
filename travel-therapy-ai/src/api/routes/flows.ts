import { Router } from "express";
import { asyncHandler } from "../middleware/error.js";
import { getAgent } from "../../ai/registry.js";
import { newContext } from "../../ai/types.js";
import { LeadModel, QuoteModel } from "../../db/models/index.js";
import { createTripFromQuote } from "../../services/bookingService.js";
import { createInvoice } from "../../services/paymentService.js";

export const flowsRouter = Router();

/**
 * The end-to-end B2C pipeline, orchestrated across employees:
 *
 *   inbound message → Lead Manager (capture, de-dupe) →
 *   [if qualified] Itinerary Generator → Quotation Agent
 *
 * POST /api/flows/inbound
 * body: {
 *   channel: "instagram" | "whatsapp" | "website" | "email" | ...,
 *   handle:  string,             // @user / phone / email / form id
 *   message: string,             // what the customer said
 *   name?, email?, phone?,
 *   autoQuote?: boolean          // run itinerary + quote if the lead qualifies (default true)
 * }
 */
flowsRouter.post(
  "/inbound",
  asyncHandler(async (req, res) => {
    const { channel, handle, message, name, email, phone, autoQuote = true } = req.body ?? {};
    if (!channel || !handle || !message) {
      res.status(400).json({ error: "Body must include channel, handle, and message." });
      return;
    }

    const ctx = newContext();
    ctx.scratch.agentName = "lead-manager";

    // 1. Capture + de-dupe the lead.
    const capturePrompt = [
      `New inbound message on ${channel} from handle "${handle}".`,
      name ? `Name: ${name}.` : "",
      email ? `Email: ${email}.` : "",
      phone ? `Phone: ${phone}.` : "",
      `Message: "${message}"`,
      `Capture this into the CRM.`,
    ]
      .filter(Boolean)
      .join(" ");

    const capture = await getAgent("lead-manager").run(capturePrompt, ctx);

    const steps: Record<string, unknown> = { capture };
    const result: Record<string, unknown> = {
      customerId: ctx.customerId,
      leadId: ctx.leadId,
      steps,
    };

    // 2. Decide whether to auto-generate a proposal.
    const lead = ctx.leadId ? await LeadModel.findById(ctx.leadId).lean() : null;
    const qualified =
      autoQuote && lead && lead.destination && (lead.nights || lead.month) && (lead.score ?? 0) >= 50;

    if (!qualified) {
      result.qualified = false;
      res.json(result);
      return;
    }

    result.qualified = true;

    // 3. Generate the itinerary (shares the same context → itineraryId lands in scratch).
    const brief = [
      `Design an itinerary for lead ${ctx.leadId}.`,
      `Destination: ${lead.destination}.`,
      lead.nights ? `Nights: ${lead.nights}.` : lead.month ? `Around: ${lead.month}.` : "",
      lead.travelers ? `Travelers: ${lead.travelers}.` : "",
      lead.budget ? `Budget (total, ${req.body.currency ?? "company currency"}): ${lead.budget}.` : "",
      lead.occasion ? `Occasion: ${lead.occasion}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const itinCtx = newContext({ customerId: ctx.customerId, leadId: ctx.leadId });
    itinCtx.scratch.agentName = "itinerary-generator";
    steps.itinerary = await getAgent("itinerary-generator").run(brief, itinCtx);
    const itineraryId = itinCtx.scratch.itineraryId as string | undefined;
    result.itineraryId = itineraryId;

    // 4. Quote it.
    if (itineraryId && lead.budget) {
      const perPerson = Math.round(lead.budget / (lead.travelers || 2));
      const quoteCtx = newContext({ customerId: ctx.customerId, leadId: ctx.leadId });
      quoteCtx.scratch.itineraryId = itineraryId;
      quoteCtx.scratch.agentName = "quotation-agent";
      steps.quote = await getAgent("quotation-agent").run(
        `Create and draft a quote for itinerary ${itineraryId} at about ${perPerson} per person for ${lead.travelers || 2} travelers.`,
        quoteCtx
      );
    }

    res.json(result);
  })
);

/**
 * Booking flow: a customer accepts a quote. Deterministic (no LLM in the money
 * path): create the trip, then raise a deposit invoice. The scheduler then
 * chases the invoice automatically.
 *
 * POST /api/flows/accept-quote
 * body: { quoteId, startDate?, endDate?, depositPercent? }  (deposit default 25%)
 */
flowsRouter.post(
  "/accept-quote",
  asyncHandler(async (req, res) => {
    const { quoteId, startDate, endDate, depositPercent = 25 } = req.body ?? {};
    if (!quoteId) {
      res.status(400).json({ error: "Body must include quoteId." });
      return;
    }
    const quote = await QuoteModel.findById(quoteId).lean();
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }

    const trip = await createTripFromQuote({
      quoteId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    const depositAmount = Math.round((quote.total * depositPercent) / 100);
    const invoice = await createInvoice({
      tripId: trip.id,
      amount: depositAmount,
      kind: "deposit",
      dueInDays: 7,
    });

    res.json({
      tripId: trip.id,
      invoice: { id: invoice.id, reference: invoice.reference, amount: invoice.amount, dueDate: invoice.dueDate },
    });
  })
);
