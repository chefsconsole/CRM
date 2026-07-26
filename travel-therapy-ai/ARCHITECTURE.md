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
| Supplier Agent | 🔲 next | Add `supplierOutreach` agent + outreach tools over `Supplier` |
| Marketing Manager | 🔲 next | 90-day content calendar; reuses the content model |
| Ad Manager | 🔲 next | Ad copy/creative briefs; human-in-the-loop publish |
| SEO Manager | 🔲 next | Destination pages, blogs, schema; content model |

### MCP servers

| Vision server | Status |
|---|---|
| `mcp-crm` | ✅ built (`src/mcp/crmServer.ts`) |
| `mcp-itinerary`, `mcp-hotels`, `mcp-payments`, `mcp-social`, … | 🔲 same pattern: wrap the relevant service in an `McpServer` |

### Database

Implemented collections: `Customer`, `Lead`, `Interaction`, `Itinerary`,
`Quote`, `Supplier`, `Activity`. The vision's `Trips`, `Payments`, `Campaigns`,
`Ads`, and `Content Library` are natural next models following the same
`InferSchemaType` pattern in `src/db/models/`.

## Roadmap

**Phase 1 — foundation (this repo).** Core funnel: capture → itinerary → quote,
7 employees, CRM, one MCP server, REST + webhooks.

**Phase 2 — supply & fulfilment.** Supplier Agent + outreach tools; `Trip` and
`Payment` models; invoice + payment-reminder automation; booking confirmation.

**Phase 3 — growth engine.** Marketing Manager (content calendar), Ad Manager,
SEO Manager; `Campaign` / `Ad` / `ContentLibrary` models; scheduled jobs for the
"every morning" content run and follow-up chasers (`nextFollowUpAt` is already
indexed on both `Lead` and `Quote`).

**Phase 4 — autonomy.** Wire real channel providers (Instagram Graph API,
WhatsApp Business, email) into the existing webhook + interaction layer; add a
scheduler that drives follow-ups and the daily marketing run; per-provider
credentials via a vault.

## Notable extension points

- **Follow-up automation:** `Lead.nextFollowUpAt` and `Quote.nextFollowUpAt` are
  indexed — a cron worker can query due items and invoke the relevant agent.
- **Real channels:** the webhook routes already normalise inbound messages into
  the `Interaction` log and CRM; swap the shared-secret guard for each
  provider's signature verification and post `result.text` back to the channel.
- **PDFs / proposals:** `Quote` + `Itinerary` hold everything a luxury PDF or
  interactive web proposal needs; render from those records.
