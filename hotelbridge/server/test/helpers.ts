import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig } from '../src/config.js';
import { createPgDb, createPgliteDb, type Db } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { seedDemo, DEMO_PASSWORD, DEMO_USERS } from '../src/db/demoData.js';
import { createContext, type AppContext } from '../src/context.js';
import { createApp } from '../src/app.js';
import { resetBreakers } from '../src/modules/inventory/gateway.js';

export { DEMO_PASSWORD, DEMO_USERS };

export interface TestEnv { ctx: AppContext; db: Db; base: string; server: Server; close: () => Promise<void> }

export async function startTestApp(env: Record<string, string> = {}): Promise<TestEnv> {
  resetBreakers();
  const config = loadConfig({ APP_ENV: 'test', NODE_ENV: 'test', SUPPLIER_TIMEOUT_MS: '200', ...env } as NodeJS.ProcessEnv);
  // Set TEST_DATABASE_URL to run against real PostgreSQL (the production driver); otherwise embedded PGlite.
  let db: Db;
  if (process.env.TEST_DATABASE_URL) {
    db = createPgDb(process.env.TEST_DATABASE_URL);
    await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } else {
    db = await createPgliteDb();
  }
  await migrate(db);
  await seedDemo(db);
  const ctx = createContext(config, db);
  const app = createApp(ctx);
  const server = await new Promise<Server>((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { ctx, db, base, server, close: async () => { server.close(); await db.close(); } };
}

/** Minimal browser-like client: keeps the session cookie and sends the CSRF header. */
export class Client {
  cookie = '';
  csrf = '';
  constructor(private base: string) {}

  async login(email: string, password = DEMO_PASSWORD) {
    const res = await this.req('POST', '/api/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    this.csrf = res.body.csrfToken;
    return this;
  }

  async req(method: string, path: string, body?: unknown, opts: { csrf?: boolean } = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && opts.csrf !== false) headers['x-csrf-token'] = this.csrf;
    const r = await fetch(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await r.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, body: parsed };
  }
  get(p: string) { return this.req('GET', p); }
  post(p: string, b?: unknown) { return this.req('POST', p, b ?? {}); }
  patch(p: string, b?: unknown) { return this.req('PATCH', p, b ?? {}); }
}

export function futureDate(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function login(env: TestEnv, email: string) {
  return new Client(env.base).login(email);
}

/** Search a city and return the first offer for a hotel slug. */
export async function findOffer(c: Client, opts: { city: string; slug: string; checkIn: string; checkOut: string; rooms: { adults: number; childrenAges?: number[] }[]; mealPlan?: string }) {
  const res = await c.post('/api/agent/search', {
    destination: opts.city, checkIn: opts.checkIn, checkOut: opts.checkOut, mealPlan: opts.mealPlan,
    rooms: opts.rooms.map((r) => ({ adults: r.adults, childrenAges: r.childrenAges ?? [] })),
  });
  if (res.status !== 200) throw new Error(`search failed ${res.status} ${JSON.stringify(res.body)}`);
  const hotel = res.body.results.find((r: any) => r.hotel.slug === opts.slug);
  return { search: res.body, hotel, offer: hotel?.offers[0] };
}

export function guestsFor(offer: any) {
  return offer.rooms.map((r: any) => ({ roomIndex: r.roomIndex, guests: [{ first: 'Test', last: `Guest${r.roomIndex + 1}` }] }));
}

let keyN = 0;
export async function book(c: Client, offer: any, extra: Record<string, unknown> = {}) {
  return c.post('/api/agent/bookings', {
    offerId: offer.id, idempotencyKey: `test-key-${Date.now()}-${keyN++}`, acceptedTotalMinor: offer.totalMinor, acceptedCurrency: offer.currency,
    acknowledgeOnRequest: offer.availability === 'on_request', rooms: guestsFor(offer), ...extra,
  });
}
