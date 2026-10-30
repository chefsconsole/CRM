import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

/** Minimal query surface shared by the production (node-postgres) and embedded (PGlite) drivers. */
export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Execute multi-statement SQL without parameters. */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  /** Run fn inside a transaction. Inside fn, use ONLY the provided handle. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly driver: 'pg' | 'pglite';
}

const INT8 = 20, NUMERIC = 1700, DATE = 1082;
const toNumber = (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) && Number.isInteger(n)) throw new Error(`int8 value ${v} exceeds safe integer range`);
  return n;
};

type RawClient = { query: (sql: string, params?: any[]) => Promise<{ rows: any[]; fields?: { name: string; dataTypeID: number }[] }>; exec?: (sql: string) => Promise<unknown> };

/** Calendar dates are always 'YYYY-MM-DD' strings, regardless of driver. */
function normalise(res: Awaited<ReturnType<RawClient['query']>>) {
  const dateCols = (res.fields ?? []).filter((f) => f.dataTypeID === DATE).map((f) => f.name);
  if (dateCols.length) {
    for (const row of res.rows) for (const c of dateCols) {
      const v = row[c];
      if (v instanceof Date) row[c] = v.toISOString().slice(0, 10);
    }
  }
  return res.rows;
}

function wrap(raw: RawClient): Queryable {
  return {
    async query(sql, params) { return normalise(await raw.query(sql, params as any[])); },
    async one(sql, params) { return normalise(await raw.query(sql, params as any[]))[0]; },
    // node-postgres runs parameterless multi-statement SQL via the simple protocol; PGlite has exec().
    async exec(sql) { if (raw.exec) await raw.exec(sql); else await raw.query(sql); },
  };
}

export function createPgDb(url: string): Db {
  pg.types.setTypeParser(INT8, toNumber);
  pg.types.setTypeParser(NUMERIC, parseFloat);
  pg.types.setTypeParser(DATE, (v: string) => v);
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const base = wrap(pool);
  return {
    driver: 'pg',
    ...base,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const db = await PGlite.create(dataDir, {
    parsers: { [INT8]: toNumber, [NUMERIC]: parseFloat, [DATE]: (v: string) => v },
  });
  const base = wrap(db as unknown as RawClient);
  return {
    driver: 'pglite',
    ...base,
    async tx(fn) { return db.transaction(async (t) => fn(wrap(t as unknown as RawClient))); },
    async close() { await db.close(); },
  };
}
