import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, GROUP_STAGE_LABEL, formatMoney, type BookingStatus, type GroupStage, type StatusTone } from '../../../shared/domain';
import { Icon, type IconName } from './icons';
import type { ApiError } from '../lib/api';

// ------------------------------------------------------------------ buttons
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light' | 'outline-light';
export function Button({ variant = 'primary', size, loading, block, icon, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'lg'; loading?: boolean; block?: boolean; icon?: IconName }) {
  const cls = ['btn', variant !== 'primary' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}
export function ButtonLink({ to, variant = 'primary', size, icon, children, block }: { to: string; variant?: BtnVariant; size?: 'sm' | 'lg'; icon?: IconName; children: ReactNode; block?: boolean }) {
  const cls = ['btn', variant !== 'primary' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block'].filter(Boolean).join(' ');
  return <Link to={to} className={cls}>{icon && <Icon name={icon} size={16} />}{children}</Link>;
}

// ------------------------------------------------------------------ fields
export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
export function TextInput({ label, hint, error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><input id={id} className={`input ${className}`} aria-invalid={!!error || undefined} {...rest} /></Field>;
}
export function SelectInput({ label, hint, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><select id={id} className="select" {...rest}>{children}</select></Field>;
}
export function TextArea({ label, hint, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><textarea id={id} className="textarea" {...rest} /></Field>;
}
export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <label className="checkbox"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{children}</span></label>;
}
export function Stepper({ value, min = 0, max = 99, onChange, label }: { value: number; min?: number; max?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

// ------------------------------------------------------------------ status
export function Pill({ tone, children, plain }: { tone: StatusTone; children: ReactNode; plain?: boolean }) {
  return <span className={`pill ${tone}${plain ? ' plain' : ''}`}>{children}</span>;
}
export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return <Pill tone={BOOKING_STATUS_TONE[status]}>{BOOKING_STATUS_LABEL[status]}</Pill>;
}
const STAGE_TONE: Record<GroupStage, StatusTone> = {
  new: 'pending', under_review: 'pending', sent_to_hotels: 'pending', offers_received: 'attention', proposal_prepared: 'attention',
  sent_to_agent: 'attention', negotiation: 'attention', won: 'positive', lost: 'neutral', cancelled: 'neutral',
};
export function StagePill({ stage }: { stage: GroupStage }) { return <Pill tone={STAGE_TONE[stage]}>{GROUP_STAGE_LABEL[stage]}</Pill>; }
export function SampleTag() { return <span className="tag tag-sample" title="Sample content for demonstration — not a real HotelBridge partner">Sample</span>; }

export function Money({ minor, currency, className = '' }: { minor: number | null | undefined; currency: string | null | undefined; className?: string }) {
  if (minor === null || minor === undefined || !currency) return <span className={className}>—</span>;
  return <span className={`money ${className}`}>{formatMoney(minor, currency)}</span>;
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error' | 'success' | 'neutral'; title?: ReactNode; children?: ReactNode }) {
  const icon: IconName = tone === 'success' ? 'check' : tone === 'info' || tone === 'neutral' ? 'help' : 'alert';
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={18} style={{ flex: 'none', marginTop: 1 }} />
      <div>{title && <strong>{title} </strong>}{children}</div>
    </div>
  );
}
export function ErrorNotice({ error }: { error: ApiError | Error | null | undefined }) {
  if (!error) return null;
  return <Notice tone="error">{error.message}</Notice>;
}

// ------------------------------------------------------------------ layout pieces
export function PageHead({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="enter">
      {back && <Link to={back.to} className="back-link"><Icon name="left" size={14} />{back.label}</Link>}
      <div className="page-head">
        <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
        {actions && <div className="row gap-3 wrap">{actions}</div>}
      </div>
    </div>
  );
}
export function Panel({ title, actions, children, pad = true, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title && <div className="panel-head"><h3>{title}</h3>{actions}</div>}
      <div className={pad ? 'panel-body' : ''}>{children}</div>
    </section>
  );
}
export function Empty({ icon = 'inbox', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-mark"><Icon name={icon} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return <div className="stack gap-3" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={44} />)}</div>;
}
export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="row gap-3 muted small" style={{ padding: 'var(--s8)', justifyContent: 'center' }} role="status"><span className="spinner" />{label}…</div>;
}

// ------------------------------------------------------------------ dialog / drawer
function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [onClose]);
}
export function Dialog({ title, children, footer, onClose }: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  useEscape(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(); }, []);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" ref={ref}>
        <div className="dialog-head row between"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </>
  );
}
export function Drawer({ title, children, footer, onClose }: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  useEscape(onClose);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

// ------------------------------------------------------------------ toast
interface Toast { id: number; text: string; tone: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}><span className="toast-dot" />{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ async action helper
export function useAction<A extends unknown[]>(fn: (...a: A) => Promise<unknown>, opts: { success?: string; onDone?: () => void } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const toast = useToast();
  const run = async (...a: A) => {
    setBusy(true); setError(null);
    try { await fn(...a); if (opts.success) toast(opts.success); opts.onDone?.(); return true; }
    catch (e) { setError(e as ApiError); return false; }
    finally { setBusy(false); }
  };
  return { run, busy, error, setError };
}
