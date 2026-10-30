import { formatMoney, MEAL_PLAN_LABEL, type MealPlan } from '../../../../shared/domain.js';
import type { Config } from '../../config.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Client-facing proposal document. Built only from the stored proposal (itself built from recorded offers). */
export function renderProposal(e: any, p: any, agencyName: string, config: Config) {
  const options = (p.options as any[]).map((o, i) => `
  <section class="opt">
    <div class="opt-head"><div><div class="label">Option ${i + 1} · ${esc(o.city)}</div><h2>${esc(o.hotelName)}</h2>
      <div class="muted">${esc(o.checkIn)} → ${esc(o.checkOut)} · ${o.nights} night${o.nights === 1 ? '' : 's'}${o.mealPlan ? ` · ${esc(MEAL_PLAN_LABEL[o.mealPlan as MealPlan])}` : ''}</div></div>
      <div class="total">${esc(formatMoney(o.sellTotalMinor, p.currency))}<div class="label">total for the group</div></div></div>
    <table><thead><tr><th>Room type</th><th>Rooms</th><th>Nights</th><th class="r">Approx. per room / night</th><th class="r">Line total</th></tr></thead><tbody>
      ${o.lines.map((l: any) => `<tr><td>${esc(l.roomType)}</td><td>${l.rooms}</td><td>${l.nights}</td><td class="r">${esc(formatMoney(l.approxPerRoomNightMinor, p.currency))}</td><td class="r">${esc(formatMoney(l.lineSellMinor, p.currency))}</td></tr>`).join('')}
      ${o.taxesMinor ? `<tr><td colspan="4">Taxes and fees (as quoted by the hotel)</td><td class="r">${esc(formatMoney(o.taxesMinor, p.currency))}</td></tr>` : ''}
    </tbody></table>
    <div class="terms"><div><div class="label">Cancellation &amp; attrition</div>${esc(o.cancellationTerms)}</div><div><div class="label">Payment terms</div>${esc(o.paymentTerms)}</div>
    ${o.conditions ? `<div><div class="label">Conditions</div>${esc(o.conditions)}</div>` : ''}</div>
  </section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proposal ${esc(e.reference)} v${p.version}</title>
<style>
 :root{--ink:#0d1321;--muted:#5b6170;--line:#e4e0d8;--accent:#9c8458} *{box-sizing:border-box}
 body{margin:0;font:15px/1.55 "Inter",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#f4f2ee}
 .page{max-width:880px;margin:32px auto;background:#fff;padding:52px 60px;border:1px solid var(--line)}
 header{display:flex;justify-content:space-between;border-bottom:1px solid var(--ink);padding-bottom:20px}
 .brand{font-weight:600;font-size:18px} .brand span{color:var(--accent);font-weight:500}
 h1{font-size:30px;font-weight:600;letter-spacing:-.015em;margin:32px 0 6px} h2{font-size:20px;margin:4px 0;font-weight:600}
 .muted{color:var(--muted)} .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
 .opt{border-top:1px solid var(--line);padding:28px 0} .opt-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
 .total{text-align:right;font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}
 table{width:100%;border-collapse:collapse;margin:18px 0} th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:14px;font-variant-numeric:tabular-nums}
 th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:500} .r{text-align:right}
 .terms{display:grid;grid-template-columns:1fr 1fr;gap:16px 32px;font-size:14px}
 .box{background:#faf8f4;border:1px solid var(--line);padding:16px 18px;font-size:14px;margin-top:20px}
 .wm{background:#fff4e0;border:1px solid #e8c98f;color:#7a5410;padding:10px 14px;font-size:13px;margin-top:16px}
 footer{margin-top:32px;font-size:12px;color:var(--muted)} @media print{body{background:#fff}.page{margin:0;border:0;padding:24px}}
 @media (max-width:640px){.page{padding:24px}.terms{grid-template-columns:1fr}.opt-head{flex-direction:column}.total{text-align:left}}
</style></head><body><div class="page">
<header><div class="brand">HotelBridge <span>Group Desk</span></div><div style="text-align:right"><div class="label">Proposal</div><div style="font-weight:600">${esc(e.reference)} · v${p.version}</div></div></header>
${config.appEnv !== 'production' ? '<div class="wm">Generated in a non-production environment.</div>' : ''}
<h1>${esc(e.title)}</h1>
<div class="muted">Prepared for ${esc(agencyName)} · ${e.total_passengers} passengers · Valid until <strong>${esc(p.valid_until)}</strong></div>
${options}
<div class="box"><strong>Important.</strong> Rates are based on offers received from the hotels and are subject to availability at the time of confirmation. They are not held until the proposal is accepted and contracts are signed with the hotels.
${p.exclusions ? `<br><br><strong>Not included:</strong> ${esc(p.exclusions)}` : ''}${p.notes ? `<br><br>${esc(p.notes)}` : ''}</div>
<footer>${config.publicContactEmail ? `Group Desk: ${esc(config.publicContactEmail)}` : 'Reply through the Group Desk in your HotelBridge portal.'}</footer>
</div></body></html>`;
}
