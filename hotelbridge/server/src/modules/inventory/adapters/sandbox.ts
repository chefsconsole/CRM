import { nightsOf } from '../../../lib/dates.js';
import type { AdapterContext, BookOutcome, BookRequest, CancelOutcome, InventoryAdapter, RevalidateResult, SearchQuery, SupplierOffer } from '../types.js';
import { SupplierError } from '../types.js';
import { fits } from './contracted.js';

/**
 * DEVELOPMENT-ONLY simulated third-party supplier. Every response is fabricated and every offer it
 * produces is labelled SANDBOX. It exists to exercise the supplier boundary — revalidation, price
 * changes, timeouts, unknown booking outcomes and reconciliation — before a real supplier is connected.
 * The registry refuses to load it when APP_ENV=production.
 */
export type SandboxFault = 'none' | 'search_error' | 'price_increase' | 'book_reject' | 'book_timeout_after_commit' | 'sold_out';

export class SandboxAdapter implements InventoryAdapter {
  code = 'sandbox';
  name = 'Sandbox supplier (simulated)';
  kind = 'development' as const;
  capabilities = {
    search: true, content: false, revalidate: true, book: true, retrieve: true, cancel: true,
    amend: false, instantConfirmation: true, idempotentBooking: true,
  };
  fault: SandboxFault = 'none';
  /** Bookings the simulated supplier holds, keyed by our client reference. */
  readonly store = new Map<string, { supplierReference: string; status: 'confirmed' | 'cancelled' }>();

  constructor(private slowMs: number) {}

  status() {
    return {
      configured: true, environment: 'sandbox' as const, label: 'Sandbox — simulated responses, development only', missing: [],
      notes: 'Responses are generated locally and are not real hotel inventory.',
    };
  }

  async search(ctx: AdapterContext, query: SearchQuery): Promise<SupplierOffer[]> {
    if (this.fault === 'search_error') throw new SupplierError('network', 'Sandbox search error (injected)');
    const mapped = await ctx.q.query<{ hotel_id: string; external_id: string }>(
      `SELECT hotel_id, external_id FROM source_mappings WHERE source = 'sandbox' AND room_type_id IS NULL AND hotel_id = ANY($1::uuid[])`, [query.hotelIds]);
    const nights = nightsOf(query.checkIn, query.checkOut);
    const offers: SupplierOffer[] = [];
    for (const m of mapped) {
      if (this.fault === 'sold_out') continue;
      const base = 9000 + (hash(m.external_id) % 9000); // EUR minor units per night
      const mealPlan = query.mealPlan ?? 'BB';
      const room = { id: 'sandbox-std-dbl', hotel_id: m.hotel_id, name: 'Standard Double', max_adults: 2, max_children: 1, max_occupancy: 3 };
      if (!query.rooms.every((r) => fits(room, r))) continue;
      offers.push({
        source: this.code, hotelId: m.hotel_id, contractId: null, supplierRateKey: `SBX-${m.external_id}-${query.checkIn}-${mealPlan}`,
        mealPlan, currency: 'EUR', rateModel: 'net', commissionBps: 0,
        taxPolicy: { includedInRate: true },
        cancellationPolicy: { refundable: true, tiers: [{ daysBefore: 3, penaltyBps: 0 }, { daysBefore: 1, penaltyBps: 10000 }] },
        availability: 'instant', requiresRevalidation: true,
        rooms: query.rooms.map((r, i) => ({
          roomIndex: i, roomTypeId: null, roomName: 'Standard Double (sandbox)', adults: r.adults, childrenAges: r.childrenAges,
          nightly: nights.map((d) => ({ date: d, amountMinor: base + (r.adults - 1) * 1500 + r.childrenAges.length * 1000 })),
        })),
        notes: ['SANDBOX: simulated supplier response for development and testing.'],
        paymentTerms: 'Simulated supplier terms.',
      });
    }
    return offers;
  }

  async revalidate(_ctx: AdapterContext, offer: SupplierOffer): Promise<RevalidateResult> {
    if (this.fault === 'sold_out') return { ok: false, reason: 'The supplier reports this rate is no longer available.' };
    if (this.fault === 'price_increase') {
      return { ok: true, offer: { ...offer, rooms: offer.rooms.map((r) => ({ ...r, nightly: r.nightly.map((n) => ({ ...n, amountMinor: Math.round(n.amountMinor * 1.05) })) })) } };
    }
    return { ok: true, offer };
  }

  async book(_ctx: AdapterContext, req: BookRequest): Promise<BookOutcome> {
    if (this.fault === 'book_reject') throw new SupplierError('rejected', 'Sandbox supplier rejected the booking (injected)');
    // Idempotent on our client reference, like a well-behaved supplier.
    const existing = this.store.get(req.clientReference);
    if (existing) return { outcome: 'confirmed', supplierReference: existing.supplierReference };
    const supplierReference = `SBX${hash(req.clientReference).toString(36).toUpperCase()}`;
    this.store.set(req.clientReference, { supplierReference, status: 'confirmed' });
    if (this.fault === 'book_timeout_after_commit') {
      // The booking exists at the supplier, but the response never arrives in time.
      await new Promise((r) => setTimeout(r, this.slowMs));
    }
    return { outcome: 'confirmed', supplierReference };
  }

  async retrieve(_ctx: AdapterContext, clientReference: string): Promise<BookOutcome | null> {
    const b = this.store.get(clientReference);
    if (!b) return null;
    return b.status === 'confirmed' ? { outcome: 'confirmed', supplierReference: b.supplierReference } : { outcome: 'failed', reason: 'cancelled' };
  }

  async cancel(_ctx: AdapterContext, clientReference: string): Promise<CancelOutcome> {
    const b = this.store.get(clientReference);
    if (!b) return { outcome: 'failed', reason: 'Booking not found at supplier' };
    b.status = 'cancelled';
    return { outcome: 'cancelled', supplierPenaltyMinor: null };
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
