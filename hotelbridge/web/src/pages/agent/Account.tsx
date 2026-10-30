import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ROLE_LABEL } from '../../../../shared/domain';
import { Button, ButtonLink, Dialog, Empty, ErrorNotice, Loading, LoadingRows, Money, Notice, PageHead, Panel, Pill, SampleTag, SelectInput, TextArea, TextInput, useAction } from '../../components/ui';
import { HotelImage } from '../../components/HotelImage';
import { patch, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { fmtDate, fmtDateTime, fmtRelative } from '../../lib/format';

export function Saved() {
  const { data, error, loading } = useApi<any[]>('/agent/saved');
  return (
    <div className="page">
      <PageHead title="Saved hotels" subtitle="Your shortlist of hotels from the collection." />
      <ErrorNotice error={error} />
      {loading ? <LoadingRows /> : !data?.length ? <div className="panel"><Empty icon="heart" title="No saved hotels" action={<ButtonLink to="/app/search" size="sm">Search hotels</ButtonLink>}>Save hotels from their detail page to find them quickly next time.</Empty></div> : (
        <div className="grid-3">{data.map((h) => (
          <Link key={h.id} to={`/app/hotels/${h.slug}`} className="panel" style={{ textDecoration: 'none', overflow: 'hidden' }}>
            <HotelImage name={h.name} images={h.images} height={150} label={false} />
            <div className="panel-body stack gap-1"><div className="row gap-2"><strong>{h.name}</strong>{h.isSample && <SampleTag />}</div><span className="small muted">{h.city}</span></div>
          </Link>))}</div>
      )}
    </div>
  );
}

export function Finance() {
  const { data, error, loading } = useApi<any>('/agent/finance');
  return (
    <div className="page">
      <PageHead title="Invoices & payments" subtitle="Your account with HotelBridge." />
      <ErrorNotice error={error} />
      {loading || !data ? <LoadingRows /> : (
        <div className="stack gap-6 enter">
          <div className="panel stat-row">
            {data.balances.length === 0 ? <div className="stat"><span className="stat-label">Balance</span><span className="stat-value">—</span><span className="stat-note">No financial activity yet</span></div>
              : data.balances.map((b: any) => <div className="stat" key={b.currency}><span className="stat-label">{b.balance_minor >= 0 ? 'Amount due' : 'In your favour'} ({b.currency})</span><span className="stat-value"><Money minor={Math.abs(b.balance_minor)} currency={b.currency} /></span></div>)}
            <div className="stat"><span className="stat-label">Credit</span><span className="stat-value">{data.credit.enabled ? <Money minor={data.credit.availableMinor} currency={data.credit.currency} /> : 'Not enabled'}</span><span className="stat-note">{data.credit.enabled ? <>Limit <Money minor={data.credit.limitMinor} currency={data.credit.currency} /></> : 'Bookings are prepaid'}</span></div>
          </div>
          <Notice tone="neutral">{data.paymentInstructions}</Notice>
          <Panel title="Invoices and credit notes" pad={false}>
            {data.invoices.length === 0 ? <Empty icon="receipt" title="No invoices yet">Invoices are issued when bookings are confirmed.</Empty> : (
              <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Document</th><th>Booking</th><th>Issued</th><th>Due</th><th className="num">Amount</th></tr></thead>
                <tbody>{data.invoices.map((i: any) => <tr key={i.number}><td><div className="table-title">{i.number}</div><div className="xs subtle">{i.kind === 'credit_note' ? 'Credit note' : 'Invoice'}</div></td><td>{i.booking_id ? <Link to={`/app/bookings/${i.booking_id}`}>{i.booking_reference}</Link> : '—'}</td><td data-hide-mobile>{fmtDate(i.issued_at)}</td><td data-hide-mobile>{fmtDate(i.due_at)}</td><td className="num"><Money minor={i.amount_minor} currency={i.currency} /></td></tr>)}</tbody></table></div>)}
          </Panel>
          <Panel title="Payments recorded" pad={false}>
            {data.payments.length === 0 ? <div className="panel-body small muted">Payments appear here once HotelBridge finance records them against your bookings.</div> : (
              <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Date</th><th>Booking</th><th>Reference</th><th className="num">Amount</th></tr></thead>
                <tbody>{data.payments.map((p: any, k: number) => <tr key={k}><td>{fmtDate(p.received_at)}</td><td>{p.booking_reference ?? '—'}</td><td className="small">{p.direction === 'refunded' ? 'Refund · ' : ''}{p.external_reference}</td><td className="num"><Money minor={p.direction === 'refunded' ? -p.amount_minor : p.amount_minor} currency={p.currency} /></td></tr>)}</tbody></table></div>)}
          </Panel>
        </div>
      )}
    </div>
  );
}

export function Agency() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<any>('/agent/agency');
  const [adding, setAdding] = useState(false);
  const [nu, setNu] = useState({ name: '', email: '', password: '', role: 'agency_agent' });
  const add = useAction(() => post('/agent/agency/users', nu), { success: 'User added', onDone: () => { setAdding(false); setNu({ name: '', email: '', password: '', role: 'agency_agent' }); reload(); } });
  const toggle = useAction((id: string, status: string) => patch(`/agent/agency/users/${id}`, { status }), { onDone: reload });
  const isAdmin = user?.role === 'agency_admin';
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  const a = data.agency;
  return (
    <div className="page">
      <PageHead title="Agency profile" subtitle={a.name} actions={isAdmin && <Button icon="plus" onClick={() => setAdding(true)}>Add user</Button>} />
      <div className="layout-2">
        <Panel title="Users" pad={false}>
          <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>{data.users.map((u: any) => <tr key={u.id}><td><div className="table-title">{u.name}</div><div className="xs subtle">{u.email}</div></td><td className="small">{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</td><td data-hide-mobile className="small">{u.last_login_at ? fmtRelative(u.last_login_at) : 'Never'}</td>
              <td className="num">{u.status === 'disabled' ? <Pill tone="neutral">Disabled</Pill> : null}{isAdmin && u.id !== user?.id && <Button size="sm" variant="ghost" onClick={() => toggle.run(u.id, u.status === 'active' ? 'disabled' : 'active')}>{u.status === 'active' ? 'Disable' : 'Enable'}</Button>}</td></tr>)}</tbody></table></div>
        </Panel>
        <Panel title="Details">
          <dl className="kv">
            <dt>Status</dt><dd>{a.status === 'active' ? <Pill tone="positive">Verified</Pill> : <Pill tone="attention">{a.status}</Pill>}</dd>
            {a.legalName && <><dt>Legal name</dt><dd>{a.legalName}</dd></>}
            <dt>Location</dt><dd>{a.city}, {a.countryCode}</dd>
            <dt>Phone</dt><dd>{a.phone}</dd>
            <dt>Selling currency</dt><dd>{a.sellingCurrency}</dd>
            <dt>Payment terms</dt><dd>{a.paymentTerms === 'credit' ? 'Approved credit' : 'Prepay'}</dd>
            {data.credit.enabled && <><dt>Credit limit</dt><dd><Money minor={data.credit.limitMinor} currency={data.credit.currency} /></dd></>}
          </dl>
          <p className="xs subtle mt-4">To change legal details or credit terms, contact HotelBridge support.</p>
        </Panel>
      </div>
      {adding && (
        <Dialog title="Add a user" onClose={() => setAdding(false)} footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button loading={add.busy} onClick={() => add.run()}>Add user</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={add.error} />
            <TextInput label="Full name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
            <TextInput label="Email" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
            <TextInput label="Initial password" type="password" autoComplete="new-password" hint="Share it securely; ask them to keep it private." value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
            <SelectInput label="Role" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="agency_agent">Agent — search, book, manage bookings</option><option value="agency_admin">Administrator — also manages users</option></SelectInput>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function Support() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data, error, loading } = useApi<any[]>('/agent/support');
  const [open, setOpen] = useState(!!params.get('booking'));
  const [f, setF] = useState({ subject: '', body: '', priority: 'normal' });
  const create = useAction(async () => { const r = await post('/agent/support', { ...f, bookingId: params.get('booking') ?? undefined }); navigate(`/app/support/${r.id}`); }, { success: 'Support request sent' });
  return (
    <div className="page">
      <PageHead title="Support" subtitle="Questions about a booking, an invoice or your account." actions={<Button icon="plus" onClick={() => setOpen(true)}>New request</Button>} />
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? <Empty icon="help" title="No support requests">Open a request and our team will reply here.</Empty> : (
        <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Request</th><th>Booking</th><th>Updated</th><th>Status</th></tr></thead>
          <tbody>{data.map((t) => <tr key={t.id} className="clickable" onClick={() => navigate(`/app/support/${t.id}`)}><td><div className="table-title">{t.subject}</div><div className="xs subtle">{t.reference}{t.priority === 'urgent' ? ' · Urgent' : ''}</div></td><td data-hide-mobile>{t.booking_reference ?? '—'}</td><td data-hide-mobile className="small">{fmtRelative(t.updated_at)}</td><td><Pill tone={t.status === 'answered' ? 'positive' : t.status === 'open' ? 'pending' : 'neutral'}>{t.status === 'open' ? 'Awaiting HotelBridge' : t.status === 'answered' ? 'Answered' : 'Closed'}</Pill></td></tr>)}</tbody></table></div>)}
      </div>
      {open && (
        <Dialog title="New support request" onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.busy} disabled={f.subject.length < 3 || f.body.length < 5} onClick={() => create.run()}>Send</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={create.error} />
            {params.get('booking') && <Notice tone="neutral">This request will be linked to the booking you came from.</Notice>}
            <TextInput label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
            <TextArea label="How can we help?" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            <SelectInput label="Priority" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="normal">Normal</option><option value="urgent">Urgent — a guest is affected now</option></SelectInput>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function SupportDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<any>(`/agent/support/${id}`);
  const [body, setBody] = useState('');
  const reply = useAction(() => post(`/agent/support/${id}/messages`, { body }), { onDone: () => { setBody(''); reload(); } });
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorNotice error={error} /></div>;
  return (
    <div className="page">
      <PageHead back={{ to: '/app/support', label: 'Support' }} title={data.ticket.subject} subtitle={data.ticket.reference} />
      <Panel title="Conversation">
        <div className="stack gap-3">
          {data.messages.map((m: any, i: number) => <div key={i} className={`message${m.from_staff ? ' internal' : ''}`}><div className="xs subtle">{m.from_staff ? `HotelBridge · ${m.author}` : m.author} · {fmtDateTime(m.at)}</div><div className="mt-2">{m.body}</div></div>)}
          <form className="stack gap-3" onSubmit={(e) => { e.preventDefault(); reply.run(); }}>
            <TextArea label="Reply" value={body} onChange={(e) => setBody(e.target.value)} />
            <ErrorNotice error={reply.error} />
            <div><Button size="sm" loading={reply.busy} disabled={!body.trim()}>Send reply</Button></div>
          </form>
        </div>
      </Panel>
    </div>
  );
}

export { SampleTag };
