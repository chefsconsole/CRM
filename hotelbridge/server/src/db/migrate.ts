import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));
// Migrations are SQL files; in a compiled build they are resolved relative to the source tree.
const candidates = [join(here, 'migrations'), join(here, '../../../../server/src/db/migrations')];

/** Forward-only, transactional migrations tracked in schema_migrations. Never destructive by default. */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  let dir = candidates[0];
  let files: string[] = [];
  for (const c of candidates) {
    try { files = (await readdir(c)).filter((f) => f.endsWith('.sql')).sort(); dir = c; break; } catch { /* try next */ }
  }
  const applied = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    ran.push(file);
  }
  return ran;
}
