import type { BookingStatus } from '../../../../shared/domain.js';
import type { Queryable } from '../../db/pool.js';
import { conflict } from '../../lib/errors.js';

/** Allowed lifecycle transitions. Anything else is rejected. */
export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  awaiting_payment: ['submitting', 'cancelled', 'failed'],
  submitting: ['confirmed', 'pending_confirmation', 'failed'],
  pending_confirmation: ['confirmed', 'failed', 'cancelled'],
  confirmed: ['amendment_requested', 'cancellation_requested', 'cancelled'],
  amendment_requested: ['confirmed', 'cancellation_requested', 'cancelled'],
  cancellation_requested: ['cancelled', 'confirmed'],
  cancelled: ['refund_pending'],
  failed: ['refund_pending'],
  refund_pending: ['refunded'],
  refunded: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus) {
  return TRANSITIONS[from].includes(to);
}

/**
 * Compare-and-set transition: succeeds only if the booking is still in `from`.
 * Concurrent requests therefore cannot both move a booking (e.g. double cancellation).
 */
export async function transition(
  q: Queryable, bookingId: string, from: BookingStatus, to: BookingStatus,
  opts: { actorUserId?: string | null; note?: string; set?: Record<string, unknown> } = {},
) {
  if (!canTransition(from, to)) throw conflict('INVALID_TRANSITION', `A booking cannot move from ${from} to ${to}.`);
  const sets = ['status = $3', 'updated_at = now()'];
  const params: unknown[] = [bookingId, from, to];
  for (const [col, val] of Object.entries(opts.set ?? {})) {
    if (!/^[a-z_]+$/.test(col)) throw new Error('bad column');
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  }
  const row = await q.one(`UPDATE bookings SET ${sets.join(', ')} WHERE id = $1 AND status = $2 RETURNING *`, params);
  if (!row) throw conflict('STATE_CHANGED', 'This booking was updated by someone else. Please refresh.');
  await q.query('INSERT INTO booking_events (booking_id, from_status, to_status, actor_user_id, note) VALUES ($1,$2,$3,$4,$5)',
    [bookingId, from, to, opts.actorUserId ?? null, opts.note ?? null]);
  return row;
}
