import { existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config.js';
import { connect } from './db/connect.js';
import { createContext } from './context.js';
import { createApp } from './app.js';
import { reconcileAll } from './modules/bookings/service.js';
import { log } from './lib/log.js';

const here = dirname(fileURLToPath(import.meta.url));
// Compiled output lives in dist/server/src; source runs from server/src.
const compiled = here.includes(`${sep}dist${sep}`);
const root = resolve(here, compiled ? '../../..' : '../..');

async function main() {
  const config = loadConfig();
  const db = await connect(config);
  if (!config.isProduction && process.env.DEMO_SEED === 'true') {
    const { seedDemo, DEMO_PASSWORD } = await import('./db/demoData.js');
    const { seeded } = await seedDemo(db);
    if (seeded) log.info('demo data loaded — sample hotels and agencies, not real partners', { password: DEMO_PASSWORD });
  }
  const ctx = createContext(config, db);
  const app = createApp(ctx);

  if (compiled || config.isProduction || process.env.SERVE_BUILD === 'true') {
    const dist = join(root, 'dist/web');
    if (!existsSync(dist)) throw new Error(`Web build not found at ${dist}. Run "npm run build".`);
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ configFile: join(root, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  // Resolve bookings whose supplier outcome is unknown. Lookups only — never re-books.
  const timer = setInterval(() => { reconcileAll(ctx).catch((e) => log.error('reconciliation sweep failed', { error: e.message })); }, 60_000);
  timer.unref();

  app.listen(config.port, () => log.info(`HotelBridge listening on http://localhost:${config.port}`, { environment: config.appEnv, database: db.driver }));
}

main().catch((err) => { log.error('failed to start', { error: err.message }); process.exit(1); });
