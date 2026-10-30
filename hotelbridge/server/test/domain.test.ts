import { describe, expect, it } from 'vitest';
import { applyBps, convert, parseDecimal, parseRate, ratioBps, roundUpToUnit } from '../src/lib/money.js';
import { price, PricingError } from '../src/modules/pricing/engine.js';
import { freeCancellationUntil, penaltyBpsAt, describePolicy } from '../src/modules/pricing/cancellation.js';
import { canTransition, TRANSITIONS } from '../src/modules/bookings/stateMachine.js';
import { runScenario } from '../src/modules/intelligence/scenarios.js';
import { compareOffers } from '../src/modules/pricing/compare.js';
import { BOOKING_STATUSES } from '../../shared/domain.js';

const nights = (n: number, amount: number, start = '2027-03-01') =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), amountMinor: amount }));

describe('money', () => {
  it('rounds basis points half-up without floating point drift', () => {
    expect(applyBps(10001, 1000)).toBe(1000);  // 1000.1 → 1000
    expect(applyBps(10005, 1000)).toBe(1001);  // 1000.5 → 1001
    expect(applyBps(1, 5000)).toBe(1);         // 0.5 → 1
    expect(applyBps(9_007_199_254_740, 10000)).toBe(9_007_199_254_740);
  });
  it('converts with a recorded 1e8-scaled rate and handles zero-decimal currencies', () => {
    expect(convert(10000, 'EUR', 'USD', 108_000_000)).toBe(10800);
    expect(convert(10000, 'EUR', 'JPY', 16_250_000_000)).toBe(16250); // €100 → ¥16,250
    expect(convert(16250, 'JPY', 'EUR', 615_384)).toBe(10000);
  });
  it('parses decimal strings exactly', () => {
    expect(parseDecimal('145.10', 'EUR')).toBe(14510);
    expect(parseDecimal('0.29', 'EUR')).toBe(29);
    expect(() => parseDecimal('1.234', 'EUR')).toThrow();
    expect(parseRate('1.08345')).toBe(108_345_000);
  });
  it('rounds up to the whole unit and computes ratios', () => {
    expect(roundUpToUnit(12301, 'EUR')).toBe(12400);
    expect(roundUpToUnit(12300, 'EUR')).toBe(12300);
    expect(ratioBps(1, 3)).toBe(3333);
  });
});

describe('pricing engine', () => {
  const base = { supplierCurrency: 'EUR', sellCurrency: 'EUR', rateModel: 'net' as const, commissionBps: 0, taxPolicy: { includedInRate: true }, fx: null };

  it('net rate + percentage markup keeps cost, markup, margin distinct', () => {
    const r = price({ ...base, markup: { id: 'm', type: 'percent', value: 1000, rounding: 'none' }, rooms: [{ guests: 2, nightly: nights(3, 10000) }] });
    expect(r.totals.supplierCostMinor).toBe(30000);
    expect(r.totals.sellMinor).toBe(33000);
    expect(r.totals.grossProfitMinor).toBe(3000);
    expect(r.totals.markupBps).toBe(1000);  // 10% on cost
    expect(r.totals.marginBps).toBe(909);   // 9.09% of sell — margin ≠ markup
  });

  it('prices mixed multi-room requests per room and sums exactly', () => {
    const r = price({ ...base, markup: { id: 'm', type: 'percent', value: 1000, rounding: 'up_to_unit' }, rooms: [
      { guests: 2, nightly: nights(2, 18500) }, { guests: 2, nightly: nights(2, 18500) }, { guests: 1, nightly: nights(2, 16550) },
    ] });
    expect(r.rooms.map((x) => x.sellMinor)).toEqual([40700, 40700, 36500]); // 36410 → rounded up to 36500
    expect(r.totals.sellMinor).toBe(40700 + 40700 + 36500);
    expect(r.totals.markupMinor).toBe(r.totals.sellMinor - r.totals.supplierCostConvertedMinor);
  });

  it('commissionable rates sell at gross; revenue is the commission', () => {
    const r = price({ ...base, rateModel: 'commissionable', commissionBps: 1500, markup: { id: 'm', type: 'percent', value: 1000, rounding: 'none' }, rooms: [{ guests: 2, nightly: nights(2, 15000) }] });
    expect(r.totals.sellMinor).toBe(30000);
    expect(r.totals.commissionMinor).toBe(4500);
    expect(r.totals.supplierCostMinor).toBe(25500);
    expect(r.totals.grossProfitMinor).toBe(4500);
  });

  it('adds VAT when excluded and passes it to the supplier, reports local tax separately', () => {
    const r = price({ ...base, taxPolicy: { includedInRate: false, vatBps: 900, localTaxPerPersonNightMinor: 300 }, markup: null, rooms: [{ guests: 2, nightly: nights(2, 10000) }] });
    expect(r.totals.taxMinor).toBe(1800);
    expect(r.totals.supplierCostMinor).toBe(21800);
    expect(r.totals.sellMinor).toBe(21800);
    expect(r.totals.localChargesMinor).toBe(1200); // not part of the sell price
  });

  it('requires a recorded FX rate to sell in another currency', () => {
    expect(() => price({ ...base, sellCurrency: 'USD', markup: null, rooms: [{ guests: 1, nightly: nights(1, 10000) }] })).toThrow(PricingError);
    const r = price({ ...base, sellCurrency: 'USD', fx: { id: 'fx', rateScaled: 108_000_000, from: 'EUR', to: 'USD', asOf: 'x' }, markup: { id: 'm', type: 'percent', value: 1000, rounding: 'none' }, rooms: [{ guests: 1, nightly: nights(1, 10000) }] });
    expect(r.totals.supplierCostMinor).toBe(10000);         // EUR
    expect(r.totals.supplierCostConvertedMinor).toBe(10800); // USD
    expect(r.totals.sellMinor).toBe(11880);
  });

  it('rejects a fixed markup in a different currency', () => {
    expect(() => price({ ...base, markup: { id: 'm', type: 'fixed_per_room_night', value: 500, currency: 'USD', rounding: 'none' }, rooms: [{ guests: 1, nightly: nights(1, 10000) }] })).toThrow(PricingError);
    const r = price({ ...base, markup: { id: 'm', type: 'fixed_per_room_night', value: 500, currency: 'EUR', rounding: 'none' }, rooms: [{ guests: 1, nightly: nights(3, 10000) }] });
    expect(r.totals.markupMinor).toBe(1500);
  });
});

describe('cancellation policy', () => {
  const policy = { refundable: true, tiers: [{ daysBefore: 7, penaltyBps: 0 }, { daysBefore: 2, penaltyBps: 5000 }] };
  it('applies tiers by time before arrival', () => {
    expect(penaltyBpsAt(policy, '2027-03-20', new Date('2027-03-10T12:00:00Z'))).toBe(0);
    expect(penaltyBpsAt(policy, '2027-03-20', new Date('2027-03-15T12:00:00Z'))).toBe(5000);
    expect(penaltyBpsAt(policy, '2027-03-20', new Date('2027-03-19T12:00:00Z'))).toBe(10000);
  });
  it('gives agents an earlier deadline than the supplier (buffer)', () => {
    expect(freeCancellationUntil(policy, '2027-03-20')!.toISOString()).toBe('2027-03-13T00:00:00.000Z');
    expect(freeCancellationUntil(policy, '2027-03-20', 1)!.toISOString()).toBe('2027-03-12T00:00:00.000Z');
    expect(penaltyBpsAt(policy, '2027-03-20', new Date('2027-03-12T12:00:00Z'), 1)).toBe(5000);
  });
  it('non-refundable is always 100% and never free', () => {
    const nr = { refundable: false, tiers: [] };
    expect(penaltyBpsAt(nr, '2027-03-20', new Date('2026-01-01'))).toBe(10000);
    expect(freeCancellationUntil(nr, '2027-03-20')).toBeNull();
    expect(describePolicy(nr, '2027-03-20')[0]).toMatch(/Non-refundable/);
  });
});

describe('booking state machine', () => {
  it('only allows defined transitions', () => {
    expect(canTransition('submitting', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'submitting')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('refunded', 'refund_pending')).toBe(false);
    for (const s of BOOKING_STATUSES) expect(TRANSITIONS[s]).toBeDefined();
  });
});

describe('scenario model', () => {
  const input = {
    currency: 'EUR', activeAgencies: 100, bookingsPerAgencyPerMonth: 4,
    segments: [
      { name: 'Direct contracts', shareBps: 6000, averageBookingValueMinor: 60000, takeRateBps: 1200 },
      { name: 'Third-party supply', shareBps: 4000, averageBookingValueMinor: 50000, takeRateBps: 600 },
    ],
    cancellationRateBps: 1000, paymentCostBps: 150, supportCostPerBookingMinor: 300,
    agenciesPerAccountManager: 50, accountManagerMonthlyCostMinor: 400000, fixedMonthlyCostsMinor: 2000000,
  };
  it('separates GBV, net revenue, gross profit and contribution', () => {
    const r = runScenario(input);
    expect(r.monthly.realisedBookings).toBe(360);
    expect(r.monthly.gbvMinor).toBe(216 * 60000 + 144 * 50000);
    expect(r.monthly.netRevenueMinor).toBe(applyBps(216 * 60000, 1200) + applyBps(144 * 50000, 600));
    expect(r.monthly.grossProfitMinor).toBeLessThan(r.monthly.netRevenueMinor);
    expect(r.monthly.contributionMinor).toBe(r.monthly.grossProfitMinor - 360 * 300 - 2 * 400000);
    expect(r.disclaimer).toMatch(/not a forecast/);
  });
  it('costs step up with scale (not linear for free)', () => {
    const r = runScenario({ ...input, activeAgencies: 101 });
    expect(r.monthly.accountManagers).toBe(3);
  });
  it('rejects segment shares that do not total 100%', () => {
    expect(() => runScenario({ ...input, segments: [{ ...input.segments[0], shareBps: 5000 }] })).toThrow(/100%/);
  });
});

describe('rate comparison', () => {
  const offer = (o: Partial<any> = {}) => ({
    source: 'a', hotelId: 'h', contractId: null, supplierRateKey: null, mealPlan: 'BB', currency: 'EUR', rateModel: 'net', commissionBps: 0,
    taxPolicy: { includedInRate: true }, cancellationPolicy: { refundable: true, tiers: [{ daysBefore: 3, penaltyBps: 0 }] },
    availability: 'instant', requiresRevalidation: false, notes: [], paymentTerms: null,
    rooms: [{ roomIndex: 0, roomTypeId: 'rt', roomName: 'Double', adults: 2, childrenAges: [], nightly: nights(2, 100) }], ...o,
  }) as any;
  const eq = (a: string | null, b: string | null) => a !== null && a === b;
  it('treats identical conditions as comparable', () => {
    expect(compareOffers(offer(), offer({ source: 'b' }), eq).comparable).toBe(true);
  });
  it('flags material differences', () => {
    const r = compareOffers(offer(), offer({ mealPlan: 'RO', cancellationPolicy: { refundable: false, tiers: [] } }), eq);
    expect(r.comparable).toBe(false);
    expect(r.differences.join()).toMatch(/meal plan/);
    expect(r.differences.join()).toMatch(/cancellation/);
  });
});
