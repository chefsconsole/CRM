# Finance model

**Requires professional review.** This describes how the system records money; it is not accounting advice.

## Concepts kept distinct

| Concept | Where |
|---|---|
| Supplier cost | `bookings.supplier_cost_minor` (supplier currency) and `supplier_cost_converted_minor` (booking currency at the recorded FX rate) |
| Agent selling price | `bookings.total_sell_minor` |
| Taxes in price | `pricing.totals.taxMinor` — passed through to the supplier, never revenue |
| Local charges | Paid by guests at the hotel; never in the sell price or the ledger |
| Commission | Commissionable contracts: hotel's commission to HotelBridge |
| Markup vs margin | Markup = gross profit ÷ cost; margin = gross profit ÷ sell |
| GBV | Sum of sell prices of live confirmed bookings — **not revenue** |
| Net revenue | `net_revenue` ledger account: sell − supplier cost (+ retained cancellation fees) |
| Gross profit | Net revenue − direct booking costs (none recorded yet) |
| Contribution | Gross profit − variable costs (payment fees, support) — not measurable until those costs are recorded |

## Journals (positive = debit)

| Event | Lines |
|---|---|
| Booking confirmed | Dr agent_receivable (sell) · Cr supplier_payable (cost) · Cr net_revenue (sell − cost) |
| Cancelled after confirmation | Exact reversal of the confirmation journal, then: Dr agent_receivable (agent fee) · Cr supplier_payable (supplier penalty) · Cr net_revenue (difference) |
| Payment received | Dr cash · Cr agent_receivable |
| Refund paid | Dr agent_receivable · Cr cash |

A negative agent receivable on a booking means HotelBridge holds the agency's money (prepayment or refund due).
Journals are rejected unless they balance per currency; ledger rows cannot be updated or deleted (trigger).

## Open treatment questions (decide with an accountant)

- Agent vs principal presentation (net vs gross revenue) per market.
- Revenue timing: currently posted at confirmation; realised stays are reported separately on the dashboard.
- VAT/GST on margin schemes and on commissions; invoice requirements per country.
- Supplier payables are recorded in the booking currency at the booking's FX rate; realised FX
  gains/losses on supplier settlement are not yet modelled.
