import { z } from 'zod';
import { applyBps } from '../../lib/money.js';

/**
 * Commercial scenario model. These are SCENARIOS to test the business model, not forecasts.
 * Margins differ by segment, costs step up with scale, and cancellations remove value — nothing
 * is assumed to scale linearly for free.
 */
export const scenarioSchema = z.object({
  currency: z.string().length(3).default('EUR'),
  activeAgencies: z.number().int().min(1).max(1_000_000),
  bookingsPerAgencyPerMonth: z.number().min(0).max(1000),
  segments: z.array(z.object({
    name: z.string().max(60),
    shareBps: z.number().int().min(0).max(10000),          // share of bookings
    averageBookingValueMinor: z.number().int().min(0),
    takeRateBps: z.number().int().min(0).max(5000),        // net revenue as % of GBV
  })).min(1).max(6),
  cancellationRateBps: z.number().int().min(0).max(9000),
  paymentCostBps: z.number().int().min(0).max(1000),       // of GBV collected
  supportCostPerBookingMinor: z.number().int().min(0),
  agenciesPerAccountManager: z.number().int().min(1),
  accountManagerMonthlyCostMinor: z.number().int().min(0),
  fixedMonthlyCostsMinor: z.number().int().min(0),
});
export type ScenarioInput = z.infer<typeof scenarioSchema>;

export function runScenario(s: ScenarioInput) {
  const shareTotal = s.segments.reduce((a, x) => a + x.shareBps, 0);
  if (shareTotal !== 10000) throw new Error(`Segment shares must total 100% (currently ${shareTotal / 100}%)`);
  const grossBookings = Math.round(s.activeAgencies * s.bookingsPerAgencyPerMonth);
  const realisedBookings = grossBookings - Math.round((grossBookings * s.cancellationRateBps) / 10000);
  const segments = s.segments.map((seg) => {
    const bookings = Math.round((realisedBookings * seg.shareBps) / 10000);
    const gbv = bookings * seg.averageBookingValueMinor;
    const netRevenue = applyBps(gbv, seg.takeRateBps);
    return { name: seg.name, bookings, gbvMinor: gbv, netRevenueMinor: netRevenue, takeRateBps: seg.takeRateBps };
  });
  const gbv = segments.reduce((a, x) => a + x.gbvMinor, 0);
  const netRevenue = segments.reduce((a, x) => a + x.netRevenueMinor, 0);
  const paymentCosts = applyBps(gbv, s.paymentCostBps);
  const grossProfit = netRevenue - paymentCosts;
  const supportCosts = realisedBookings * s.supportCostPerBookingMinor;
  const accountManagers = Math.ceil(s.activeAgencies / s.agenciesPerAccountManager);
  const accountCosts = accountManagers * s.accountManagerMonthlyCostMinor;
  const contribution = grossProfit - supportCosts - accountCosts;
  const operating = contribution - s.fixedMonthlyCostsMinor;
  return {
    currency: s.currency,
    monthly: {
      grossBookings, cancelledBookings: grossBookings - realisedBookings, realisedBookings,
      gbvMinor: gbv, netRevenueMinor: netRevenue, paymentCostsMinor: paymentCosts, grossProfitMinor: grossProfit,
      supportCostsMinor: supportCosts, accountManagers, accountCostsMinor: accountCosts, contributionMinor: contribution,
      fixedCostsMinor: s.fixedMonthlyCostsMinor, operatingResultMinor: operating,
    },
    annual: { gbvMinor: gbv * 12, netRevenueMinor: netRevenue * 12, grossProfitMinor: grossProfit * 12, contributionMinor: contribution * 12, operatingResultMinor: operating * 12 },
    segments,
    blendedTakeRateBps: gbv ? Math.round((netRevenue * 10000) / gbv) : 0,
    disclaimer: 'Scenario only — illustrative inputs, not a forecast or a statement of actual performance.',
  };
}
