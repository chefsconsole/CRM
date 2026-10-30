import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { COLLECTION_LABEL, type Collection } from '../../../../shared/domain';
import { Button, Empty, ErrorNotice, Loading, Notice, PageHead, Panel, SampleTag, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { HotelImage } from '../../components/HotelImage';
import { decodeRooms, encodeRooms, summariseRooms } from '../../components/RoomsPicker';
import { del, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { OfferRow, SearchForm, Stars } from './Search';
import { addDays, fmtDate, todayIso } from '../../lib/format';

export default function HotelDetail() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: hotel, error, loading, setData } = useApi<any>(`/agent/hotels/${slug}`);
  const stay = { in: params.get('in') ?? addDays(todayIso(), 21), out: params.get('out') ?? addDays(todayIso(), 23), rooms: decodeRooms(params.get('rooms')) };
  const [offers, setOffers] = useState<any>(null);
  const [offerError, setOfferError] = useState<any>(null);
  useEffect(() => {
    if (!hotel) return;
    setOffers(null); setOfferError(null);
    post('/agent/search', { destination: hotel.city, hotelSlug: slug, checkIn: stay.in, checkOut: stay.out, rooms: stay.rooms })
      .then((r) => setOffers(r)).catch(setOfferError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotel?.id, params.toString()]);
  const toggleSave = async () => {
    if (hotel.saved) await del(`/agent/saved/${hotel.id}`); else await post(`/agent/saved/${hotel.id}`);
    setData({ ...hotel, saved: !hotel.saved });
    toast(hotel.saved ? 'Removed from saved hotels' : 'Saved to your hotels');
  };
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !hotel) return <div className="page"><ErrorNotice error={error} /></div>;
  const res = offers?.results?.[0];
  return (
    <div className="page">
      <PageHead back={{ to: `/app/search?d=${encodeURIComponent(hotel.city)}&in=${stay.in}&out=${stay.out}&rooms=${encodeRooms(stay.rooms)}`, label: `Back to ${hotel.city}` }}
        title={<span className="row gap-3 wrap">{hotel.name}<Stars n={hotel.starRating} />{hotel.isSample && <SampleTag />}</span>}
        subtitle={<span className="row gap-1"><Icon name="pin" size={14} />{[hotel.address, hotel.city].filter(Boolean).join(', ')}</span>}
        actions={<Button variant="secondary" icon="heart" onClick={toggleSave}>{hotel.saved ? 'Saved' : 'Save hotel'}</Button>} />
      {hotel.isSample && <Notice tone="warn" title="Sample property.">This hotel and its rates exist for demonstration only and cannot be booked for real travel.</Notice>}
      <div className="layout-2 mt-6">
        <div className="stack gap-6">
          <HotelImage name={hotel.name} images={hotel.images} height={340} />
          <Panel title="Availability">
            <SearchForm compact initial={{ d: hotel.city, ...stay }} onSearch={(v) => setParams({ in: v.in, out: v.out, rooms: encodeRooms(v.rooms) })} />
            <p className="small muted mt-4">{fmtDate(stay.in)} – {fmtDate(stay.out)} · {summariseRooms(stay.rooms)}</p>
            <ErrorNotice error={offerError} />
            {!offers && !offerError && <Loading label="Checking availability" />}
            {res && res.offers.length === 0 && <Empty icon="calendar" title="No availability for this configuration">Try other dates, or ask the Group Desk.</Empty>}
            {res?.offers.map((o: any) => <OfferRow key={o.id} offer={o} nights={offers.nights} onSelect={() => navigate(`/app/checkout/${o.id}`)} />)}
          </Panel>
          {hotel.description && <Panel title="About the hotel"><p className="muted" style={{ lineHeight: 1.7 }}>{hotel.description}</p>{!hotel.contentVerified && <p className="xs subtle mt-4">Content not yet verified by the HotelBridge content team.</p>}</Panel>}
          <Panel title="Room types" pad={false}>
            <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Room</th><th>Occupancy</th><th>Beds</th><th className="num">Size</th></tr></thead>
              <tbody>{hotel.roomTypes.map((r: any) => (
                <tr key={r.id}><td className="table-title">{r.name}</td><td>Up to {r.maxAdults} adults{r.maxChildren ? ` + ${r.maxChildren} child` : ''}</td><td data-hide-mobile>{r.bedConfiguration ?? '—'}</td><td className="num" data-hide-mobile>{r.sizeSqm ? `${r.sizeSqm} m²` : '—'}</td></tr>))}</tbody></table></div>
          </Panel>
        </div>
        <div className="stack gap-6">
          <Panel title="At a glance">
            <dl className="kv">
              {hotel.checkInTime && <><dt>Check-in</dt><dd>From {hotel.checkInTime}</dd></>}
              {hotel.checkOutTime && <><dt>Check-out</dt><dd>Until {hotel.checkOutTime}</dd></>}
              <dt>Category</dt><dd>{hotel.starRating ? `${hotel.starRating} stars` : 'Not verified'}</dd>
              <dt>Collections</dt><dd>{hotel.collections.map((c: Collection) => COLLECTION_LABEL[c]).join(', ') || '—'}</dd>
            </dl>
          </Panel>
          {hotel.facilities.length > 0 && <Panel title="Facilities"><div className="facts">{hotel.facilities.map((f: string) => <span key={f} className="tag">{f}</span>)}</div></Panel>}
          {(hotel.transportNotes || hotel.location) && <Panel title="Location & transport">
            {hotel.transportNotes && <p className="small muted">{hotel.transportNotes}</p>}
            {hotel.location && <a className="small mt-4" style={{ display: 'inline-block' }} target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${hotel.location.lat}&mlon=${hotel.location.lng}#map=16/${hotel.location.lat}/${hotel.location.lng}`}>Open map</a>}
          </Panel>}
        </div>
      </div>
    </div>
  );
}
