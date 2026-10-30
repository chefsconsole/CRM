import type { CancellationPolicy } from '../../../../shared/domain.js';
import { applyBps } from '../../lib/money.js';
import { addDays } from '../../lib/dates.js';

/**
 * Cancellation policies are tiers measured in days before check-in (00:00 UTC on arrival day).
 * A tier applies while `now` is earlier than (check-in − daysBefore days). If no tier still applies,
 * the full stay is charged. Agents see deadlines `bufferDays` earlier than the supplier's, so
 * HotelBridge always has time to cancel upstream.
 */
export const AGENT_BUFFER_DAYS = 1;

export function tierDeadline(checkIn: string, daysBefore: number): Date {
  return new Date(`${addDays(checkIn, -daysBefore)}T00:00:00Z`);
}

export function validatePolicy(p: CancellationPolicy): string | null {
  if (!p.refundable) return null;
  if (!p.tiers.length) return 'A refundable policy needs at least one tier.';
  for (const t of p.tiers) {
    if (!Number.isInteger(t.daysBefore) || t.daysBefore < 0) return 'daysBefore must be a non-negative integer.';
    if (!Number.isInteger(t.penaltyBps) || t.penaltyBps < 0 || t.penaltyBps > 10000) return 'penaltyBps must be 0–10000.';
  }
  return null;
}

/** Penalty in bps if cancelled at `now`. */
export function penaltyBpsAt(policy: CancellationPolicy, checkIn: string, now: Date, bufferDays = 0): number {
  if (!policy.refundable) return 10_000;
  const tiers = [...policy.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
  for (const tier of tiers) {
    if (now < tierDeadline(checkIn, tier.daysBefore + bufferDays)) return tier.penaltyBps;
  }
  return 10_000;
}

export function penaltyAt(policy: CancellationPolicy, checkIn: string, now: Date, totalMinor: number, bufferDays = 0) {
  const bps = penaltyBpsAt(policy, checkIn, now, bufferDays);
  return { penaltyBps: bps, penaltyMinor: applyBps(totalMinor, bps) };
}

/** Last instant a cancellation is free of charge, or null if never free. */
export function freeCancellationUntil(policy: CancellationPolicy, checkIn: string, bufferDays = 0): Date | null {
  if (!policy.refundable) return null;
  const free = policy.tiers.filter((t) => t.penaltyBps === 0);
  if (!free.length) return null;
  const minDays = Math.min(...free.map((t) => t.daysBefore));
  return tierDeadline(checkIn, minDays + bufferDays);
}

export function describePolicy(policy: CancellationPolicy, checkIn: string, bufferDays = 0): string[] {
  if (!policy.refundable) return ['Non-refundable: the full amount is charged on cancellation, amendment or no-show.'];
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const tiers = [...policy.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
  const lines: string[] = [];
  for (const t of tiers) {
    const until = fmt(tierDeadline(checkIn, t.daysBefore + bufferDays));
    lines.push(t.penaltyBps === 0
      ? `Free cancellation before ${until} 00:00 UTC.`
      : `${(t.penaltyBps / 100).toFixed(0)}% of the total if cancelled before ${until} 00:00 UTC.`);
  }
  lines.push('100% of the total after the last deadline or for no-shows.');
  return lines;
}
