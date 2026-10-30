import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorNotice, LoadingRows, Money, Notice, PageHead, Panel, Pill } from '../../components/ui';
import { useApi } from '../../lib/useApi';
import { fmtRelative, pct } from '../../lib/format';

const linkFor = (i: any) => ({
  booking: `/admin/bookings/${i.entityId}`, group_enquiry: `/admin/groups/${i.entityId}`, contract: `/admin/contracts/${i.entityId}`,
  agency: `/admin/agencies/${i.entityId}`, partner_application: '/admin/applications', support_ticket: `/admin/support/${i.entityId}`,
} as Record<string, string>)[i.entityType] ?? '/admin';

export default function AdminOverview() {
  const { data, error, loading } = useApi<any>('/admin/overview');
  if (loading) return <div className="page"><LoadingRows rows={8} /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const m = data.metrics;
  const high = data.issues.filter((i: any) => i.severity === 'high').length;
  return (
    <div className="page">
      <PageHead title="Overview" subtitle="What the business has actually done — from recorded bookings, ledger entries and enquiries." />
      <div className="stack gap-6 enter">
        {data.environment !== 'production' && <Notice tone="warn" title={`${data.environment} environment.`}>Figures below come from this environment's records, which include demo and test data. They are not business performance.</Notice>}

        <Panel title={<span className="row gap-3">Needs attention {data.issues.length > 0 && <Pill tone={high ? 'negative' : 'attention'}>{data.issues.length}</Pill>}</span>} pad={false}>
          {data.issues.length === 0 ? <Empty icon="check" title="Nothing waiting">No unresolved bookings, overdue payments, missed group deadlines or pending verifications.</Empty> : (
            <div className="table-wrap"><table className="table table-responsive"><tbody>{data.issues.slice(0, 25).map((i: any, k: number) => (
              <tr key={k}><td style={{ width: 110 }}><Pill tone={i.severity === 'high' ? 'negative' : i.severity === 'medium' ? 'attention' : 'neutral'}>{i.severity === 'high' ? 'Urgent' : i.severity === 'medium' ? 'Today' : 'Soon'}</Pill></td>
                <td><Link to={linkFor(i)} className="table-title">{i.title}</Link><div className="xs subtle">{i.detail}</div></td>
                <td data-hide-mobile className="xs subtle num">{i.at ? fmtRelative(i.at) : ''}</td></tr>))}</tbody></table></div>)}
        </Panel>

        <section>
          <div className="section-title"><h2>Network</h2></div>
          <div className="panel stat-row">
            <div className="stat"><span className="stat-label">Registered agencies</span><span className="stat-value">{m.agencies.registered}</span><span className="stat-note">{m.agencies.pending} awaiting verification</span></div>
            <div className="stat"><span className="stat-label">Verified agencies</span><span className="stat-value">{m.agencies.verified}</span></div>
            <div className="stat"><span className="stat-label">Active (30 days)</span><span className="stat-value">{m.agencies.activeLast30d}</span><span className="stat-note">Agencies that searched</span></div>
            <div className="stat"><span className="stat-label">Searches (30 days)</span><span className="stat-value">{m.funnel.searches30d}</span><span className="stat-note">{pct(m.funnel.searchToBookingBps)} became bookings</span></div>
          </div>
        </section>

        <section>
          <div className="section-title"><h2>Bookings</h2><span className="xs subtle">Created ≠ confirmed ≠ realised</span></div>
          <div className="panel stat-row">
            <div className="stat"><span className="stat-label">Created</span><span className="stat-value">{m.bookings.created}</span><span className="stat-note">All records, any status</span></div>
            <div className="stat"><span className="stat-label">Confirmed (live)</span><span className="stat-value">{m.bookings.confirmed}</span><span className="stat-note">{m.bookings.roomNights} room nights</span></div>
            <div className="stat"><span className="stat-label">Realised</span><span className="stat-value">{m.bookings.realised}</span><span className="stat-note">Stay completed</span></div>
            <div className="stat"><span className="stat-label">Cancellation rate</span><span className="stat-value">{pct(m.bookings.cancellationRateBps)}</span><span className="stat-note">Of bookings ever confirmed</span></div>
            <div className="stat"><span className="stat-label">Repeat agencies</span><span className="stat-value">{pct(m.bookings.repeatAgencyRateBps)}</span><span className="stat-note">Booked 2+ times</span></div>
          </div>
        </section>

        <section>
          <div className="section-title"><h2>Economics</h2><span className="xs subtle">Per currency — never summed across currencies</span></div>
          {m.byCurrency.length === 0 ? <div className="panel"><Empty icon="chart" title="No confirmed bookings yet">Gross booking value and revenue appear once bookings are confirmed.</Empty></div> : (
            <div className="panel table-wrap"><table className="table table-responsive">
              <thead><tr><th>Currency</th><th className="num">GBV (not revenue)</th><th className="num">Realised GBV</th><th className="num">Net revenue</th><th className="num">Gross profit</th><th className="num">Contribution</th><th className="num">Avg booking</th></tr></thead>
              <tbody>{m.byCurrency.map((c: any) => (
                <tr key={c.currency}><td className="table-title">{c.currency}</td>
                  <td className="num"><Money minor={c.gbvMinor} currency={c.currency} /></td><td className="num"><Money minor={c.realisedGbvMinor} currency={c.currency} /></td>
                  <td className="num"><Money minor={c.netRevenueMinor} currency={c.currency} /></td><td className="num"><Money minor={c.grossProfitMinor} currency={c.currency} /></td>
                  <td className="num subtle" title={m.definitions.contribution}>Needs cost data</td><td className="num"><Money minor={c.averageBookingValueMinor} currency={c.currency} /></td></tr>))}</tbody></table></div>)}
          <dl className="kv mt-4 xs">{Object.entries(m.definitions).map(([k, v]) => <Fragment key={k}><dt>{({ gbv: 'GBV', netRevenue: 'Net revenue', grossProfit: 'Gross profit', contribution: 'Contribution' } as Record<string, string>)[k] ?? k}</dt><dd style={{ fontWeight: 400, color: 'var(--text-2)' }}>{v as string}</dd></Fragment>)}</dl>
        </section>

        <div className="grid-2">
          <Panel title="Obligations" pad={false}>
            {m.exposure.length === 0 ? <div className="panel-body small muted">No receivables or payables recorded.</div> : (
              <table className="table"><thead><tr><th>Currency</th><th className="num">Agencies owe</th><th className="num">Owed to suppliers</th><th className="num">Cash</th></tr></thead>
                <tbody>{m.exposure.map((e: any) => <tr key={e.currency}><td>{e.currency}</td><td className="num"><Money minor={e.agent_receivable_minor ?? 0} currency={e.currency} /></td><td className="num"><Money minor={e.supplier_payable_minor ?? 0} currency={e.currency} /></td><td className="num"><Money minor={e.cash_minor ?? 0} currency={e.currency} /></td></tr>)}</tbody></table>)}
            <div className="panel-body xs subtle" style={{ paddingTop: 0 }}>A negative receivable means HotelBridge holds agency money (prepayments or refunds due). <Link to="/admin/finance">Finance detail</Link></div>
          </Panel>
          <Panel title="Supply" pad={false}>
            {m.supplierConcentration.length === 0 ? <div className="panel-body small muted">No confirmed bookings by source yet.</div> : (
              <table className="table"><thead><tr><th>Source</th><th className="num">Bookings</th><th className="num">Share of GBV</th></tr></thead>
                <tbody>{m.supplierConcentration.map((s: any) => <tr key={s.source + s.currency}><td>{s.source} <span className="xs subtle">{s.currency}</span></td><td className="num">{s.bookings}</td><td className="num">{pct(s.shareBps)}</td></tr>)}</tbody></table>)}
            <div className="panel-body xs subtle" style={{ paddingTop: 0 }}>Supplier calls (30 days): {m.suppliers.calls30d} · failure rate {pct(m.suppliers.failureRateBps)}</div>
          </Panel>
        </div>

        <div className="grid-2">
          <Panel title="Hotel production" pad={false}>
            {m.hotelProduction.length === 0 ? <div className="panel-body small muted">Production by hotel appears with confirmed bookings.</div> : (
              <div className="table-wrap"><table className="table"><thead><tr><th>Hotel</th><th className="num">Bookings</th><th className="num">GBV</th><th className="num">Gross profit</th></tr></thead>
                <tbody>{m.hotelProduction.map((h: any) => <tr key={h.name + h.currency}><td><div className="table-title small">{h.name}</div><div className="xs subtle">{h.city}</div></td><td className="num">{h.bookings}</td><td className="num"><Money minor={h.gbv_minor} currency={h.currency} /></td><td className="num"><Money minor={h.gross_profit_minor} currency={h.currency} /></td></tr>)}</tbody></table></div>)}
          </Panel>
          <Panel title="Group Desk">
            <dl className="kv">
              <dt>Open enquiries</dt><dd>{m.groups.open}</dd>
              <dt>Won / lost</dt><dd>{m.groups.won} / {m.groups.lost}</dd>
              <dt>Conversion</dt><dd>{m.groups.won + m.groups.lost ? pct(m.groups.conversionBps) : '—'}</dd>
              <dt>Time to first proposal</dt><dd>{m.groups.avgHoursToFirstProposal ? `${m.groups.avgHoursToFirstProposal.toFixed(1)} h average` : '—'}</dd>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
