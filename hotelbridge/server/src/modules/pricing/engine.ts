import { applyBps, convert, ratioBps, roundUpToUnit, sum, assertMinor } from '../../lib/money.js';

/**
 * The single authoritative pricing engine. Pure and deterministic: given supplier prices and the
 * commercial rules in force, it produces every number a booking needs — and keeps them distinct:
 *
 *   supplier cost   what HotelBridge owes the hotel/supplier (supplier currency, then converted)
 *   taxes           tax amounts inside the price (passed through to the supplier, never revenue)
 *   commission      for commissionable rates, the hotel's commission to HotelBridge
 *   markup          amount added to cost (markup % is relative to COST)
 *   sell price      what the agency pays
 *   gross profit    sell − converted supplier cost (margin % is relative to SELL)
 *   local charges   payable directly at the hotel, NOT included in the sell price
 */

export interface NightlyRate { date: string; amountMinor: number }

export interface TaxPolicy {
  /** true: rates already include all taxes charged by the supplier. */
  includedInRate: boolean;
  /** When not included: VAT/sales tax added to the rate, in bps. Paid to the supplier. */
  vatBps?: number;
  /** Local/city tax per person per night, collected by the hotel on arrival. */
  localTaxPerPersonNightMinor?: number;
  localTaxLabel?: string;
}

export interface MarkupRule {
  id: string;
  type: 'percent' | 'fixed_per_room_night';
  value: number; // bps, or minor units in `currency`
  currency?: string | null;
  rounding: 'none' | 'up_to_unit';
}

export interface FxQuote { id: string; rateScaled: number; from: string; to: string; asOf: string }

export interface PricingInput {
  supplierCurrency: string;
  sellCurrency: string;
  rateModel: 'net' | 'commissionable';
  commissionBps: number;
  taxPolicy: TaxPolicy;
  markup: MarkupRule | null;
  fx: FxQuote | null;
  rooms: { guests: number; nightly: NightlyRate[] }[];
}

export interface PricedRoom {
  nights: number;
  supplierRateMinor: number;    // sum of nightly rates, supplier currency
  supplierTaxMinor: number;     // tax added on top of rate, supplier currency
  commissionMinor: number;      // supplier currency
  supplierCostMinor: number;    // supplier currency — what we pay
  supplierCostConvertedMinor: number; // sell currency
  taxMinor: number;             // sell currency, informational (included in sell)
  markupMinor: number;          // sell currency
  sellMinor: number;            // sell currency
  localChargesMinor: number;    // supplier currency, payable at hotel
}

export interface PricingResult {
  supplierCurrency: string;
  sellCurrency: string;
  rateModel: 'net' | 'commissionable';
  fx: FxQuote | null;
  markupRuleId: string | null;
  rooms: PricedRoom[];
  totals: {
    supplierCostMinor: number;
    supplierCostConvertedMinor: number;
    commissionMinor: number;
    taxMinor: number;
    markupMinor: number;
    sellMinor: number;
    grossProfitMinor: number;
    marginBps: number;   // gross profit / sell
    markupBps: number;   // gross profit / cost
    localChargesMinor: number;
    localChargesCurrency: string;
  };
}

export class PricingError extends Error {}

export function price(input: PricingInput): PricingResult {
  const { supplierCurrency, sellCurrency, rateModel, taxPolicy, markup } = input;
  if (supplierCurrency !== sellCurrency) {
    if (!input.fx) throw new PricingError(`No recorded FX rate for ${supplierCurrency}→${sellCurrency}`);
    if (input.fx.from !== supplierCurrency || input.fx.to !== sellCurrency) throw new PricingError('FX quote does not match currencies');
  }
  if (markup?.type === 'fixed_per_room_night' && markup.currency !== sellCurrency) {
    throw new PricingError(`Fixed markup is in ${markup.currency}, cannot apply to ${sellCurrency} prices`);
  }
  const conv = (m: number) => (supplierCurrency === sellCurrency ? m : convert(m, supplierCurrency, sellCurrency, input.fx!.rateScaled));

  const rooms: PricedRoom[] = input.rooms.map((room) => {
    if (room.nightly.length === 0) throw new PricingError('Room has no nights');
    const nights = room.nightly.length;
    const supplierRateMinor = sum(room.nightly.map((n) => assertMinor(n.amountMinor, 'nightly rate')));
    const supplierTaxMinor = taxPolicy.includedInRate ? 0 : applyBps(supplierRateMinor, taxPolicy.vatBps ?? 0);
    const grossSupplierMinor = supplierRateMinor + supplierTaxMinor;
    // Commission is calculated on the rate excluding tax.
    const commissionMinor = rateModel === 'commissionable' ? applyBps(supplierRateMinor, input.commissionBps) : 0;
    const supplierCostMinor = grossSupplierMinor - commissionMinor;
    const supplierCostConvertedMinor = conv(supplierCostMinor);
    const taxMinor = conv(supplierTaxMinor);

    let sellMinor: number;
    if (rateModel === 'commissionable') {
      // Commissionable rates are sold at the hotel's gross price (rate parity); our revenue is the commission.
      sellMinor = conv(grossSupplierMinor);
    } else {
      let m = 0;
      if (markup?.type === 'percent') m = applyBps(supplierCostConvertedMinor, markup.value);
      if (markup?.type === 'fixed_per_room_night') m = markup.value * nights;
      sellMinor = supplierCostConvertedMinor + m;
    }
    if (markup?.rounding === 'up_to_unit') sellMinor = roundUpToUnit(sellMinor, sellCurrency);
    const localChargesMinor = (taxPolicy.localTaxPerPersonNightMinor ?? 0) * room.guests * nights;

    return {
      nights, supplierRateMinor, supplierTaxMinor, commissionMinor, supplierCostMinor, supplierCostConvertedMinor,
      taxMinor, markupMinor: sellMinor - supplierCostConvertedMinor, sellMinor, localChargesMinor,
    };
  });

  const t = (k: keyof PricedRoom) => sum(rooms.map((r) => r[k] as number));
  const sellMinor = t('sellMinor');
  const costConv = t('supplierCostConvertedMinor');
  const grossProfitMinor = sellMinor - costConv;
  return {
    supplierCurrency, sellCurrency, rateModel, fx: input.fx, markupRuleId: markup?.id ?? null, rooms,
    totals: {
      supplierCostMinor: t('supplierCostMinor'),
      supplierCostConvertedMinor: costConv,
      commissionMinor: t('commissionMinor'),
      taxMinor: t('taxMinor'),
      markupMinor: t('markupMinor'),
      sellMinor,
      grossProfitMinor,
      marginBps: ratioBps(grossProfitMinor, sellMinor),
      markupBps: ratioBps(grossProfitMinor, costConv),
      localChargesMinor: t('localChargesMinor'),
      localChargesCurrency: supplierCurrency,
    },
  };
}
