import type { Queryable } from '../../db/pool.js';
import type { FxQuote, MarkupRule } from './engine.js';

/** Most specific active rule wins: agency+source > agency > source > network default. */
export async function resolveMarkup(q: Queryable, agencyId: string, source: string): Promise<MarkupRule | null> {
  const row = await q.one<{ id: string; markup_type: MarkupRule['type']; value: number; currency: string | null; rounding: MarkupRule['rounding'] }>(
    `SELECT id, markup_type, value, currency, rounding FROM pricing_rules
      WHERE active AND (agency_id = $1 OR agency_id IS NULL) AND (source = $2 OR source IS NULL)
      ORDER BY (agency_id IS NOT NULL) DESC, (source IS NOT NULL) DESC, created_at DESC LIMIT 1`,
    [agencyId, source],
  );
  return row ? { id: row.id, type: row.markup_type, value: row.value, currency: row.currency, rounding: row.rounding } : null;
}

export const FX_MAX_AGE_HOURS = 72;

/** Latest recorded rate, if recent enough. Conversion never happens without a recorded rate. */
export async function resolveFx(q: Queryable, from: string, to: string, now = new Date()): Promise<FxQuote | null> {
  if (from === to) return null;
  const row = await q.one<{ id: string; rate_scaled: number; as_of: Date }>(
    `SELECT id, rate_scaled, as_of FROM fx_rates WHERE base = $1 AND quote = $2 ORDER BY as_of DESC LIMIT 1`, [from, to]);
  if (!row) return null;
  if (now.getTime() - new Date(row.as_of).getTime() > FX_MAX_AGE_HOURS * 3_600_000) return null;
  return { id: row.id, rateScaled: row.rate_scaled, from, to, asOf: new Date(row.as_of).toISOString() };
}
