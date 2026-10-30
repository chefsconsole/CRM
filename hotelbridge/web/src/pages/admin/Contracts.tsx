import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MEAL_PLAN_LABEL, MEAL_PLANS, type MealPlan } from '../../../../shared/domain';
import { Button, ButtonLink, Checkbox, Dialog, Empty, ErrorNotice, Loading, LoadingRows, Money, Notice, PageHead, Panel, Pill, SelectInput, TextArea, TextInput, useAction } from '../../components/ui';
import { del, patch, post, put, type ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { addDays, fmtDate, fmtDateTime, fromMinor, pct, todayIso, toMinor } from '../../lib/format';

const STATUS_TONE: Record<string, any> = { active: 'positive', pending_approval: 'attention', draft: 'neutral', suspended: 'negative', expired: 'neutral' };

export function AdminContracts() {
  const { data, error, loading } = useApi<any[]>('/admin/contracts');
  const navigate = useNavigate();
  return (
    <div className="page">
      <PageHead title="Contracts" subtitle="Direct hotel agreements. Rates are bookable only on approved, active contracts." actions={<ButtonLink to="/admin/contracts/new" icon="plus">New contract</ButtonLink>} />
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? <Empty icon="contract" title="No contracts" /> : (
        <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Contract</th><th>Validity</th><th>Model</th><th className="num">Active rates</th><th>Status</th></tr></thead>
          <tbody>{data.map((c) => <tr key={c.id} className="clickable" onClick={() => navigate(`/admin/contracts/${c.id}`)}>
            <td><div className="table-title">{c.hotel_name}</div><div className="xs subtle">{c.reference} · v{c.version}</div></td>
            <td data-hide-mobile className="small">{fmtDate(c.valid_from)} – {fmtDate(c.valid_to)}</td>
            <td data-hide-mobile className="small">{c.rate_model} · {c.currency} · {c.booking_mode}</td><td className="num">{c.active_rates}</td>
            <td><Pill tone={STATUS_TONE[c.status]}>{c.status.replace('_', ' ')}</Pill></td></tr>)}</tbody></table></div>)}
      </div>
    </div>
  );
}

interface Terms { hotelId: string; reference: string; rateModel: 'net' | 'commissionable'; commissionPct: string; currency: string; validFrom: string; validTo: string; bookingMode: 'instant' | 'request'; releaseDays: number;
  taxIncluded: boolean; vatPct: string; localTax: string; localTaxLabel: string; refundable: boolean; tiers: { daysBefore: number; pct: string }[]; paymentTerms: string; b2b: boolean; markets: string; distributionNotes: string; internalNotes: string; changeNote: string }

function termsFromContract(c: any): Terms {
  return {
    hotelId: c.hotel_id, reference: c.reference, rateModel: c.rate_model, commissionPct: c.commission_bps ? String(c.commission_bps / 100) : '', currency: c.currency, validFrom: c.valid_from, validTo: c.valid_to,
    bookingMode: c.booking_mode, releaseDays: c.release_days, taxIncluded: c.tax_policy.includedInRate, vatPct: c.tax_policy.vatBps ? String(c.tax_policy.vatBps / 100) : '',
    localTax: c.tax_policy.localTaxPerPersonNightMinor ? fromMinor(c.tax_policy.localTaxPerPersonNightMinor) : '', localTaxLabel: c.tax_policy.localTaxLabel ?? '',
    refundable: c.cancellation_policy.refundable, tiers: c.cancellation_policy.tiers.map((t: any) => ({ daysBefore: t.daysBefore, pct: String(t.penaltyBps / 100) })),
    paymentTerms: c.payment_terms ?? '', b2b: c.distribution.b2bAgencies, markets: (c.distribution.markets ?? []).join(', '), distributionNotes: c.distribution.notes ?? '', internalNotes: c.internal_notes ?? '', changeNote: '',
  };
}
const bps = (p: string) => Math.round(Number(p || 0) * 100);
function termsBody(t: Terms) {
  return {
    hotelId: t.hotelId, reference: t.reference, rateModel: t.rateModel, commissionBps: t.rateModel === 'commissionable' ? bps(t.commissionPct) : 0, currency: t.currency.toUpperCase(),
    validFrom: t.validFrom, validTo: t.validTo, bookingMode: t.bookingMode, releaseDays: Number(t.releaseDays),
    taxPolicy: { includedInRate: t.taxIncluded, ...(t.taxIncluded ? {} : { vatBps: bps(t.vatPct) }), ...(t.localTax ? { localTaxPerPersonNightMinor: toMinor(t.localTax) ?? 0, localTaxLabel: t.localTaxLabel || 'Local tax payable at the hotel' } : {}) },
    cancellationPolicy: { refundable: t.refundable, tiers: t.refundable ? t.tiers.map((x) => ({ daysBefore: Number(x.daysBefore), penaltyBps: bps(x.pct) })) : [] },
    paymentTerms: t.paymentTerms || undefined, distribution: { b2bAgencies: t.b2b, markets: t.markets.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean), notes: t.distributionNotes },
    internalNotes: t.internalNotes || undefined, documents: [],
  };
}

function TermsForm({ t, setT, hotels }: { t: Terms; setT: (t: Terms) => void; hotels?: any[] }) {
  const s = (k: keyof Terms) => (e: { target: { value: string } }) => setT({ ...t, [k]: e.target.value });
  return (
    <div className="stack gap-6">
      <Panel title="Agreement">
        <div className="form-grid">
          {hotels && <SelectInput label="Hotel" value={t.hotelId} onChange={s('hotelId')}><option value="">Select…</option>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name} · {h.city}</option>)}</SelectInput>}
          <TextInput label="Contract reference" value={t.reference} onChange={s('reference')} />
          <TextInput label="Currency" maxLength={3} value={t.currency} onChange={s('currency')} />
          <TextInput label="Valid from" type="date" value={t.validFrom} onChange={s('validFrom')} />
          <TextInput label="Valid to (last night)" type="date" value={t.validTo} onChange={s('validTo')} />
          <SelectInput label="Rate model" value={t.rateModel} onChange={s('rateModel')}><option value="net">Net rates (we add markup)</option><option value="commissionable">Commissionable (sold at hotel price)</option></SelectInput>
          {t.rateModel === 'commissionable' && <TextInput label="Commission %" inputMode="decimal" value={t.commissionPct} onChange={s('commissionPct')} />}
          <SelectInput label="Confirmation" value={t.bookingMode} onChange={s('bookingMode')}><option value="request">On request — hotel confirms each booking</option><option value="instant">Instant — against our allocation</option></SelectInput>
          <TextInput label="Release period (days)" type="number" min={0} value={t.releaseDays} onChange={(e) => setT({ ...t, releaseDays: Number(e.target.value) })} />
        </div>
      </Panel>
      <Panel title="Taxes">
        <div className="stack gap-4">
          <Checkbox checked={t.taxIncluded} onChange={(v) => setT({ ...t, taxIncluded: v })}>Rates include all taxes charged by the hotel</Checkbox>
          <div className="form-grid">
            {!t.taxIncluded && <TextInput label="VAT / sales tax %" inputMode="decimal" value={t.vatPct} onChange={s('vatPct')} />}
            <TextInput label="Local tax per person per night" hint="Collected by the hotel; shown separately" inputMode="decimal" value={t.localTax} onChange={s('localTax')} />
            <TextInput label="Local tax label" value={t.localTaxLabel} onChange={s('localTaxLabel')} />
          </div>
        </div>
      </Panel>
      <Panel title="Cancellation (supplier policy)">
        <div className="stack gap-4">
          <Checkbox checked={t.refundable} onChange={(v) => setT({ ...t, refundable: v })}>Refundable</Checkbox>
          {t.refundable && <>
            {t.tiers.map((tier, i) => <div key={i} className="row gap-3 wrap" style={{ alignItems: 'end' }}>
              <TextInput label="Days before arrival" type="number" min={0} value={tier.daysBefore} onChange={(e) => setT({ ...t, tiers: t.tiers.map((x, j) => (j === i ? { ...x, daysBefore: Number(e.target.value) } : x)) })} />
              <TextInput label="Penalty % of stay" inputMode="decimal" value={tier.pct} onChange={(e) => setT({ ...t, tiers: t.tiers.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)) })} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setT({ ...t, tiers: t.tiers.filter((_, j) => j !== i) })}>Remove</Button>
            </div>)}
            <div><Button type="button" variant="secondary" size="sm" onClick={() => setT({ ...t, tiers: [...t.tiers, { daysBefore: 1, pct: '100' }] })}>Add tier</Button></div>
            <p className="xs subtle">Agents see each deadline one day earlier than the hotel's, so cancellations can always be processed in time.</p>
          </>}
        </div>
      </Panel>
      <Panel title="Distribution & payment">
        <div className="stack gap-4">
          <Checkbox checked={t.b2b} onChange={(v) => setT({ ...t, b2b: v })}>The contract permits distribution to B2B travel agencies</Checkbox>
          <TextInput label="Permitted markets" hint="Country codes, comma-separated; empty = no market restriction recorded" value={t.markets} onChange={s('markets')} />
          <TextArea label="Distribution notes" value={t.distributionNotes} onChange={s('distributionNotes')} />
          <TextArea label="Payment terms with the hotel" value={t.paymentTerms} onChange={s('paymentTerms')} />
          <TextArea label="Internal notes" value={t.internalNotes} onChange={s('internalNotes')} />
        </div>
      </Panel>
    </div>
  );
}

export function AdminContractNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: hotels } = useApi<any[]>('/admin/hotels');
  const [t, setT] = useState<Terms>({ hotelId: params.get('hotel') ?? '', reference: '', rateModel: 'net', commissionPct: '', currency: 'EUR', validFrom: todayIso(), validTo: addDays(todayIso(), 365), bookingMode: 'request', releaseDays: 0,
    taxIncluded: true, vatPct: '', localTax: '', localTaxLabel: '', refundable: true, tiers: [{ daysBefore: 7, pct: '0' }, { daysBefore: 1, pct: '50' }], paymentTerms: '', b2b: true, markets: '', distributionNotes: '', internalNotes: '', changeNote: '' });
  const save = useAction(async () => { const r = await post('/admin/contracts', termsBody(t)); navigate(`/admin/contracts/${r.id}`, { replace: true }); }, { success: 'Contract created as draft' });
  return (
    <div className="page">
      <PageHead back={{ to: '/admin/contracts', label: 'Contracts' }} title="New contract" subtitle="Created as a draft. Add rates, then submit for approval." actions={<Button loading={save.busy} onClick={() => save.run()}>Create draft</Button>} />
      <ErrorNotice error={save.error} />
      <TermsForm t={t} setT={setT} hotels={hotels ?? []} />
    </div>
  );
}

export function AdminContractDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<any>(`/admin/contracts/${id}`);
  const [tab, setTab] = useState<'rates' | 'restrictions' | 'allocation' | 'preview' | 'terms' | 'history'>('rates');
  const [terms, setTerms] = useState<Terms | null>(null);
  const [dialog, setDialog] = useState<null | 'rate' | 'sheet' | 'restriction' | 'allocation'>(null);
  const [rate, setRate] = useState({ roomTypeId: '', mealPlan: 'BB', adults: 2, dateFrom: '', dateTo: '', amount: '', child: '' });
  const [csv, setCsv] = useState('room_code,meal_plan,adults,date_from,date_to,amount,child_amount\n');
  const [restr, setRestr] = useState({ kind: 'stop_sell', roomTypeId: '', dateFrom: todayIso(), dateTo: todayIso(), value: '', note: '' });
  const [alloc, setAlloc] = useState({ roomTypeId: '', dateFrom: todayIso(), dateTo: addDays(todayIso(), 90), allotted: 5 });
  const [preview, setPreview] = useState<any>(null);
  const [pv, setPv] = useState({ checkIn: addDays(todayIso(), 30), checkOut: addDays(todayIso(), 32), rooms: '2', sellingCurrency: '' });
  const [pvError, setPvError] = useState<ApiError | null>(null);
  useEffect(() => { if (data) { setTerms(termsFromContract(data.contract)); setRate((r) => ({ ...r, dateFrom: data.contract.valid_from, dateTo: data.contract.valid_to, roomTypeId: data.rooms[0]?.id ?? '' })); setAlloc((a) => ({ ...a, roomTypeId: data.rooms[0]?.id ?? '' })); } }, [data]);
  const status = useAction((action: string) => post(`/admin/contracts/${id}/status`, { action }), { success: 'Status updated', onDone: reload });
  const saveTerms = useAction(() => put(`/admin/contracts/${id}`, { ...termsBody(terms!), changeNote: terms!.changeNote || 'Terms updated' }), { success: 'Terms saved', onDone: reload });
  const sub = useAction(async () => {
    if (dialog === 'rate') {
      const amountMinor = toMinor(rate.amount);
      if (!amountMinor) throw new Error('Enter the nightly amount, e.g. 145.00');
      await post(`/admin/contracts/${id}/rates`, { rates: [{ roomTypeId: rate.roomTypeId, mealPlan: rate.mealPlan, adults: Number(rate.adults), dateFrom: rate.dateFrom, dateTo: rate.dateTo, amountMinor, childAmountMinor: rate.child ? toMinor(rate.child) ?? 0 : 0 }] });
    }
    if (dialog === 'sheet') await post(`/admin/contracts/${id}/rate-sheet`, { csv });
    if (dialog === 'restriction') await post(`/admin/contracts/${id}/restrictions`, { kind: restr.kind, roomTypeId: restr.roomTypeId || null, dateFrom: restr.dateFrom, dateTo: restr.dateTo, value: restr.value ? (restr.kind === 'supplement' ? toMinor(restr.value) : Number(restr.value)) : null, note: restr.note || undefined });
    if (dialog === 'allocation') await post(`/admin/contracts/${id}/allocations`, alloc);
  }, { success: 'Saved', onDone: () => { setDialog(null); reload(); } });
  const rateToggle = useAction((rateId: string, s: string) => patch(`/admin/rates/${rateId}`, { status: s }), { onDone: reload });
  const removeR = useAction((rid: string) => del(`/admin/restrictions/${rid}`), { onDone: reload });
  const runPreview = async () => {
    setPvError(null);
    try { setPreview(await post(`/admin/contracts/${id}/preview`, { checkIn: pv.checkIn, checkOut: pv.checkOut, rooms: pv.rooms.split(',').map((a) => ({ adults: Number(a.trim()) || 2, childrenAges: [] })), sellingCurrency: pv.sellingCurrency || undefined })); }
    catch (e) { setPvError(e as ApiError); }
  };
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const c = data.contract;
  const isAdmin = user?.role === 'hb_admin';
  return (
    <div className="page">
      <PageHead back={{ to: '/admin/contracts', label: 'Contracts' }} title={c.hotel_name}
        subtitle={<span className="row gap-3 wrap"><span className="num">{c.reference} · v{c.version}</span><Pill tone={STATUS_TONE[c.status]}>{c.status.replace('_', ' ')}</Pill><span className="small">{fmtDate(c.valid_from)} – {fmtDate(c.valid_to)}</span></span>}
        actions={<>
          {c.status === 'draft' && <Button loading={status.busy} onClick={() => status.run('submit')}>Submit for approval</Button>}
          {c.status === 'pending_approval' && <Button loading={status.busy} disabled={!isAdmin} title={isAdmin ? '' : 'Administrator approval required'} onClick={() => status.run('approve')}>Approve &amp; activate</Button>}
          {c.status === 'active' && <Button variant="danger" loading={status.busy} onClick={() => status.run('suspend')}>Suspend</Button>}
          {c.status === 'suspended' && <Button variant="secondary" loading={status.busy} onClick={() => status.run('reactivate')}>Re-submit</Button>}
        </>} />
      <ErrorNotice error={status.error} />
      {c.status !== 'active' && <div style={{ marginBottom: 'var(--s4)' }}><Notice tone="warn">Not bookable. Rates under this contract are invisible to agents until it is approved and active.</Notice></div>}
      {c.status === 'pending_approval' && c.created_by === user?.id && <div style={{ marginBottom: 'var(--s4)' }}><Notice tone="neutral">You created this contract. Where possible, ask a second administrator to approve it; self-approval is recorded in the audit log.</Notice></div>}
      <div className="tabs" role="tablist">{(['rates', 'restrictions', 'allocation', 'preview', 'terms', 'history'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>

      {tab === 'rates' && <Panel title="Rates (per room per night)" pad={false} actions={<div className="row gap-2"><Button size="sm" variant="secondary" onClick={() => setDialog('sheet')}>Import rate sheet</Button><Button size="sm" icon="plus" onClick={() => setDialog('rate')}>Add rate</Button></div>}>
        {data.rates.length === 0 ? <Empty icon="coins" title="No rates yet">Add rates manually or import a structured rate sheet.</Empty> : (
          <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Room</th><th>Board</th><th className="num">Adults</th><th>Period</th><th className="num">{c.rate_model === 'net' ? 'Net' : 'Gross'}</th><th className="num">Per child</th><th>Status</th><th /></tr></thead>
            <tbody>{data.rates.map((r: any) => <tr key={r.id} style={r.status === 'inactive' ? { opacity: 0.5 } : undefined}><td className="small">{r.room_name} <span className="xs subtle">{r.room_code}</span></td><td className="small">{r.meal_plan}</td><td className="num">{r.adults}</td>
              <td className="small">{fmtDate(r.date_from)} – {fmtDate(r.date_to)}</td><td className="num"><Money minor={r.amount_minor} currency={c.currency} /></td><td className="num"><Money minor={r.child_amount_minor} currency={c.currency} /></td>
              <td><Pill tone={r.status === 'active' ? 'positive' : 'neutral'}>{r.status}</Pill></td><td className="num"><button className="link-btn xs" onClick={() => rateToggle.run(r.id, r.status === 'active' ? 'inactive' : 'active')}>{r.status === 'active' ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div>)}
        <ErrorNotice error={rateToggle.error} />
      </Panel>}

      {tab === 'restrictions' && <Panel title="Restrictions & supplements" pad={false} actions={<Button size="sm" icon="plus" onClick={() => setDialog('restriction')}>Add</Button>}>
        {data.restrictions.length === 0 ? <div className="panel-body small muted">No stop-sells, blackouts, minimum stays or supplements.</div> : (
          <table className="table"><thead><tr><th>Type</th><th>Room</th><th>Dates</th><th>Value</th><th /></tr></thead><tbody>{data.restrictions.map((r: any) => <tr key={r.id}><td className="small">{r.kind.replace('_', ' ')}</td><td className="small">{r.room_name ?? 'All rooms'}</td><td className="small">{fmtDate(r.date_from)} – {fmtDate(r.date_to)}</td>
            <td className="small">{r.kind === 'min_stay' ? `${r.value} nights` : r.kind === 'supplement' ? <Money minor={r.value} currency={c.currency} /> : '—'}{r.note && <div className="xs subtle">{r.note}</div>}</td><td className="num"><button className="link-btn xs" onClick={() => removeR.run(r.id)}>Remove</button></td></tr>)}</tbody></table>)}
      </Panel>}

      {tab === 'allocation' && <Panel title="Allocation (future dates)" pad={false} actions={<Button size="sm" icon="plus" onClick={() => setDialog('allocation')}>Set allocation</Button>}>
        {c.booking_mode !== 'instant' && <div className="panel-body"><Notice tone="neutral">This contract is on request; allocation is only used for instant confirmation.</Notice></div>}
        {data.allocation.length === 0 ? <div className="panel-body small muted">No allocation loaded. Without allocation, bookings are on request.</div> : (
          <table className="table"><thead><tr><th>Room</th><th>Dates loaded</th><th className="num">Room-nights allotted</th><th className="num">Sold</th></tr></thead><tbody>{data.allocation.map((a: any) => <tr key={a.room_type_id}><td>{a.room_name}</td><td className="small">{fmtDate(a.from_date)} – {fmtDate(a.to_date)}</td><td className="num">{a.allotted}</td><td className="num">{a.sold}</td></tr>)}</tbody></table>)}
        <div className="panel-body xs subtle">Release period: {c.release_days} days — inside it, allocation is not used and bookings go on request.</div>
      </Panel>}

      {tab === 'preview' && <Panel title="Agent price preview">
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <TextInput label="Check-in" type="date" value={pv.checkIn} onChange={(e) => setPv({ ...pv, checkIn: e.target.value })} />
          <TextInput label="Check-out" type="date" value={pv.checkOut} onChange={(e) => setPv({ ...pv, checkOut: e.target.value })} />
          <TextInput label="Adults per room" hint="e.g. 2,2,1" value={pv.rooms} onChange={(e) => setPv({ ...pv, rooms: e.target.value })} />
          <TextInput label="Selling currency" hint={`Default ${c.currency}`} maxLength={3} value={pv.sellingCurrency} onChange={(e) => setPv({ ...pv, sellingCurrency: e.target.value.toUpperCase() })} />
          <Button onClick={runPreview}>Preview</Button>
        </div>
        <div className="mt-6"><ErrorNotice error={pvError} />
          {preview && (preview.options.length === 0 ? <Notice tone="neutral">{preview.message ?? 'No sellable options for this request (check rates, occupancy and restrictions).'}</Notice> : (
            <table className="table"><thead><tr><th>Option</th><th>Availability</th><th className="num">Supplier cost</th><th className="num">Sell</th><th className="num">Gross profit</th><th className="num">Margin</th></tr></thead>
              <tbody>{preview.options.map((o: any, i: number) => <tr key={i}><td className="small">{o.rooms.map((r: any) => `${r.roomName} (${r.adults}A)`).join(' + ')}<div className="xs subtle">{MEAL_PLAN_LABEL[o.mealPlan as MealPlan]}</div></td><td className="small">{o.availability}</td>
                <td className="num"><Money minor={o.pricing.totals.supplierCostConvertedMinor} currency={o.pricing.sellCurrency} /></td><td className="num table-title"><Money minor={o.pricing.totals.sellMinor} currency={o.pricing.sellCurrency} /></td>
                <td className="num"><Money minor={o.pricing.totals.grossProfitMinor} currency={o.pricing.sellCurrency} /></td><td className="num">{pct(o.pricing.totals.marginBps)}</td></tr>)}</tbody></table>))}
          {preview && !preview.bookable && <p className="xs subtle mt-4">Preview only — this contract is not active, so agents cannot see these prices.</p>}
        </div>
      </Panel>}

      {tab === 'terms' && terms && <div className="stack gap-6">
        {c.status === 'active' && <Notice tone="warn">Changing terms on an active contract creates a new version and returns it for approval. Its rates stop being bookable until re-approved.</Notice>}
        <TermsForm t={terms} setT={setTerms} />
        <Panel><div className="row gap-3 wrap" style={{ alignItems: 'end' }}><div className="grow"><TextInput label="Change note (required)" value={terms.changeNote} onChange={(e) => setTerms({ ...terms, changeNote: e.target.value })} /></div><Button loading={saveTerms.busy} disabled={terms.changeNote.length < 3} onClick={() => saveTerms.run()}>Save new version</Button></div><ErrorNotice error={saveTerms.error} /></Panel>
      </div>}

      {tab === 'history' && <Panel title="Version history" pad={false}>
        <table className="table"><tbody>{data.versions.map((v: any, i: number) => <tr key={i}><td className="num" style={{ width: 60 }}>v{v.version}</td><td>{v.change_note}</td><td className="small">{v.changed_by ?? '—'}</td><td className="num xs">{fmtDateTime(v.changed_at)}</td></tr>)}</tbody></table>
      </Panel>}

      {dialog && (
        <Dialog title={{ rate: 'Add rate', sheet: 'Import rate sheet', restriction: 'Add restriction', allocation: 'Set allocation' }[dialog]} onClose={() => setDialog(null)} footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button loading={sub.busy} onClick={() => sub.run()}>Save</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={sub.error} />
            {sub.error?.details && Array.isArray(sub.error.details) && typeof sub.error.details[0] === 'string' && <div className="code-block">{sub.error.details.join('\n')}</div>}
            {dialog === 'rate' && <div className="grid-2">
              <SelectInput label="Room type" value={rate.roomTypeId} onChange={(e) => setRate({ ...rate, roomTypeId: e.target.value })}>{data.rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput>
              <SelectInput label="Board" value={rate.mealPlan} onChange={(e) => setRate({ ...rate, mealPlan: e.target.value })}>{MEAL_PLANS.map((m) => <option key={m} value={m}>{MEAL_PLAN_LABEL[m]}</option>)}</SelectInput>
              <TextInput label="Adults" type="number" min={1} value={rate.adults} onChange={(e) => setRate({ ...rate, adults: Number(e.target.value) })} />
              <TextInput label={`Amount per night (${c.currency})`} inputMode="decimal" value={rate.amount} onChange={(e) => setRate({ ...rate, amount: e.target.value })} />
              <TextInput label="From" type="date" value={rate.dateFrom} onChange={(e) => setRate({ ...rate, dateFrom: e.target.value })} />
              <TextInput label="To (last night)" type="date" value={rate.dateTo} onChange={(e) => setRate({ ...rate, dateTo: e.target.value })} />
              <TextInput label="Per child per night" inputMode="decimal" value={rate.child} onChange={(e) => setRate({ ...rate, child: e.target.value })} />
            </div>}
            {dialog === 'sheet' && <>
              <p className="small muted">CSV columns: <code>room_code, meal_plan, adults, date_from, date_to, amount</code>, optional <code>child_amount</code>. Amounts are decimals in {c.currency}. Room codes: {data.rooms.map((r: any) => r.code).join(', ')}. If any row is invalid, nothing is imported.</p>
              <textarea className="textarea code-block" style={{ minHeight: 200 }} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="Rate sheet CSV" />
            </>}
            {dialog === 'restriction' && <div className="grid-2">
              <SelectInput label="Type" value={restr.kind} onChange={(e) => setRestr({ ...restr, kind: e.target.value })}><option value="stop_sell">Stop-sell</option><option value="blackout">Blackout</option><option value="min_stay">Minimum stay</option><option value="supplement">Supplement per room-night</option></SelectInput>
              <SelectInput label="Room" value={restr.roomTypeId} onChange={(e) => setRestr({ ...restr, roomTypeId: e.target.value })}><option value="">All rooms</option>{data.rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput>
              <TextInput label="From" type="date" value={restr.dateFrom} onChange={(e) => setRestr({ ...restr, dateFrom: e.target.value })} />
              <TextInput label="To" type="date" value={restr.dateTo} onChange={(e) => setRestr({ ...restr, dateTo: e.target.value })} />
              {(restr.kind === 'min_stay' || restr.kind === 'supplement') && <TextInput label={restr.kind === 'min_stay' ? 'Minimum nights' : `Amount (${c.currency})`} value={restr.value} onChange={(e) => setRestr({ ...restr, value: e.target.value })} />}
              <TextInput label="Note" value={restr.note} onChange={(e) => setRestr({ ...restr, note: e.target.value })} />
            </div>}
            {dialog === 'allocation' && <div className="grid-2">
              <SelectInput label="Room" value={alloc.roomTypeId} onChange={(e) => setAlloc({ ...alloc, roomTypeId: e.target.value })}>{data.rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput>
              <TextInput label="Rooms per night" type="number" min={0} value={alloc.allotted} onChange={(e) => setAlloc({ ...alloc, allotted: Number(e.target.value) })} />
              <TextInput label="From" type="date" value={alloc.dateFrom} onChange={(e) => setAlloc({ ...alloc, dateFrom: e.target.value })} />
              <TextInput label="To" type="date" value={alloc.dateTo} onChange={(e) => setAlloc({ ...alloc, dateTo: e.target.value })} />
            </div>}
          </div>
        </Dialog>
      )}
      <p className="xs subtle mt-8"><Link to={`/admin/hotels/${c.hotel_id}`}>Open hotel</Link></p>
    </div>
  );
}

export { ButtonLink };
