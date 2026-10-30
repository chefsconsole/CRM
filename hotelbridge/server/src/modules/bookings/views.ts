import type { Queryable } from '../../db/pool.js';
import { BOOKING_STATUS_LABEL, type BookingStatus } from '../../../../shared/domain.js';
import { notFound } from '../../lib/errors.js';
import { AGENT_BUFFER_DAYS, describePolicy } from '../pricing/cancellation.js';
import { bookingBalance } from '../finance/ledger.js';

/**
 * Load a booking scoped to an agency. Tenant isolation is enforced in the query itself:
 * a booking id belonging to another agency is indistinguishable from one that doesn't exist.
 */
export async function agencyBooking(q: Queryable, agencyId: string, bookingId: string) {
  const b = await q.one('SELECT * FROM bookings WHERE id = $1 AND agency_id = $2', [bookingId, agencyId]);
  if (!b) throw notFound('Booking');
  return b;
}

async function parts(q: Queryable, b: any) {
  const [rooms, events, hotel, invoices, balance] = await Promise.all([
    q.query('SELECT room_index, room_name, meal_plan, adults, children_ages, guests, sell_minor, supplier_cost_minor FROM booking_rooms WHERE booking_id = $1 ORDER BY room_index', [b.id]),
    q.query('SELECT from_status, to_status, note, at FROM booking_events WHERE booking_id = $1 ORDER BY at, id', [b.id]),
    q.one('SELECT id, slug, name, city, country_code, address, check_in_time, check_out_time, is_sample, partner_contact_email FROM hotels WHERE id = $1', [b.hotel_id]),
    q.query('SELECT number, kind, currency, amount_minor, status, issued_at, due_at FROM invoices WHERE booking_id = $1 ORDER BY issued_at', [b.id]),
    bookingBalance(q, b.id),
  ]);
  return { rooms, events, hotel, invoices, balance };
}

/** What an agency sees. Supplier cost, markup, margin and supplier internals are excluded. */
export async function agentBookingView(q: Queryable, b: any) {
  const p = await parts(q, b);
  const so = b.pricing.supplierOffer;
  return {
    id: b.id, reference: b.reference, status: b.status as BookingStatus, statusLabel: BOOKING_STATUS_LABEL[b.status as BookingStatus],
    isSandbox: b.source === 'sandbox',
    hotel: p.hotel && { slug: p.hotel.slug, name: p.hotel.name, city: p.hotel.city, countryCode: p.hotel.country_code, address: p.hotel.address, checkInTime: p.hotel.check_in_time, checkOutTime: p.hotel.check_out_time, isSample: p.hotel.is_sample },
    checkIn: b.check_in, checkOut: b.check_out, nights: b.nights,
    mealPlan: so.mealPlan,
    currency: b.currency, totalMinor: b.total_sell_minor,
    taxIncludedMinor: b.pricing.pricing.totals.taxMinor,
    localCharges: b.pricing.pricing.totals.localChargesMinor > 0 ? { amountMinor: b.pricing.pricing.totals.localChargesMinor, currency: b.pricing.pricing.totals.localChargesCurrency, label: so.taxPolicy.localTaxLabel ?? 'Local tax payable at the hotel' } : null,
    rooms: p.rooms.map((r: any) => ({ roomIndex: r.room_index, roomName: r.room_name, mealPlan: r.meal_plan, adults: r.adults, childrenAges: r.children_ages, guests: r.guests, sellMinor: r.sell_minor })),
    leadGuestName: b.lead_guest_name, agentReference: b.agent_reference, specialRequests: b.special_requests,
    supplierReference: b.status === 'confirmed' || b.status === 'cancelled' ? b.supplier_reference : null,
    hotelConfirmationNumber: b.hotel_confirmation_number,
    cancellation: { freeUntil: b.free_cancellation_until, lines: describePolicy(b.cancellation_policy, b.check_in, AGENT_BUFFER_DAYS) },
    payment: { method: b.payment_method, dueAt: b.payment_due_at, outstandingMinor: Math.max(0, p.balance), creditMinor: Math.max(0, -p.balance) },
    paymentTerms: so.paymentTerms,
    notes: so.notes,
    failureReason: b.status === 'failed' ? b.failure_reason : null,
    invoices: p.invoices,
    events: p.events.map((e: any) => ({ from: e.from_status, to: e.to_status, label: BOOKING_STATUS_LABEL[e.to_status as BookingStatus], note: e.note, at: e.at })),
    createdAt: b.created_at, confirmedAt: b.confirmed_at, cancelledAt: b.cancelled_at,
    voucherAvailable: b.status === 'confirmed' || b.status === 'amendment_requested',
  };
}

/** Internal view with full economics for HotelBridge staff. */
export async function adminBookingView(q: Queryable, b: any) {
  const base = await agentBookingView(q, b);
  const p = await parts(q, b);
  const agency = await q.one('SELECT id, name, country_code FROM agencies WHERE id = $1', [b.agency_id]);
  const calls = await q.query('SELECT operation, outcome, error_class, duration_ms, at FROM supplier_calls WHERE booking_id = $1 ORDER BY at DESC LIMIT 20', [b.id]);
  const ledger = await q.query('SELECT journal_id, account, amount_minor, currency, kind, memo, created_at FROM ledger_entries WHERE booking_id = $1 ORDER BY id', [b.id]);
  return {
    ...base,
    agency, source: b.source, contractId: b.contract_id, supplierReference: b.supplier_reference,
    needsReconciliation: b.needs_reconciliation, failureReason: b.failure_reason,
    economics: {
      supplierCurrency: b.supplier_currency, supplierCostMinor: b.supplier_cost_minor, supplierCostConvertedMinor: b.supplier_cost_converted_minor,
      fxRateScaled: b.fx_rate_scaled, pricing: b.pricing.pricing,
    },
    rooms: p.rooms.map((r: any) => ({ ...base.rooms.find((x) => x.roomIndex === r.room_index), supplierCostMinor: r.supplier_cost_minor })),
    supplierCalls: calls, ledger,
  };
}
