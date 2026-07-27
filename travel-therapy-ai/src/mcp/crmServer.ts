/**
 * mcp-crm — a Model Context Protocol server exposing the Travel Therapy CRM as
 * tools any MCP client (Claude Desktop, other agents, the future HotelBridge
 * platform) can call. Speaks JSON-RPC over stdio; all logs go to stderr so the
 * protocol stream on stdout stays clean.
 *
 * Run:  npm run mcp:crm
 * Then register it in an MCP client config as a stdio server.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { connectDb } from "../db/connect.js";
import {
  LeadModel,
  ActivityModel,
  ItineraryModel,
  QuoteModel,
  SupplierModel,
  PaymentModel,
} from "../db/models/index.js";
import { findOrCreateCustomer } from "../services/leadService.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("mcp-crm");

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

async function main() {
  await connectDb();

  const server = new McpServer({ name: "mcp-crm", version: "0.1.0" });

  server.tool(
    "find_or_create_customer",
    "Resolve an inbound contact to a single de-duplicated customer profile (creates one only if no match).",
    {
      platform: z.enum(["instagram", "facebook", "whatsapp", "email", "website", "referral", "other"]),
      handle: z.string(),
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      city: z.string().optional(),
    },
    async (args) => {
      const c = await findOrCreateCustomer(args);
      return text({ customerId: c.id, name: c.name, wasCreated: c.wasCreated });
    }
  );

  server.tool(
    "list_leads",
    "List recent leads, optionally filtered by status.",
    {
      status: z
        .enum(["new", "qualifying", "qualified", "proposal_sent", "won", "lost", "nurture"])
        .optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ status, limit }) => {
      const filter = status ? { status } : {};
      const leads = await LeadModel.find(filter)
        .populate("customer", "name email")
        .sort({ createdAt: -1 })
        .limit(limit ?? 20)
        .lean();
      return text(leads);
    }
  );

  server.tool(
    "get_lead",
    "Fetch a single lead with its itineraries and quotes.",
    { leadId: z.string() },
    async ({ leadId }) => {
      const lead = await LeadModel.findById(leadId).populate("customer").lean();
      if (!lead) return text({ error: "Lead not found" });
      const [itineraries, quotes] = await Promise.all([
        ItineraryModel.find({ lead: leadId }).lean(),
        QuoteModel.find({ lead: leadId }).lean(),
      ]);
      return text({ lead, itineraries, quotes });
    }
  );

  server.tool(
    "search_activities",
    "Search the bookable activity catalog for a destination.",
    {
      destination: z.string(),
      category: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ destination, category, limit }) => {
      const query: Record<string, unknown> = {
        destination: new RegExp(`^${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
      };
      if (category) query.category = category;
      const activities = await ActivityModel.find(query).limit(limit ?? 20).lean();
      return text(activities);
    }
  );

  server.tool(
    "upsert_supplier",
    "Add or update a supplier (hotel, DMC, transfer, activity, etc.) in the database.",
    {
      name: z.string(),
      type: z.enum(["hotel", "dmc", "transfer", "activity", "cruise", "air", "insurance", "other"]),
      destination: z.string(),
      country: z.string().optional(),
      email: z.string().optional(),
      rating: z.number().min(0).max(5).optional(),
      preferred: z.boolean().optional(),
    },
    async (args) => {
      const supplier = await SupplierModel.findOneAndUpdate(
        { name: args.name, destination: args.destination },
        {
          name: args.name,
          type: args.type,
          destination: args.destination,
          country: args.country,
          rating: args.rating,
          preferred: args.preferred,
          contact: { email: args.email },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return text({ supplierId: supplier.id, name: supplier.name });
    }
  );

  server.tool(
    "list_due_followups",
    "List everything currently due for follow-up: leads, quote chases, and payment reminders.",
    {},
    async () => {
      const now = new Date();
      const [leads, quotes, invoices] = await Promise.all([
        LeadModel.find({ nextFollowUpAt: { $lte: now }, status: { $nin: ["won", "lost"] } })
          .populate("customer", "name")
          .lean(),
        QuoteModel.find({ nextFollowUpAt: { $lte: now }, status: { $in: ["sent", "viewed"] } }).lean(),
        PaymentModel.find({ nextReminderAt: { $lte: now }, status: { $in: ["due", "overdue"] } }).lean(),
      ]);
      return text({ leads, quotes, invoices });
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("ready", { transport: "stdio" });
}

main().catch((err) => {
  log.error("fatal", { error: String(err) });
  process.exit(1);
});
