import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BOOKING_STATUS_LABEL, MEAL_PLAN_LABEL, type BookingStatus, type MealPlan } from '../../../../shared/domain';
import { BookingStatusPill, Button, ButtonLink, Dialog, Empty, ErrorNotice, Loading, LoadingRows, Money, Notice, PageHead, Panel, SampleTag, TextArea, useAction } from '../../components/ui';
import { Icon } from '../../components/icons';
import { post } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDate, fmtDateTime, plural } from '../../lib/format';

const FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Confirmed', value: 'confirmed,amendment_requested' },
  { label: 'Pending', value: 'pending_confirmation,submitting,awaiting_payment,cancellation_requested' },
  { label: 'Cancelled', value: 'cancelled,refund_pending,refunded,failed' },
];

export function BookingList() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const navigate = useNavigate();
  const { data, error, loading } = useApi<any>(`/agent/bookings?${new URLSearchParams({ ...(status && { status }), ...(params.get('q') && { search: params.get('q')! }) })}`);
  return (
    <div className="page">
      <PageHead title="My bookings" subtitle="Every reservation made by your agency, with its current status." actions={<ButtonLink to="/app/search" icon="search">New booking</ButtonLink>} />
      <div className="row between wrap gap-3" style={{ marginBottom: 'var(--s4)' }}>
        <div className="segmented" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => <button key={f.label} aria-pressed={status === f.value} onClick={() => setParams(f.value ? { status: f.value } : {})}>{f.label}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setParams({ ...(status && { status }), ...(search && { q: search }) }); }}>
          <input className="input input-sm" style={{ width: 260 }} placeholder="Reference, guest, hotel…" aria-label="Search bookings" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
      </div>
      <ErrorNotice error={error} />
      <div className="panel">
        {loading ? <div className="panel-body"><LoadingRows /></div> : data?.bookings.length === 0 ? (
          <Empty icon="calendar" title="No bookings found" action={<ButtonLink to="/app/search" size="sm">Search hotels</ButtonLink>}>Try a different filter, or make your first booking.</Empty>
        ) : (
          <div className="table-wrap"><table className="table table-responsive">
            <thead><tr><th>Hotel &amp; guest</th><th>Stay</th><th>Free cancellation</th><th className="num">Total</th><th>Status</th></tr></thead>
            <tbody>{data?.bookings.map((b: any) => (
              <tr key={b.id} className="clickable" onClick={() => navigate(`/app/bookings/${b.id}`)}>
                <td><div className="table-title row gap-2">{b.hotel_name}{b.is_sandbox && <span className="tag tag-sample">Sandbox</span>}</div><div className="xs subtle">{b.reference} · {b.lead_guest_name}{b.agent_reference ? ` · ${b.agent_reference}` : ''}</div></td>
                <td data-hide-mobile className="small">{fmtDate(b.check_in)}<div className="xs subtle">{plural(b.nights, 'night')}</div></td>
                <td data-hide-mobile className="small">{b.free_cancellation_until ? fmtDate(b.free_cancellation_until) : <span className="subtle">Non-refundable</span>}</td>
                <td className="num"><Money minor={b.total_sell_minor} currency={b.currency} /></td>
                <td><BookingStatusPill status={b.status} /></td>
              </tr>))}</tbody></table></div>
        )}
      </div>
    </div>
  );
}

function Confirmation({ status }: { status: BookingStatus }) {
  const map: Partial<Record<BookingStatus, [string, string, string]>> = {
    confirmed: ['', 'Booking confirmed', 'The hotel reservation is confirmed. Your voucher is ready.'],
    pending_confirmation: ['pending', 'Request sent to the hotel', 'This booking is not yet confirmed. We will update its status as soon as the hotel responds.'],
    awaiting_payment: ['attention', 'Booking created — awaiting payment', 'This non-refundable rate is sent to the hotel once payment is received. It is not yet confirmed.'],
    submitting: ['pending', 'Confirming with the supplier', 'We have not yet received the supplier\'s response. We will not book twice — operations is reconciling the status.'],
    failed: ['attention', 'The booking could not be completed', 'Nothing was confirmed. See the reason below and choose another option.'],
  };
  const m = map[status];
  if (!m) return null;
  return (
    <div className="panel panel-pad row gap-4 enter" style={{ alignItems: 'flex-start' }}>
      <div className={`confirm-mark ${m[0]}`}>
        <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={status === 'confirmed' ? 'M4 10.5 8 14.5 16 6' : status === 'failed' ? 'M10 4v7M10 14.5v.1' : 'M10 4v6l3 2'} />
        </svg>
      </div>
      <div className="stack gap-1"><h2 style={{ fontSize: 'var(--fs-lg)' }}>{m[1]}</h2><p className="muted small">{m[2]}</p></div>
    </div>
  );
}

export function BookingDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useApi<any>(`/agent/bookings/${id}`);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const cancel = useAction(() => post(`/agent/bookings/${id}/cancel`, { acceptedPenaltyMinor: data.cancellation.penaltyMinor, reason }), { success: 'Cancellation processed', onDone: () => { setCancelOpen(false); reload(); } });
  const amend = useAction(() => post(`/agent/bookings/${id}/amend`, { details }), { success: 'Amendment request sent', onDone: () => { setAmendOpen(false); reload(); } });
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const b = data.booking;
  const canCancel = ['awaiting_payment', 'pending_confirmation', 'confirmed', 'amendment_requested'].includes(b.status);
  return (
    <div className="page">
      <PageHead back={{ to: '/app/bookings', label: 'My bookings' }}
        title={<span className="row gap-3 wrap">{b.hotel?.name}{b.hotel?.isSample && <SampleTag />}{b.isSandbox && <span className="tag tag-sample">Sandbox</span>}</span>}
        subtitle={<span className="row gap-3 wrap"><span className="num">{b.reference}</span><BookingStatusPill status={b.status} /></span>}
        actions={<>
          {b.voucherAvailable && <a className="btn btn-secondary" href={`/api/agent/bookings/${b.id}/voucher`} target="_blank" rel="noreferrer"><Icon name="print" size={16} />Voucher</a>}
          {b.status === 'confirmed' && <Button variant="secondary" onClick={() => setAmendOpen(true)}>Request amendment</Button>}
          {canCancel && <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancel booking</Button>}
        </>} />
      <div className="stack gap-6">
        {params.get('new') && <Confirmation status={b.status} />}
        {b.failureReason && <Notice tone="error" title="Reason:">{b.failureReason}</Notice>}
        {b.payment.outstandingMinor > 0 && b.status !== 'cancelled' && b.status !== 'awaiting_payment' && <Notice tone={b.payment.dueAt && new Date(b.payment.dueAt).getTime() - Date.now() < 3 * 86_400_000 ? 'warn' : 'info'} title="Payment due.">Outstanding <Money minor={b.payment.outstandingMinor} currency={b.currency} />{b.payment.dueAt && <> by <strong>{fmtDateTime(b.payment.dueAt)}</strong></>}. Bank details are on the invoice from HotelBridge finance.</Notice>}
        {b.status === 'awaiting_payment' && <Notice tone="warn" title="Not yet confirmed.">Pay <Money minor={b.totalMinor} currency={b.currency} /> by {fmtDateTime(b.payment.dueAt)}. The rate is re-checked with the hotel when payment arrives.</Notice>}
        {b.payment.creditMinor > 0 && <Notice tone="info">HotelBridge owes your agency <Money minor={b.payment.creditMinor} currency={b.currency} />{b.status === 'refund_pending' ? ' — refund pending.' : '.'}</Notice>}
        <div className="layout-2">
          <div className="stack gap-6">
            <Panel title="Stay">
              <dl className="kv">
                <dt>Check-in</dt><dd>{fmtDate(b.checkIn, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{b.hotel?.checkInTime && <span className="subtle"> · from {b.hotel.checkInTime}</span>}</dd>
                <dt>Check-out</dt><dd>{fmtDate(b.checkOut, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{b.hotel?.checkOutTime && <span className="subtle"> · until {b.hotel.checkOutTime}</span>}</dd>
                <dt>Nights</dt><dd>{b.nights}</dd>
                <dt>Board</dt><dd>{MEAL_PLAN_LABEL[b.mealPlan as MealPlan]}</dd>
                <dt>Hotel address</dt><dd>{[b.hotel?.address, b.hotel?.city].filter(Boolean).join(', ')}</dd>
                {b.hotelConfirmationNumber && <><dt>Hotel confirmation</dt><dd className="num">{b.hotelConfirmationNumber}</dd></>}
                {b.agentReference && <><dt>Your reference</dt><dd>{b.agentReference}</dd></>}
                {b.specialRequests && <><dt>Special requests</dt><dd>{b.specialRequests}</dd></>}
              </dl>
            </Panel>
            <Panel title="Rooms & guests" pad={false}>
              <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Room</th><th>Guests</th><th className="num">Price</th></tr></thead>
                <tbody>{b.rooms.map((r: any) => (
                  <tr key={r.roomIndex}><td><div className="table-title">Room {r.roomIndex + 1} · {r.roomName}</div><div className="xs subtle">{plural(r.adults, 'adult')}{r.childrenAges.length ? `, children aged ${r.childrenAges.join(', ')}` : ''}</div></td>
                    <td className="small">{r.guests.map((g: any) => `${g.first} ${g.last}`).join(', ')}</td><td className="num"><Money minor={r.sellMinor} currency={b.currency} /></td></tr>))}
                  <tr><td className="table-title">Total</td><td className="xs subtle">Taxes included{b.localCharges ? '; local tax payable at hotel' : ''}</td><td className="num table-title"><Money minor={b.totalMinor} currency={b.currency} /></td></tr>
                </tbody></table></div>
            </Panel>
            <Panel title="Cancellation policy">
              <ul className="stack gap-2 small" style={{ margin: 0, paddingLeft: 18 }}>{b.cancellation.lines.map((l: string) => <li key={l}>{l}</li>)}</ul>
            </Panel>
          </div>
          <div className="stack gap-6">
            <Panel title="Status history">
              <ol className="timeline">{b.events.map((e: any, i: number) => <li key={i}><div className="table-title small">{e.label}</div>{e.note && <div className="xs muted">{e.note}</div>}<div className="xs subtle">{fmtDateTime(e.at)}</div></li>)}</ol>
            </Panel>
            <Panel title="Invoices" pad={false}>
              {b.invoices.length === 0 ? <div className="panel-body small muted">An invoice is issued when the booking is confirmed.</div> :
                <table className="table"><tbody>{b.invoices.map((i: any) => <tr key={i.number}><td><div className="table-title small">{i.number}</div><div className="xs subtle">{i.kind === 'credit_note' ? 'Credit note' : 'Invoice'} · {fmtDate(i.issued_at)}</div></td><td className="num"><Money minor={i.amount_minor} currency={i.currency} /></td></tr>)}</tbody></table>}
            </Panel>
            <Panel title="Need help?"><p className="small muted">Open a support request about this booking.</p><div className="mt-4"><ButtonLink to={`/app/support?booking=${b.id}`} variant="secondary" size="sm">Contact support</ButtonLink></div></Panel>
          </div>
        </div>
      </div>
      {cancelOpen && (
        <Dialog title="Cancel this booking?" onClose={() => setCancelOpen(false)} footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep booking</Button><Button variant="danger" loading={cancel.busy} disabled={reason.trim().length < 2} onClick={() => cancel.run()}>Confirm cancellation</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={cancel.error} />
            <div className="panel panel-pad" style={{ background: 'var(--paper)' }}>
              <div className="summary-line"><span className="muted">Booking total</span><Money minor={b.totalMinor} currency={b.currency} /></div>
              <div className="summary-line"><span className="muted">Cancellation charge{data.cancellation.penaltyBps ? ` (${data.cancellation.penaltyBps / 100}%)` : ''}</span><Money minor={data.cancellation.penaltyMinor} currency={b.currency} /></div>
              <div className="summary-line total"><span>Not charged / refundable</span><Money minor={data.cancellation.refundableMinor} currency={b.currency} /></div>
            </div>
            {data.cancellation.note && <p className="small muted">{data.cancellation.note}</p>}
            <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            <p className="xs subtle">If the hotel source cannot cancel automatically, the booking moves to "Cancellation requested" and operations completes it at the charge shown here.</p>
          </div>
        </Dialog>
      )}
      {amendOpen && (
        <Dialog title="Request an amendment" onClose={() => setAmendOpen(false)} footer={<><Button variant="secondary" onClick={() => setAmendOpen(false)}>Close</Button><Button loading={amend.busy} disabled={details.trim().length < 5} onClick={() => amend.run()}>Send request</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={amend.error} />
            <p className="small muted">Amendments are handled by our team with the hotel and may change the price or conditions. Your booking stays as it is until we confirm the change.</p>
            <TextArea label="What needs to change?" value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
        </Dialog>
      )}
    </div>
  );
}

export { BOOKING_STATUS_LABEL, Link };
