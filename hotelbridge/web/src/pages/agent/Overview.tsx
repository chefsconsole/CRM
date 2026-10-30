import { Link, useNavigate } from 'react-router-dom';
import type { RoomRequest } from '../../../../shared/domain';
import { BookingStatusPill, ButtonLink, Empty, ErrorNotice, LoadingRows, Money, Notice, PageHead, Panel, StagePill } from '../../components/ui';
import { encodeRooms, summariseRooms } from '../../components/RoomsPicker';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { fmtDate, fmtDay, fmtRelative } from '../../lib/format';

export default function Overview() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<any>('/agent/overview');
  const navigate = useNavigate();
  const first = user?.name.split(' ')[0];
  return (
    <div className="page">
      <PageHead title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}${first ? `, ${first}` : ''}`}
        subtitle={user?.agencyName ?? undefined}
        actions={<><ButtonLink to="/app/groups/new" variant="secondary" icon="groups">Group request</ButtonLink><ButtonLink to="/app/search" icon="search">Search hotels</ButtonLink></>} />
      <ErrorNotice error={error} />
      {loading ? <LoadingRows rows={6} /> : data && (
        <div className="stack gap-6 enter">
          <div className="panel stat-row">
            <div className="stat"><span className="stat-label">Upcoming arrivals</span><span className="stat-value">{data.upcoming.length}</span><span className="stat-note">Next six shown below</span></div>
            <div className="stat"><span className="stat-label">Awaiting confirmation or action</span><span className="stat-value">{data.pendingCount}</span><span className="stat-note">Pending hotel, amendments, cancellations</span></div>
            <div className="stat"><span className="stat-label">Payments due</span><span className="stat-value">{data.outstanding.length}</span><span className="stat-note">Bookings with an outstanding balance</span></div>
            <div className="stat"><span className="stat-label">Credit</span><span className="stat-value">{data.credit.enabled ? <Money minor={data.credit.availableMinor} currency={data.credit.currency} /> : 'Prepay'}</span><span className="stat-note">{data.credit.enabled ? 'Available on approved credit' : 'Credit not enabled for your agency'}</span></div>
          </div>

          {data.outstanding.length > 0 && (
            <Notice tone="warn" title="Payment due.">
              {data.outstanding.slice(0, 3).map((o: any, i: number) => (
                <span key={o.id}>{i > 0 && ' · '}<Link to={`/app/bookings/${o.id}`}>{o.reference}</Link> — <Money minor={o.outstanding_minor} currency={o.currency} />{o.payment_due_at && ` by ${fmtDate(o.payment_due_at)}`}</span>
              ))}
            </Notice>
          )}

          <div className="layout-2">
            <Panel title="Upcoming arrivals" pad={false} actions={<Link className="small" to="/app/bookings">All bookings</Link>}>
              {data.upcoming.length === 0
                ? <Empty icon="calendar" title="No upcoming stays" action={<ButtonLink to="/app/search" size="sm">Search hotels</ButtonLink>}>Confirmed and pending bookings with future arrival dates will appear here.</Empty>
                : <table className="table table-responsive"><tbody>{data.upcoming.map((b: any) => (
                  <tr key={b.id} className="clickable" onClick={() => navigate(`/app/bookings/${b.id}`)}>
                    <td><div className="table-title">{b.hotel_name}</div><div className="xs subtle">{b.reference} · {b.lead_guest_name}</div></td>
                    <td data-hide-mobile className="small">{fmtDay(b.check_in)} → {fmtDay(b.check_out)}</td>
                    <td><BookingStatusPill status={b.status} /></td>
                  </tr>))}</tbody></table>}
            </Panel>
            <div className="stack gap-6">
              <Panel title="Recent searches" pad={false}>
                {data.recentSearches.length === 0 ? <div className="panel-body small muted">Your recent searches will appear here for one-click repeat.</div> : (
                  <div>{data.recentSearches.map((s: any, i: number) => (
                    <Link key={i} className="option" style={{ padding: 'var(--s3) var(--s6)', textDecoration: 'none' }}
                      to={`/app/search?d=${encodeURIComponent(s.destination)}&in=${s.check_in}&out=${s.check_out}&rooms=${encodeRooms(s.rooms as RoomRequest[])}`}>
                      <div><div className="table-title small">{s.destination}</div><div className="xs subtle">{fmtDay(s.check_in)} – {fmtDay(s.check_out)} · {summariseRooms(s.rooms)}</div></div>
                      <span className="xs subtle">{fmtRelative(s.at)}</span>
                    </Link>))}</div>)}
              </Panel>
              <Panel title="Group requests" pad={false} actions={<Link className="small" to="/app/groups">View all</Link>}>
                {data.quotes.length === 0 ? <div className="panel-body small muted">Need 10+ rooms or a multi-city tour? <Link to="/app/groups/new">Submit a group request</Link>.</div> : (
                  <div>{data.quotes.map((q: any) => (
                    <Link key={q.id} to={`/app/groups/${q.id}`} className="option" style={{ padding: 'var(--s3) var(--s6)', textDecoration: 'none' }}>
                      <div><div className="table-title small">{q.title}</div><div className="xs subtle">{q.reference}</div></div><StagePill stage={q.status} />
                    </Link>))}</div>)}
              </Panel>
            </div>
          </div>

          <Panel title="Recent bookings" pad={false}>
            {data.recent.length === 0 ? <Empty icon="calendar" title="No bookings yet">When you book, every reservation and its status will be listed here.</Empty> : (
              <div className="table-wrap"><table className="table table-responsive">
                <thead><tr><th>Booking</th><th>Arrival</th><th className="num">Total</th><th>Status</th></tr></thead>
                <tbody>{data.recent.map((b: any) => (
                  <tr key={b.id} className="clickable" onClick={() => navigate(`/app/bookings/${b.id}`)}>
                    <td><div className="table-title">{b.hotel_name}</div><div className="xs subtle">{b.reference}</div></td>
                    <td data-hide-mobile>{fmtDate(b.check_in)}</td>
                    <td className="num"><Money minor={b.total_sell_minor} currency={b.currency} /></td>
                    <td><BookingStatusPill status={b.status} /></td>
                  </tr>))}</tbody></table></div>)}
          </Panel>
        </div>
      )}
    </div>
  );
}
