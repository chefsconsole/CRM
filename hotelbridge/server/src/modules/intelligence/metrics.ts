import type { Queryable } from '../../db/pool.js';
import { ratioBps } from '../../lib/money.js';

/**
 * Founder metrics computed ONLY from recorded data. Monetary metrics are grouped by currency —
 * amounts in different currencies are never added together.
 *
 * Definitions:
 *   created     every booking record
 *   confirmed   currently confirmed (or amendment pending) — economically live
 *   realised    confirmed and the stay has ended (check-out in the past)
 *   GBV         gross booking value: sell price of confirmed bookings. NOT revenue.
 *   net revenue ledger balance of the net_revenue account (sell − supplier cost, incl. cancellation fees)
 *   gross profit net revenue − direct costs recorded against bookings (none recorded yet → equals net revenue)
 *   contribution gross profit − variable costs (payment fees, support) — requires cost data, reported as unavailable until recorded
 */
const LIVE = `('confirmed','amendment_requested','cancellation_requested')`;

export async function founderMetrics(q: Queryable, now = new Date()) {
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const [agencies, activity, bookings, money, ledger, receivables, repeat, sources, hotels, groups, suppliers, timeToProposal] = await Promise.all([
    q.one(`SELECT count(*)::int AS registered, count(*) FILTER (WHERE status='active')::int AS verified, count(*) FILTER (WHERE status='pending')::int AS pending FROM agencies`),
    q.one(`SELECT count(*)::int AS searches_30d, count(DISTINCT agency_id)::int AS active_agencies_30d FROM searches WHERE created_at >= $1`, [since30]),
    q.one(`SELECT count(*)::int AS created,
                  count(*) FILTER (WHERE status IN ${LIVE})::int AS confirmed,
                  count(*) FILTER (WHERE status IN ${LIVE} AND check_out < $1::date)::int AS realised,
                  count(*) FILTER (WHERE status IN ('cancelled','refund_pending','refunded') AND confirmed_at IS NOT NULL)::int AS cancelled_after_confirmation,
                  count(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS ever_confirmed,
                  count(*) FILTER (WHERE status = 'failed')::int AS failed,
                  COALESCE(SUM(nights * (SELECT count(*) FROM booking_rooms r WHERE r.booking_id = b.id)) FILTER (WHERE status IN ${LIVE}),0)::int AS room_nights,
                  count(*) FILTER (WHERE created_at >= $2)::int AS created_30d
             FROM bookings b`, [now.toISOString().slice(0, 10), since30]),
    q.query(`SELECT currency, SUM(total_sell_minor)::bigint AS gbv_minor, count(*)::int AS n,
                    SUM(total_sell_minor) FILTER (WHERE check_out < $1::date)::bigint AS realised_gbv_minor
               FROM bookings WHERE status IN ${LIVE} GROUP BY currency ORDER BY currency`, [now.toISOString().slice(0, 10)]),
    q.query(`SELECT currency, -SUM(amount_minor)::bigint AS net_revenue_minor FROM ledger_entries WHERE account = 'net_revenue' GROUP BY currency ORDER BY currency`),
    q.query(`SELECT currency,
                    SUM(amount_minor) FILTER (WHERE account='agent_receivable')::bigint AS agent_receivable_minor,
                    -SUM(amount_minor) FILTER (WHERE account='supplier_payable')::bigint AS supplier_payable_minor,
                    SUM(amount_minor) FILTER (WHERE account='cash')::bigint AS cash_minor
               FROM ledger_entries GROUP BY currency ORDER BY currency`),
    q.one(`SELECT count(*) FILTER (WHERE n >= 2)::int AS repeat_agencies, count(*)::int AS booking_agencies
             FROM (SELECT agency_id, count(*) AS n FROM bookings WHERE confirmed_at IS NOT NULL GROUP BY agency_id) x`),
    q.query(`SELECT source, currency, count(*)::int AS bookings, SUM(total_sell_minor)::bigint AS gbv_minor FROM bookings WHERE status IN ${LIVE} GROUP BY source, currency ORDER BY gbv_minor DESC`),
    q.query(`SELECT h.name, h.city, b.currency, count(*)::int AS bookings, SUM(b.nights)::int AS nights, SUM(b.total_sell_minor)::bigint AS gbv_minor,
                    SUM(b.total_sell_minor - b.supplier_cost_converted_minor)::bigint AS gross_profit_minor
               FROM bookings b JOIN hotels h ON h.id = b.hotel_id WHERE b.status IN ${LIVE}
              GROUP BY h.name, h.city, b.currency ORDER BY gbv_minor DESC LIMIT 15`),
    q.one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='won')::int AS won, count(*) FILTER (WHERE status='lost')::int AS lost,
                  count(*) FILTER (WHERE status NOT IN ('won','lost','cancelled'))::int AS open FROM group_enquiries`),
    q.one(`SELECT count(*)::int AS calls, count(*) FILTER (WHERE outcome <> 'success')::int AS failures FROM supplier_calls WHERE at >= $1`, [since30]),
    q.one(`SELECT AVG(EXTRACT(EPOCH FROM (p.first_sent - e.created_at)) / 3600)::float AS hours
             FROM group_enquiries e JOIN (SELECT enquiry_id, MIN(sent_at) AS first_sent FROM group_proposals WHERE sent_at IS NOT NULL GROUP BY enquiry_id) p ON p.enquiry_id = e.id`),
  ]);
  const b: any = bookings;
  const net = new Map(ledger.map((r: any) => [r.currency, r.net_revenue_minor]));
  const totalGbvByCcy = new Map(sources.map((s: any) => [s.currency, 0]));
  for (const s of sources as any[]) totalGbvByCcy.set(s.currency, (totalGbvByCcy.get(s.currency) ?? 0) + s.gbv_minor);
  const decided = (groups as any).won + (groups as any).lost;
  return {
    hasData: b.created > 0 || (agencies as any).registered > 0,
    agencies: { ...(agencies as any), activeLast30d: (activity as any).active_agencies_30d },
    funnel: {
      searches30d: (activity as any).searches_30d, bookingsCreated30d: b.created_30d,
      searchToBookingBps: ratioBps(b.created_30d, (activity as any).searches_30d),
    },
    bookings: {
      created: b.created, confirmed: b.confirmed, realised: b.realised, failed: b.failed, roomNights: b.room_nights,
      cancellationRateBps: ratioBps(b.cancelled_after_confirmation, b.ever_confirmed),
      repeatAgencyRateBps: ratioBps((repeat as any).repeat_agencies, (repeat as any).booking_agencies),
    },
    byCurrency: money.map((m: any) => {
      const netRevenue = net.get(m.currency) ?? 0;
      return {
        currency: m.currency,
        gbvMinor: m.gbv_minor, realisedGbvMinor: m.realised_gbv_minor ?? 0,
        averageBookingValueMinor: m.n ? Math.round(m.gbv_minor / m.n) : 0,
        netRevenueMinor: netRevenue, grossProfitMinor: netRevenue,
        netRevenuePerActiveAgencyMinor: (activity as any).active_agencies_30d ? Math.round(netRevenue / (activity as any).active_agencies_30d) : null,
        contributionMinor: null as number | null, // requires recorded payment & support costs
      };
    }),
    netRevenueOnlyCurrencies: ledger.filter((l: any) => !money.find((m: any) => m.currency === l.currency)),
    exposure: receivables,
    supplierConcentration: (sources as any[]).map((s) => ({ ...s, shareBps: ratioBps(s.gbv_minor, totalGbvByCcy.get(s.currency) ?? 0) })),
    hotelProduction: hotels,
    groups: { ...(groups as any), conversionBps: ratioBps((groups as any).won, decided), avgHoursToFirstProposal: (timeToProposal as any)?.hours ?? null },
    suppliers: { calls30d: (suppliers as any).calls, failureRateBps: ratioBps((suppliers as any).failures, (suppliers as any).calls) },
    definitions: {
      gbv: 'Gross booking value — total sell price of live confirmed bookings. This is not revenue.',
      netRevenue: 'Recorded in the ledger: sell price minus supplier cost, plus cancellation fees retained.',
      grossProfit: 'Net revenue less direct costs recorded against bookings. No direct costs are recorded yet.',
      contribution: 'Requires payment-processing and support costs to be recorded. Not yet measurable.',
    },
  };
}

export interface OpsIssue { severity: 'high' | 'medium' | 'low'; kind: string; title: string; detail: string; entityType: string; entityId: string; at: string | null }

/** Everything that needs a human, newest-risk first. */
export async function operationalIssues(q: Queryable, now = new Date()): Promise<OpsIssue[]> {
  const issues: OpsIssue[] = [];
  const push = (rows: any[], f: (r: any) => OpsIssue) => rows.forEach((r) => issues.push(f(r)));
  const [unknown, pending, payDue, cancelReq, amendReq, refunds, groupLate, hotelLate, contractsExpiring, agenciesPending, apps, tickets] = await Promise.all([
    q.query(`SELECT id, reference, updated_at FROM bookings WHERE needs_reconciliation`),
    q.query(`SELECT id, reference, created_at, check_in FROM bookings WHERE status = 'pending_confirmation' ORDER BY check_in`),
    q.query(`SELECT b.id, b.reference, b.payment_due_at, b.status FROM bookings b
              WHERE b.status IN ('confirmed','awaiting_payment','amendment_requested') AND b.payment_due_at < $1
                AND (SELECT COALESCE(SUM(amount_minor),0) FROM ledger_entries l WHERE l.booking_id = b.id AND l.account = 'agent_receivable') > 0
                 OR (b.status = 'awaiting_payment' AND b.payment_due_at < $1)`, [now]),
    q.query(`SELECT id, reference, updated_at FROM bookings WHERE status = 'cancellation_requested'`),
    q.query(`SELECT id, reference, updated_at FROM bookings WHERE status = 'amendment_requested'`),
    q.query(`SELECT id, reference, updated_at FROM bookings WHERE status = 'refund_pending'`),
    q.query(`SELECT id, reference, target_response_at, status FROM group_enquiries WHERE status IN ('new','under_review') AND target_response_at < $1`, [now]),
    q.query(`SELECT r.id, r.hotel_name, r.respond_by, e.reference, e.id AS enquiry_id FROM group_hotel_requests r JOIN group_enquiries e ON e.id = r.enquiry_id
              WHERE r.status = 'sent' AND r.respond_by < $1 AND e.status NOT IN ('won','lost','cancelled')`, [now]),
    q.query(`SELECT c.id, c.reference, c.valid_to, h.name FROM contracts c JOIN hotels h ON h.id = c.hotel_id
              WHERE c.status = 'active' AND c.valid_to <= ($1::date + 45)`, [now.toISOString().slice(0, 10)]),
    q.query(`SELECT id, name, created_at FROM agencies WHERE status = 'pending' ORDER BY created_at`),
    q.query(`SELECT id, organisation, kind, created_at FROM partner_applications WHERE status = 'new' ORDER BY created_at`),
    q.query(`SELECT id, reference, subject, priority, updated_at FROM support_tickets WHERE status = 'open' ORDER BY priority DESC, updated_at`),
  ]);
  push(unknown, (r) => ({ severity: 'high', kind: 'reconciliation', title: `${r.reference}: supplier outcome unknown`, detail: 'A booking request timed out. Reconcile with the supplier before any retry.', entityType: 'booking', entityId: r.id, at: r.updated_at }));
  push(pending, (r) => ({ severity: (Date.parse(`${r.check_in}T00:00:00Z`) - now.getTime()) < 3 * 86_400_000 ? 'high' : 'medium', kind: 'pending_confirmation', title: `${r.reference}: awaiting hotel confirmation`, detail: `Arrival ${r.check_in}. Chase the hotel and record its decision.`, entityType: 'booking', entityId: r.id, at: r.created_at }));
  push(payDue, (r) => ({ severity: 'high', kind: 'payment_overdue', title: `${r.reference}: payment overdue`, detail: `Payment was due ${new Date(r.payment_due_at).toISOString().slice(0, 16).replace('T', ' ')} UTC.`, entityType: 'booking', entityId: r.id, at: r.payment_due_at }));
  push(cancelReq, (r) => ({ severity: 'high', kind: 'cancellation_request', title: `${r.reference}: cancellation to complete`, detail: 'The supplier could not process it automatically.', entityType: 'booking', entityId: r.id, at: r.updated_at }));
  push(amendReq, (r) => ({ severity: 'medium', kind: 'amendment_request', title: `${r.reference}: amendment requested`, detail: 'Review the request with the hotel.', entityType: 'booking', entityId: r.id, at: r.updated_at }));
  push(refunds, (r) => ({ severity: 'medium', kind: 'refund_pending', title: `${r.reference}: refund owed to agency`, detail: 'Record the refund once paid.', entityType: 'booking', entityId: r.id, at: r.updated_at }));
  push(groupLate, (r) => ({ severity: 'medium', kind: 'group_sla', title: `${r.reference}: response target missed`, detail: 'Group enquiry has not progressed past review.', entityType: 'group_enquiry', entityId: r.id, at: r.target_response_at }));
  push(hotelLate, (r) => ({ severity: 'low', kind: 'hotel_no_response', title: `${r.reference}: ${r.hotel_name} has not responded`, detail: `Offer was requested by ${new Date(r.respond_by).toISOString().slice(0, 10)}.`, entityType: 'group_enquiry', entityId: r.enquiry_id, at: r.respond_by }));
  push(contractsExpiring, (r) => ({ severity: 'low', kind: 'contract_expiring', title: `${r.name}: contract ${r.reference} ends ${r.valid_to}`, detail: 'Plan the renewal negotiation.', entityType: 'contract', entityId: r.id, at: null }));
  push(agenciesPending, (r) => ({ severity: 'medium', kind: 'agency_verification', title: `${r.name}: awaiting verification`, detail: 'Verify the agency before it can book.', entityType: 'agency', entityId: r.id, at: r.created_at }));
  push(apps, (r) => ({ severity: 'low', kind: 'partner_application', title: `${r.organisation}: new ${r.kind} application`, detail: 'Review the partner application.', entityType: 'partner_application', entityId: r.id, at: r.created_at }));
  push(tickets, (r) => ({ severity: r.priority === 'urgent' ? 'high' : 'medium', kind: 'support', title: `${r.reference}: ${r.subject}`, detail: 'Open support request.', entityType: 'support_ticket', entityId: r.id, at: r.updated_at }));
  const rank = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
