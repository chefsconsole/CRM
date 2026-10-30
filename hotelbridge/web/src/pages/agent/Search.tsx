import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { COLLECTION_LABEL, COLLECTIONS, MEAL_PLAN_LABEL, MEAL_PLANS, type Availability, type Collection, type MealPlan, type RoomRequest } from '../../../../shared/domain';
import { Button, Empty, ErrorNotice, Field, Money, Notice, PageHead, Pill, SampleTag, Skeleton } from '../../components/ui';
import { Icon } from '../../components/icons';
import { HotelImage } from '../../components/HotelImage';
import { decodeRooms, encodeRooms, RoomsPicker, summariseRooms } from '../../components/RoomsPicker';
import { post, type ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { addDays, fmtDate, nightsBetween, plural, todayIso } from '../../lib/format';

const AV_TONE: Record<Availability, 'positive' | 'pending' | 'attention'> = { instant: 'positive', revalidate: 'pending', on_request: 'attention' };

export function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return <span className="stars" aria-label={`${n} star`}>{Array.from({ length: Math.round(n) }, (_, i) => <Icon key={i} name="star" size={12} fill="currentColor" strokeWidth={0} />)}</span>;
}

export function OfferRow({ offer, onSelect, nights }: { offer: any; onSelect: () => void; nights: number }) {
  const roomsLabel = Object.entries(offer.rooms.reduce((a: Record<string, number>, r: any) => ({ ...a, [r.roomName]: (a[r.roomName] ?? 0) + 1 }), {}))
    .map(([n, c]) => `${c} × ${n}`).join(' + ');
  return (
    <div className="option">
      <div className="grow">
        <div className="row gap-2 wrap"><strong>{roomsLabel}</strong>{offer.isSandbox && <span className="tag tag-sample">Sandbox</span>}</div>
        <div className="option-meta">
          <span>{MEAL_PLAN_LABEL[offer.mealPlan as MealPlan]}</span>
          {offer.cancellation.refundable
            ? <span className="ok">Free cancellation until {fmtDate(offer.cancellation.freeUntil)}</span>
            : <span>Non-refundable</span>}
          <Pill tone={AV_TONE[offer.availability as Availability]}>{offer.availabilityLabel}</Pill>
        </div>
        {offer.notes.filter((n: string) => !n.startsWith('SANDBOX')).map((n: string) => <div key={n} className="xs subtle mt-2">{n}</div>)}
      </div>
      <div className="option-price">
        <div>
          <Money minor={offer.totalMinor} currency={offer.currency} />
          <span className="xs subtle">{plural(nights, 'night')} · taxes included{offer.localCharges ? ' · + local tax at hotel' : ''}</span>
        </div>
        <Button size="sm" onClick={onSelect}>{offer.availability === 'on_request' ? 'Request' : 'Select'}</Button>
      </div>
    </div>
  );
}

export function SearchForm({ initial, onSearch, compact }: { initial: { d: string; in: string; out: string; rooms: RoomRequest[] }; onSearch: (v: { d: string; in: string; out: string; rooms: RoomRequest[] }) => void; compact?: boolean }) {
  const [d, setD] = useState(initial.d);
  const [cin, setIn] = useState(initial.in);
  const [cout, setOut] = useState(initial.out);
  const [rooms, setRooms] = useState(initial.rooms);
  const { data: dests } = useApi<{ city: string; country_code: string; hotels: number }[]>('/agent/destinations');
  const submit = (e: FormEvent) => { e.preventDefault(); onSearch({ d: d.trim(), in: cin, out: cout, rooms }); };
  const nights = cin && cout ? nightsBetween(cin, cout) : 0;
  return (
    <form className="search-bar" onSubmit={submit} style={compact ? { boxShadow: 'none' } : undefined}>
      <Field label="Destination" htmlFor="dest">
        <input id="dest" className="input" list="dest-list" placeholder="City" required value={d} onChange={(e) => setD(e.target.value)} autoComplete="off" />
        <datalist id="dest-list">{dests?.map((x) => <option key={x.city} value={x.city}>{`${x.hotels} hotels`}</option>)}</datalist>
      </Field>
      <Field label="Check-in" htmlFor="cin"><input id="cin" type="date" className="input" min={todayIso()} required value={cin} onChange={(e) => { setIn(e.target.value); if (!cout || cout <= e.target.value) setOut(addDays(e.target.value, 2)); }} /></Field>
      <Field label={`Check-out${nights > 0 ? ` · ${plural(nights, 'night')}` : ''}`} htmlFor="cout"><input id="cout" type="date" className="input" min={cin ? addDays(cin, 1) : todayIso()} required value={cout} onChange={(e) => setOut(e.target.value)} /></Field>
      <Field label="Rooms & guests"><RoomsPicker rooms={rooms} onChange={setRooms} /></Field>
      <Button type="submit" size="lg" icon="search">Search</Button>
    </form>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = useMemo(() => ({
    d: params.get('d') ?? '', in: params.get('in') ?? addDays(todayIso(), 21), out: params.get('out') ?? addDays(todayIso(), 23),
    rooms: decodeRooms(params.get('rooms')), meal: (params.get('meal') ?? '') as MealPlan | '', stars: params.get('stars') ?? '', col: (params.get('col') ?? '') as Collection | '',
  }), [params]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const hasQuery = !!params.get('d');

  useEffect(() => {
    if (!hasQuery) return;
    let cancelled = false;
    setLoading(true); setError(null);
    post('/agent/search', {
      destination: q.d, checkIn: q.in, checkOut: q.out, rooms: q.rooms,
      mealPlan: q.meal || undefined, minStars: q.stars ? Number(q.stars) : undefined, collection: q.col || undefined,
    }).then((r) => { if (!cancelled) setResult(r); }).catch((e) => { if (!cancelled) { setError(e); setResult(null); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasQuery, q]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next);
  };
  const results = (result?.results ?? []).filter((r: any) => !onlyAvailable || r.offers.length);
  const unavailable = (result?.results ?? []).filter((r: any) => !r.offers.length).length;
  const roomsParam = encodeRooms(q.rooms);

  return (
    <div className="page">
      <PageHead title="Search hotels" subtitle="Our curated collection, priced for your agency." />
      <SearchForm key={params.toString()} initial={q} onSearch={(v) => update({ d: v.d, in: v.in, out: v.out, rooms: encodeRooms(v.rooms) })} />
      {hasQuery && (
        <div className="search-filters">
          <select className="select input-sm" style={{ width: 'auto' }} aria-label="Meal plan" value={q.meal} onChange={(e) => update({ meal: e.target.value })}>
            <option value="">Any board</option>{MEAL_PLANS.map((m) => <option key={m} value={m}>{MEAL_PLAN_LABEL[m]}</option>)}
          </select>
          <select className="select input-sm" style={{ width: 'auto' }} aria-label="Hotel category" value={q.stars} onChange={(e) => update({ stars: e.target.value })}>
            <option value="">Any category</option><option value="3">3 stars and above</option><option value="4">4 stars and above</option><option value="5">5 stars</option>
          </select>
          <select className="select input-sm" style={{ width: 'auto' }} aria-label="Collection" value={q.col} onChange={(e) => update({ col: e.target.value })}>
            <option value="">All collections</option>{COLLECTIONS.map((c) => <option key={c} value={c}>{COLLECTION_LABEL[c]}</option>)}
          </select>
          <label className="checkbox" style={{ alignItems: 'center' }}><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />Available only</label>
        </div>
      )}

      <div className="mt-8">
        <ErrorNotice error={error} />
        {!hasQuery && <Empty icon="search" title="Where are your clients travelling?">Enter a destination and dates. Configure each room separately — the exact occupancy is kept all the way to the voucher.</Empty>}
        {loading && (
          <div className="stack gap-4" aria-busy="true" aria-label="Searching">
            <p className="small muted">Checking contracted rates and connected suppliers…</p>
            {[0, 1, 2].map((i) => <div key={i} className="result"><Skeleton h={200} r={0} /><div className="result-body"><Skeleton h={22} w="40%" /><Skeleton h={14} w="60%" /><Skeleton h={56} /><Skeleton h={56} /></div></div>)}
          </div>
        )}
        {!loading && result && (
          <div className="stack gap-4 enter">
            <div className="row between wrap gap-3">
              <p className="small muted">{plural(results.length, 'hotel')} in {q.d} · {fmtDate(q.in)} – {fmtDate(q.out)} · {summariseRooms(q.rooms)}</p>
              {unavailable > 0 && onlyAvailable && <button className="link-btn small" onClick={() => setOnlyAvailable(false)}>Show {plural(unavailable, 'hotel')} without availability</button>}
            </div>
            {result.sourceIssues.map((s: any) => <Notice key={s.source} tone="warn">{s.message}</Notice>)}
            {results.length === 0 && <Empty icon="building" title={result.results.length ? 'Nothing available for these dates' : `We don't have a collection in ${q.d} yet`}>
              {result.results.length ? 'Try different dates or room configurations — or ask the Group Desk to source an offer.' : 'Our network is growing destination by destination. The Group Desk can still source hotels for you.'}
            </Empty>}
            {results.map((r: any) => (
              <article key={r.hotel.id} className="result">
                <HotelImage name={r.hotel.name} images={r.hotel.images} height="100%" />
                <div className="result-body">
                  <div className="result-title">
                    <div className="stack gap-1">
                      <div className="row gap-2 wrap"><h3><Link to={`/app/hotels/${r.hotel.slug}?in=${q.in}&out=${q.out}&rooms=${roomsParam}`}>{r.hotel.name}</Link></h3><Stars n={r.hotel.starRating} />{r.hotel.isSample && <SampleTag />}</div>
                      <span className="small muted row gap-1"><Icon name="pin" size={14} />{r.hotel.address ?? r.hotel.city}</span>
                    </div>
                  </div>
                  {r.hotel.summary && <p className="small muted">{r.hotel.summary}</p>}
                  <div className="facts">{r.hotel.collections.map((c: Collection) => <span key={c} className="tag">{COLLECTION_LABEL[c]}</span>)}{r.hotel.facilities.slice(0, 4).map((f: string) => <span key={f} className="tag">{f}</span>)}</div>
                  {r.offers.length === 0 ? <p className="small subtle option">No availability for this configuration and these dates.</p>
                    : r.offers.slice(0, 4).map((o: any) => <OfferRow key={o.id} offer={o} nights={result.nights} onSelect={() => navigate(`/app/checkout/${o.id}`)} />)}
                  {r.offers.length > 4 && <Link className="small" to={`/app/hotels/${r.hotel.slug}?in=${q.in}&out=${q.out}&rooms=${roomsParam}`}>See all {r.offers.length} options</Link>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
