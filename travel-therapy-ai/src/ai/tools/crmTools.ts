import type { Tool } from "../types.js";
import { CustomerModel, LeadModel, InteractionModel } from "../../db/models/index.js";
import { findOrCreateCustomer } from "../../services/leadService.js";

/**
 * CRM tool surface shared by the Lead Manager, Instagram, and Customer Success
 * agents. Each tool maps to a concrete, auditable database operation — the
 * agents never touch the CRM "by hand".
 */

export const findOrCreateCustomerTool: Tool = {
  definition: {
    name: "find_or_create_customer",
    description:
      "Resolve an inbound contact to a single de-duplicated customer profile. " +
      "Matches on email, phone, or a social handle; creates a new customer only if none match. " +
      "Always call this first when handling a new inbound message so we never create duplicate leads.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Person's name, if known" },
        email: { type: "string" },
        phone: { type: "string" },
        platform: {
          type: "string",
          enum: ["instagram", "facebook", "whatsapp", "email", "website", "referral", "other"],
          description: "Channel the contact arrived on",
        },
        handle: { type: "string", description: "Their identifier on that platform (@user, phone, email)" },
        city: { type: "string" },
      },
      required: ["platform", "handle"],
    },
  },
  handler: async (input, ctx) => {
    const customer = await findOrCreateCustomer({
      name: input.name as string | undefined,
      email: input.email as string | undefined,
      phone: input.phone as string | undefined,
      platform: input.platform as string,
      handle: input.handle as string,
      city: input.city as string | undefined,
    });
    ctx.customerId = customer.id;
    return { customerId: customer.id, name: customer.name, isNew: customer.wasCreated };
  },
};

export const upsertLeadTool: Tool = {
  definition: {
    name: "upsert_lead",
    description:
      "Create or update the trip enquiry (lead) for the current customer. Fill in whatever " +
      "trip details are known (destination, month, nights, travelers, budget, occasion) and set " +
      "a qualification score 0-100. Call find_or_create_customer first to get the customerId.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        source: {
          type: "string",
          enum: ["instagram", "facebook", "whatsapp", "website", "email", "referral", "ad", "other"],
        },
        destination: { type: "string" },
        month: { type: "string" },
        nights: { type: "number" },
        travelers: { type: "number" },
        departureCity: { type: "string" },
        budget: { type: "number" },
        occasion: { type: "string" },
        status: {
          type: "string",
          enum: ["new", "qualifying", "qualified", "proposal_sent", "won", "lost", "nurture"],
        },
        summary: { type: "string", description: "One-line summary of the enquiry" },
        score: { type: "number", description: "Qualification score 0-100" },
      },
      required: ["customerId", "source"],
    },
  },
  handler: async (input, ctx) => {
    const customerId = (input.customerId as string) ?? ctx.customerId;
    if (!customerId) throw new Error("customerId is required (call find_or_create_customer first)");

    // Reuse the customer's most recent open lead, or create a new one.
    let lead = await LeadModel.findOne({
      customer: customerId,
      status: { $nin: ["won", "lost"] },
    }).sort({ createdAt: -1 });

    const patch = {
      customer: customerId,
      source: input.source,
      destination: input.destination,
      month: input.month,
      nights: input.nights,
      travelers: input.travelers,
      departureCity: input.departureCity,
      budget: input.budget,
      occasion: input.occasion,
      status: input.status,
      summary: input.summary,
      score: input.score,
    };
    // Drop undefined so we never overwrite known fields with blanks.
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
      if (patch[k] === undefined) delete patch[k];
    }

    if (lead) {
      lead.set(patch);
      await lead.save();
    } else {
      lead = await LeadModel.create(patch);
    }
    ctx.leadId = lead.id;
    return { leadId: lead.id, status: lead.status, score: lead.score };
  },
};

export const logInteractionTool: Tool = {
  definition: {
    name: "log_interaction",
    description: "Record an inbound or outbound message/comment on a channel against the customer.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        channel: { type: "string", enum: ["instagram", "facebook", "whatsapp", "email", "website", "sms"] },
        direction: { type: "string", enum: ["inbound", "outbound"] },
        kind: {
          type: "string",
          enum: ["dm", "comment", "story_reply", "mention", "email", "message", "form", "call"],
        },
        text: { type: "string" },
      },
      required: ["channel", "direction", "text"],
    },
  },
  handler: async (input, ctx) => {
    const doc = await InteractionModel.create({
      customer: (input.customerId as string) ?? ctx.customerId,
      lead: ctx.leadId,
      channel: input.channel,
      direction: input.direction,
      kind: (input.kind as string) ?? "message",
      text: input.text,
      handledBy: input.direction === "outbound" ? ctx.scratch.agentName : undefined,
    });
    return { interactionId: doc.id };
  },
};

export const scheduleFollowUpTool: Tool = {
  definition: {
    name: "schedule_follow_up",
    description:
      "Set the next follow-up time on the current lead (e.g. chase after 24h if no reply). " +
      "Provide hoursFromNow.",
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        hoursFromNow: { type: "number", description: "How many hours from now to follow up" },
        note: { type: "string" },
      },
      required: ["hoursFromNow"],
    },
  },
  handler: async (input, ctx) => {
    const leadId = (input.leadId as string) ?? ctx.leadId;
    if (!leadId) throw new Error("No lead in context to schedule a follow-up for");
    const when = new Date(Date.now() + (input.hoursFromNow as number) * 3600_000);
    await LeadModel.findByIdAndUpdate(leadId, { nextFollowUpAt: when, lastContactedAt: new Date() });
    return { nextFollowUpAt: when.toISOString() };
  },
};

export const crmTools: Tool[] = [
  findOrCreateCustomerTool,
  upsertLeadTool,
  logInteractionTool,
  scheduleFollowUpTool,
];
