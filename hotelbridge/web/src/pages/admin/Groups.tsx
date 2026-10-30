import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GROUP_STAGE_LABEL, GROUP_STAGES, MEAL_PLAN_LABEL, MEAL_PLANS, type GroupStage, type MealPlan } from '../../../../shared/domain';
import { Button, Checkbox, Dialog, Empty, ErrorNotice, Loading, LoadingRows, Money, Notice, PageHead, Panel, Pill, SelectInput, StagePill, TextArea, TextInput, useAction, useToast } from '../../components/ui';
import { post } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { addDays, fmtDate, fmtDateTime, plural, todayIso, toMinor } from '../../lib/format';

export function AdminGroups() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const { data, error, loading } = useApi<any[]>(`/admin/groups${status ? `?status=${status}` : ''}`);
  const navigate = useNavigate();
  const overdue = (g: any) => ['new', 'under_review'].includes(g.status) && new Date(g.targetResponseAt) < new Date();
  return (
    <div className="page">
      <PageHead title="Group Desk" subtitle="Enquiry pipeline — negotiation is human; the administration around it is not." />
      <div className="row gap-3 wrap" style={{ marginBottom: 'var(--s4)' }}>
        <select className="select input-sm" style={{ width: 'auto' }} value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})} aria-label="Stage">
          <option value="">All stages</option>{GROUP_STAGES.map((s) => <option key={s} value={s}>{GROUP_STAGE_LABEL[s]}</option>)}
        </select>
      </div>
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? <Empty icon="groups" title="No group enquiries" /> : (
        <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Enquiry</th><th>Agency</th><th>Itinerary</th><th>Respond by</th><th>Owner</th><th>Stage</th></tr></thead>
          <tbody>{data.map((g) => <tr key={g.id} className="clickable" onClick={() => navigate(`/admin/groups/${g.id}`)}>
            <td><div className="table-title">{g.title}</div><div className="xs subtle">{g.reference} · {g.totalPassengers} pax</div></td>
            <td data-hide-mobile className="small">{g.agencyName}</td>
            <td data-hide-mobile className="small">{g.legs.map((l: any) => l.city).join(' → ')}<div className="xs subtle">{fmtDate(g.legs[0].checkIn)}</div></td>
            <td data-hide-mobile className="small">{overdue(g) ? <Pill tone="negative">Overdue</Pill> : fmtDateTime(g.targetResponseAt)}<div className="xs subtle">Quote by {fmtDate(g.quoteNeededBy)}</div></td>
            <td data-hide-mobile className="small">{g.assignee ?? <span className="subtle">Unassigned</span>}</td>
            <td><StagePill stage={g.status} /></td></tr>)}</tbody></table></div>)}
      </div>
    </div>
  );
}

export function AdminGroupDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(`/admin/groups/${id}`);
  const { data: hotels } = useApi<any[]>('/admin/hotels');
  const [dialog, setDialog] = useState<null | 'requests' | 'offer' | 'proposal' | 'stage' | 'view'>(null);
  const [viewReq, setViewReq] = useState<any>(null);
  const [reqForm, setReqForm] = useState({ legIndex: 0, hotelIds: [] as string[], extraName: '', extraEmail: '', respondBy: addDays(todayIso(), 5) });
  const [offer, setOffer] = useState<any>(null);
  const [prop, setProp] = useState({ offerIds: [] as string[], markupPct: '8', validUntil: '', exclusions: '', notes: '' });
  const [stage, setStage] = useState({ stage: 'under_review' as GroupStage, reason: '' });
  const [msg, setMsg] = useState({ body: '', visibility: 'internal' });
  const done = () => { setDialog(null); reload(); };
  const assign = useAction(() => post(`/admin/groups/${id}/assign`), { success: 'Assigned to you', onDone: reload });
  const sent = useAction((rid: string) => post(`/admin/hotel-requests/${rid}/sent`), { success: 'Recorded as sent', onDone: () => { setDialog(null); reload(); } });
  const outcome = useAction((rid: string, status: string) => post(`/admin/hotel-requests/${rid}/outcome`, { status }), { onDone: reload });
  const sendProp = useAction((pid: string) => post(`/admin/proposals/${pid}/send`), { success: 'Proposal sent to the agency', onDone: reload });
  const message = useAction(() => post(`/admin/groups/${id}/messages`, msg), { onDone: () => { setMsg({ ...msg, body: '' }); reload(); } });
  const sub = useAction(async () => {
    if (dialog === 'requests') {
      const list = [...reqForm.hotelIds.map((h) => ({ hotelId: h })), ...(reqForm.extraName ? [{ hotelName: reqForm.extraName, contactEmail: reqForm.extraEmail || undefined }] : [])];
      await post(`/admin/groups/${id}/hotel-requests`, { legIndex: reqForm.legIndex, hotels: list, respondBy: reqForm.respondBy });
    }
    if (dialog === 'offer') {
      const lines = offer.lines.map((l: any) => ({ roomType: l.roomType, rooms: Number(l.rooms), nightlyNetMinor: toMinor(l.nightly) ?? 0 }));
      if (lines.some((l: any) => !l.nightlyNetMinor)) throw new Error('Enter a nightly net rate for every line, e.g. 140.00');
      await post(`/admin/groups/${id}/offers`, { ...offer, lines, taxesMinor: offer.taxes ? toMinor(offer.taxes) ?? 0 : 0, mealPlan: offer.mealPlan || undefined, hotelRequestId: offer.hotelRequestId || undefined, conditions: offer.conditions || undefined });
    }
    if (dialog === 'proposal') await post(`/admin/groups/${id}/proposals`, { offerIds: prop.offerIds, markupBps: Math.round(Number(prop.markupPct) * 100), validUntil: prop.validUntil, exclusions: prop.exclusions || undefined, notes: prop.notes || undefined });
    if (dialog === 'stage') await post(`/admin/groups/${id}/stage`, { stage: stage.stage, reason: stage.reason || undefined });
  }, { success: 'Saved', onDone: done });
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const g = data;
  const openOffer = (req?: any) => {
    const leg = g.legs[0];
    setOffer({ hotelRequestId: req?.id ?? '', hotelName: req?.hotel_name ?? '', city: leg.city, checkIn: leg.checkIn, checkOut: leg.checkOut, currency: 'EUR', mealPlan: g.mealPlan ?? '',
      lines: Object.entries(g.rooming).filter(([, v]) => (v as number) > 0).map(([k, v]) => ({ roomType: k[0].toUpperCase() + k.slice(1), rooms: v, nightly: '' })),
      taxes: '', cancellationTerms: '', paymentTerms: '', conditions: '', validUntil: addDays(todayIso(), 14) });
    setDialog('offer');
  };
  const copy = async (r: any) => { await navigator.clipboard?.writeText(`${r.subject}\n\n${r.body}`).catch(() => {}); toast('Enquiry copied — paste it into your email'); };
  return (
    <div className="page">
      <PageHead back={{ to: '/admin/groups', label: 'Group Desk' }} title={g.title}
        subtitle={<span className="row gap-3 wrap"><span className="num">{g.reference}</span><StagePill stage={g.status} /><span className="small">{g.agency?.name}</span></span>}
        actions={<><Button variant="secondary" loading={assign.busy} onClick={() => assign.run()}>Assign to me</Button><Button variant="secondary" onClick={() => setDialog('stage')}>Change stage</Button></>} />
      <div className="layout-2">
        <div className="stack gap-6">
          {['new', 'under_review'].includes(g.status) && new Date(g.targetResponseAt) < new Date() && <Notice tone="error">Response target {fmtDateTime(g.targetResponseAt)} has passed.</Notice>}
          <Panel title="1 · Hotel enquiries" pad={false} actions={<Button size="sm" icon="plus" onClick={() => setDialog('requests')}>Draft enquiries</Button>}>
            {g.hotelRequests.length === 0 ? <div className="panel-body small muted">Select suitable hotels to generate structured enquiries. Email integration is not connected: copy each enquiry into your email client, then record it as sent.</div> : (
              <table className="table"><tbody>{g.hotelRequests.map((r: any) => <tr key={r.id}>
                <td><div className="table-title small">{r.hotel_name}</div><div className="xs subtle">{r.contact_email ?? 'No contact email'} · reply by {fmtDate(r.respond_by)}</div></td>
                <td><Pill tone={r.status === 'responded' ? 'positive' : r.status === 'sent' ? 'pending' : r.status === 'drafted' ? 'neutral' : 'negative'}>{r.status === 'drafted' ? 'Drafted — not sent' : r.status === 'sent' ? `Sent ${fmtDate(r.sent_at)}` : r.status.replace('_', ' ')}</Pill></td>
                <td className="num"><div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="ghost" onClick={() => { setViewReq(r); setDialog('view'); }}>View</Button>
                  {r.status === 'sent' && <Button size="sm" variant="secondary" onClick={() => openOffer(r)}>Record offer</Button>}
                  {r.status === 'sent' && <Button size="sm" variant="ghost" onClick={() => outcome.run(r.id, 'declined')}>Declined</Button>}
                </div></td></tr>)}</tbody></table>)}
          </Panel>
          <Panel title="2 · Offers received" pad={false} actions={<Button size="sm" variant="secondary" onClick={() => openOffer()}>Record offer</Button>}>
            {g.offers.length === 0 ? <div className="panel-body small muted">Record each hotel's offer exactly as received — proposals can only be built from recorded offers.</div> : (
              <table className="table"><thead><tr><th>Hotel</th><th>Stay</th><th className="num">Net total</th><th>Valid until</th></tr></thead><tbody>{g.offers.map((o: any) => <tr key={o.id}><td><div className="table-title small">{o.hotel_name}</div><div className="xs subtle">{o.lines.map((l: any) => `${l.rooms}×${l.roomType}`).join(', ')}</div></td><td className="small">{o.city} · {fmtDate(o.check_in)} → {fmtDate(o.check_out)}</td><td className="num"><Money minor={o.net_total_minor} currency={o.currency} /></td><td className="small">{fmtDate(o.valid_until)}</td></tr>)}</tbody></table>)}
          </Panel>
          <Panel title="3 · Proposals" pad={false} actions={<Button size="sm" disabled={!g.offers.length} onClick={() => { setProp({ ...prop, offerIds: g.offers.map((o: any) => o.id), validUntil: [...g.offers.map((o: any) => o.valid_until)].sort()[0] }); setDialog('proposal'); }}>Build proposal</Button>}>
            {g.proposals.length === 0 ? <div className="panel-body small muted">No proposals yet.</div> : (
              <table className="table"><thead><tr><th>Version</th><th className="num">Net</th><th className="num">Sell</th><th className="num">Markup</th><th>Status</th><th /></tr></thead><tbody>{g.proposals.map((p: any) => <tr key={p.id}><td>v{p.version}<div className="xs subtle">valid to {fmtDate(p.valid_until)}</div></td><td className="num"><Money minor={p.total_net_minor} currency={p.currency} /></td><td className="num table-title"><Money minor={p.total_sell_minor} currency={p.currency} /></td><td className="num">{(p.markup_bps / 100).toFixed(1)}%</td>
                <td><Pill tone={p.status === 'accepted' ? 'positive' : p.status === 'sent' ? 'attention' : 'neutral'}>{p.status}</Pill></td>
                <td className="num"><div className="row gap-2" style={{ justifyContent: 'flex-end' }}><a className="btn btn-ghost btn-sm" href={`/api/admin/proposals/${p.id}/document`} target="_blank" rel="noreferrer">Document</a>{p.status === 'draft' && <Button size="sm" loading={sendProp.busy} onClick={() => sendProp.run(p.id)}>Send to agency</Button>}</div></td></tr>)}</tbody></table>)}
            <ErrorNotice error={sendProp.error} />
          </Panel>
          <Panel title="Communication">
            <div className="stack gap-3">
              {g.messages.map((m: any, i: number) => <div key={i} className={`message${m.visibility === 'internal' ? ' internal' : ''}`}><div className="xs subtle">{m.visibility === 'internal' ? 'Internal · ' : 'Visible to agency · '}{m.author ?? 'System'} · {fmtDateTime(m.at)}</div><div className="mt-2">{m.body}</div></div>)}
              <TextArea label="Add a note or message" value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
              <div className="row gap-3"><select className="select input-sm" style={{ width: 'auto' }} value={msg.visibility} onChange={(e) => setMsg({ ...msg, visibility: e.target.value })} aria-label="Visibility"><option value="internal">Internal note</option><option value="agent">Message to agency</option></select><Button size="sm" loading={message.busy} disabled={!msg.body.trim()} onClick={() => message.run()}>Post</Button></div>
            </div>
          </Panel>
        </div>
        <Panel title="Requirement">
          <dl className="kv">
            <dt>Agency</dt><dd>{g.agency?.name}</dd><dt>Type</dt><dd>{g.groupType}</dd><dt>Passengers</dt><dd>{g.totalPassengers}</dd>
            <dt>Itinerary</dt><dd>{g.legs.map((l: any, i: number) => <div key={i}>{l.city} · {fmtDate(l.checkIn)} → {fmtDate(l.checkOut)}</div>)}</dd>
            <dt>Rooming</dt><dd>{Object.entries(g.rooming).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${v} ${k}`).join(', ')}</dd>
            <dt>Category</dt><dd>{g.hotelCategory}</dd><dt>Board</dt><dd>{g.mealPlan ? MEAL_PLAN_LABEL[g.mealPlan as MealPlan] : '—'}</dd>
            {g.budgetMinor && <><dt>Budget</dt><dd><Money minor={g.budgetMinor} currency={g.budgetCurrency} /> / room-night</dd></>}
            <dt>Coach</dt><dd>{g.coachParking ? 'Required' : '—'}</dd>{g.accessibility && <><dt>Access</dt><dd>{g.accessibility}</dd></>}{g.specialRequests && <><dt>Requests</dt><dd>{g.specialRequests}</dd></>}
            <dt>Respond by</dt><dd>{fmtDateTime(g.targetResponseAt)}</dd><dt>Quote by</dt><dd>{fmtDate(g.quoteNeededBy)}</dd>
          </dl>
        </Panel>
      </div>

      {dialog && dialog !== 'view' && (
        <Dialog title={{ requests: 'Draft hotel enquiries', offer: 'Record hotel offer', proposal: 'Build proposal', stage: 'Change stage' }[dialog]} onClose={() => setDialog(null)} footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button loading={sub.busy} onClick={() => sub.run()}>Save</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={sub.error} />
            {dialog === 'requests' && <>
              <SelectInput label="Itinerary leg" value={reqForm.legIndex} onChange={(e) => setReqForm({ ...reqForm, legIndex: Number(e.target.value) })}>{g.legs.map((l: any, i: number) => <option key={i} value={i}>{l.city} · {fmtDate(l.checkIn)}</option>)}</SelectInput>
              <div className="field"><span className="field-label">Hotels in the collection</span><div className="stack gap-2">{hotels?.filter((h) => h.city.toLowerCase() === g.legs[reqForm.legIndex].city.toLowerCase()).map((h) => <Checkbox key={h.id} checked={reqForm.hotelIds.includes(h.id)} onChange={(v) => setReqForm({ ...reqForm, hotelIds: v ? [...reqForm.hotelIds, h.id] : reqForm.hotelIds.filter((x) => x !== h.id) })}>{h.name}</Checkbox>)}
                {!hotels?.some((h) => h.city.toLowerCase() === g.legs[reqForm.legIndex].city.toLowerCase()) && <span className="small muted">No collection hotels in this city — add one below.</span>}</div></div>
              <div className="grid-2"><TextInput label="Other hotel (optional)" value={reqForm.extraName} onChange={(e) => setReqForm({ ...reqForm, extraName: e.target.value })} /><TextInput label="Its reservations email" value={reqForm.extraEmail} onChange={(e) => setReqForm({ ...reqForm, extraEmail: e.target.value })} /></div>
              <TextInput label="Ask hotels to respond by" type="date" value={reqForm.respondBy} onChange={(e) => setReqForm({ ...reqForm, respondBy: e.target.value })} />
              <p className="xs subtle">Enquiries are generated as drafts. They do not include the agency's identity or budget.</p>
            </>}
            {dialog === 'offer' && offer && <>
              <div className="grid-2">
                <TextInput label="Hotel" value={offer.hotelName} onChange={(e) => setOffer({ ...offer, hotelName: e.target.value })} />
                <TextInput label="City" value={offer.city} onChange={(e) => setOffer({ ...offer, city: e.target.value })} />
                <TextInput label="Arrival" type="date" value={offer.checkIn} onChange={(e) => setOffer({ ...offer, checkIn: e.target.value })} />
                <TextInput label="Departure" type="date" value={offer.checkOut} onChange={(e) => setOffer({ ...offer, checkOut: e.target.value })} />
                <TextInput label="Currency" maxLength={3} value={offer.currency} onChange={(e) => setOffer({ ...offer, currency: e.target.value.toUpperCase() })} />
                <SelectInput label="Board" value={offer.mealPlan} onChange={(e) => setOffer({ ...offer, mealPlan: e.target.value })}><option value="">—</option>{MEAL_PLANS.map((m) => <option key={m} value={m}>{MEAL_PLAN_LABEL[m]}</option>)}</SelectInput>
              </div>
              {offer.lines.map((l: any, i: number) => <div key={i} className="row gap-3" style={{ alignItems: 'end' }}>
                <TextInput label="Room type" value={l.roomType} onChange={(e) => setOffer({ ...offer, lines: offer.lines.map((x: any, j: number) => (j === i ? { ...x, roomType: e.target.value } : x)) })} />
                <TextInput label="Rooms" type="number" value={l.rooms} onChange={(e) => setOffer({ ...offer, lines: offer.lines.map((x: any, j: number) => (j === i ? { ...x, rooms: e.target.value } : x)) })} />
                <TextInput label="Net / room / night" inputMode="decimal" value={l.nightly} onChange={(e) => setOffer({ ...offer, lines: offer.lines.map((x: any, j: number) => (j === i ? { ...x, nightly: e.target.value } : x)) })} />
              </div>)}
              <TextInput label="Taxes & fees total (as quoted)" inputMode="decimal" value={offer.taxes} onChange={(e) => setOffer({ ...offer, taxes: e.target.value })} />
              <TextArea label="Cancellation & attrition terms" value={offer.cancellationTerms} onChange={(e) => setOffer({ ...offer, cancellationTerms: e.target.value })} />
              <TextArea label="Payment / deposit terms" value={offer.paymentTerms} onChange={(e) => setOffer({ ...offer, paymentTerms: e.target.value })} />
              <TextInput label="Offer valid until" type="date" value={offer.validUntil} onChange={(e) => setOffer({ ...offer, validUntil: e.target.value })} />
            </>}
            {dialog === 'proposal' && <>
              <div className="field"><span className="field-label">Options to include</span><div className="stack gap-2">{g.offers.map((o: any) => <Checkbox key={o.id} checked={prop.offerIds.includes(o.id)} onChange={(v) => setProp({ ...prop, offerIds: v ? [...prop.offerIds, o.id] : prop.offerIds.filter((x) => x !== o.id) })}>{o.hotel_name} · <Money minor={o.net_total_minor} currency={o.currency} /> net · valid to {fmtDate(o.valid_until)}</Checkbox>)}</div></div>
              <div className="grid-2"><TextInput label="Markup on room cost %" inputMode="decimal" value={prop.markupPct} onChange={(e) => setProp({ ...prop, markupPct: e.target.value })} /><TextInput label="Proposal valid until" type="date" hint="Cannot exceed the hotels' offer validity" value={prop.validUntil} onChange={(e) => setProp({ ...prop, validUntil: e.target.value })} /></div>
              <TextArea label="Exclusions" value={prop.exclusions} onChange={(e) => setProp({ ...prop, exclusions: e.target.value })} />
              <TextArea label="Notes to the agency" value={prop.notes} onChange={(e) => setProp({ ...prop, notes: e.target.value })} />
              <p className="xs subtle">Taxes pass through at cost. Margin is calculated on the sell price; markup on cost.</p>
            </>}
            {dialog === 'stage' && <>
              <SelectInput label="Stage" value={stage.stage} onChange={(e) => setStage({ ...stage, stage: e.target.value as GroupStage })}>{GROUP_STAGES.map((s) => <option key={s} value={s}>{GROUP_STAGE_LABEL[s]}</option>)}</SelectInput>
              <TextArea label={stage.stage === 'lost' || stage.stage === 'cancelled' ? 'Reason (required)' : 'Note'} value={stage.reason} onChange={(e) => setStage({ ...stage, reason: e.target.value })} />
            </>}
          </div>
        </Dialog>
      )}
      {dialog === 'view' && viewReq && (
        <Dialog title={viewReq.subject} onClose={() => setDialog(null)} footer={<><Button variant="secondary" onClick={() => copy(viewReq)}>Copy</Button>{viewReq.contact_email && <a className="btn btn-secondary" href={`mailto:${viewReq.contact_email}?subject=${encodeURIComponent(viewReq.subject)}&body=${encodeURIComponent(viewReq.body)}`}>Open in email</a>}{viewReq.status === 'drafted' && <Button loading={sent.busy} onClick={() => sent.run(viewReq.id)}>I have sent it</Button>}</>}>
          <div className="code-block">{viewReq.body}</div>
          <ErrorNotice error={sent.error} />
          <p className="xs subtle mt-4">Not sent automatically. Record it as sent only after it has actually been sent.</p>
        </Dialog>
      )}
      <span className="sr-only">{plural(g.offers.length, 'offer')}</span>
    </div>
  );
}
