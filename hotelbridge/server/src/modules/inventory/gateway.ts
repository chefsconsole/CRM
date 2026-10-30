import type { Db } from '../../db/pool.js';
import { redact } from '../../lib/redact.js';
import { log } from '../../lib/log.js';
import { SupplierError, type InventoryAdapter } from './types.js';

/**
 * Every call to an external inventory source goes through here: timeouts, retry rules per
 * operation, a per-source circuit breaker, error classification and redacted call logging.
 *
 * Retry policy:
 *   search / revalidate / retrieve   safe to retry once (read-only)
 *   book / cancel                    NEVER retried here. A timed-out booking is "unknown" and must be
 *                                    reconciled with retrieve(), otherwise we risk duplicate reservations.
 */
type Op = 'search' | 'revalidate' | 'book' | 'retrieve' | 'cancel';
const RETRYABLE: Record<Op, boolean> = { search: true, revalidate: true, retrieve: true, book: false, cancel: false };

interface Breaker { failures: number; openUntil: number }
const breakers = new Map<string, Breaker>();
const FAILURE_THRESHOLD = 5;
const OPEN_MS = 30_000;

export function breakerState(source: string) {
  const b = breakers.get(source);
  return { failures: b?.failures ?? 0, open: !!b && b.openUntil > Date.now() };
}
export function resetBreakers() { breakers.clear(); }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SupplierError('timeout', `No response within ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class InventoryGateway {
  constructor(private db: Db, private timeoutMs: number) {}

  async call<T>(adapter: InventoryAdapter, op: Op, fn: () => Promise<T>, meta: { bookingId?: string; request?: unknown } = {}): Promise<T> {
    // Internal sources (our own database) are not subject to network failure modes.
    const external = adapter.kind !== 'direct';
    const b = breakers.get(adapter.code) ?? { failures: 0, openUntil: 0 };
    breakers.set(adapter.code, b);
    if (external && b.openUntil > Date.now()) {
      await this.record(adapter.code, op, meta, null, 'circuit_open', 'circuit_open', 0);
      throw new SupplierError('circuit_open', `${adapter.name} is temporarily unavailable`);
    }
    const attempts = RETRYABLE[op] && external ? 2 : 1;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      const started = Date.now();
      try {
        const result = external ? await withTimeout(fn(), this.timeoutMs) : await fn();
        b.failures = 0;
        if (external) await this.record(adapter.code, op, meta, result, 'success', null, Date.now() - started);
        return result;
      } catch (err) {
        lastErr = err;
        const cls = err instanceof SupplierError ? err.errorClass : 'network';
        if (external) {
          b.failures += 1;
          if (b.failures >= FAILURE_THRESHOLD) b.openUntil = Date.now() + OPEN_MS;
          await this.record(adapter.code, op, meta, { message: (err as Error).message }, cls === 'timeout' ? 'timeout' : 'error', cls, Date.now() - started);
        }
        if (cls === 'rejected' || cls === 'not_configured') break; // retrying won't help
        if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
      }
    }
    throw lastErr;
  }

  private async record(source: string, operation: string, meta: { bookingId?: string; request?: unknown }, response: unknown, outcome: string, errorClass: string | null, ms: number) {
    try {
      await this.db.query(
        `INSERT INTO supplier_calls (source, operation, booking_id, request, response, outcome, error_class, duration_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [source, operation, meta.bookingId ?? null, JSON.stringify(redact(meta.request ?? null)),
          JSON.stringify(redact(summarise(response))), outcome, errorClass, ms],
      );
    } catch (e) {
      log.warn('failed to record supplier call', { source, operation, error: (e as Error).message });
    }
  }
}

/** Keep logs small: record counts for large result arrays rather than full payloads. */
function summarise(v: unknown): unknown {
  if (Array.isArray(v)) return { count: v.length };
  return v ?? null;
}
