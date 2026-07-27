import { Agent } from "../ai/agent.js";
import { brandPreamble } from "../ai/agents/shared.js";
import {
  LeadModel,
  QuoteModel,
  PaymentModel,
  CustomerModel,
  InteractionModel,
  type CustomerDoc,
} from "../db/models/index.js";
import { formatMoney } from "../utils/money.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("scheduler");

const VALID_CHANNELS = ["instagram", "facebook", "whatsapp", "email", "website", "sms"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

/**
 * A lightweight, tool-less drafting employee used only by the scheduler to
 * write follow-up copy. Kept separate from the public roster. If no API key is
 * configured (or the call fails), the worker falls back to a template — so the
 * automation still advances state and logs a message either way.
 */
let drafter: Agent | null = null;
function getDrafter(): Agent {
  if (!drafter) {
    drafter = new Agent({
      name: "follow-up-writer",
      role: "Follow-up Writer",
      maxTokens: 800,
      system: [
        brandPreamble(),
        "You write a single short, warm follow-up message (2-3 sentences) for the given situation.",
        "Return only the message text — no preamble, no quotes.",
      ].join("\n"),
    });
  }
  return drafter;
}

async function draftOrTemplate(instruction: string, fallback: string): Promise<string> {
  try {
    const result = await getDrafter().run(instruction);
    return result.text.trim() || fallback;
  } catch (err) {
    log.warn("draft_fallback", { error: String(err) });
    return fallback;
  }
}

function pickChannel(customer: CustomerDoc | null): Channel {
  const platform = customer?.handles?.[0]?.platform;
  if (platform && (VALID_CHANNELS as readonly string[]).includes(platform)) return platform as Channel;
  return "email";
}

export interface TickSummary {
  ranAt: string;
  leads: number;
  quotes: number;
  invoices: number;
  drafted: Array<{ type: "lead" | "quote" | "invoice"; id: string; channel: Channel; message: string }>;
}

/**
 * Process everything that is due right now: lead follow-ups, quote chases, and
 * payment reminders. Idempotent per due-window: each item's next-touch time is
 * advanced (or cleared) so it won't be reprocessed on the following tick.
 */
export async function runSchedulerTick(now: Date = new Date()): Promise<TickSummary> {
  const summary: TickSummary = { ranAt: now.toISOString(), leads: 0, quotes: 0, invoices: 0, drafted: [] };

  // 1. Lead follow-ups.
  const dueLeads = await LeadModel.find({
    nextFollowUpAt: { $lte: now },
    status: { $nin: ["won", "lost"] },
  }).limit(25);

  for (const lead of dueLeads) {
    const customer = await CustomerModel.findById(lead.customer);
    const name = customer?.name ?? "there";
    const channel = pickChannel(customer);
    const message = await draftOrTemplate(
      `Follow up with ${name} about their ${lead.destination ?? "trip"} enquiry` +
        `${lead.month ? ` around ${lead.month}` : ""}. We haven't heard back; nudge gently and offer to help.`,
      `Hi ${name}, just following up on your ${lead.destination ?? "trip"} plans — happy to put together a tailored itinerary whenever you're ready. Anything I can help pin down?`
    );

    await InteractionModel.create({
      customer: lead.customer,
      lead: lead._id,
      channel,
      direction: "outbound",
      kind: "message",
      text: message,
      handledBy: "scheduler:follow-up-writer",
    });

    // Advance state so we don't loop. After ~3 weeks, drop to nurture.
    const ageDays = (now.getTime() - new Date(lead.createdAt as Date).getTime()) / 86_400_000;
    if (ageDays > 21) {
      lead.status = "nurture";
      lead.nextFollowUpAt = undefined;
    } else {
      lead.nextFollowUpAt = new Date(now.getTime() + 3 * 86_400_000);
    }
    lead.lastContactedAt = now;
    await lead.save();

    summary.leads++;
    summary.drafted.push({ type: "lead", id: lead.id, channel, message });
  }

  // 2. Quote chases.
  const dueQuotes = await QuoteModel.find({
    nextFollowUpAt: { $lte: now },
    status: { $in: ["sent", "viewed"] },
  }).limit(25);

  for (const quote of dueQuotes) {
    // Expire quotes past their validity instead of chasing them.
    if (quote.validUntil && quote.validUntil < now) {
      quote.status = "expired";
      quote.nextFollowUpAt = undefined;
      await quote.save();
      continue;
    }
    const customer = await CustomerModel.findById(quote.customer);
    const name = customer?.name ?? "there";
    const channel = pickChannel(customer);
    const total = formatMoney(quote.total, quote.currency);
    const message = await draftOrTemplate(
      `Chase quote ${quote.reference} (${total}) with ${name}. It's valid until ${quote.validUntil?.toDateString()}. Encourage them to confirm.`,
      `Hi ${name}, just checking in on your proposal ${quote.reference} (${total}). It's held until ${quote.validUntil?.toDateString() ?? "soon"} — shall we lock it in?`
    );

    await InteractionModel.create({
      customer: quote.customer,
      lead: quote.lead,
      channel,
      direction: "outbound",
      kind: "message",
      text: message,
      handledBy: "scheduler:follow-up-writer",
    });

    quote.nextFollowUpAt = new Date(now.getTime() + 3 * 86_400_000);
    await quote.save();

    summary.quotes++;
    summary.drafted.push({ type: "quote", id: quote.id, channel, message });
  }

  // 3. Payment reminders.
  const dueInvoices = await PaymentModel.find({
    nextReminderAt: { $lte: now },
    status: { $in: ["due", "overdue"] },
  }).limit(25);

  for (const invoice of dueInvoices) {
    const customer = await CustomerModel.findById(invoice.customer);
    const name = customer?.name ?? "there";
    const channel = pickChannel(customer);
    const amount = formatMoney(invoice.amount, invoice.currency);
    const overdue = invoice.dueDate && invoice.dueDate < now;
    if (overdue && invoice.status === "due") invoice.status = "overdue";

    const message = await draftOrTemplate(
      `Send a ${overdue ? "polite overdue" : "friendly"} payment reminder to ${name} for invoice ${invoice.reference} (${amount}), due ${invoice.dueDate?.toDateString()}.`,
      `Hi ${name}, a ${overdue ? "gentle reminder" : "friendly heads-up"} that invoice ${invoice.reference} for ${amount} is ${overdue ? "now due" : `due on ${invoice.dueDate?.toDateString() ?? "soon"}`}. Here's your secure payment link to confirm your booking.`
    );

    await InteractionModel.create({
      customer: invoice.customer,
      channel,
      direction: "outbound",
      kind: "message",
      text: message,
      handledBy: "scheduler:follow-up-writer",
    });

    invoice.nextReminderAt = new Date(now.getTime() + 2 * 86_400_000);
    await invoice.save();

    summary.invoices++;
    summary.drafted.push({ type: "invoice", id: invoice.id, channel, message });
  }

  log.info("tick", { leads: summary.leads, quotes: summary.quotes, invoices: summary.invoices });
  return summary;
}
