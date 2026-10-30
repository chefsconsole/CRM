import type { Config } from '../../config.js';
import { formatMoney, MEAL_PLAN_LABEL, type MealPlan } from '../../../../shared/domain.js';
import type { agentBookingView } from './views.js';

type View = Awaited<ReturnType<typeof agentBookingView>>;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Printable hotel voucher. Prices are deliberately omitted — vouchers travel with guests. */
export function renderVoucher(b: View, agencyName: string, config: Config): string {
  const watermark = b.isSandbox || b.hotel?.isSample || config.appEnv !== 'production';
  const rooms = b.rooms.map((r) => `
    <tr><td>Room ${r.roomIndex + 1}</td><td>${esc(r.roomName)}</td><td>${esc(MEAL_PLAN_LABEL[r.mealPlan as MealPlan] ?? r.mealPlan)}</td>
    <td>${r.adults} adult${r.adults > 1 ? 's' : ''}${r.childrenAges.length ? `, ${r.childrenAges.length} child (${r.childrenAges.join(', ')})` : ''}</td>
    <td>${(r.guests as { first: string; last: string }[]).map((g) => esc(`${g.first} ${g.last}`)).join('<br>')}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voucher ${esc(b.reference)}</title>
<style>
  :root{--ink:#0d1321;--muted:#5b6170;--line:#e4e0d8;--accent:#9c8458}
  *{box-sizing:border-box} body{margin:0;font:15px/1.5 "Inter",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#f4f2ee}
  .page{max-width:820px;margin:32px auto;background:#fff;padding:48px 56px;border:1px solid var(--line)}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--ink);padding-bottom:20px}
  .brand{font-weight:600;letter-spacing:.02em;font-size:18px} .brand span{color:var(--accent);font-weight:500}
  h1{font-size:28px;font-weight:600;letter-spacing:-.01em;margin:28px 0 4px} .muted{color:var(--muted)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 40px;margin:28px 0}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)} .value{font-size:16px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:8px 0 28px} th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:500}
  .ref{font-variant-numeric:tabular-nums;font-feature-settings:"tnum";font-size:20px;font-weight:600}
  .note{background:#faf8f4;border:1px solid var(--line);padding:14px 16px;font-size:13px}
  .wm{background:#fff4e0;border:1px solid #e8c98f;color:#7a5410;padding:10px 14px;font-size:13px;margin-top:16px}
  footer{margin-top:36px;font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:16px}
  @media print{body{background:#fff}.page{margin:0;border:0;padding:24px}.noprint{display:none}}
  @media (max-width:640px){.page{padding:24px}.grid{grid-template-columns:1fr}}
</style></head><body><div class="page">
<header><div class="brand">HotelBridge <span>Global</span></div><div style="text-align:right"><div class="label">Booking reference</div><div class="ref">${esc(b.reference)}</div></div></header>
${watermark ? `<div class="wm"><strong>Not valid for travel.</strong> This voucher was generated in a ${b.isSandbox ? 'sandbox' : 'non-production'} environment${b.hotel?.isSample ? ' for a sample property' : ''}.</div>` : ''}
<h1>${esc(b.hotel?.name)}</h1>
<div class="muted">${esc([b.hotel?.address, b.hotel?.city].filter(Boolean).join(', '))}</div>
<div class="grid">
  <div><div class="label">Check-in</div><div class="value">${fmtDate(b.checkIn)}</div>${b.hotel?.checkInTime ? `<div class="muted">From ${esc(b.hotel.checkInTime)}</div>` : ''}</div>
  <div><div class="label">Check-out</div><div class="value">${fmtDate(b.checkOut)}</div>${b.hotel?.checkOutTime ? `<div class="muted">Until ${esc(b.hotel.checkOutTime)}</div>` : ''}</div>
  <div><div class="label">Lead guest</div><div class="value">${esc(b.leadGuestName)}</div></div>
  <div><div class="label">${b.hotelConfirmationNumber ? 'Hotel confirmation' : 'Reservation reference'}</div><div class="value">${esc(b.hotelConfirmationNumber ?? b.supplierReference ?? b.reference)}</div></div>
  <div><div class="label">Booked by</div><div class="value">${esc(agencyName)}</div>${b.agentReference ? `<div class="muted">Agency ref. ${esc(b.agentReference)}</div>` : ''}</div>
  <div><div class="label">Nights</div><div class="value">${b.nights}</div></div>
</div>
<table><thead><tr><th></th><th>Room</th><th>Board</th><th>Occupancy</th><th>Guests</th></tr></thead><tbody>${rooms}</tbody></table>
${b.localCharges ? `<div class="note"><strong>Payable at the hotel:</strong> ${esc(b.localCharges.label)} — approximately ${esc(formatMoney(b.localCharges.amountMinor, b.localCharges.currency))} in total, collected by the hotel on arrival.</div>` : ''}
${b.specialRequests ? `<p class="muted"><strong>Special requests</strong> (subject to availability, not guaranteed): ${esc(b.specialRequests)}</p>` : ''}
<footer>The accommodation above is reserved through HotelBridge; room charges are settled between HotelBridge and the booking agency. Extras and any local charges are payable by the guest directly to the hotel.
${config.publicContactEmail ? `Support: ${esc(config.publicContactEmail)}${config.publicContactPhone ? ` · ${esc(config.publicContactPhone)}` : ''}` : ''}
<div class="noprint" style="margin-top:16px"><button onclick="window.print()" style="font:inherit;padding:8px 16px;border:1px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer">Print or save as PDF</button></div></footer>
</div></body></html>`;
}
