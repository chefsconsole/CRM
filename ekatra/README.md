# EstateIQ

Collective homebuying for Mumbai, plus the private command centre that runs it.

EstateIQ gathers serious buyers for a project (for example ten families who want a 2 BHK at a Borivali West launch), presents that **anonymised** demand to the developer, records whatever the developer actually confirms, and tracks the sale through to the commission. Interest is never presented as a commitment, and no discount is shown publicly until the developer has confirmed it in writing.

| | |
|---|---|
| **Buyer site** (`/`) | Atlys-style search, a map and list of projects, project pages with a live buying-group panel, a 6-step interest flow, a smart requirement match (`/match`), groups, locations, developers, compare and a buyer account with an emailed sign-in code |
| **Admin** (`/admin`) | Overview dashboard, Projects (with price history and a research review queue), Available Inventory, Buyers (filters, saved segments, pipeline, export), Demand Campaigns (Demand Studio), Developers, negotiations, Follow-ups, Reports, commissions, settings, ⌘K global search and quick add |

## Run it locally

Requires Node 20+ and PostgreSQL 14+.

```bash
cp .env.example .env              # then set DATABASE_URL and SESSION_SECRET (openssl rand -hex 32)
npm install
npm run setup                     # applies migrations and loads demo data + the research dataset
npm run dev                       # http://localhost:3000
```

### Demo logins (`/admin/login`)

All seeded team accounts use the password `EstateIQ@2026`, or `SEED_TEAM_PASSWORD` when it is set. **Change it before any real use.**

| Email | Role | What they can do |
|---|---|---|
| admin@estateiq.demo | Super Administrator | Everything, including user management and erasure |
| ops@estateiq.demo | Operations Manager | Everything except user management and erasure |
| riya@estateiq.demo / arjun@estateiq.demo | Sales Representative | Buyers (with contact details), visits, read-only projects, demand and developers. No commercial terms, commissions, exports or settings |
| analyst@estateiq.demo | Read-only Analyst | Dashboards and pipelines. Contact details are masked; no commercial terms |

Buyers sign in at `/account` with a 6-digit code sent by email. Without `RESEND_API_KEY`, the email lands in **Admin → Settings → Outbox**, and in development the code is also shown on screen.

### Demo data versus real data

The seed creates **fictional** developers, projects, buyers and deals. They carry `isDemo = true`, the site shows a DEMO DATA ribbon, and **Admin → Settings → Remove demo data** deletes them.

The **research dataset** (real Mumbai projects, `prisma/research-data.ts`) is different: these are real projects found by web research. They are imported **unpublished**, with status *Needs review* and approval *Pending*, so they never reach the buyer site until a person verifies them. See [docs/RESEARCH.md](docs/RESEARCH.md).

## Tests

```bash
createdb ekatra_test              # once; the tests refuse any database not named *_test
npm test                          # 66 unit + integration tests
npm run typecheck && npm run build
```

The tests cover:
- **Calculations:** commissions (rates, slabs, splits, GST/TDS, payment overshoot), demand metrics and milestones, matching and its hard constraints, A–D priority, group suggestions, inventory comparison, rental yield, INR formatting.
- **Permissions and filters:** RBAC rules and combinable buyer filters.
- **End-to-end flows against Postgres:** inquiry de-duplication, the unique campaign count, price history, commission double-count prevention, visit clashes, public privacy and buyer erasure.

## Project layout

```
prisma/            schema, migrations, seed.ts, research-data.ts, import-research.ts
src/app/(site)     public buyer site
src/app/admin      team application (every page and action checks a permission on the server)
src/app/api        inquiries, visit requests, match preview, exports, search, cron
src/lib/domain     pure business rules (matching, priority, demand, commission, pricing, …) — unit tested
src/lib/services   transactional workflows (inquiry, campaigns, commissions, visits, …)
src/lib/queries    read models; public.ts is the only thing the buyer site reads, and its selects omit all private fields
tests/             vitest unit + integration suites
docs/              research, matching, inventory import, operations, integrations
```

## Security and privacy

- Server-side RBAC on every page, server action and API route (`src/lib/rbac.ts`). Contact details are masked for roles without `buyers:pii`, and the raw values are never sent to their browser.
- Sessions use random tokens stored as HMAC hashes in httpOnly, SameSite=Lax cookies. Logins and sign-in codes are rate-limited, and failed logins are audited.
- Public POST endpoints check the origin and rate limits, and use a honeypot field. Validation is done with zod.
- CSP and security headers are set in `next.config.ts`. Exports are protected against spreadsheet formula injection, and every export is audit-logged.
- Consent is recorded per purpose with the policy version. Erasure anonymises the buyer but keeps the anonymous counts.
- Private documents are served only to team members.

## Compliance

EstateIQ is a tool, not legal advice. Before you promote projects publicly in Maharashtra:
- Register as a MahaRERA real estate agent and enter the number in Settings; it appears in the site footer.
- Show only projects with a verified MahaRERA registration. The publish gate requires a compliance review.
- Have your agreements and privacy notice reviewed by a qualified professional. The DPDP Act 2023 applies to buyer data.

More: [docs/MATCHING.md](docs/MATCHING.md) · [docs/INVENTORY_IMPORT.md](docs/INVENTORY_IMPORT.md) · [docs/OPERATIONS.md](docs/OPERATIONS.md) · [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) · [docs/RESEARCH.md](docs/RESEARCH.md)
