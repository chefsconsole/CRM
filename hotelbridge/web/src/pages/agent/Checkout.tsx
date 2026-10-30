import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MEAL_PLAN_LABEL, type MealPlan } from '../../../../shared/domain';
import { Button, Checkbox, ErrorNotice, Loading, Money, Notice, PageHead, Panel, Pill, SampleTag, TextArea, TextInput } from '../../components/ui';
import { HotelImage } from '../../components/HotelImage';
import { api, post, ApiError } from '../../lib/api';
import { fmtDate, fmtDateTime, plural } from '../../lib/format';

interface Guest { first: string; last: string }

export default function Checkout() {
  const { offerId } = useParams();
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<any>(null);
  const [offer, setOffer] = useState<any>(null);
  const [reval, setReval] = useState<'checking' | 'unchanged' | 'changed' | 'unavailable' | 'error'>('checking');
  const [revalNote, setRevalNote] = useState<string>('');
  const [previousTotal, setPreviousTotal] = useState<number | null>(null);
  const [guests, setGuests] = useState<Guest[][]>([]);
  const [agentRef, setAgentRef] = useState('');
  const [requests, setRequests] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // One key per checkout attempt: retries and double-clicks can never create a second booking.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [offerId]);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const c = await api(`/agent/offers/${offerId}`);
        if (off) return;
        setCtx(c); setOffer(c.offer);
        setGuests(c.offer.rooms.map((r: any) => Array.from({ length: r.adults + r.childrenAges.length }, () => ({ first: '', last: '' }))));
        const r = await post(`/agent/offers/${offerId}/revalidate`);
        if (off) return;
        setReval(r.status);
        if (r.status === 'unavailable') setRevalNote(r.reason);
        else { if (r.status === 'changed') setPreviousTotal(r.previousTotalMinor); setOffer(r.offer); }
      } catch (e) { if (!off) { setError(e as ApiError); setReval('error'); } }
    })();
    return () => { off = true; };
  }, [offerId]);

  const setGuest = (room: number, idx: number, patch: Partial<Guest>) => setGuests(guests.map((g, i) => (i === room ? g.map((x, j) => (j === idx ? { ...x, ...patch } : x)) : g)));
  const leadMissing = guests.some((g) => !g[0]?.first.trim() || !g[0]?.last.trim());
  const onRequest = offer?.availability === 'on_request';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await post('/agent/bookings', {
        offerId: offer.id, idempotencyKey, acceptedTotalMinor: offer.totalMinor, acceptedCurrency: offer.currency, acknowledgeOnRequest: ack,
        agentReference: agentRef || undefined, specialRequests: requests || undefined,
        rooms: offer.rooms.map((r: any, i: number) => ({ roomIndex: r.roomIndex, guests: guests[i].filter((g) => g.first.trim() && g.last.trim()) })),
      });
      navigate(`/app/bookings/${r.booking.id}?new=1`, { replace: true });
    } catch (err) {
      const ae = err as ApiError;
      if (ae.code === 'PRICE_CHANGED' && ae.details?.offer) { setPreviousTotal(offer.totalMinor); setOffer(ae.details.offer); setReval('changed'); }
      else if (ae.code === 'NO_LONGER_AVAILABLE') { setReval('unavailable'); setRevalNote(ae.message); }
      else setError(ae);
    } finally { setBusy(false); }
  };

  if (!ctx && !error) return <div className="page"><Loading label="Preparing checkout" /></div>;
  if (!ctx) return <div className="page"><ErrorNotice error={error} /><Link to="/app/search">Back to search</Link></div>;
  const checkOut = new Date(Date.parse(`${ctx.checkIn}T00:00:00Z`) + ctx.nights * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="page">
      <PageHead back={{ to: `/app/hotels/${ctx.hotel.slug}`, label: ctx.hotel.name }} title={onRequest ? 'Request booking' : 'Review and book'} subtitle="Check the details below. Nothing is booked until you confirm." />
      <form className="checkout" onSubmit={submit}>
        <div className="stack gap-6">
          {reval === 'checking' && <Notice tone="info">Re-checking the price and availability with the hotel source…</Notice>}
          {reval === 'unchanged' && <Notice tone="success">Price and availability re-checked just now.</Notice>}
          {reval === 'changed' && <Notice tone="warn" title="The offer has changed.">{previousTotal !== null && <>It was <Money minor={previousTotal} currency={offer.currency} /> and is now <strong><Money minor={offer.totalMinor} currency={offer.currency} /></strong>. </>}Review the updated price and conditions; booking now accepts the updated offer.</Notice>}
          {reval === 'unavailable' && <Notice tone="error" title="No longer available.">{revalNote} <Link to={`/app/hotels/${ctx.hotel.slug}`}>Choose another option</Link>.</Notice>}
          {ctx.expired && reval !== 'unavailable' && reval !== 'checking' && <Notice tone="neutral">This offer was refreshed because the original quote had expired.</Notice>}
          <ErrorNotice error={error} />

          {offer.rooms.map((room: any, i: number) => (
            <Panel key={room.roomIndex} title={<span>Room {i + 1} · {room.roomName}</span>} actions={<span className="small muted">{plural(room.adults, 'adult')}{room.childrenAges.length ? `, ${plural(room.childrenAges.length, 'child', 'children')} (${room.childrenAges.join(', ')})` : ''}</span>}>
              <div className="stack gap-4">
                {guests[i]?.map((g, j) => (
                  <div key={j} className="grid-2">
                    <TextInput label={j === 0 ? 'Lead guest first name' : `Guest ${j + 1} first name (optional)`} required={j === 0} autoComplete="off" value={g.first} onChange={(e) => setGuest(i, j, { first: e.target.value })} />
                    <TextInput label={j === 0 ? 'Lead guest last name' : `Guest ${j + 1} last name (optional)`} required={j === 0} autoComplete="off" value={g.last} onChange={(e) => setGuest(i, j, { last: e.target.value })} />
                  </div>
                ))}
              </div>
            </Panel>
          ))}

          <Panel title="Your references">
            <div className="stack gap-4">
              <TextInput label="Agency reference" hint="Optional — shown on vouchers and invoices" maxLength={60} value={agentRef} onChange={(e) => setAgentRef(e.target.value)} />
              <TextArea label="Special requests" hint="Passed to the hotel. Requests are not guaranteed." maxLength={500} value={requests} onChange={(e) => setRequests(e.target.value)} />
            </div>
          </Panel>
        </div>

        <aside className="sticky-aside stack gap-4">
          <div className="panel">
            <HotelImage name={ctx.hotel.name} images={ctx.hotel.images} height={140} label={false} />
            <div className="panel-body stack gap-3">
              <div className="row gap-2 wrap"><h3>{ctx.hotel.name}</h3>{ctx.hotel.isSample && <SampleTag />}{offer.isSandbox && <span className="tag tag-sample">Sandbox</span>}</div>
              <div className="small muted">{fmtDate(ctx.checkIn)} → {fmtDate(checkOut)} · {plural(ctx.nights, 'night')}</div>
              <div className="row gap-2 wrap"><span className="tag">{MEAL_PLAN_LABEL[offer.mealPlan as MealPlan]}</span><Pill tone={offer.availability === 'on_request' ? 'attention' : offer.availability === 'instant' ? 'positive' : 'pending'}>{offer.availabilityLabel}</Pill></div>
              <div>
                {offer.rooms.map((r: any, i: number) => <div className="summary-line" key={i}><span className="muted">Room {i + 1} · {r.roomName}</span><Money minor={r.sellMinor} currency={offer.currency} /></div>)}
                <div className="summary-line"><span className="muted">Taxes included</span><span className="muted">{offer.taxIncludedMinor > 0 ? <Money minor={offer.taxIncludedMinor} currency={offer.currency} /> : 'As charged by the hotel'}</span></div>
                <div className="summary-line total"><span>Total to pay HotelBridge</span><Money minor={offer.totalMinor} currency={offer.currency} /></div>
                {offer.localCharges && <p className="xs subtle mt-2">Plus approx. <Money minor={offer.localCharges.amountMinor} currency={offer.localCharges.currency} /> {offer.localCharges.label.toLowerCase()}, paid by guests on arrival.</p>}
                {offer.fx && <p className="xs subtle mt-2">Converted from {offer.fx.from} at the rate recorded {fmtDateTime(offer.fx.asOf)}.</p>}
              </div>
            </div>
          </div>
          <Panel title="Cancellation">
            <ul className="stack gap-2 small" style={{ margin: 0, paddingLeft: 18 }}>{offer.cancellation.lines.map((l: string) => <li key={l}>{l}</li>)}</ul>
          </Panel>
          <Panel title="Payment">
            <p className="small muted">{offer.cancellation.refundable
              ? 'Payable before the free-cancellation deadline, unless your agency has approved credit.'
              : 'Non-refundable: the booking is sent to the hotel once payment is received (or immediately on approved credit). The rate is re-checked at that point.'}</p>
            {offer.paymentTerms && <p className="xs subtle mt-2">Supplier terms: {offer.paymentTerms}</p>}
          </Panel>
          {onRequest && <Checkbox checked={ack} onChange={setAck}>I understand this is a request. It is not confirmed until the hotel accepts, and no voucher is issued before then.</Checkbox>}
          <Button type="submit" size="lg" block loading={busy} disabled={reval === 'checking' || reval === 'unavailable' || reval === 'error' || leadMissing || (onRequest && !ack)}>
            {onRequest ? 'Send booking request' : reval === 'changed' ? 'Book at the updated price' : 'Confirm booking'}
          </Button>
          {leadMissing && <p className="xs subtle">Add a lead guest name for each room to continue.</p>}
          {offer.isSandbox && <p className="xs subtle">Sandbox offers are simulated and never reach a real hotel.</p>}
        </aside>
      </form>
    </div>
  );
}
