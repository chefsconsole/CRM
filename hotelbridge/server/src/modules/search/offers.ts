import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/pool.js';
import { AVAILABILITY_LABEL, type Availability } from '../../../../shared/domain.js';
import { price, PricingError, type PricingResult } from '../pricing/engine.js';
import { resolveFx, resolveMarkup } from '../pricing/rules.js';
import { AGENT_BUFFER_DAYS, describePolicy, freeCancellationUntil } from '../pricing/cancellation.js';
import type { SupplierOffer } from '../inventory/types.js';

export interface AgencyCommercials { id: string; selling_currency: string }

export interface PricedOffer { supplierOffer: SupplierOffer; pricing: PricingResult }

/** Apply HotelBridge commercial rules to a supplier offer. Sell currency falls back to supplier currency without a fresh FX rate. */
export async function priceSupplierOffer(q: Queryable, agency: AgencyCommercials, offer: SupplierOffer, now: Date): Promise<PricedOffer> {
  const markup = await resolveMarkup(q, agency.id, offer.source);
  let sellCurrency = agency.selling_currency;
  let fx = await resolveFx(q, offer.currency, sellCurrency, now);
  if (offer.currency !== sellCurrency && !fx) { sellCurrency = offer.currency; fx = null; }
  const effectiveMarkup = markup?.type === 'fixed_per_room_night' && markup.currency !== sellCurrency ? null : markup;
  const pricing = price({
    supplierCurrency: offer.currency, sellCurrency, rateModel: offer.rateModel, commissionBps: offer.commissionBps,
    taxPolicy: offer.taxPolicy, markup: effectiveMarkup, fx,
    rooms: offer.rooms.map((r) => ({ guests: r.adults + r.childrenAges.length, nightly: r.nightly })),
  });
  return { supplierOffer: offer, pricing };
}

export function availabilityOf(o: SupplierOffer): Availability {
  if (o.availability === 'on_request') return 'on_request';
  return o.requiresRevalidation ? 'revalidate' : 'instant';
}

export async function persistOffer(ctx: AppContext, q: Queryable, args: { agencyId: string; searchId: string | null; priced: PricedOffer }) {
  const { priced } = args;
  const expires = new Date(ctx.now().getTime() + ctx.config.offerTtlMinutes * 60_000);
  const row = await q.one<{ id: string }>(
    `INSERT INTO offers (search_id, agency_id, hotel_id, source, payload, total_sell_minor, currency, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [args.searchId, args.agencyId, priced.supplierOffer.hotelId, priced.supplierOffer.source, JSON.stringify(priced),
      priced.pricing.totals.sellMinor, priced.pricing.sellCurrency, expires],
  );
  return { id: row!.id, expiresAt: expires };
}

/**
 * The agent-facing view of an offer. Supplier cost, commission, markup and margin are confidential
 * and never leave the server in agent responses.
 */
export function agentOfferView(id: string, expiresAt: Date | string, p: PricedOffer, sourceLabel: string) {
  const o = p.supplierOffer;
  const checkIn = o.rooms[0].nightly[0].date;
  const freeUntil = freeCancellationUntil(o.cancellationPolicy, checkIn, AGENT_BUFFER_DAYS);
  const availability = availabilityOf(o);
  return {
    id,
    expiresAt: new Date(expiresAt).toISOString(),
    source: o.source,
    sourceLabel,
    isSandbox: o.source === 'sandbox',
    mealPlan: o.mealPlan,
    availability,
    availabilityLabel: AVAILABILITY_LABEL[availability],
    currency: p.pricing.sellCurrency,
    totalMinor: p.pricing.totals.sellMinor,
    taxIncludedMinor: p.pricing.totals.taxMinor,
    taxesIncluded: true,
    localCharges: p.pricing.totals.localChargesMinor > 0
      ? { amountMinor: p.pricing.totals.localChargesMinor, currency: p.pricing.totals.localChargesCurrency, label: o.taxPolicy.localTaxLabel ?? 'Local tax payable at the hotel' }
      : null,
    fx: p.pricing.fx ? { from: p.pricing.fx.from, to: p.pricing.fx.to, asOf: p.pricing.fx.asOf } : null,
    rooms: o.rooms.map((r, i) => ({
      roomIndex: r.roomIndex, roomName: r.roomName, adults: r.adults, childrenAges: r.childrenAges,
      nights: r.nightly.length, sellMinor: p.pricing.rooms[i].sellMinor,
    })),
    cancellation: {
      refundable: o.cancellationPolicy.refundable && freeUntil !== null,
      freeUntil: freeUntil?.toISOString() ?? null,
      lines: describePolicy(o.cancellationPolicy, checkIn, AGENT_BUFFER_DAYS),
    },
    notes: o.notes,
    paymentTerms: o.paymentTerms,
  };
}
export type AgentOfferView = ReturnType<typeof agentOfferView>;

export const SOURCE_LABEL: Record<string, string> = {
  direct_contract: 'HotelBridge contract',
  sandbox: 'Sandbox supplier',
};

export { PricingError };
