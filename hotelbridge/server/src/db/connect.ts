import { mkdirSync } from 'node:fs';
import type { Config } from '../config.js';
import { createPgDb, createPgliteDb, type Db } from './pool.js';
import { migrate } from './migrate.js';
import { log } from '../lib/log.js';

export async function connect(config: Config): Promise<Db> {
  let db: Db;
  if (config.databaseUrl) {
    db = createPgDb(config.databaseUrl);
  } else {
    if (config.pgliteDataDir) mkdirSync(config.pgliteDataDir, { recursive: true });
    db = await createPgliteDb(config.pgliteDataDir);
    log.info('using embedded PGlite database (development only)', { dir: config.pgliteDataDir ?? 'memory' });
  }
  const ran = await migrate(db);
  if (ran.length) log.info('migrations applied', { ran });
  return db;
}
