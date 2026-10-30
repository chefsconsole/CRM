import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MEAL_PLAN_LABEL, type MealPlan } from '../../../../shared/domain';
import { BookingStatusPill, Button, Dialog, Empty, ErrorNotice, Loading, LoadingRows, Money, Notice, PageHead, Panel, Pill, SampleTag, SelectInput, TextArea, TextInput, useAction } from '../../components/ui';
import { post } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDate, fmtDateTime, pct, toMinor } from '../../lib/format';

export function AdminBookings() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('search') ?? '');
  const qs = new URLSearchParams(params);
  const { data, error, loading } = useApi<any[]>(`/admin/bookings?${qs}`);
  return (
    <div className="page">
      <PageHead title="Bookings" subtitle="All reservations across agencies, with economics." />
      <div className="row between wrap gap-3" style={{ marginBottom: 'var(--s4)' }}>
        <div className="segmented">
          <button aria-pressed={!params.get('attention')} onClick={() => setParams({})}>All</button>
          <button aria-pressed={!!params.get('attention')} onClick={() => setParams({ attention: 'true' })}>Needs action</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setParams(q ? { search: q } : {}); }}><input className="input input-sm" style={{ width: 280 }} placeholder="Reference, guest, hotel, agency" value={q} onChange={(e) => setQ(e.target.value)} /></form>
      </div>
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? <Empty icon="calendar" title="No bookings">Nothing matches this view.</Empty> : (
        <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Booking</th><th>Agency</th><th>Arrival</th><th className="num">Sell</th><th className="num">Gross profit</th><th>Status</th></tr></thead>
          <tbody>{data.map((b) => (
            <tr key={b.id} className="clickable" onClick={() => navigate(`/admin/bookings/${b.id}`)}>
              <td><div className="table-title">{b.hotel_name}</div><div className="xs subtle">{b.reference} · {b.source}</div></td>
              <td data-hide-mobile className="small">{b.agency_name}</td><td data-hide-mobile className="small">{fmtDate(b.check_in)}</td>
              <td className="num"><Money minor={b.total_sell_minor} currency={b.currency} /></td>
              <td className="num" data-hide-mobile><Money minor={b.gross_profit_minor} currency={b.currency} /></td>
              <td><div className="row gap-2">{b.needs_reconciliation && <Pill tone="negative">Reconcile</Pill>}<BookingStatusPill status={b.status} /></div></td>
            </tr>))}</tbody></table></div>)}
      </div>
    </div>
  );
}

export function AdminBookingDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<any>(`/admin/bookings/${id}`);
  const [dialog, setDialog] = useState<null | 'confirm' | 'decline' | 'amend' | 'cancelreq' | 'payment' | 'cancel'>(null);
  const [text, setText] = useState('');
  const [pay, setPay] = useState({ direction: 'received', method: 'bank_transfer', amount: '', reference: '', at: new Date().toISOString().slice(0, 16) });
  const done = () => { setDialog(null); setText(''); reload(); };
  const act = useAction(async () => {
    const base = `/admin/bookings/${id}`;
    if (dialog === 'confirm') await post(`${base}/confirm`, { hotelConfirmationNumber: text });
    if (dialog === 'decline') await post(`${base}/decline`, { reason: text });
    if (dialog === 'amend') await post(`${base}/amendment/resolve`, { note: text });
    if (dialog === 'cancelreq') await post(`${base}/cancellation/complete`, { approve: true, note: text });
    if (dialog === 'cancel') await post(`${base}/cancel`, { acceptedPenaltyMinor: data.cancellation.penaltyMinor, reason: text });
    if (dialog === 'payment') {
      const amountMinor = toMinor(pay.amount);
      if (!amountMinor) throw new Error('Enter a valid amount, e.g. 245.00');
      await post('/admin/payments', { bookingId: id, direction: pay.direction, method: pay.method, amountMinor, currency: data.booking.currency, externalReference: pay.reference, receivedAt: new Date(`${pay.at}:00Z`).toISOString() });
    }
  }, { success: 'Saved', onDone: done });
  const reconcile = useAction(() => post(`/admin/bookings/${id}/reconcile`), { success: 'Reconciliation run', onDone: reload });
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const b = data.booking, e = b.economics, t = e.pricing.totals;
  return (
    <div className="page">
      <PageHead back={{ to: '/admin/bookings', label: 'Bookings' }} title={<span className="row gap-3 wrap">{b.hotel?.name}{b.hotel?.isSample && <SampleTag />}</span>}
        subtitle={<span className="row gap-3 wrap"><span className="num">{b.reference}</span><BookingStatusPill status={b.status} /><span className="small">{b.agency?.name}</span></span>}
        actions={<>
          {b.needsReconciliation && <Button loading={reconcile.busy} onClick={() => reconcile.run()} icon="refresh">Reconcile with supplier</Button>}
          {b.status === 'pending_confirmation' && <><Button onClick={() => setDialog('confirm')}>Record hotel confirmation</Button><Button variant="danger" onClick={() => setDialog('decline')}>Hotel declined</Button></>}
          {b.status === 'amendment_requested' && <Button onClick={() => setDialog('amend')}>Resolve amendment</Button>}
          {b.status === 'cancellation_requested' && <Button onClick={() => setDialog('cancelreq')}>Complete cancellation</Button>}
          {['confirmed', 'pending_confirmation', 'awaiting_payment'].includes(b.status) && <Button variant="secondary" onClick={() => setDialog('cancel')}>Cancel</Button>}
          <Button variant="secondary" onClick={() => setDialog('payment')}>Record payment</Button>
        </>} />
      <div className="stack gap-6">
        {b.needsReconciliation && <Notice tone="error" title="Supplier outcome unknown.">A booking request did not receive a response. It has not been retried. Reconcile by looking it up with the supplier — never re-submit.</Notice>}
        <ErrorNotice error={reconcile.error} />
        <div className="panel stat-row">
          <div className="stat"><span className="stat-label">Sell price (agency pays)</span><span className="stat-value"><Money minor={t.sellMinor} currency={e.pricing.sellCurrency} /></span></div>
          <div className="stat"><span className="stat-label">Supplier cost</span><span className="stat-value"><Money minor={e.supplierCostMinor} currency={e.supplierCurrency} /></span><span className="stat-note">{e.supplierCurrency !== b.currency && <>= <Money minor={e.supplierCostConvertedMinor} currency={b.currency} /> at recorded FX</>}</span></div>
          <div className="stat"><span className="stat-label">Gross profit</span><span className="stat-value"><Money minor={t.grossProfitMinor} currency={e.pricing.sellCurrency} /></span><span className="stat-note">Margin {pct(t.marginBps)} · markup {pct(t.markupBps)}</span></div>
          <div className="stat"><span className="stat-label">Balance due from agency</span><span className="stat-value"><Money minor={b.payment.outstandingMinor - b.payment.creditMinor} currency={b.currency} /></span><span className="stat-note">{b.payment.method === 'credit' ? 'On credit' : 'Prepay'} · due {fmtDate(b.payment.dueAt)}</span></div>
        </div>
        <div className="layout-2">
          <div className="stack gap-6">
            <Panel title="Pricing breakdown" pad={false}>
              <table className="table"><thead><tr><th>Room</th><th className="num">Supplier rate</th><th className="num">Tax</th><th className="num">Commission</th><th className="num">Cost</th><th className="num">Markup</th><th className="num">Sell</th></tr></thead>
                <tbody>{e.pricing.rooms.map((r: any, i: number) => <tr key={i}><td>{b.rooms[i]?.roomName} <span className="xs subtle">{b.rooms[i]?.adults}A{b.rooms[i]?.childrenAges.length ? `+${b.rooms[i].childrenAges.length}C` : ''}</span></td>
                  <td className="num"><Money minor={r.supplierRateMinor} currency={e.supplierCurrency} /></td><td className="num"><Money minor={r.supplierTaxMinor} currency={e.supplierCurrency} /></td><td className="num"><Money minor={r.commissionMinor} currency={e.supplierCurrency} /></td>
                  <td className="num"><Money minor={r.supplierCostConvertedMinor} currency={e.pricing.sellCurrency} /></td><td className="num"><Money minor={r.markupMinor} currency={e.pricing.sellCurrency} /></td><td className="num table-title"><Money minor={r.sellMinor} currency={e.pricing.sellCurrency} /></td></tr>)}</tbody></table>
              <div className="panel-body xs subtle">Rate model: {e.pricing.rateModel}{e.pricing.fx ? ` · FX ${e.pricing.fx.from}→${e.pricing.fx.to} ${(e.pricing.fx.rateScaled / 1e8).toFixed(6)} recorded ${fmtDateTime(e.pricing.fx.asOf)}` : ''}{e.pricing.markupRuleId ? ` · markup rule ${e.pricing.markupRuleId.slice(0, 8)}` : ' · no markup rule'}</div>
            </Panel>
            <Panel title="Ledger" pad={false}>
              {b.ledger.length === 0 ? <div className="panel-body small muted">No journals yet — posted on confirmation, payment and cancellation.</div> : (
                <table className="table"><thead><tr><th>When</th><th>Kind</th><th>Account</th><th className="num">Debit / (credit)</th></tr></thead>
                  <tbody>{b.ledger.map((l: any, i: number) => <tr key={i}><td className="xs">{fmtDateTime(l.created_at)}</td><td className="small">{l.kind}</td><td className="small">{l.account}</td><td className="num"><Money minor={l.amount_minor} currency={l.currency} /></td></tr>)}</tbody></table>)}
            </Panel>
            <Panel title="Supplier calls" pad={false}>
              {b.supplierCalls.length === 0 ? <div className="panel-body small muted">Internal contract — no external supplier calls.</div> : (
                <table className="table"><tbody>{b.supplierCalls.map((c: any, i: number) => <tr key={i}><td className="small">{c.operation}</td><td><Pill tone={c.outcome === 'success' ? 'positive' : 'negative'}>{c.outcome}</Pill></td><td className="xs subtle">{c.error_class ?? ''}</td><td className="num xs">{c.duration_ms} ms · {fmtDateTime(c.at)}</td></tr>)}</tbody></table>)}
            </Panel>
          </div>
          <div className="stack gap-6">
            <Panel title="Details">
              <dl className="kv">
                <dt>Source</dt><dd>{b.source}</dd>
                <dt>Supplier ref.</dt><dd className="num">{b.supplierReference ?? '—'}</dd>
                <dt>Hotel conf.</dt><dd className="num">{b.hotelConfirmationNumber ?? '—'}</dd>
                <dt>Stay</dt><dd>{fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}</dd>
                <dt>Board</dt><dd>{MEAL_PLAN_LABEL[b.mealPlan as MealPlan]}</dd>
                <dt>Lead guest</dt><dd>{b.leadGuestName}</dd>
                <dt>Free cancel</dt><dd>{b.cancellation.freeUntil ? fmtDateTime(b.cancellation.freeUntil) : 'Non-refundable'}</dd>
                {b.contractId && <><dt>Contract</dt><dd><Link to={`/admin/contracts/${b.contractId}`}>View contract</Link></dd></>}
              </dl>
            </Panel>
            <Panel title="History"><ol className="timeline">{b.events.map((ev: any, i: number) => <li key={i}><div className="table-title small">{ev.label}</div>{ev.note && <div className="xs muted">{ev.note}</div>}<div className="xs subtle">{fmtDateTime(ev.at)}</div></li>)}</ol></Panel>
          </div>
        </div>
      </div>
      {dialog && (
        <Dialog onClose={() => setDialog(null)} title={{ confirm: 'Record hotel confirmation', decline: 'Hotel declined the request', amend: 'Resolve amendment', cancelreq: 'Complete cancellation with supplier', payment: 'Record payment or refund', cancel: 'Cancel on behalf of the agency' }[dialog]}
          footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Close</Button><Button loading={act.busy} onClick={() => act.run()}>Save</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={act.error} />
            {dialog === 'confirm' && <TextInput label="Hotel confirmation number" value={text} onChange={(e) => setText(e.target.value)} />}
            {['decline', 'amend', 'cancelreq', 'cancel'].includes(dialog) && <TextArea label={dialog === 'decline' ? 'Reason given by the hotel' : 'Note (recorded on the booking)'} value={text} onChange={(e) => setText(e.target.value)} />}
            {dialog === 'cancelreq' && <p className="small muted">Only complete this once the supplier has confirmed the cancellation. The agency is charged at the policy in force when they requested it.</p>}
            {dialog === 'cancel' && <p className="small muted">Charge under the agency-facing policy now: <Money minor={data.cancellation.penaltyMinor} currency={b.currency} />.</p>}
            {dialog === 'payment' && <>
              <Notice tone="neutral">No payment provider is connected. Record payments from the bank statement. Recorded payments cannot be edited — post a refund to correct.</Notice>
              <div className="grid-2">
                <SelectInput label="Type" value={pay.direction} onChange={(e) => setPay({ ...pay, direction: e.target.value })}><option value="received">Payment received</option><option value="refunded">Refund paid out</option></SelectInput>
                <SelectInput label="Method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></SelectInput>
                <TextInput label={`Amount (${b.currency})`} inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                <TextInput label="Received at (UTC)" type="datetime-local" value={pay.at} onChange={(e) => setPay({ ...pay, at: e.target.value })} />
              </div>
              <TextInput label="Bank / external reference" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
            </>}
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function AdminFinance() {
  const { data, error, loading } = useApi<any>('/admin/finance');
  if (loading) return <div className="page"><LoadingRows /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  return (
    <div className="page">
      <PageHead title="Finance" subtitle="Receivables, payables and the journal. Ledger entries are append-only." />
      <div className="stack gap-6">
        <Notice tone="neutral">{data.paymentProvider.note} Accounting treatment (agent vs principal, VAT on margin, revenue timing) must be confirmed with a qualified accountant.</Notice>
        <div className="grid-2">
          <Panel title="Agency receivables" pad={false}>{data.receivables.length === 0 ? <div className="panel-body small muted">Nothing outstanding.</div> : <table className="table"><tbody>{data.receivables.map((r: any) => <tr key={r.id + r.currency}><td><Link to={`/admin/agencies/${r.id}`}>{r.name}</Link></td><td className="num"><Money minor={r.balance_minor} currency={r.currency} /></td></tr>)}</tbody></table>}</Panel>
          <Panel title="Supplier payables" pad={false}>{data.payables.length === 0 ? <div className="panel-body small muted">Nothing owed.</div> : <table className="table"><tbody>{data.payables.map((r: any) => <tr key={r.name + r.currency}><td>{r.name}</td><td className="num"><Money minor={r.payable_minor} currency={r.currency} /></td></tr>)}</tbody></table>}</Panel>
        </div>
        <Panel title="Recent journals" pad={false}>
          {data.journals.length === 0 ? <Empty icon="coins" title="No journals yet" /> : <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>When</th><th>Booking</th><th>Kind</th><th>Lines</th></tr></thead>
            <tbody>{data.journals.map((j: any) => <tr key={j.journal_id}><td className="xs">{fmtDateTime(j.created_at)}</td><td className="small">{j.reference ?? '—'}</td><td className="small">{j.kind}</td><td className="xs">{j.lines.map((l: any, i: number) => <div key={i} className="row between gap-4"><span>{l.account}</span><Money minor={l.amountMinor} currency={j.currency} /></div>)}</td></tr>)}</tbody></table></div>}
        </Panel>
        <Panel title="Payments" pad={false}>
          {data.payments.length === 0 ? <div className="panel-body small muted">No payments recorded.</div> : <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Received</th><th>Agency</th><th>Booking</th><th>Reference</th><th className="num">Amount</th></tr></thead>
            <tbody>{data.payments.map((p: any) => <tr key={p.id}><td className="small">{fmtDate(p.received_at)}</td><td className="small">{p.agency_name}</td><td className="small">{p.reference}</td><td className="small">{p.direction === 'refunded' ? 'Refund · ' : ''}{p.external_reference}</td><td className="num"><Money minor={p.direction === 'refunded' ? -p.amount_minor : p.amount_minor} currency={p.currency} /></td></tr>)}</tbody></table></div>}
        </Panel>
      </div>
    </div>
  );
}
