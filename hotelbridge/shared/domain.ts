/** Domain vocabulary shared by server and web. No business calculations live here. */

export const BOOKING_STATUSES = [
  'awaiting_payment', 'submitting', 'pending_confirmation', 'confirmed', 'amendment_requested',
  'cancellation_requested', 'cancelled', 'failed', 'refund_pending', 'refunded',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  submitting: 'Submission in progress',
  pending_confirmation: 'Pending hotel confirmation',
  confirmed: 'Confirmed',
  amendment_requested: 'Amendment requested',
  cancellation_requested: 'Cancellation requested',
  cancelled: 'Cancelled',
  failed: 'Not confirmed',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
};

export type StatusTone = 'positive' | 'pending' | 'attention' | 'negative' | 'neutral';
export const BOOKING_STATUS_TONE: Record<BookingStatus, StatusTone> = {
  awaiting_payment: 'attention', submitting: 'pending', pending_confirmation: 'pending', confirmed: 'positive',
  amendment_requested: 'pending', cancellation_requested: 'pending', cancelled: 'neutral', failed: 'negative',
  refund_pending: 'attention', refunded: 'neutral',
};

/** How an offer can be booked — shown on every result so nothing is implied that isn't true. */
export type Availability = 'instant' | 'revalidate' | 'on_request';
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  instant: 'Available to book now',
  revalidate: 'Price confirmed at checkout',
  on_request: 'On request — hotel confirms',
};

export const MEAL_PLANS = ['RO', 'BB', 'HB', 'FB', 'AI'] as const;
export type MealPlan = (typeof MEAL_PLANS)[number];
export const MEAL_PLAN_LABEL: Record<MealPlan, string> = {
  RO: 'Room only', BB: 'Breakfast included', HB: 'Half board', FB: 'Full board', AI: 'All inclusive',
};

export const ROLES = ['agency_admin', 'agency_agent', 'hb_admin', 'hb_ops', 'hb_finance', 'hotel_partner'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['hb_admin', 'hb_ops', 'hb_finance'];
export const ROLE_LABEL: Record<Role, string> = {
  agency_admin: 'Agency administrator', agency_agent: 'Agent', hb_admin: 'HotelBridge administrator',
  hb_ops: 'HotelBridge operations', hb_finance: 'HotelBridge finance', hotel_partner: 'Hotel partner',
};

export const GROUP_STAGES = [
  'new', 'under_review', 'sent_to_hotels', 'offers_received', 'proposal_prepared', 'sent_to_agent',
  'negotiation', 'won', 'lost', 'cancelled',
] as const;
export type GroupStage = (typeof GROUP_STAGES)[number];
export const GROUP_STAGE_LABEL: Record<GroupStage, string> = {
  new: 'New', under_review: 'Under review', sent_to_hotels: 'Sent to hotels', offers_received: 'Offers received',
  proposal_prepared: 'Proposal prepared', sent_to_agent: 'Proposal sent', negotiation: 'Negotiation',
  won: 'Won', lost: 'Lost', cancelled: 'Cancelled',
};

export const COLLECTIONS = ['city_centre', 'airport', 'business', 'premium_leisure', 'groups', 'value', 'station'] as const;
export type Collection = (typeof COLLECTIONS)[number];
export const COLLECTION_LABEL: Record<Collection, string> = {
  city_centre: 'City centre', airport: 'Airport', business: 'Business', premium_leisure: 'Premium leisure',
  groups: 'Groups', value: 'Value', station: 'Near rail station',
};

/** Cancellation policy: ordered tiers. A stay cancelled ≥ daysBefore check-in incurs penaltyBps of the total. */
export interface CancellationTier { daysBefore: number; penaltyBps: number }
export interface CancellationPolicy { refundable: boolean; tiers: CancellationTier[]; notes?: string }

export interface RoomRequest { adults: number; childrenAges: number[] }

/** Display formatting only. Never use for calculation. */
export function formatMoney(minor: number, currency: string, opts: { compact?: boolean } = {}): string {
  const digits = ['JPY', 'KRW', 'VND', 'CLP', 'ISK'].includes(currency) ? 0 : 2;
  const value = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency,
      minimumFractionDigits: opts.compact ? 0 : digits, maximumFractionDigits: opts.compact ? 0 : digits,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(digits)}`;
  }
}
