# Travel Therapy AI

> **Project 2** of the two-platform roadmap — the **B2C**, customer-facing, AI-first
> luxury travel company. (HotelBridge, the B2B contracting platform, is deliberately
> kept 100% separate: separate agents, MCP servers, database, and prompts.)

An AI-first travel company where the customer journey — from lead capture to
itinerary, quote, and follow-up — is driven by a roster of **AI employees** built
on Claude, backed by a MongoDB CRM and exposed over both a REST API and a
Model Context Protocol server.

This repository is a **working foundation**: the core B2C loop runs end-to-end,
and every remaining employee from the vision drops into the same agent/tool
pattern. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for what's built vs. planned.

---

## What runs today

The end-to-end pipeline, orchestrated across employees, with automated
follow-up throughout:

```
 Instagram DM / website form / WhatsApp / email
        │
        ▼
 Lead Manager ──► de-duplicated Customer + Lead (no duplicate leads)
        │  (if qualified: destination + dates + budget, score ≥ 50)
        ▼
 Itinerary Generator ──► day-by-day Itinerary (grounded in the supplier/activity catalog)
        │
        ▼
 Quotation Agent ──► priced Quote (reference #, inclusions, validity) + delivery message
        │  (accept-quote flow — deterministic, no LLM in the money path)
        ▼
 Trip (booked) + deposit Invoice ──► Scheduler chases the invoice & any stale leads/quotes
```

### The AI employees (all 11 from the vision)

| Agent | Role | Tools |
|---|---|---|
| `lead-manager` | Ingest inbound messages, de-dupe to one customer, capture the enquiry | CRM |
| `travel-consultant` | Conversational destination/pricing/visa advice (multi-turn) | Catalog |
| `itinerary-generator` | Design & persist a day-by-day plan with costing | Catalog + save |
| `quotation-agent` | Turn an itinerary into a priced, sendable quote | Quote |
| `instagram-agent` | Reply to DMs/comments while capturing the lead | CRM |
| `social-media-manager` | Daily content pack (reel, carousels, stories, blog, prompts) | — |
| `customer-success-agent` | Pre/in/post-trip messaging (packing, check-ins, reviews) | — |
| `supplier-agent` | Build the supplier network; draft & log rate/availability outreach | Suppliers |
| `marketing-manager` | Plan the 30–90 day content calendar; schedule campaigns | Content |
| `ad-manager` | Weekly ad concepts: copy, creatives, audiences, budgets (human publishes) | Content |
| `seo-manager` | Destination pages, blogs, FAQs, schema, keywords | Content |

Post-sale money actions (booking, invoicing, payments) are **deterministic
service calls**, never LLM tool calls — the AI drafts the messages, the code
moves the money. A background **scheduler** drives the automated follow-ups,
quote chases, and payment reminders (drafting with the AI when a key is present,
falling back to templates when not).

---

## Quick start

```bash
cp .env.example .env          # then set ANTHROPIC_API_KEY and MONGODB_URI
npm install
npm run seed                  # load sample Bali & Japan suppliers/activities
npm run dev                   # API on http://localhost:4000
```

Requirements: Node ≥ 20, a MongoDB instance (local or Atlas), and an Anthropic
API key (or `ant auth login`). The API boots without a key — CRM read routes
work — but agent runs return `503` until a key is configured.

### Try it

```bash
# Health
curl localhost:4000/health

# Run any employee directly
curl -sX POST localhost:4000/api/agents/travel-consultant/run \
  -H 'content-type: application/json' \
  -d '{"input":"Where should we go for a 7-night honeymoon in September, budget ₹2.5L?"}'

# End-to-end: capture an inbound lead and auto-generate itinerary + quote
curl -sX POST localhost:4000/api/flows/inbound \
  -H 'content-type: application/json' \
  -d '{
    "channel":"instagram","handle":"@aisha.travels",
    "message":"Bali honeymoon, 6 nights this December, 2 of us, budget around ₹2 lakh from Mumbai",
    "name":"Aisha"
  }'

# Inspect what the agents produced
curl localhost:4000/api/crm/leads
curl localhost:4000/api/crm/leads/<leadId>     # lead + its itineraries + quotes

# Customer accepts the quote → book the trip + raise a deposit invoice
curl -sX POST localhost:4000/api/flows/accept-quote \
  -H 'content-type: application/json' \
  -d '{"quoteId":"<quoteId>","depositPercent":25}'

# Run one scheduler pass (lead follow-ups, quote chases, payment reminders)
curl -sX POST localhost:4000/api/scheduler/tick
```

### Webhooks (channel ingestion)

Guarded by `x-webhook-secret: $WEBHOOK_SECRET`.

```bash
curl -sX POST localhost:4000/api/webhooks/instagram \
  -H "x-webhook-secret: change-me" -H 'content-type: application/json' \
  -d '{"handle":"@rahul","message":"Bali honeymoon price?"}'
# → { "reply": "Hi 👋 We'd love to help! ...", "customerId": "...", "leadId": "..." }
```

---

## MCP server (`mcp-crm`)

The CRM is also exposed over the Model Context Protocol so any MCP client
(Claude Desktop, another agent, the future HotelBridge platform) can query it:

```bash
npm run mcp:crm      # stdio server
```

Tools: `find_or_create_customer`, `list_leads`, `get_lead`, `search_activities`,
`upsert_supplier`, `list_due_followups`. Register it in an MCP client as a stdio
server pointing at `npx tsx src/mcp/crmServer.ts`.

---

## API reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Status + whether the AI key is configured |
| `GET` | `/api/agents` | List the roster of AI employees |
| `POST` | `/api/agents/:name/run` | Run one employee (`{ input, context? }`) |
| `POST` | `/api/flows/inbound` | Full pipeline: capture → itinerary → quote |
| `POST` | `/api/flows/accept-quote` | Booking: quote → trip + deposit invoice |
| `GET` | `/api/crm/customers` | Recent customers |
| `GET` | `/api/crm/leads` | Leads (`?status=`) |
| `GET` | `/api/crm/leads/:id` | Lead + itineraries + quotes |
| `GET` | `/api/crm/itineraries/:id` | One itinerary |
| `GET` | `/api/crm/quotes/:id` | One quote |
| `GET` | `/api/crm/trips` | Trips (`?status=`) |
| `GET` | `/api/crm/payments` | Invoices/payments (`?status=`) |
| `GET` | `/api/crm/suppliers` | Suppliers (`?destination=&type=`) |
| `GET` | `/api/crm/campaigns` | Content calendar |
| `GET` | `/api/crm/content` | Content library (`?kind=&status=`) |
| `POST` | `/api/scheduler/tick` | Run one follow-up/reminder pass |
| `POST` | `/api/webhooks/instagram` | Instagram DM/comment ingestion |
| `POST` | `/api/webhooks/website-form` | Website enquiry ingestion |

## Automated follow-ups (scheduler)

`Lead.nextFollowUpAt`, `Quote.nextFollowUpAt`, and `Payment.nextReminderAt` are
indexed. The scheduler (`src/scheduler/`) sweeps due items and, for each, drafts
a message (via the AI when configured, else a template), logs it as an outbound
`Interaction`, and advances the next-touch time so nothing loops. Enable the
periodic run with `SCHEDULER_ENABLED=true`, or call `POST /api/scheduler/tick`
manually. Quotes past their validity are auto-expired; leads older than ~3 weeks
drop to `nurture`.

---

## Project layout

```
src/
  config/          env loading
  db/
    connect.ts     mongoose connection
    models/        Customer, Lead, Interaction, Itinerary, Quote, Supplier,
                   Activity, Trip, Payment, Campaign, ContentAsset
  ai/
    client.ts      lazy Anthropic client
    agent.ts       base Agent (Claude tool-use loop)
    tools/         crm / catalog / itinerary / supplier / fulfilment / content
    agents/        the 11 AI employees
    registry.ts    name → agent factory
  services/        lead / itinerary / quote / booking / payment / content logic
  scheduler/       background follow-up & reminder worker
  api/             express server, routes, middleware
  mcp/crmServer.ts MCP stdio server
scripts/seed.ts    sample supplier & activity catalog
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Run the API with hot reload |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run typecheck` | Type-check without emitting |
| `npm run seed` | Load the sample catalog |
| `npm run mcp:crm` | Start the MCP CRM server |

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design, the mapping to the full
vision, and the roadmap for the remaining employees and MCP servers.
