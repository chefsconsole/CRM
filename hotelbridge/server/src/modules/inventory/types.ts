import type { CancellationPolicy, MealPlan, RoomRequest } from '../../../../shared/domain.js';
import type { NightlyRate, TaxPolicy } from '../pricing/engine.js';
import type { Db, Queryable } from '../../db/pool.js';

/**
 * The common internal inventory model. Every source — our own contracts, a request-to-book hotel,
 * or a third-party B2B supplier — is translated into these shapes. Nothing outside an adapter
 * may depend on a supplier's native response format.
 */

export interface Capabilities {
  search: boolean;
  content: boolean;
  revalidate: boolean;
  book: boolean;
  retrieve: boolean;     // look up a booking by our client reference — required for safe reconciliation
  cancel: boolean;
  amend: boolean;
  instantConfirmation: boolean;
  idempotentBooking: boolean;
}

export interface AdapterStatus {
  configured: boolean;
  environment: 'internal' | 'sandbox' | 'production' | 'not_connected';
  label: string;
  missing: string[];      // what is required to activate it (credentials, agreements)
  notes?: string;
}

export interface SearchQuery {
  agencyId: string;
  city: string;
  hotelIds: string[];     // catalogue hotels in scope (curated collection only)
  checkIn: string;
  checkOut: string;
  rooms: RoomRequest[];
  mealPlan?: MealPlan;
}

export interface SupplierRoom {
  roomIndex: number;
  roomTypeId: string | null;
  roomName: string;
  adults: number;
  childrenAges: number[];
  nightly: NightlyRate[];
}

/** An offer in supplier terms — before HotelBridge pricing is applied. */
export interface SupplierOffer {
  source: string;
  hotelId: string;
  contractId: string | null;
  supplierRateKey: string | null;
  mealPlan: MealPlan;
  currency: string;
  rateModel: 'net' | 'commissionable';
  commissionBps: number;
  taxPolicy: TaxPolicy;
  cancellationPolicy: CancellationPolicy;
  availability: 'instant' | 'on_request';
  requiresRevalidation: boolean;
  rooms: SupplierRoom[];
  notes: string[];        // restrictions and conditions the agent must see
  paymentTerms: string | null;
}

export type RevalidateResult =
  | { ok: true; offer: SupplierOffer }
  | { ok: false; reason: string };

export interface BookRequest {
  clientReference: string; // our booking reference — sent to suppliers for idempotency / lookup
  bookingId: string;
  offer: SupplierOffer;
  leadGuestName: string;
  guests: { roomIndex: number; names: { first: string; last: string }[] }[];
  specialRequests?: string | null;
}

export type BookOutcome =
  | { outcome: 'confirmed'; supplierReference: string; hotelConfirmationNumber?: string | null }
  | { outcome: 'pending'; supplierReference: string | null }
  | { outcome: 'failed'; reason: string }
  /** Unknown: the request may or may not have succeeded (e.g. timeout). Never retry blindly — reconcile. */
  | { outcome: 'unknown'; reason: string };

export type CancelOutcome =
  | { outcome: 'cancelled'; supplierPenaltyMinor: number | null }
  | { outcome: 'pending' }
  | { outcome: 'failed'; reason: string };

export interface AdapterContext { db: Db; q: Queryable; now: Date }

export interface InventoryAdapter {
  code: string;
  name: string;
  kind: 'direct' | 'third_party' | 'development';
  capabilities: Capabilities;
  status(): AdapterStatus;
  search(ctx: AdapterContext, query: SearchQuery): Promise<SupplierOffer[]>;
  revalidate(ctx: AdapterContext, offer: SupplierOffer): Promise<RevalidateResult>;
  book(ctx: AdapterContext, req: BookRequest): Promise<BookOutcome>;
  retrieve(ctx: AdapterContext, clientReference: string): Promise<BookOutcome | null>;
  cancel(ctx: AdapterContext, clientReference: string, supplierReference: string | null): Promise<CancelOutcome>;
  /** Release anything held for a booking that will not proceed (e.g. allocation). */
  release?(ctx: AdapterContext, bookingId: string): Promise<void>;
}

export class SupplierError extends Error {
  constructor(public errorClass: 'timeout' | 'network' | 'rejected' | 'not_configured' | 'invalid_response' | 'circuit_open', message: string) {
    super(message);
  }
}
