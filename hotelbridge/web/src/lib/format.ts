export { formatMoney } from '../../../shared/domain';

const tz = 'UTC';
export function fmtDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '—';
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00Z`) : new Date(d);
  return date.toLocaleDateString('en-GB', { ...opts, timeZone: tz });
}
export const fmtDay = (d: string) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }) + ' UTC';
}
export function fmtRelative(d: string | Date) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return fmtDate(d);
}
export const pct = (bps: number | null | undefined) => (bps === null || bps === undefined ? '—' : `${(bps / 100).toFixed(1)}%`);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
/** Parse a user-entered decimal into minor units without floating point. */
export function toMinor(v: string): number | null {
  const m = /^\s*(\d+)(?:[.,](\d{1,2}))?\s*$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
export const fromMinor = (n: number) => (n / 100).toFixed(2);
