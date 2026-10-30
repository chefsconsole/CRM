import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { COLLECTION_LABEL, COLLECTIONS, type Collection } from '../../../../shared/domain';
import { Button, ButtonLink, Checkbox, Dialog, Empty, ErrorNotice, Loading, LoadingRows, Notice, PageHead, Panel, Pill, SampleTag, SelectInput, TextArea, TextInput, useAction } from '../../components/ui';
import { HotelImage } from '../../components/HotelImage';
import { del, post, put } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { fmtDate } from '../../lib/format';

export function AdminHotels() {
  const { data, error, loading } = useApi<any[]>('/admin/hotels');
  const navigate = useNavigate();
  return (
    <div className="page">
      <PageHead title="Hotels" subtitle="The curated collection. Every hotel needs a reason to be here." actions={<ButtonLink to="/admin/hotels/new" icon="plus">Add hotel</ButtonLink>} />
      <ErrorNotice error={error} />
      <div className="panel">{loading ? <div className="panel-body"><LoadingRows /></div> : !data?.length ? <Empty icon="building" title="No hotels yet" action={<ButtonLink to="/admin/hotels/new" size="sm">Add the first hotel</ButtonLink>} /> : (
        <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Hotel</th><th>Collections</th><th className="num">Rooms</th><th className="num">Active contracts</th><th>Status</th></tr></thead>
          <tbody>{data.map((h) => <tr key={h.id} className="clickable" onClick={() => navigate(`/admin/hotels/${h.id}`)}>
            <td><div className="table-title row gap-2">{h.name}{h.is_sample && <SampleTag />}</div><div className="xs subtle">{h.city}, {h.country_code}{h.star_rating ? ` · ${h.star_rating}★${h.star_rating_verified ? '' : ' (unverified)'}` : ''}</div></td>
            <td data-hide-mobile className="small">{h.collections.map((c: Collection) => COLLECTION_LABEL[c]).join(', ')}</td>
            <td className="num" data-hide-mobile>{h.room_types}</td><td className="num">{h.active_contracts}</td>
            <td><Pill tone={h.status === 'live' ? 'positive' : h.status === 'paused' ? 'attention' : 'neutral'}>{h.status}</Pill></td></tr>)}</tbody></table></div>)}
      </div>
    </div>
  );
}

const blank = { slug: '', name: '', city: '', countryCode: '', address: '', latitude: '', longitude: '', starRating: '', starRatingVerified: false, collections: [] as Collection[], summary: '', description: '', facilities: '', contentVerified: false, transportNotes: '', checkInTime: '15:00', checkOutTime: '11:00', inclusionRationale: '', status: 'draft', partnerContactEmail: '' };

export function AdminHotelEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<any>(isNew ? null : `/admin/hotels/${id}`);
  const [f, setF] = useState(blank);
  const [dialog, setDialog] = useState<null | 'room' | 'image' | 'partner'>(null);
  const [room, setRoom] = useState({ code: '', name: '', maxAdults: 2, maxChildren: 1, maxOccupancy: 3, bedConfiguration: '', sizeSqm: '' });
  const [img, setImg] = useState({ url: '', caption: '', credit: '', license: '' });
  const [partner, setPartner] = useState({ name: '', email: '', password: '' });
  useEffect(() => {
    if (!data) return;
    const h = data.hotel;
    setF({ slug: h.slug, name: h.name, city: h.city, countryCode: h.country_code, address: h.address ?? '', latitude: h.latitude ?? '', longitude: h.longitude ?? '', starRating: h.star_rating ?? '', starRatingVerified: h.star_rating_verified,
      collections: h.collections, summary: h.summary ?? '', description: h.description ?? '', facilities: h.facilities.join(', '), contentVerified: h.content_verified, transportNotes: h.transport_notes ?? '',
      checkInTime: h.check_in_time ?? '', checkOutTime: h.check_out_time ?? '', inclusionRationale: h.inclusion_rationale ?? '', status: h.status, partnerContactEmail: h.partner_contact_email ?? '' });
  }, [data]);
  const body = () => ({
    ...f, latitude: f.latitude === '' ? null : Number(f.latitude), longitude: f.longitude === '' ? null : Number(f.longitude), starRating: f.starRating === '' ? null : Number(f.starRating),
    facilities: f.facilities.split(',').map((s) => s.trim()).filter(Boolean), partnerContactEmail: f.partnerContactEmail || undefined,
    address: f.address || undefined, summary: f.summary || undefined, description: f.description || undefined, transportNotes: f.transportNotes || undefined, inclusionRationale: f.inclusionRationale || undefined,
  });
  const save = useAction(async () => {
    if (isNew) { const r = await post('/admin/hotels', body()); navigate(`/admin/hotels/${r.id}`, { replace: true }); }
    else { await put(`/admin/hotels/${id}`, body()); reload(); }
  }, { success: 'Hotel saved' });
  const sub = useAction(async () => {
    if (dialog === 'room') await post(`/admin/hotels/${id}/rooms`, { ...room, code: room.code, sizeSqm: room.sizeSqm ? Number(room.sizeSqm) : null, bedConfiguration: room.bedConfiguration || undefined });
    if (dialog === 'image') await post(`/admin/hotels/${id}/images`, { ...img, caption: img.caption || undefined });
    if (dialog === 'partner') await post(`/admin/hotels/${id}/partner-users`, partner);
  }, { success: 'Saved', onDone: () => { setDialog(null); reload(); } });
  const removeImg = useAction((imgId: string) => del(`/admin/images/${imgId}`), { onDone: reload });
  if (!isNew && loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorNotice error={error} /></div>;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="page">
      <PageHead back={{ to: '/admin/hotels', label: 'Hotels' }} title={isNew ? 'Add hotel' : f.name || 'Hotel'} subtitle={data?.hotel?.is_sample ? 'Sample property (demo data)' : undefined}
        actions={<Button loading={save.busy} onClick={() => save.run()}>Save hotel</Button>} />
      <div className="layout-2">
        <div className="stack gap-6">
          <ErrorNotice error={save.error} />
          <Panel title="Identity">
            <div className="form-grid">
              <TextInput label="Name" value={f.name} onChange={set('name')} />
              <TextInput label="URL name" hint="lowercase-with-hyphens" value={f.slug} onChange={set('slug')} />
              <TextInput label="City" value={f.city} onChange={set('city')} />
              <TextInput label="Country code" maxLength={2} value={f.countryCode} onChange={set('countryCode')} />
              <TextInput label="Address" value={f.address} onChange={set('address')} />
              <TextInput label="Latitude" value={f.latitude} onChange={set('latitude')} />
              <TextInput label="Longitude" value={f.longitude} onChange={set('longitude')} />
              <TextInput label="Star rating" inputMode="decimal" value={f.starRating} onChange={set('starRating')} />
            </div>
            <div className="stack gap-3 mt-4">
              <Checkbox checked={f.starRatingVerified} onChange={(v) => setF({ ...f, starRatingVerified: v })}>Star rating verified against an official classification (shown to agents only when verified)</Checkbox>
            </div>
          </Panel>
          <Panel title="Content shown to agents">
            <div className="stack gap-4">
              <TextInput label="One-line summary" value={f.summary} onChange={set('summary')} />
              <TextArea label="Description" value={f.description} onChange={set('description')} />
              <TextInput label="Facilities" hint="Comma-separated. Only list facilities confirmed by the hotel." value={f.facilities} onChange={set('facilities')} />
              <TextArea label="Location & transport" value={f.transportNotes} onChange={set('transportNotes')} />
              <div className="grid-2"><TextInput label="Check-in from" value={f.checkInTime} onChange={set('checkInTime')} /><TextInput label="Check-out until" value={f.checkOutTime} onChange={set('checkOutTime')} /></div>
              <Checkbox checked={f.contentVerified} onChange={(v) => setF({ ...f, contentVerified: v })}>Content verified with the hotel</Checkbox>
            </div>
          </Panel>
          {!isNew && <Panel title="Room types" pad={false} actions={<Button size="sm" variant="secondary" icon="plus" onClick={() => setDialog('room')}>Add room type</Button>}>
            {data.rooms.length === 0 ? <div className="panel-body small muted">Add room types before contracting rates.</div> :
              <table className="table"><thead><tr><th>Code</th><th>Room</th><th>Occupancy</th><th>Status</th></tr></thead><tbody>{data.rooms.map((r: any) => <tr key={r.id}><td className="num">{r.code}</td><td>{r.name}<div className="xs subtle">{r.bed_configuration}</div></td><td className="small">{r.max_adults}A · {r.max_children}C · max {r.max_occupancy}</td><td><Pill tone={r.status === 'active' ? 'positive' : 'neutral'}>{r.status}</Pill></td></tr>)}</tbody></table>}
          </Panel>}
        </div>
        <div className="stack gap-6">
          <Panel title="Publishing">
            <div className="stack gap-4">
              <SelectInput label="Status" value={f.status} onChange={set('status')}><option value="draft">Draft — not visible</option><option value="live">Live — visible to agents</option><option value="paused">Paused</option></SelectInput>
              <div className="field"><span className="field-label">Collections</span><div className="stack gap-2">{COLLECTIONS.map((c) => <Checkbox key={c} checked={f.collections.includes(c)} onChange={(v) => setF({ ...f, collections: v ? [...f.collections, c] : f.collections.filter((x) => x !== c) })}>{COLLECTION_LABEL[c]}</Checkbox>)}</div></div>
              <TextArea label="Why this hotel is in the collection" hint="Internal only — commercial and guest-experience rationale" value={f.inclusionRationale} onChange={set('inclusionRationale')} />
              <TextInput label="Reservations email" hint="Used for group enquiries; internal" value={f.partnerContactEmail} onChange={set('partnerContactEmail')} />
            </div>
          </Panel>
          {!isNew && <>
            <Panel title="Images" actions={<Button size="sm" variant="secondary" icon="plus" onClick={() => setDialog('image')}>Add</Button>}>
              {data.images.length === 0 ? <><HotelImage name={f.name} height={140} /><p className="xs subtle mt-4">No licensed images yet. Agents see this placeholder — never an unrelated photo.</p></> : (
                <div className="stack gap-3">{data.images.map((i: any) => <div key={i.id} className="stack gap-1"><HotelImage name={f.name} images={[i]} height={120} /><div className="row between"><span className="xs subtle">© {i.credit} · {i.license}</span><button className="link-btn xs" onClick={() => removeImg.run(i.id)}>Remove</button></div></div>)}</div>)}
            </Panel>
            <Panel title="Contracts" pad={false} actions={<ButtonLink size="sm" variant="secondary" to={`/admin/contracts/new?hotel=${id}`}>New contract</ButtonLink>}>
              {data.contracts.length === 0 ? <div className="panel-body small muted">No contracts.</div> : <table className="table"><tbody>{data.contracts.map((c: any) => <tr key={c.id}><td><Link to={`/admin/contracts/${c.id}`} className="table-title small">{c.reference}</Link><div className="xs subtle">{fmtDate(c.valid_from)} – {fmtDate(c.valid_to)}</div></td><td><Pill tone={c.status === 'active' ? 'positive' : 'neutral'}>{c.status}</Pill></td></tr>)}</tbody></table>}
            </Panel>
            <Panel title="Hotel partner access" actions={<Button size="sm" variant="secondary" onClick={() => setDialog('partner')}>Add user</Button>}>
              {data.partnerUsers.length === 0 ? <p className="small muted">Partner users can confirm on-request bookings and see production for this hotel only.</p> : data.partnerUsers.map((u: any) => <div key={u.id} className="small">{u.name} · <span className="subtle">{u.email}</span></div>)}
            </Panel>
          </>}
        </div>
      </div>
      {dialog && (
        <Dialog title={{ room: 'Add room type', image: 'Add licensed image', partner: 'Add hotel partner user' }[dialog]} onClose={() => setDialog(null)} footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button loading={sub.busy} onClick={() => sub.run()}>Save</Button></>}>
          <div className="stack gap-4">
            <ErrorNotice error={sub.error} />
            {dialog === 'room' && <div className="grid-2">
              <TextInput label="Code" hint="Used in rate sheets, e.g. DBL" value={room.code} onChange={(e) => setRoom({ ...room, code: e.target.value })} />
              <TextInput label="Name" value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} />
              <TextInput label="Max adults" type="number" value={room.maxAdults} onChange={(e) => setRoom({ ...room, maxAdults: Number(e.target.value) })} />
              <TextInput label="Max children" type="number" value={room.maxChildren} onChange={(e) => setRoom({ ...room, maxChildren: Number(e.target.value) })} />
              <TextInput label="Max occupancy" type="number" value={room.maxOccupancy} onChange={(e) => setRoom({ ...room, maxOccupancy: Number(e.target.value) })} />
              <TextInput label="Size (m²)" value={room.sizeSqm} onChange={(e) => setRoom({ ...room, sizeSqm: e.target.value })} />
              <TextInput label="Beds" value={room.bedConfiguration} onChange={(e) => setRoom({ ...room, bedConfiguration: e.target.value })} />
            </div>}
            {dialog === 'image' && <>
              <Notice tone="warn">Only add images the hotel has supplied or that you are licensed to use, and only images of this property.</Notice>
              <TextInput label="Image URL (https)" value={img.url} onChange={(e) => setImg({ ...img, url: e.target.value })} />
              <TextInput label="Caption" value={img.caption} onChange={(e) => setImg({ ...img, caption: e.target.value })} />
              <TextInput label="Credit / owner" value={img.credit} onChange={(e) => setImg({ ...img, credit: e.target.value })} />
              <TextInput label="Licence or permission reference" value={img.license} onChange={(e) => setImg({ ...img, license: e.target.value })} />
            </>}
            {dialog === 'partner' && <>
              <TextInput label="Name" value={partner.name} onChange={(e) => setPartner({ ...partner, name: e.target.value })} />
              <TextInput label="Email" type="email" value={partner.email} onChange={(e) => setPartner({ ...partner, email: e.target.value })} />
              <TextInput label="Initial password" type="password" autoComplete="new-password" value={partner.password} onChange={(e) => setPartner({ ...partner, password: e.target.value })} />
            </>}
          </div>
        </Dialog>
      )}
    </div>
  );
}

export { Empty };
