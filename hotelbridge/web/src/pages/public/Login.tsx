import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorNotice, Notice, TextInput } from '../../components/ui';
import { homeFor, useAuth } from '../../lib/auth';
import type { ApiError } from '../../lib/api';

export default function Login() {
  const { login, user, config } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  if (user && !params.get('wrong')) return <Navigate to={params.get('next') ?? homeFor(user)} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const u = await login(email, password); navigate(params.get('next') ?? homeFor(u), { replace: true }); }
    catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  };
  return (
    <div className="auth-shell">
      <form className="auth-card panel panel-pad enter" onSubmit={submit} noValidate>
        <div className="stack gap-2"><span className="eyebrow">HotelBridge workspace</span><h1>Sign in</h1><p className="muted">Agents, hotel partners and the HotelBridge team.</p></div>
        <div className="stack gap-4 mt-6">
          {params.get('wrong') && <Notice tone="warn">That area isn't available for your account.</Notice>}
          <ErrorNotice error={error} />
          <TextInput label="Work email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextInput label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" size="lg" block loading={busy}>Sign in</Button>
          <p className="small muted">New agency? <Link to="/register">Register for an account</Link>. Forgotten your password? Ask your agency administrator to reset it.</p>
          {config && !config.isProduction && <Notice tone="neutral" title="Demo environment.">Run <code>npm run seed:demo</code> (or <code>npm run demo</code>) and sign in with a demo user listed in the README.</Notice>}
        </div>
      </form>
    </div>
  );
}
