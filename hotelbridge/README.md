# HotelBridge Global

A curated B2B hotel distribution platform: a premium public website, an agent booking portal,
a contracted-hotel engine, a booking lifecycle with financial records, a Group Desk, a minimal
hotel-partner workspace and a founder/operations console.

> **Status: first working release (MVP foundation).** Core workflows run end-to-end and are
> covered by automated tests against both embedded and real PostgreSQL. It is **not yet
> production-ready** — see [What still requires external work](#what-still-requires-external-work).

## Quick start (zero setup)

```bash
cd hotelbridge
npm install
npm run demo          # embedded Postgres (PGlite) + demo data → http://localhost:4100
```

Demo data is **fictional** — sample hotels (all labelled "Sample"), sample agencies and sample rates.
Nothing in it represents a real partner, contract or price. Every non-production page carries a banner.

| Persona | Email | Password |
|---|---|---|
| HotelBridge administrator | `admin@hotelbridge.test` | `Demo-Passw0rd-2026` |
| Operations | `ops@hotelbridge.test` | same |
| Finance | `finance@hotelbridge.test` | same |
| Agent — prepay, sells in EUR | `agent@sample-agency.test` | same |
| Agent — approved credit, sells in USD | `agent@sample-dmc.test` | same |
| Agent — unverified agency | `owner@pending-agency.test` | same |
| Hotel partner (Kade House) | `reservations@kade-house.test` | same |

### Against real PostgreSQL

```bash
docker compose up -d                                   # or any Postgres 14+
export DATABASE_URL=postgres://hotelbridge:hotelbridge@localhost:5432/hotelbridge
npm run migrate
npm run seed:demo                                      # optional, refused in production
npm run dev
```

### Production

```bash
npm run build
APP_ENV=production DATABASE_URL=... npm start          # serves API + built web app
ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... APP_ENV=production DATABASE_URL=... npm run create-admin
```

Production requires `DATABASE_URL`, forces secure cookies, disables the sandbox supplier and refuses demo data.
Run behind HTTPS (TLS-terminating proxy).

## Commands

| Command | Does |
|---|---|
| `npm run demo` | Embedded DB, demo data, full app |
| `npm run dev` | Dev server (Vite middleware + API, hot reload) |
| `npm test` | 53 tests — domain, API, tenant isolation, booking & finance flows (PGlite) |
| `TEST_DATABASE_URL=postgres://… npm run test:pg` | Same suite against real PostgreSQL |
| `npm run typecheck` | Server + web type-check |
| `npm run build` / `npm start` | Production build / serve |
| `npm run migrate` | Apply forward-only SQL migrations |
| `npm run create-admin` | Bootstrap the first administrator (password via env) |

## What works today

**Public website** — hero, curated network, agent workflow with real status vocabulary, hotel-partner
proposition, Group Desk, partner CTAs, operational clarity, footer. Agency registration (pending until
verified), hotel and distribution-partner applications, draft privacy/terms clearly marked for legal review.

**Agent portal** — overview; search by destination/dates with **per-room occupancy and children's ages**
preserved to the voucher; filters; results showing total stay price, board, cancellation deadline, taxes,
local charges and an explicit availability type (*Available to book now / Price confirmed at checkout /
On request*); hotel detail; checkout with **mandatory revalidation**, explicit re-acceptance of any price
change, idempotent submission; booking list and detail with status timeline, invoices, voucher (confirmed
only), amendment requests and cancellation with the exact charge shown and confirmed; Group Desk; saved
hotels; invoices & payments; agency users; support.

**Contracted hotel engine** — hotels, room types (occupancy rules), licensed images with credit/licence,
contracts (net or commissionable, validity, currency, tax policy, cancellation tiers, payment terms,
release period, B2B distribution permission, instant vs on-request), rates by room/board/occupancy/date
range, CSV rate-sheet import (all-or-nothing), stop-sell/blackout/min-stay/supplements, allocation,
versioning with change notes, approval workflow (admin-only approval, edits to active terms force re-approval),
agent-price preview with full economics.

**Pricing** — one authoritative engine: supplier cost, taxes, commission, markup, sell price, gross profit,
margin (on sell) vs markup (on cost), local charges, FX only via recorded rates (≤72h old), rounding,
network/agency/source-specific rules. Integer minor units + BigInt; no floating point in totals.

**Bookings** — explicit state machine with compare-and-set transitions; idempotency keys (DB-unique per
agency); prepay vs approved-credit paths; non-refundable rates held until paid; atomic allocation
consumption and release; request-to-book confirmation by operations or the hotel partner; unknown
supplier outcomes are **never retried** — they are reconciled by lookup (sweep every minute + manual).

**Finance** — balanced double-entry journals (append-only, DB-enforced), sale/reversal/cancellation-fee
journals, invoices and credit notes, manual payment and refund recording, refund-pending/refunded states,
receivables/payables.

**Group Desk** — structured enquiries (multi-city legs, rooming validated against passengers, coach,
accessibility, budget, deadline), automatic acknowledgement with response target, hotel-enquiry drafts
(agency identity and budget withheld), "sent" recorded only by a human, offers recorded as received,
versioned proposals built only from recorded offers (validity capped at hotel validity), printable proposal,
agent accept/decline, internal vs agent-visible messages, SLA alerts.

**Supplier architecture** — common inventory model, capability flags, gateway with timeouts, read-only
retries, circuit breaker, error classes and redacted call logs; adapters: direct contracts (live),
sandbox (development only, fault injection), TBO / Hotelbeds / RateHawk boundaries (not connected).
Internal rate comparison that refuses to call offers equivalent unless every condition matches.

**Intelligence** — founder overview from recorded data only (agencies, funnel, created ≠ confirmed ≠
realised, GBV vs net revenue vs gross profit vs contribution, obligations, supplier concentration,
hotel production, Group Desk conversion), operational-issues queue, scenario model (segmented take rates,
cancellations, payment/support costs, step-cost account management), audit log.

**Hotel partner** — own-hotel bookings only, net amounts only (no agency identity or sell price),
confirm/decline requests, production and agreements.

## What still requires external work

| Item | What is needed |
|---|---|
| Third-party supplier inventory | Commercial agreement permitting onward distribution, API certification, credentials, adapter implementation (boundary and tests exist). |
| Real contracted hotels | Signed contracts; content, licensed photography and rates entered or imported. |
| Online payments | A payment provider account (e.g. card/bank checkout with tokenisation). Today payments are recorded manually; no card data is ever handled. |
| Email delivery | Transactional email provider for confirmations, Group Desk enquiries and password resets. Today enquiries are copy-and-send and recorded manually. |
| Password reset / MFA / SSO | Needs email delivery; MFA recommended for staff before launch. |
| Legal & tax | Terms, privacy notice, invoicing requirements, VAT/GST treatment, agent-vs-principal revenue recognition — professional review per market. Company details in the footer are intentionally blank until verified. |
| Operations at scale | Shared rate-limit store, centralised logging/alerting, backups, PDF rendering service, multiple app instances. |

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`docs/FINANCE.md`](./docs/FINANCE.md).
