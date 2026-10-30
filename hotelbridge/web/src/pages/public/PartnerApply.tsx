import { useState, type FormEvent } from 'react';
import { Button, Checkbox, ErrorNotice, TextArea, TextInput } from '../../components/ui';
import { Icon } from '../../components/icons';
import { post, type ApiError } from '../../lib/api';

export default function PartnerApply({ kind }: { kind: 'hotel' | 'distribution' }) {
  const hotel = kind === 'hotel';
  const [f, setF] = useState({ organisation: '', contactName: '', email: '', phone: '', countryCode: '', city: '', website: '', rooms: '', category: '', channelManager: '', message: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await post('/public/applications', {
        kind, organisation: f.organisation, contactName: f.contactName, email: f.email, phone: f.phone || undefined,
        countryCode: f.countryCode || undefined, city: f.city || undefined, website: f.website || undefined, consent,
        details: { rooms: f.rooms ? Number(f.rooms) : undefined, category: f.category || undefined, channelManager: f.channelManager || undefined, message: f.message || undefined },
      });
      setDone(true);
    } catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  };
  if (done) return (
    <div className="auth-shell"><div className="auth-card panel panel-pad enter stack gap-4">
      <div className="confirm-mark"><Icon name="check" size={26} /></div>
      <h1>Application received</h1>
      <p className="muted">Thank you. Our partnerships team reviews each application against demand in the destination and will reply by email.</p>
    </div></div>
  );
  return (
    <div className="auth-shell">
      <form className="auth-card wide panel panel-pad enter" onSubmit={submit}>
        <div className="stack gap-2">
          <span className="eyebrow">{hotel ? 'Hotel partnerships' : 'Distribution partners'}</span>
          <h1>{hotel ? 'Apply to join the HotelBridge network' : 'Work with HotelBridge'}</h1>
          <p className="muted">{hotel
            ? 'We keep a focused collection in each destination, so not every application can be accepted. Share a few details and we will be in touch.'
            : 'For hotel suppliers, channel managers and technology partners. Tell us what you have in mind.'}</p>
        </div>
        <div className="stack gap-5 mt-8">
          <ErrorNotice error={error} />
          <div className="form-grid">
            <TextInput label={hotel ? 'Hotel name' : 'Company'} required value={f.organisation} onChange={set('organisation')} />
            <TextInput label="Contact name" required value={f.contactName} onChange={set('contactName')} />
            <TextInput label="Email" type="email" required value={f.email} onChange={set('email')} />
            <TextInput label="Phone" type="tel" value={f.phone} onChange={set('phone')} />
            <TextInput label="Country code" maxLength={2} value={f.countryCode} onChange={set('countryCode')} />
            <TextInput label="City" value={f.city} onChange={set('city')} />
            <TextInput label="Website" value={f.website} onChange={set('website')} />
            {hotel && <TextInput label="Number of rooms" inputMode="numeric" value={f.rooms} onChange={set('rooms')} />}
            {hotel && <TextInput label="Category" hint="e.g. 4-star city centre" value={f.category} onChange={set('category')} />}
            {hotel && <TextInput label="Channel manager (if any)" value={f.channelManager} onChange={set('channelManager')} />}
          </div>
          <TextArea label={hotel ? 'Anything we should know' : 'What would you like to discuss?'} value={f.message} onChange={set('message')} />
          <Checkbox checked={consent} onChange={setConsent}>I agree to HotelBridge contacting me about this application.</Checkbox>
          <div><Button type="submit" size="lg" loading={busy} disabled={!consent}>Submit application</Button></div>
        </div>
      </form>
    </div>
  );
}
