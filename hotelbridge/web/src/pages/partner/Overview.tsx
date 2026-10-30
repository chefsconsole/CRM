import { useState } from 'react';
import { BOOKING_STATUS_LABEL, MEAL_PLAN_LABEL, type BookingStatus, type MealPlan } from '../../../../shared/domain';
import { BookingStatusPill, Button, Dialog, Empty, ErrorNotice, LoadingRows, Money, Notice, PageHead, Panel, Pill, TextInput, useAction } from '../../components/ui';
import { post } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDate, plural } from '../../lib/format';

/** Hotel partner workspace: confirm requests, see arrivals and production for this hotel only. */
export default function PartnerOverview() {
  const { data, error, loading, reload } = useApi<any>('/partner/overview');
  const [act, setAct] = useState<{ id: string; confirm: boolean; ref: string } | null>(null);
  const [value, setValue] = useState('');
  const decide = useAction(() => post(`/partner/bookings/${act!.id}/${act!.confirm ? 'confirm' : 'decline'}`, act!.confirm ? { hotelConfirmationNumber: value } : { reason: value }), {
    success: 'Response recorded', onDone: () => { setAct(null); setValue(''); reload(); },
  });
  if (loading) return <div className="page"><LoadingRows /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const pending = data.bookings.filter((b: any) => b.status === 'pending_confirmation');
  const others = data.bookings.filter((b: any) => b.status !== 'pending_confirmation');
  return (
    <div className="page">
      <PageHead title={data.hotel.name} subtitle="Partner workspace — bookings placed through HotelBridge for your hotel." />
      <div className="stack gap-6">
        <Notice tone="neutral">HotelBridge is the booker of record. Amounts shown are the net amounts payable to the hotel under your contract.</Notice>
        <Panel title={<span className="row gap-3">Requests awaiting your confirmation {pending.length > 0 && <Pill tone="attention">{pending.length}</Pill>}</span>} pad={false}>
          {pending.length === 0 ? <Empty icon="check" title="Nothing waiting">New booking requests appear here for you to confirm or decline.</Empty> : (
            <div className="table-wrap"><table className="table table-responsive"><tbody>{pending.map((b: any) => (
              <tr key={b.id}><td><div className="table-title">{b.lead_guest_name}</div><div className="xs subtle">{b.reference}</div></td>
                <td className="small">{fmtDate(b.check_in)} → {fmtDate(b.check_out)}<div className="xs subtle">{b.rooms.map((r: any) => `${r.roomName} (${r.adults}A${r.childrenAges.length ? `+${r.childrenAges.length}C` : ''}) ${MEAL_PLAN_LABEL[r.mealPlan as MealPlan]}`).join(' · ')}</div>{b.special_requests && <div className="xs subtle">Requests: {b.special_requests}</div>}</td>
                <td className="num"><Money minor={b.net_payable_minor} currency={b.supplier_currency} /></td>
                <td className="num"><div className="row gap-2" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={() => setAct({ id: b.id, confirm: true, ref: b.reference })}>Confirm</Button><Button size="sm" variant="secondary" onClick={() => setAct({ id: b.id, confirm: false, ref: b.reference })}>Decline</Button></div></td></tr>))}</tbody></table></div>)}
        </Panel>
        <Panel title="Reservations" pad={false}>
          {others.length === 0 ? <div className="panel-body small muted">No reservations yet.</div> : (
            <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Guest</th><th>Stay</th><th>Your confirmation</th><th className="num">Net payable</th><th>Status</th></tr></thead>
              <tbody>{others.map((b: any) => <tr key={b.id}><td><div className="table-title">{b.lead_guest_name ?? '—'}</div><div className="xs subtle">{b.reference}</div></td><td className="small">{fmtDate(b.check_in)} · {plural(b.nights, 'night')}</td><td className="small num">{b.hotel_confirmation_number ?? '—'}</td><td className="num"><Money minor={b.net_payable_minor} currency={b.supplier_currency} /></td><td><BookingStatusPill status={b.status as BookingStatus} /></td></tr>)}</tbody></table></div>)}
        </Panel>
        <div className="grid-2">
          <Panel title="Production (confirmed)" pad={false}>
            {data.production.length === 0 ? <div className="panel-body small muted">Production appears once bookings are confirmed.</div> : (
              <table className="table"><thead><tr><th>Arrival month</th><th className="num">Bookings</th><th className="num">Room nights</th><th className="num">Net</th></tr></thead><tbody>{data.production.map((p: any) => <tr key={p.month + p.currency}><td>{p.month}</td><td className="num">{p.bookings}</td><td className="num">{p.room_nights}</td><td className="num"><Money minor={p.net_minor} currency={p.currency} /></td></tr>)}</tbody></table>)}
          </Panel>
          <Panel title="Your agreements" pad={false}>
            {data.contracts.length === 0 ? <div className="panel-body small muted">No active agreement.</div> : <table className="table"><tbody>{data.contracts.map((c: any) => <tr key={c.reference}><td><div className="table-title small">{c.reference}</div><div className="xs subtle">{fmtDate(c.valid_from)} – {fmtDate(c.valid_to)} · {c.booking_mode === 'instant' ? `allocation, ${c.release_days}-day release` : 'on request'}</div></td><td><Pill tone={c.status === 'active' ? 'positive' : 'attention'}>{c.status.replace('_', ' ')}</Pill></td></tr>)}</tbody></table>}
            <div className="panel-body xs subtle">To change rates or allocation, contact your HotelBridge partner manager.</div>
          </Panel>
        </div>
      </div>
      {act && (
        <Dialog title={act.confirm ? `Confirm ${act.ref}` : `Decline ${act.ref}`} onClose={() => setAct(null)} footer={<><Button variant="secondary" onClick={() => setAct(null)}>Back</Button><Button loading={decide.busy} disabled={value.trim().length < 2} onClick={() => decide.run()}>{act.confirm ? 'Confirm booking' : 'Decline request'}</Button></>}>
          <div className="stack gap-4"><ErrorNotice error={decide.error} />
            <TextInput label={act.confirm ? 'Your hotel confirmation number' : 'Reason (shared with HotelBridge)'} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </Dialog>
      )}
      <span className="sr-only">{BOOKING_STATUS_LABEL.confirmed}</span>
    </div>
  );
}
