import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MEAL_PLAN_LABEL, MEAL_PLANS, type MealPlan } from '../../../../shared/domain';
import { Button, ButtonLink, Checkbox, Dialog, Empty, ErrorNotice, Loading, LoadingRows, Money, Notice, PageHead, Panel, SelectInput, StagePill, Stepper, TextArea, TextInput, useAction } from '../../components/ui';
import { Icon } from '../../components/icons';
import { post, type ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { addDays, fmtDate, fmtDateTime, plural, todayIso, toMinor } from '../../lib/format';

export function GroupList() {
  const { data, error, loading } = useApi<any[]>('/agent/groups');
  const navigate = useNavigate();
  return (
    <div className="page">
      <PageHead title="Group Desk" subtitle="Negotiated hotel rates for groups, series and multi-city itineraries." actions={<ButtonLink to="/app/groups/new" icon="plus">New group request</ButtonLink>} />
      <ErrorNotice error={error} />
      <div className="panel">
        {loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? (
          <Empty icon="groups" title="No group requests yet" action={<ButtonLink to="/app/groups/new" size="sm">Submit a request</ButtonLink>}>
            Send the full requirement once. We acknowledge it automatically, request offers from suitable hotels and return a structured proposal.
          </Empty>
        ) : (
          <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Request</th><th>Itinerary</th><th>Quote needed by</th><th>Stage</th></tr></thead>
            <tbody>{data.map((g) => (
              <tr key={g.id} className="clickable" onClick={() => navigate(`/app/groups/${g.id}`)}>
                <td><div className="table-title">{g.title}</div><div className="xs subtle">{g.reference} · {g.totalPassengers} pax</div></td>
                <td data-hide-mobile className="small">{g.legs.map((l: any) => l.city).join(' → ')}<div className="xs subtle">{fmtDate(g.legs[0].checkIn)}</div></td>
                <td data-hide-mobile className="small">{fmtDate(g.quoteNeededBy)}</td>
                <td><StagePill stage={g.status} /></td>
              </tr>))}</tbody></table></div>
        )}
      </div>
    </div>
  );
}

const ROOM_KINDS = [['single', 'Single', 1], ['double', 'Double', 2], ['twin', 'Twin', 2], ['triple', 'Triple', 3], ['family', 'Family', 4]] as const;

export function GroupNew() {
  const navigate = useNavigate();
  const start = addDays(todayIso(), 60);
  const [f, setF] = useState({ title: '', groupType: 'leisure', totalPassengers: 20, hotelCategory: '4', mealPlan: 'BB' as MealPlan | '', budget: '', budgetCurrency: 'EUR', coachParking: false, accessibility: '', specialRequests: '', quoteNeededBy: addDays(todayIso(), 10) });
  const [legs, setLegs] = useState([{ city: '', checkIn: start, checkOut: addDays(start, 3) }]);
  const [rooming, setRooming] = useState({ single: 2, double: 9, twin: 0, triple: 0, family: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const capacity = ROOM_KINDS.reduce((a, [k, , c]) => a + rooming[k] * c, 0);
  const rooms = Object.values(rooming).reduce((a, b) => a + b, 0);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const budgetMinor = f.budget ? toMinor(f.budget) : null;
      const r = await post('/agent/groups', {
        title: f.title, groupType: f.groupType, legs, totalPassengers: f.totalPassengers, rooming, hotelCategory: f.hotelCategory,
        mealPlan: f.mealPlan || undefined, budgetMinor: budgetMinor ?? undefined, budgetCurrency: budgetMinor ? f.budgetCurrency : undefined,
        coachParking: f.coachParking, accessibility: f.accessibility || undefined, specialRequests: f.specialRequests || undefined, quoteNeededBy: f.quoteNeededBy,
      });
      navigate(`/app/groups/${r.id}`, { replace: true });
    } catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <PageHead back={{ to: '/app/groups', label: 'Group Desk' }} title="New group request" subtitle="The more complete the request, the faster and more accurate the hotel offers." />
      <form className="checkout" onSubmit={submit}>
        <div className="stack gap-6">
          <ErrorNotice error={error} />
          <Panel title="The group">
            <div className="form-grid">
              <TextInput label="Request title" placeholder="e.g. Spring architecture tour" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <SelectInput label="Group type" value={f.groupType} onChange={(e) => setF({ ...f, groupType: e.target.value })}>
                <option value="leisure">Leisure tour</option><option value="corporate">Corporate</option><option value="mice">Meetings &amp; events</option><option value="tour_series">Tour series</option><option value="other">Other</option>
              </SelectInput>
              <TextInput label="Total passengers" type="number" min={1} required value={f.totalPassengers} onChange={(e) => setF({ ...f, totalPassengers: Number(e.target.value) })} />
            </div>
          </Panel>
          <Panel title="Itinerary" actions={<Button type="button" size="sm" variant="secondary" icon="plus" disabled={legs.length >= 8} onClick={() => { const last = legs[legs.length - 1]; setLegs([...legs, { city: '', checkIn: last.checkOut, checkOut: addDays(last.checkOut, 2) }]); }}>Add city</Button>}>
            <div className="stack gap-4">
              {legs.map((l, i) => (
                <div key={i} className="form-grid" style={{ alignItems: 'end' }}>
                  <TextInput label={`City ${i + 1}`} required value={l.city} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} />
                  <TextInput label="Arrival" type="date" required value={l.checkIn} min={todayIso()} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, checkIn: e.target.value } : x)))} />
                  <TextInput label="Departure" type="date" required value={l.checkOut} min={l.checkIn} onChange={(e) => setLegs(legs.map((x, j) => (j === i ? { ...x, checkOut: e.target.value } : x)))} />
                  {legs.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setLegs(legs.filter((_, j) => j !== i))}>Remove</Button>}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Rooming" actions={<span className={`small ${capacity < f.totalPassengers ? '' : 'muted'}`} style={capacity < f.totalPassengers ? { color: 'var(--negative)' } : undefined}>{plural(rooms, 'room')} · sleeps {capacity} of {f.totalPassengers}</span>}>
            <div className="form-grid">
              {ROOM_KINDS.map(([k, label]) => <div key={k} className="field"><span className="field-label">{label}</span><Stepper label={`${label} rooms`} value={rooming[k]} max={500} onChange={(v) => setRooming({ ...rooming, [k]: v })} /></div>)}
            </div>
          </Panel>
          <Panel title="Requirements">
            <div className="stack gap-4">
              <div className="form-grid">
                <SelectInput label="Hotel category" value={f.hotelCategory} onChange={(e) => setF({ ...f, hotelCategory: e.target.value })}><option value="3">3 star</option><option value="4">4 star</option><option value="5">5 star</option><option value="any">Any</option></SelectInput>
                <SelectInput label="Meal plan" value={f.mealPlan} onChange={(e) => setF({ ...f, mealPlan: e.target.value as MealPlan })}><option value="">No preference</option>{MEAL_PLANS.map((m) => <option key={m} value={m}>{MEAL_PLAN_LABEL[m]}</option>)}</SelectInput>
                <TextInput label="Target budget per room per night" hint="Optional — shared with our team, not with hotels" inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
                <SelectInput label="Budget currency" value={f.budgetCurrency} onChange={(e) => setF({ ...f, budgetCurrency: e.target.value })}>{['EUR', 'USD', 'GBP', 'INR', 'AED'].map((c) => <option key={c}>{c}</option>)}</SelectInput>
              </div>
              <Checkbox checked={f.coachParking} onChange={(v) => setF({ ...f, coachParking: v })}>Coach parking or drop-off required</Checkbox>
              <TextInput label="Accessibility requirements" value={f.accessibility} onChange={(e) => setF({ ...f, accessibility: e.target.value })} />
              <TextArea label="Other requirements" value={f.specialRequests} onChange={(e) => setF({ ...f, specialRequests: e.target.value })} />
            </div>
          </Panel>
        </div>
        <aside className="sticky-aside stack gap-4">
          <Panel title="Deadline">
            <TextInput label="Quotation needed by" type="date" required min={todayIso()} value={f.quoteNeededBy} onChange={(e) => setF({ ...f, quoteNeededBy: e.target.value })} />
            <p className="xs subtle mt-4">Group rates are negotiated with hotels individually. You'll receive an automatic acknowledgement and a target response time straight away.</p>
          </Panel>
          <Button type="submit" size="lg" block loading={busy} disabled={capacity < f.totalPassengers || rooms === 0}>Submit group request</Button>
        </aside>
      </form>
    </div>
  );
}

export function GroupDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<any>(`/agent/groups/${id}`);
  const [msg, setMsg] = useState('');
  const [respond, setRespond] = useState<{ id: string; accept: boolean } | null>(null);
  const [comment, setComment] = useState('');
  const send = useAction(() => post(`/agent/groups/${id}/messages`, { body: msg }), { onDone: () => { setMsg(''); reload(); } });
  const answer = useAction(() => post(`/agent/groups/proposals/${respond!.id}/respond`, { accept: respond!.accept, comment: comment || undefined }), { success: 'Response sent', onDone: () => { setRespond(null); reload(); } });
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const g = data;
  return (
    <div className="page">
      <PageHead back={{ to: '/app/groups', label: 'Group Desk' }} title={g.title} subtitle={<span className="row gap-3 wrap"><span className="num">{g.reference}</span><StagePill stage={g.status} /></span>} />
      <div className="layout-2">
        <div className="stack gap-6">
          {g.proposals.length === 0 ? (
            <Panel title="Proposal"><Empty icon="file" title="Proposal in preparation">We are collecting offers from hotels. Target first response: {fmtDateTime(g.targetResponseAt)}.</Empty></Panel>
          ) : g.proposals.map((p: any) => (
            <Panel key={p.id} title={<span className="row gap-3">Proposal v{p.version}<span className={`pill ${p.status === 'accepted' ? 'positive' : p.status === 'sent' ? 'attention' : 'neutral'}`}>{p.status === 'sent' ? 'Awaiting your response' : p.status[0].toUpperCase() + p.status.slice(1)}</span></span>}
              actions={<a className="small" href={`/api/agent/groups/proposals/${p.id}/document`} target="_blank" rel="noreferrer">Printable proposal</a>}>
              <div className="stack gap-4">
                <p className="small muted">Valid until <strong>{fmtDate(p.valid_until)}</strong>. Rates come from hotel offers and are subject to availability until contracted.</p>
                {p.options.map((o: any, i: number) => (
                  <div key={i} className="panel panel-pad" style={{ background: 'var(--paper)' }}>
                    <div className="row between wrap gap-3"><div><div className="eyebrow">Option {i + 1} · {o.city}</div><h4 className="mt-2">{o.hotelName}</h4><div className="xs subtle">{fmtDate(o.checkIn)} → {fmtDate(o.checkOut)} · {plural(o.nights, 'night')}{o.mealPlan ? ` · ${MEAL_PLAN_LABEL[o.mealPlan as MealPlan]}` : ''}</div></div>
                      <div className="right"><Money className="table-title" minor={o.sellTotalMinor} currency={p.currency} /><div className="xs subtle">total for the group</div></div></div>
                    <table className="table mt-4"><tbody>{o.lines.map((l: any, j: number) => <tr key={j}><td>{l.rooms} × {l.roomType}</td><td className="small subtle">≈ <Money minor={l.approxPerRoomNightMinor} currency={p.currency} /> / room / night</td><td className="num"><Money minor={l.lineSellMinor} currency={p.currency} /></td></tr>)}
                      {o.taxesMinor > 0 && <tr><td colSpan={2}>Taxes &amp; fees as quoted</td><td className="num"><Money minor={o.taxesMinor} currency={p.currency} /></td></tr>}</tbody></table>
                    <div className="grid-2 mt-4 small"><div><div className="xs subtle">Cancellation &amp; attrition</div>{o.cancellationTerms}</div><div><div className="xs subtle">Payment</div>{o.paymentTerms}</div></div>
                  </div>
                ))}
                {p.exclusions && <p className="small"><strong>Not included:</strong> {p.exclusions}</p>}
                {p.status === 'sent' && <div className="row gap-3"><Button onClick={() => setRespond({ id: p.id, accept: true })}>Accept proposal</Button><Button variant="secondary" onClick={() => setRespond({ id: p.id, accept: false })}>Decline or negotiate</Button></div>}
              </div>
            </Panel>
          ))}
          <Panel title="Messages">
            <div className="stack gap-3">
              {g.messages.map((m: any, i: number) => <div key={i} className="message"><div className="xs subtle">{m.author ?? 'HotelBridge Group Desk'} · {fmtDateTime(m.at)}</div><div className="mt-2">{m.body}</div></div>)}
              <form className="stack gap-3" onSubmit={(e) => { e.preventDefault(); send.run(); }}>
                <TextArea label="Message the Group Desk" value={msg} onChange={(e) => setMsg(e.target.value)} />
                <ErrorNotice error={send.error} />
                <div><Button size="sm" loading={send.busy} disabled={!msg.trim()}>Send</Button></div>
              </form>
            </div>
          </Panel>
        </div>
        <Panel title="Requirement">
          <dl className="kv">
            <dt>Passengers</dt><dd>{g.totalPassengers}</dd>
            <dt>Itinerary</dt><dd>{g.legs.map((l: any) => <div key={l.city + l.checkIn}>{l.city} · {fmtDate(l.checkIn)} → {fmtDate(l.checkOut)}</div>)}</dd>
            <dt>Rooms</dt><dd>{Object.entries(g.rooming).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${v} ${k}`).join(', ')}</dd>
            <dt>Category</dt><dd>{g.hotelCategory === 'any' ? 'Any' : `${g.hotelCategory} star`}</dd>
            <dt>Board</dt><dd>{g.mealPlan ? MEAL_PLAN_LABEL[g.mealPlan as MealPlan] : 'No preference'}</dd>
            {g.budgetMinor && <><dt>Budget</dt><dd><Money minor={g.budgetMinor} currency={g.budgetCurrency} /> / room / night</dd></>}
            <dt>Coach</dt><dd>{g.coachParking ? 'Parking required' : '—'}</dd>
            {g.accessibility && <><dt>Accessibility</dt><dd>{g.accessibility}</dd></>}
            <dt>Quote by</dt><dd>{fmtDate(g.quoteNeededBy)}</dd>
          </dl>
        </Panel>
      </div>
      {respond && (
        <Dialog title={respond.accept ? 'Accept this proposal?' : 'Decline or negotiate'} onClose={() => setRespond(null)}
          footer={<><Button variant="secondary" onClick={() => setRespond(null)}>Back</Button><Button loading={answer.busy} onClick={() => answer.run()}>{respond.accept ? 'Accept proposal' : 'Send response'}</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={answer.error} />
            {respond.accept && <Notice tone="info">Accepting asks the Group Desk to contract with the hotels. Deposit and rooming-list deadlines will follow; rooms are not held until contracts are signed.</Notice>}
            <TextArea label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </Dialog>
      )}
    </div>
  );
}

export { Link, Icon };
