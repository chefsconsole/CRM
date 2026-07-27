# Architecture & Roadmap — Travel Therapy AI

This document explains how the foundation is designed, how it maps to the full
Travel Therapy vision, and what to build next.

## Design principles

1. **Separate from HotelBridge.** This is the B2C platform. It has its own
   database, agents, MCP servers, and prompts. Shared infrastructure (auth,
   storage, notifications) can be factored out later, but the two products are
   never entangled.
2. **Agents act through tools, never freehand.** Every write an AI employee
   makes goes through a typed tool that maps to one auditable database
   operation. This keeps behaviour inspectable (every run returns a `trace` of
   tool calls) and safe to extend.
3. **One customer, many channels.** `findOrCreateCustomer` de-duplicates every
   inbound signal (Instagram, WhatsApp, website, email) onto a single profile —
   the anti-duplicate-leads guarantee from the vision.
4. **Employees compose.** The `flows/inbound` pipeline threads a shared context
   object through Lead Manager → Itinerary Generator → Quotation Agent, so the
   `customerId` / `leadId` / `itineraryId` flow between them automatically.

## The agent framework

`src/ai/agent.ts` implements the standard Claude tool-use loop:

- Adaptive thinking on (`claude-opus-5` default; configurable via `AI_MODEL`).
- On each turn the **full** `response.content` (thinking + tool_use blocks) is
  appended back — the correct multi-turn pattern for thinking models.
- Tool calls are dispatched to handlers, results fed back, repeat until the
  model stops calling tools or the iteration cap is hit.
- Returns `{ text, toolCalls, usage, trace }`.

Adding an employee is: write a system prompt + pick tools in `src/ai/agents/`,
register it in `src/ai/registry.ts`. It's immediately runnable at
`POST /api/agents/:name/run` and reusable inside flows.

## Vision → implementation map

### AI employees

| Vision employee | Status | Notes |
|---|---|---|
| Travel Consultant | ✅ built | `travel-consultant`, multi-turn, catalog-grounded |
| Social Media Manager | ✅ built | `social-media-manager`, daily content pack |
| Instagram Agent | ✅ built | `instagram-agent`, reply + capture |
| Lead Manager | ✅ built | `lead-manager`, de-dupe + enquiry capture |
| Itinerary Generator | ✅ built | `itinerary-generator`, day-by-day + costing |
| Quotation Agent | ✅ built | `quotation-agent`, priced quote + message |
| Customer Success Agent | ✅ built | `customer-success-agent`, lifecycle messaging |
| Supplier Agent | ✅ built | `supplier-agent`, upsert suppliers + log rate outreach |
| Marketing Manager | ✅ built | `marketing-manager`, schedules the content calendar |
| Ad Manager | ✅ built | `ad-manager`, weekly ad concepts → content library (human publishes) |
| SEO Manager | ✅ built | `seo-manager`, destination pages/blogs/FAQs → content library |

All 11 vision employees are implemented.

### MCP servers

| Vision server | Status |
|---|---|
| `mcp-crm` | ✅ built (`src/mcp/crmServer.ts`) |
| `mcp-itinerary`, `mcp-hotels`, `mcp-payments`, `mcp-social`, … | 🔲 same pattern: wrap the relevant service in an `McpServer` |

## Money is deterministic, not agentic

Booking, invoicing, and recording payments run as plain **service calls**
(`bookingService`, `paymentService`) invoked from the `accept-quote` flow — never
as LLM tool calls. The AI drafts the *messages* around money (quote delivery,
payment reminders); the code moves the money. `fulfilmentTools` exist for agents
that need them, but the default booking path keeps the model out of the
transaction.

## The scheduler

`src/scheduler/` is a periodic worker (opt-in via `SCHEDULER_ENABLED`, or one
pass via `POST /api/scheduler/tick`). Each tick sweeps due items —
`Lead.nextFollowUpAt`, `Quote.nextFollowUpAt`, `Payment.nextReminderAt` (all
indexed) — drafts a message with a tool-less writer agent (falling back to a
template when no API key is set), logs it as an outbound `Interaction`, and
advances the next-touch time so items never reprocess in a loop. Expired quotes
are closed; aged leads drop to `nurture`.

### Database

Implemented collections: `Customer`, `Lead`, `Interaction`, `Itinerary`,
`Quote`, `Supplier`, `Activity`, `Trip`, `Payment`, `Campaign`, `ContentAsset`.

## Roadmap

**Phase 1 — foundation. ✅ done.** Core funnel (capture → itinerary → quote),
CRM, MCP server, REST + webhooks.

**Phase 2 — supply & fulfilment. ✅ done.** Supplier Agent + outreach tools;
`Trip` and `Payment` models; booking + deposit-invoice flow; payment-reminder
automation.

**Phase 3 — growth engine. ✅ done.** Marketing Manager (content calendar), Ad
Manager, SEO Manager; `Campaign` + `ContentAsset` (content library); scheduler
for follow-up chasers.

**Phase 4 — autonomy. 🔲 next.** Wire real channel providers (Instagram Graph
API, WhatsApp Business, email/Gmail) into the existing webhook + `Interaction`
layer so drafted messages actually send; add per-provider credentials via a
vault; add the "every morning" scheduled marketing run alongside the existing
follow-up sweep; render luxury PDF proposals from `Quote` + `Itinerary`.

## Notable extension points

- **Follow-up automation:** `Lead.nextFollowUpAt` and `Quote.nextFollowUpAt` are
  indexed — a cron worker can query due items and invoke the relevant agent.
- **Real channels:** the webhook routes already normalise inbound messages into
  the `Interaction` log and CRM; swap the shared-secret guard for each
  provider's signature verification and post `result.text` back to the channel.
- **PDFs / proposals:** `Quote` + `Itinerary` hold everything a luxury PDF or
  interactive web proposal needs; render from those records.
