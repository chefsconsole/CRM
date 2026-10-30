import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ROLE_LABEL } from '../../../../shared/domain';
import { Button, Checkbox, Dialog, Empty, ErrorNotice, Loading, LoadingRows, Money, Notice, PageHead, Panel, Pill, SelectInput, TextArea, TextInput, useAction } from '../../components/ui';
import { patch, post, type ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDate, fmtDateTime, fmtRelative, fromMinor, pct, toMinor } from '../../lib/format';

const AG_TONE: Record<string, any> = { active: 'positive', pending: 'attention', suspended: 'negative', rejected: 'neutral' };

export function AdminAgencies() {
  const { data, error, loading } = useApi<any[]>('/admin/agencies');
  const navigate = useNavigate();
  return (
    <div className="page">
      <PageHead title="Agencies" subtitle="Verification, credit and commercial terms." />
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? <Empty icon="user" title="No agencies registered" /> : (
        <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Agency</th><th>Location</th><th className="num">Users</th><th className="num">Bookings</th><th>Terms</th><th>Status</th></tr></thead>
          <tbody>{data.map((a) => <tr key={a.id} className="clickable" onClick={() => navigate(`/admin/agencies/${a.id}`)}>
            <td><div className="table-title">{a.name}</div><div className="xs subtle">Registered {fmtDate(a.created_at)}</div></td><td data-hide-mobile className="small">{a.city}, {a.country_code}</td>
            <td className="num" data-hide-mobile>{a.users}</td><td className="num">{a.bookings}</td><td data-hide-mobile className="small">{a.credit_enabled ? <>Credit · <Money minor={a.credit_limit_minor} currency={a.selling_currency} /></> : 'Prepay'} · {a.selling_currency}</td>
            <td><Pill tone={AG_TONE[a.status]}>{a.status}</Pill></td></tr>)}</tbody></table></div>)}
      </div>
    </div>
  );
}

export function AdminAgencyDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<any>(`/admin/agencies/${id}`);
  const [dialog, setDialog] = useState<null | 'status' | 'credit' | 'markup'>(null);
  const [st, setSt] = useState({ status: 'active', note: '' });
  const [cr, setCr] = useState({ enabled: false, limit: '', paymentTerms: 'prepay', justification: '' });
  const [mk, setMk] = useState({ pct: '10', rounding: 'up_to_unit' });
  const sub = useAction(async () => {
    if (dialog === 'status') await post(`/admin/agencies/${id}/status`, st);
    if (dialog === 'credit') await post(`/admin/agencies/${id}/credit`, { enabled: cr.enabled, limitMinor: cr.enabled ? toMinor(cr.limit) ?? 0 : 0, paymentTerms: cr.paymentTerms, justification: cr.justification });
    if (dialog === 'markup') await post('/admin/pricing-rules', { agencyId: id, markupType: 'percent', value: Math.round(Number(mk.pct) * 100), rounding: mk.rounding });
  }, { success: 'Saved', onDone: () => { setDialog(null); reload(); } });
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const a = data.agency;
  const activeRule = data.pricingRules.find((r: any) => r.active);
  return (
    <div className="page">
      <PageHead back={{ to: '/admin/agencies', label: 'Agencies' }} title={a.name} subtitle={<Pill tone={AG_TONE[a.status]}>{a.status}</Pill>}
        actions={<>
          {a.status === 'pending' && <Button onClick={() => { setSt({ status: 'active', note: '' }); setDialog('status'); }}>Verify &amp; activate</Button>}
          {a.status === 'active' && <Button variant="danger" onClick={() => { setSt({ status: 'suspended', note: '' }); setDialog('status'); }}>Suspend</Button>}
          {a.status !== 'active' && a.status !== 'pending' && <Button variant="secondary" onClick={() => { setSt({ status: 'active', note: '' }); setDialog('status'); }}>Reactivate</Button>}
          <Button variant="secondary" onClick={() => { setCr({ enabled: a.credit_enabled, limit: a.credit_limit_minor ? fromMinor(a.credit_limit_minor) : '', paymentTerms: a.payment_terms, justification: '' }); setDialog('credit'); }}>Credit &amp; terms</Button>
          <Button variant="secondary" onClick={() => setDialog('markup')}>Agency markup</Button>
        </>} />
      <div className="layout-2">
        <div className="stack gap-6">
          <Panel title="Verification details">
            <dl className="kv">
              <dt>Legal name</dt><dd>{a.legal_name ?? '—'}</dd><dt>Registration no.</dt><dd>{a.registration_number ?? <span className="subtle">Not provided</span>}</dd>
              <dt>Location</dt><dd>{[a.address, a.city, a.country_code].filter(Boolean).join(', ')}</dd><dt>Phone</dt><dd>{a.phone ?? '—'}</dd>
              <dt>Website</dt><dd>{a.website ?? '—'}</dd><dt>Verified</dt><dd>{a.verified_at ? fmtDateTime(a.verified_at) : 'Not yet'}</dd>
            </dl>
            {a.notes && <div className="code-block mt-4">{a.notes}</div>}
          </Panel>
          <Panel title="Users" pad={false}><table className="table"><tbody>{data.users.map((u: any) => <tr key={u.id}><td><div className="table-title small">{u.name}</div><div className="xs subtle">{u.email}</div></td><td className="small">{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</td><td className="xs subtle num">{u.last_login_at ? fmtRelative(u.last_login_at) : 'Never signed in'}</td></tr>)}</tbody></table></Panel>
        </div>
        <Panel title="Commercial">
          <dl className="kv">
            <dt>Selling currency</dt><dd>{a.selling_currency}</dd>
            <dt>Payment terms</dt><dd>{a.payment_terms === 'credit' ? 'Credit' : 'Prepay'}</dd>
            <dt>Credit</dt><dd>{a.credit_enabled ? <Money minor={a.credit_limit_minor} currency={a.selling_currency} /> : 'Disabled'}</dd>
            {a.credit_approved_at && <><dt>Credit approved</dt><dd>{fmtDate(a.credit_approved_at)}</dd></>}
            <dt>Agency markup</dt><dd>{activeRule ? `${pct(activeRule.value)} (overrides network default)` : 'Network default'}</dd>
            <dt>Balance</dt><dd>{data.balances.length ? data.balances.map((b: any) => <div key={b.currency}><Money minor={b.balance_minor} currency={b.currency} /></div>) : '—'}</dd>
          </dl>
        </Panel>
      </div>
      {dialog && (
        <Dialog title={{ status: st.status === 'active' ? 'Verify agency' : 'Suspend agency', credit: 'Credit & payment terms', markup: 'Agency-specific markup' }[dialog]} onClose={() => setDialog(null)} footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button loading={sub.busy} onClick={() => sub.run()}>Save</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={sub.error} />
            {dialog === 'status' && <>
              {st.status === 'active' && <p className="small muted">Confirm you have verified the business (registration, licence, references) before activating. Activation enables search and booking.</p>}
              {st.status === 'suspended' && <Notice tone="warn">Suspending signs out all of the agency's users immediately.</Notice>}
              <TextArea label="Verification / reason note (recorded)" value={st.note} onChange={(e) => setSt({ ...st, note: e.target.value })} />
            </>}
            {dialog === 'credit' && <>
              <Notice tone="warn">Credit exposes HotelBridge to non-payment. Approve only after a documented credit check.</Notice>
              <Checkbox checked={cr.enabled} onChange={(v) => setCr({ ...cr, enabled: v, paymentTerms: v ? cr.paymentTerms : 'prepay' })}>Enable credit</Checkbox>
              {cr.enabled && <div className="grid-2"><TextInput label={`Credit limit (${a.selling_currency})`} inputMode="decimal" value={cr.limit} onChange={(e) => setCr({ ...cr, limit: e.target.value })} /><SelectInput label="Payment terms" value={cr.paymentTerms} onChange={(e) => setCr({ ...cr, paymentTerms: e.target.value })}><option value="credit">Credit</option><option value="prepay">Prepay (credit as fallback off)</option></SelectInput></div>}
              <TextArea label="Justification (recorded in audit log)" value={cr.justification} onChange={(e) => setCr({ ...cr, justification: e.target.value })} />
            </>}
            {dialog === 'markup' && <div className="grid-2"><TextInput label="Markup on net cost %" inputMode="decimal" value={mk.pct} onChange={(e) => setMk({ ...mk, pct: e.target.value })} /><SelectInput label="Rounding" value={mk.rounding} onChange={(e) => setMk({ ...mk, rounding: e.target.value })}><option value="up_to_unit">Round up to whole unit</option><option value="none">No rounding</option></SelectInput></div>}
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function AdminPricing() {
  const rules = useApi<any[]>('/admin/pricing-rules');
  const fx = useApi<any[]>('/admin/fx');
  const [rule, setRule] = useState({ markupType: 'percent', value: '10', currency: 'EUR', rounding: 'up_to_unit', source: '' });
  const [rate, setRate] = useState({ base: 'EUR', quote: 'USD', rate: '', source: '', asOf: new Date().toISOString().slice(0, 16) });
  const addRule = useAction(() => post('/admin/pricing-rules', { markupType: rule.markupType, value: rule.markupType === 'percent' ? Math.round(Number(rule.value) * 100) : toMinor(rule.value) ?? 0, currency: rule.markupType === 'percent' ? null : rule.currency, rounding: rule.rounding, source: rule.source || null }), { success: 'Network rule saved', onDone: rules.reload });
  const deact = useAction((rid: string) => post(`/admin/pricing-rules/${rid}/deactivate`), { onDone: rules.reload });
  const addFx = useAction(() => post('/admin/fx', { ...rate, asOf: new Date(`${rate.asOf}:00Z`).toISOString() }), { success: 'Rate recorded', onDone: fx.reload });
  return (
    <div className="page">
      <PageHead title="Pricing & FX" subtitle="Markups apply to net cost. Commissionable rates sell at the hotel's price. Currency conversion uses only recorded rates." />
      <div className="stack gap-6">
        <Panel title="Markup rules" pad={false}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Scope</th><th>Source</th><th>Markup</th><th>Rounding</th><th>Status</th><th /></tr></thead>
            <tbody>{rules.data?.map((r) => <tr key={r.id} style={r.active ? undefined : { opacity: 0.5 }}><td className="small">{r.agency_name ?? 'Network default'}</td><td className="small">{r.source ?? 'All'}</td><td className="num">{r.markup_type === 'percent' ? pct(r.value) : <><Money minor={r.value} currency={r.currency} /> / room-night</>}</td><td className="small">{r.rounding}</td><td><Pill tone={r.active ? 'positive' : 'neutral'}>{r.active ? 'Active' : 'Superseded'}</Pill></td><td className="num">{r.active && <button className="link-btn xs" onClick={() => deact.run(r.id)}>Deactivate</button>}</td></tr>)}</tbody></table></div>
          <div className="panel-body">
            <div className="form-grid" style={{ alignItems: 'end' }}>
              <SelectInput label="Type" value={rule.markupType} onChange={(e) => setRule({ ...rule, markupType: e.target.value })}><option value="percent">Percentage of cost</option><option value="fixed_per_room_night">Fixed per room-night</option></SelectInput>
              <TextInput label={rule.markupType === 'percent' ? 'Markup %' : 'Amount'} inputMode="decimal" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} />
              {rule.markupType !== 'percent' && <TextInput label="Currency" maxLength={3} value={rule.currency} onChange={(e) => setRule({ ...rule, currency: e.target.value.toUpperCase() })} />}
              <SelectInput label="Source" value={rule.source} onChange={(e) => setRule({ ...rule, source: e.target.value })}><option value="">All sources</option><option value="direct_contract">Direct contracts</option><option value="sandbox">Sandbox</option></SelectInput>
              <SelectInput label="Rounding" value={rule.rounding} onChange={(e) => setRule({ ...rule, rounding: e.target.value })}><option value="up_to_unit">Round up</option><option value="none">None</option></SelectInput>
              <Button loading={addRule.busy} onClick={() => addRule.run()}>Set network rule</Button>
            </div>
            <ErrorNotice error={addRule.error} />
            <p className="xs subtle mt-4">A new rule supersedes the previous rule for the same scope. Agency-specific rules are set from the agency page. Changes affect new searches; existing offers are revalidated at checkout.</p>
          </div>
        </Panel>
        <Panel title="Recorded exchange rates" pad={false}>
          {fx.data?.length === 0 ? <div className="panel-body small muted">No rates recorded. Without a rate, agencies are shown prices in the contract currency.</div> : (
            <table className="table"><thead><tr><th>Pair</th><th className="num">Rate</th><th>Source</th><th>As of</th></tr></thead><tbody>{fx.data?.map((r) => <tr key={r.id}><td>{r.base} → {r.quote}</td><td className="num">{(r.rate_scaled / 1e8).toFixed(6)}</td><td className="small">{r.source}</td><td className="small">{fmtDateTime(r.as_of)}{Date.now() - new Date(r.as_of).getTime() > 72 * 3600_000 && <Pill tone="attention">Stale — not used</Pill>}</td></tr>)}</tbody></table>)}
          <div className="panel-body">
            <div className="form-grid" style={{ alignItems: 'end' }}>
              <TextInput label="Base" maxLength={3} value={rate.base} onChange={(e) => setRate({ ...rate, base: e.target.value.toUpperCase() })} />
              <TextInput label="Quote" maxLength={3} value={rate.quote} onChange={(e) => setRate({ ...rate, quote: e.target.value.toUpperCase() })} />
              <TextInput label="1 base = ? quote" inputMode="decimal" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} />
              <TextInput label="Source" hint="e.g. bank rate sheet" value={rate.source} onChange={(e) => setRate({ ...rate, source: e.target.value })} />
              <TextInput label="As of (UTC)" type="datetime-local" value={rate.asOf} onChange={(e) => setRate({ ...rate, asOf: e.target.value })} />
              <Button loading={addFx.busy} onClick={() => addFx.run()}>Record rate</Button>
            </div>
            <ErrorNotice error={addFx.error} />
            <p className="xs subtle mt-4">Rates older than 72 hours are ignored. Each booking stores the rate and timestamp it was priced with.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function AdminSuppliers() {
  const { data, error, loading, reload } = useApi<any[]>('/admin/suppliers');
  const calls = useApi<any[]>('/admin/suppliers/calls');
  const fault = useAction((mode: string) => post('/admin/suppliers/sandbox/fault', { mode }), { success: 'Sandbox behaviour updated', onDone: reload });
  const [cmp, setCmp] = useState<{ hotelId: string; checkIn: string; checkOut: string }>({ hotelId: '', checkIn: '', checkOut: '' });
  const hotels = useApi<any[]>('/admin/hotels');
  const [cmpRes, setCmpRes] = useState<any>(null);
  const [cmpErr, setCmpErr] = useState<ApiError | null>(null);
  const runCmp = async () => { setCmpErr(null); try { setCmpRes(await post('/admin/rate-comparison', { ...cmp, rooms: [{ adults: 2 }] })); } catch (e) { setCmpErr(e as ApiError); } };
  if (loading) return <div className="page"><LoadingRows /></div>;
  return (
    <div className="page">
      <PageHead title="Inventory sources" subtitle="Each source exposes only the capabilities it actually supports. Third-party suppliers are candidates until contracted and certified." />
      <ErrorNotice error={error} />
      <div className="stack gap-4">
        {data?.map((s) => (
          <Panel key={s.code} title={<span className="row gap-3">{s.name}<Pill tone={s.status.configured ? (s.status.environment === 'sandbox' ? 'attention' : 'positive') : 'neutral'}>{s.status.label}</Pill>{s.breaker.open && <Pill tone="negative">Circuit open</Pill>}</span>}>
            <div className="grid-2">
              <div>
                <div className="eyebrow">Capabilities</div>
                <div className="facts mt-2">{Object.entries(s.capabilities).map(([k, v]) => <span key={k} className="tag" style={v ? undefined : { opacity: 0.4, textDecoration: 'line-through' }}>{k}</span>)}</div>
                {s.status.notes && <p className="xs subtle mt-4">{s.status.notes}</p>}
              </div>
              <div>
                {s.status.missing.length > 0 ? <><div className="eyebrow">Needed to activate</div><ul className="small muted" style={{ margin: 'var(--s2) 0 0', paddingLeft: 18 }}>{s.status.missing.map((m: string) => <li key={m}>{m}</li>)}</ul></>
                  : s.stats ? <dl className="kv"><dt>Calls (7 days)</dt><dd>{s.stats.calls}</dd><dt>Failures</dt><dd>{s.stats.failures}</dd><dt>Average</dt><dd>{s.stats.avg_ms} ms</dd></dl> : <p className="small muted">No recent calls.</p>}
                {s.fault !== undefined && <div className="mt-4"><SelectInput label="Sandbox behaviour (testing)" value={s.fault} onChange={(e) => fault.run(e.target.value)}>
                  {['none', 'search_error', 'price_increase', 'book_reject', 'book_timeout_after_commit', 'sold_out'].map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}</SelectInput></div>}
              </div>
            </div>
          </Panel>
        ))}
        <Panel title="Rate comparison (internal)">
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <SelectInput label="Hotel" value={cmp.hotelId} onChange={(e) => setCmp({ ...cmp, hotelId: e.target.value })}><option value="">Select…</option>{hotels.data?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</SelectInput>
            <TextInput label="Check-in" type="date" value={cmp.checkIn} onChange={(e) => setCmp({ ...cmp, checkIn: e.target.value })} />
            <TextInput label="Check-out" type="date" value={cmp.checkOut} onChange={(e) => setCmp({ ...cmp, checkOut: e.target.value })} />
            <Button onClick={runCmp} disabled={!cmp.hotelId || !cmp.checkIn || !cmp.checkOut}>Compare sources (2 adults)</Button>
          </div>
          <ErrorNotice error={cmpErr} />
          {cmpRes && <div className="stack gap-4 mt-6">
            <table className="table"><thead><tr><th>#</th><th>Source</th><th>Room</th><th>Board</th><th className="num">Cost</th><th className="num">Sell</th></tr></thead><tbody>{cmpRes.offers.map((o: any) => <tr key={o.index}><td>{o.index + 1}</td><td>{o.source}</td><td className="small">{o.rooms.join(', ')}</td><td>{o.mealPlan}</td><td className="num"><Money minor={o.supplierCostMinor} currency={o.currency} /></td><td className="num"><Money minor={o.sellMinor} currency={o.currency} /></td></tr>)}</tbody></table>
            {cmpRes.comparisons.map((c: any, i: number) => <Notice key={i} tone={c.comparable ? 'success' : 'neutral'} title={`Offer ${c.a + 1} vs ${c.b + 1}:`}>{c.comparable ? 'Equivalent conditions — prices are directly comparable.' : `Not equivalent — ${c.differences.join('; ')}.`}</Notice>)}
            <p className="xs subtle">{cmpRes.note}</p>
          </div>}
        </Panel>
        <Panel title="Recent supplier calls (redacted)" pad={false}>
          {!calls.data?.length ? <div className="panel-body small muted">No external calls logged.</div> : <div className="table-wrap"><table className="table"><tbody>{calls.data.slice(0, 40).map((c) => <tr key={c.id}><td className="small">{c.source}</td><td className="small">{c.operation}</td><td><Pill tone={c.outcome === 'success' ? 'positive' : 'negative'}>{c.outcome}</Pill></td><td className="xs subtle">{c.error_class ?? ''}</td><td className="num xs">{c.duration_ms} ms</td><td className="num xs">{fmtDateTime(c.at)}</td></tr>)}</tbody></table></div>}
        </Panel>
      </div>
    </div>
  );
}

export function AdminApplications() {
  const { data, error, loading, reload } = useApi<any[]>('/admin/applications');
  const upd = useAction((aid: string, status: string) => patch(`/admin/applications/${aid}`, { status }), { onDone: reload });
  return (
    <div className="page">
      <PageHead title="Partner applications" subtitle="Hotels and distribution partners who asked to join." />
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? <Empty icon="inbox" title="No applications yet" /> : (
        <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Organisation</th><th>Contact</th><th>Details</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((a) => <tr key={a.id}><td><div className="table-title">{a.organisation}</div><div className="xs subtle">{a.kind} · {[a.city, a.country_code].filter(Boolean).join(', ')} · {fmtDate(a.created_at)}</div></td>
            <td className="small">{a.contact_name}<div className="xs subtle">{a.email}{a.phone ? ` · ${a.phone}` : ''}</div></td>
            <td className="xs" data-hide-mobile>{[a.details.rooms && `${a.details.rooms} rooms`, a.details.category, a.details.channelManager, a.details.message].filter(Boolean).join(' · ')}</td>
            <td><Pill tone={a.status === 'approved' ? 'positive' : a.status === 'declined' ? 'neutral' : 'pending'}>{a.status}</Pill></td>
            <td className="num"><select className="select input-sm" style={{ width: 130 }} value={a.status} onChange={(e) => upd.run(a.id, e.target.value)} aria-label="Update status"><option value="new">New</option><option value="reviewing">Reviewing</option><option value="approved">Approved</option><option value="declined">Declined</option></select></td></tr>)}</tbody></table></div>)}
      </div>
      <p className="xs subtle mt-4">Approving an application records the decision only. Create the hotel, contract and partner users from the Hotels area.</p>
    </div>
  );
}

export function AdminSupport() {
  const { data, error, loading } = useApi<any[]>('/admin/support');
  const navigate = useNavigate();
  return (
    <div className="page">
      <PageHead title="Support" />
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? <Empty icon="help" title="No support requests" /> : (
        <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Request</th><th>Agency</th><th>Updated</th><th>Status</th></tr></thead>
          <tbody>{data.map((t) => <tr key={t.id} className="clickable" onClick={() => navigate(`/admin/support/${t.id}`)}><td><div className="table-title">{t.subject}</div><div className="xs subtle">{t.reference}{t.booking_reference ? ` · ${t.booking_reference}` : ''}</div></td><td className="small" data-hide-mobile>{t.agency_name}</td><td className="small" data-hide-mobile>{fmtRelative(t.updated_at)}</td>
            <td><div className="row gap-2">{t.priority === 'urgent' && t.status === 'open' && <Pill tone="negative">Urgent</Pill>}<Pill tone={t.status === 'open' ? 'attention' : t.status === 'answered' ? 'pending' : 'neutral'}>{t.status}</Pill></div></td></tr>)}</tbody></table></div>)}
      </div>
    </div>
  );
}

export function AdminSupportDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<any>(`/admin/support/${id}`);
  const [body, setBody] = useState('');
  const reply = useAction((close: boolean) => post(`/admin/support/${id}/reply`, { body, close }), { success: 'Reply sent', onDone: () => { setBody(''); reload(); } });
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  return (
    <div className="page">
      <PageHead back={{ to: '/admin/support', label: 'Support' }} title={data.ticket.subject} subtitle={`${data.ticket.reference} · ${data.ticket.agency_name}`} actions={data.ticket.booking_id && <Link className="btn btn-secondary" to={`/admin/bookings/${data.ticket.booking_id}`}>Open booking</Link>} />
      <Panel title="Conversation"><div className="stack gap-3">
        {data.messages.map((m: any, i: number) => <div key={i} className={`message${m.from_staff ? ' internal' : ''}`}><div className="xs subtle">{m.author} · {fmtDateTime(m.at)}</div><div className="mt-2">{m.body}</div></div>)}
        <TextArea label="Reply to the agency" value={body} onChange={(e) => setBody(e.target.value)} />
        <ErrorNotice error={reply.error} />
        <div className="row gap-3"><Button loading={reply.busy} disabled={!body.trim()} onClick={() => reply.run(false)}>Send reply</Button><Button variant="secondary" disabled={!body.trim()} onClick={() => reply.run(true)}>Reply &amp; close</Button></div>
      </div></Panel>
    </div>
  );
}

const PRESETS: Record<string, number> = { '100 agencies': 100, '1,000 agencies': 1000, '10,000 agencies': 10000 };
export function AdminScenarios() {
  const [s, setS] = useState({
    currency: 'EUR', activeAgencies: 100, bookingsPerAgencyPerMonth: 4, cancellationPct: '12', paymentCostPct: '1.5', supportCost: '4.00', agenciesPerAM: 60, amCost: '4500', fixed: '40000',
    segments: [{ name: 'Direct contracts', sharePct: '55', abv: '650', takePct: '12' }, { name: 'Third-party supply', sharePct: '35', abv: '520', takePct: '6' }, { name: 'Groups', sharePct: '10', abv: '9000', takePct: '8' }],
  });
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const run = async (agencies = s.activeAgencies) => {
    setErr(null);
    try {
      setRes(await post('/admin/scenarios', {
        currency: s.currency, activeAgencies: agencies, bookingsPerAgencyPerMonth: Number(s.bookingsPerAgencyPerMonth),
        segments: s.segments.map((x) => ({ name: x.name, shareBps: Math.round(Number(x.sharePct) * 100), averageBookingValueMinor: toMinor(x.abv) ?? 0, takeRateBps: Math.round(Number(x.takePct) * 100) })),
        cancellationRateBps: Math.round(Number(s.cancellationPct) * 100), paymentCostBps: Math.round(Number(s.paymentCostPct) * 100), supportCostPerBookingMinor: toMinor(s.supportCost) ?? 0,
        agenciesPerAccountManager: Number(s.agenciesPerAM), accountManagerMonthlyCostMinor: toMinor(s.amCost) ?? 0, fixedMonthlyCostsMinor: toMinor(s.fixed) ?? 0,
      }));
    } catch (e) { setErr(e as ApiError); }
  };
  const m = res?.monthly, y = res?.annual, c = res?.currency;
  return (
    <div className="page">
      <PageHead title="Commercial scenarios" subtitle="Test the business model. These are scenarios with your inputs — not forecasts and not actual performance." />
      <div className="layout-2">
        <div className="stack gap-6">
          <Panel title="Inputs">
            <div className="stack gap-4">
              <div className="row gap-2 wrap">{Object.entries(PRESETS).map(([k, v]) => <Button key={k} size="sm" variant={s.activeAgencies === v ? 'primary' : 'secondary'} onClick={() => { setS({ ...s, activeAgencies: v }); run(v); }}>{k}</Button>)}</div>
              <div className="form-grid">
                <TextInput label="Active agencies" type="number" value={s.activeAgencies} onChange={(e) => setS({ ...s, activeAgencies: Number(e.target.value) })} />
                <TextInput label="Bookings / agency / month" inputMode="decimal" value={s.bookingsPerAgencyPerMonth} onChange={(e) => setS({ ...s, bookingsPerAgencyPerMonth: Number(e.target.value) })} />
                <TextInput label="Cancellation rate %" value={s.cancellationPct} onChange={(e) => setS({ ...s, cancellationPct: e.target.value })} />
                <TextInput label="Payment cost % of GBV" value={s.paymentCostPct} onChange={(e) => setS({ ...s, paymentCostPct: e.target.value })} />
                <TextInput label="Support cost / booking" value={s.supportCost} onChange={(e) => setS({ ...s, supportCost: e.target.value })} />
                <TextInput label="Agencies per account manager" type="number" value={s.agenciesPerAM} onChange={(e) => setS({ ...s, agenciesPerAM: Number(e.target.value) })} />
                <TextInput label="Account manager cost / month" value={s.amCost} onChange={(e) => setS({ ...s, amCost: e.target.value })} />
                <TextInput label="Fixed costs / month" value={s.fixed} onChange={(e) => setS({ ...s, fixed: e.target.value })} />
              </div>
              <div className="eyebrow mt-4">Segments — margins differ by source</div>
              {s.segments.map((seg, i) => <div key={i} className="form-grid">
                <TextInput label="Segment" value={seg.name} onChange={(e) => setS({ ...s, segments: s.segments.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <TextInput label="Share of bookings %" value={seg.sharePct} onChange={(e) => setS({ ...s, segments: s.segments.map((x, j) => (j === i ? { ...x, sharePct: e.target.value } : x)) })} />
                <TextInput label="Avg booking value" value={seg.abv} onChange={(e) => setS({ ...s, segments: s.segments.map((x, j) => (j === i ? { ...x, abv: e.target.value } : x)) })} />
                <TextInput label="Take rate %" hint="Net revenue ÷ GBV" value={seg.takePct} onChange={(e) => setS({ ...s, segments: s.segments.map((x, j) => (j === i ? { ...x, takePct: e.target.value } : x)) })} />
              </div>)}
              <ErrorNotice error={err} />
              <div><Button onClick={() => run()}>Run scenario</Button></div>
            </div>
          </Panel>
        </div>
        <div className="stack gap-4">
          {!res ? <Panel><Empty icon="chart" title="Run a scenario">Results separate gross booking value, net revenue, gross profit and contribution.</Empty></Panel> : <>
            <Notice tone="warn">{res.disclaimer}</Notice>
            <Panel title="Monthly">
              <div className="summary-line"><span className="muted">Realised bookings</span><span className="num">{m.realisedBookings.toLocaleString()} <span className="xs subtle">({m.cancelledBookings.toLocaleString()} cancelled)</span></span></div>
              <div className="summary-line"><span className="muted">Gross booking value</span><Money minor={m.gbvMinor} currency={c} /></div>
              <div className="summary-line"><span className="muted">Net revenue ({pct(res.blendedTakeRateBps)} blended)</span><Money minor={m.netRevenueMinor} currency={c} /></div>
              <div className="summary-line"><span className="muted">− Payment costs</span><Money minor={-m.paymentCostsMinor} currency={c} /></div>
              <div className="summary-line total"><span>Gross profit</span><Money minor={m.grossProfitMinor} currency={c} /></div>
              <div className="summary-line"><span className="muted">− Support</span><Money minor={-m.supportCostsMinor} currency={c} /></div>
              <div className="summary-line"><span className="muted">− Account management ({m.accountManagers})</span><Money minor={-m.accountCostsMinor} currency={c} /></div>
              <div className="summary-line total"><span>Contribution</span><Money minor={m.contributionMinor} currency={c} /></div>
              <div className="summary-line"><span className="muted">− Fixed costs</span><Money minor={-m.fixedCostsMinor} currency={c} /></div>
              <div className="summary-line total"><span>Operating result</span><Money minor={m.operatingResultMinor} currency={c} /></div>
            </Panel>
            <Panel title="Annualised (×12)">
              <div className="summary-line"><span className="muted">GBV</span><Money minor={y.gbvMinor} currency={c} /></div>
              <div className="summary-line"><span className="muted">Net revenue</span><Money minor={y.netRevenueMinor} currency={c} /></div>
              <div className="summary-line"><span className="muted">Contribution</span><Money minor={y.contributionMinor} currency={c} /></div>
              <div className="summary-line"><span className="muted">Operating result</span><Money minor={y.operatingResultMinor} currency={c} /></div>
              <p className="xs subtle mt-4">Revenue of $1bn requires net revenue, not GBV, of that size. Compare the net revenue line above.</p>
            </Panel>
          </>}
        </div>
      </div>
    </div>
  );
}

export function AdminAudit() {
  const { data, error, loading } = useApi<any[]>('/admin/audit');
  return (
    <div className="page">
      <PageHead title="Audit log" subtitle="Append-only record of significant actions." />
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>Actor</th><th>Entity</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>{data?.map((a) => <tr key={a.id}><td className="xs">{fmtDateTime(a.at)}</td><td className="small">{a.actor ?? 'System'}</td><td className="small">{a.entity_type}<div className="xs subtle">{String(a.entity_id).slice(0, 8)}</div></td><td className="small">{a.action}</td><td className="xs subtle" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{JSON.stringify(a.details)}</td></tr>)}</tbody></table></div>)}
      </div>
    </div>
  );
}

export function AdminStaff() {
  const { data, error, loading, reload } = useApi<any[]>('/admin/staff');
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'hb_ops' });
  const add = useAction(() => post('/admin/staff', f), { success: 'Staff user created', onDone: () => { setF({ name: '', email: '', password: '', role: 'hb_ops' }); reload(); } });
  return (
    <div className="page">
      <PageHead title="Team" subtitle="HotelBridge staff accounts." />
      <ErrorNotice error={error} />
      <div className="layout-2">
        <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : <table className="table"><tbody>{data?.map((u) => <tr key={u.id}><td><div className="table-title small">{u.name}</div><div className="xs subtle">{u.email}</div></td><td className="small">{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</td><td className="xs subtle num">{u.last_login_at ? fmtRelative(u.last_login_at) : 'Never'}</td></tr>)}</tbody></table>}</div>
        <Panel title="Add team member"><div className="stack gap-4">
          <ErrorNotice error={add.error} />
          <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <TextInput label="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextInput label="Initial password" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <SelectInput label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="hb_ops">Operations</option><option value="hb_finance">Finance</option><option value="hb_admin">Administrator</option></SelectInput>
          <Button loading={add.busy} onClick={() => add.run()}>Create</Button>
        </div></Panel>
      </div>
    </div>
  );
}
