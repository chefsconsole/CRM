# HotelBridge — Architecture

## Repository audit (starting point)

The repository contained one application, `travel-therapy-ai/` — a B2C AI-employee CRM (Express,
Mongoose, Claude agents). Its README states HotelBridge must be kept fully separate, and none of its
code fit a B2B financial booking platform (no tenancy, no auth, MongoDB without transactions for money).
HotelBridge was therefore built as a sibling application, `hotelbridge/`, reusing the existing house
idioms (TypeScript, Express, zod) and leaving `travel-therapy-ai/` untouched.

## Shape: a modular monolith

```
hotelbridge/
  shared/domain.ts          status vocabularies & labels shared by server and web (no calculations)
  server/src/
    config.ts               environment configuration (secrets stay server-side)
    db/                     pg + PGlite driver behind one interface, SQL migrations, demo data, admin bootstrap
    lib/                    money (integer minor units, BigInt), dates, errors, audit, redaction, rate limit, refs
    modules/
      auth/                 scrypt passwords, hashed session tokens, CSRF, role & tenant guards
      catalogue/            agent-safe hotel views
      contracts/            contract lifecycle, versions, rates, rate sheets, restrictions, allocation, preview
      pricing/              engine (authoritative), rules (markup, FX), cancellation, rate comparison
      inventory/            common model, gateway (timeouts/retries/circuit breaker/logging), adapter registry
        adapters/           contracted (live) · sandbox (dev only) · unconnected third parties
      search/               search orchestration, offer snapshots, agent-safe offer view
      bookings/             state machine, booking service, views, voucher
      finance/              double-entry ledger, invoices
      groups/               Group Desk workflow and proposal document
      intelligence/         founder metrics, operational issues, scenarios
      agency/ admin/ partner/   HTTP routes per audience
    app.ts / index.ts       Express app; serves the SPA (Vite middleware in dev, static build in prod)
  server/test/              Vitest: domain + HTTP integration (PGlite or real Postgres)
  web/src/                  React SPA: design system, public site, agent portal, admin console, partner
```

Business boundaries are module boundaries, so any one of them (e.g. inventory, finance) can be
extracted into a service later without rewriting callers. Nothing here needs microservices yet.

## Key decisions

| Decision | Why |
|---|---|
| PostgreSQL; PGlite in dev/test | Transactions, constraints and triggers for financial data. PGlite gives zero-setup demos and fast tests with the same SQL; the suite also runs on real Postgres. |
| Money as BIGINT minor units + currency | No floating point; currencies never mixed; FX stored as 1e8-scaled integers with source and timestamp. |
| Server-side offer snapshots | Checkout references an offer id; prices never come from the browser. Revalidation always precedes booking; a changed price gets a new offer id that must be accepted. |
| Idempotency key unique per agency | Double clicks and retries return the same booking. |
| No automatic retry of book/cancel | A timeout is an *unknown* outcome; it is reconciled by lookup with the client reference. |
| Compare-and-set state transitions | `UPDATE … WHERE status = $from` plus an event row: concurrent actions can't both succeed. |
| Append-only ledger (DB triggers) | Corrections are reversals; journals must balance per currency. |
| Capabilities, not assumptions | Each source declares what it supports; unconnected suppliers claim nothing. |
| Agency-facing deadlines one day earlier | Cancellations can always be completed with the hotel in time. |
| Tenant isolation in SQL | Every agency query filters by the session's agency id; foreign ids return 404. Covered by tests. |
| Lazy-loaded admin bundle | Agents never download staff code (~87 KB gzipped agent bundle). |

## Security controls

scrypt password hashing; 32-byte session tokens stored as SHA-256; httpOnly SameSite=Lax cookies
(Secure in production); CSRF token on every state-changing request; login/registration/search/booking
rate limits; zod validation on every input; role guards on server routes (client guards are UX only);
security headers; no card data stored; supplier logs redacted of secrets and guest PII; audit log is
append-only; credit off by default and changeable only by finance/admin with justification.

## Booking lifecycle

```
awaiting_payment ─► submitting ─► confirmed ─► amendment_requested ─► confirmed
        │               │   └──► pending_confirmation ─► confirmed / failed
        │               └──► failed            confirmed ─► cancellation_requested ─► cancelled
        └──► cancelled                         cancelled / failed ─► refund_pending ─► refunded
```
`submitting` + `needs_reconciliation` = the supplier's answer is unknown; operations sees it as urgent.

## Extending

- **New supplier**: implement `InventoryAdapter` (map to `SupplierOffer`), declare honest capabilities,
  register in `inventory/registry.ts`, map hotels/rooms in `source_mappings`. The gateway, pricing,
  booking, reconciliation and comparison work unchanged.
- **Payment provider**: create provider checkout → on webhook, insert a `payments` row and post a
  `payment` journal in one transaction, then call `onPaymentRecorded`.
- **Email**: send Group Desk enquiries with `sent_via = 'email_integration'`; record message ids.
