import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Checkbox, ErrorNotice, SelectInput, TextInput } from '../../components/ui';
import { Icon } from '../../components/icons';
import { post, type ApiError } from '../../lib/api';

export default function Register() {
  const [f, setF] = useState({ name: '', legalName: '', countryCode: '', city: '', phone: '', website: '', registrationNumber: '', sellingCurrency: 'EUR', adminName: '', email: '', password: '' });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await post('/auth/register', {
        agency: { name: f.name, legalName: f.legalName || undefined, countryCode: f.countryCode, city: f.city, phone: f.phone, website: f.website || undefined, registrationNumber: f.registrationNumber || undefined, sellingCurrency: f.sellingCurrency },
        admin: { name: f.adminName, email: f.email, password: f.password }, acceptTerms: terms,
      });
      setDone(true);
    } catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  };
  if (done) return (
    <div className="auth-shell"><div className="auth-card panel panel-pad enter stack gap-4">
      <div className="confirm-mark pending"><Icon name="clock" size={26} /></div>
      <h1>Thank you — your agency is under review</h1>
      <p className="muted">We verify every agency before it can search and book. You can sign in now; booking tools unlock as soon as your account is approved.</p>
      <Link className="btn" to="/login">Go to sign in</Link>
    </div></div>
  );
  return (
    <div className="auth-shell">
      <form className="auth-card wide panel panel-pad enter" onSubmit={submit}>
        <div className="stack gap-2"><span className="eyebrow">Agency registration</span><h1>Register your travel business</h1>
          <p className="muted">Accounts are for travel agencies, tour operators and DMCs. We review each registration before booking is enabled.</p></div>
        <div className="stack gap-6 mt-8">
          <ErrorNotice error={error} />
          <div className="stack gap-4"><h4>Agency</h4>
            <div className="form-grid">
              <TextInput label="Trading name" required value={f.name} onChange={set('name')} />
              <TextInput label="Legal name" hint="As registered" value={f.legalName} onChange={set('legalName')} />
              <TextInput label="Country code" hint="Two letters, e.g. IN, AE, GB" maxLength={2} required value={f.countryCode} onChange={set('countryCode')} />
              <TextInput label="City" required value={f.city} onChange={set('city')} />
              <TextInput label="Business phone" type="tel" required value={f.phone} onChange={set('phone')} />
              <TextInput label="Website" value={f.website} onChange={set('website')} />
              <TextInput label="Registration / licence number" hint="Helps us verify you faster" value={f.registrationNumber} onChange={set('registrationNumber')} />
              <SelectInput label="Preferred selling currency" value={f.sellingCurrency} onChange={set('sellingCurrency')} hint="Prices convert only where a recorded exchange rate exists">
                {['EUR', 'USD', 'GBP', 'INR', 'AED', 'THB'].map((c) => <option key={c}>{c}</option>)}
              </SelectInput>
            </div>
          </div>
          <div className="stack gap-4"><h4>Administrator</h4>
            <div className="form-grid">
              <TextInput label="Full name" required value={f.adminName} onChange={set('adminName')} />
              <TextInput label="Work email" type="email" autoComplete="username" required value={f.email} onChange={set('email')} />
              <TextInput label="Password" type="password" autoComplete="new-password" hint="At least 10 characters, letters and numbers" required value={f.password} onChange={set('password')} />
            </div>
          </div>
          <Checkbox checked={terms} onChange={setTerms}>I confirm I represent a travel business and agree to the <Link to="/terms" target="_blank">terms</Link> and <Link to="/privacy" target="_blank">privacy notice</Link>.</Checkbox>
          <div className="row gap-3 wrap"><Button type="submit" size="lg" loading={busy} disabled={!terms}>Submit registration</Button><span className="small muted">Already registered? <Link to="/login">Sign in</Link></span></div>
        </div>
      </form>
    </div>
  );
}
