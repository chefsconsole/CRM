import { randomUUID } from 'node:crypto';
import type { Queryable } from '../../db/pool.js';
import { nextReference } from '../../lib/refs.js';

/**
 * Double-entry journal. Positive = debit, negative = credit. Every journal must balance to zero
 * per currency. Rows are append-only (DB trigger); corrections are reversing journals.
 *
 *   agent_receivable  asset      what agencies owe us (negative balance = we owe them, i.e. refund liability)
 *   supplier_payable  liability  what we owe hotels / suppliers
 *   net_revenue       income     our recognised revenue: sell − supplier cost (never gross booking value)
 *   cash              asset      money received / paid out
 *
 * Accounting treatment (agent vs principal, revenue timing, VAT on margin) must be confirmed with a
 * qualified accountant per jurisdiction — see docs/FINANCE.md.
 */
export type Account = 'agent_receivable' | 'supplier_payable' | 'net_revenue' | 'cash';
export interface JournalLine { account: Account; amountMinor: number; currency: string }

export class UnbalancedJournal extends Error {}

export async function postJournal(q: Queryable, j: {
  bookingId?: string | null; agencyId?: string | null; kind: string; memo?: string; lines: JournalLine[];
  reversesJournalId?: string | null; createdBy?: string | null;
}): Promise<string> {
  const lines = j.lines.filter((l) => l.amountMinor !== 0);
  const totals = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isSafeInteger(l.amountMinor)) throw new UnbalancedJournal('Non-integer amount');
    totals.set(l.currency, (totals.get(l.currency) ?? 0) + l.amountMinor);
  }
  for (const [ccy, t] of totals) if (t !== 0) throw new UnbalancedJournal(`Journal does not balance in ${ccy} (${t})`);
  const journalId = randomUUID();
  for (const l of lines) {
    await q.query(
      `INSERT INTO ledger_entries (journal_id, booking_id, agency_id, account, amount_minor, currency, kind, memo, reverses_journal_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [journalId, j.bookingId ?? null, j.agencyId ?? null, l.account, l.amountMinor, l.currency, j.kind, j.memo ?? null, j.reversesJournalId ?? null, j.createdBy ?? null],
    );
  }
  return journalId;
}

/** Post the exact negation of an earlier journal. */
export async function reverseJournal(q: Queryable, journalId: string, memo: string, createdBy?: string | null) {
  const rows = await q.query<{ booking_id: string | null; agency_id: string | null; account: Account; amount_minor: number; currency: string }>(
    'SELECT booking_id, agency_id, account, amount_minor, currency FROM ledger_entries WHERE journal_id = $1', [journalId]);
  if (!rows.length) return null;
  return postJournal(q, {
    bookingId: rows[0].booking_id, agencyId: rows[0].agency_id, kind: 'reversal', memo, reversesJournalId: journalId, createdBy,
    lines: rows.map((r) => ({ account: r.account, amountMinor: -r.amount_minor, currency: r.currency })),
  });
}

export async function bookingBalance(q: Queryable, bookingId: string, account: Account = 'agent_receivable'): Promise<number> {
  const r = await q.one<{ s: number | null }>(
    'SELECT COALESCE(SUM(amount_minor),0)::bigint AS s FROM ledger_entries WHERE booking_id = $1 AND account = $2', [bookingId, account]);
  return r?.s ?? 0;
}

/** Confirmation: the agency owes the sell price; we owe the supplier its cost; the difference is our revenue. */
export async function postBookingConfirmed(q: Queryable, b: { id: string; agency_id: string; currency: string; total_sell_minor: number; supplier_cost_converted_minor: number }, actor?: string | null) {
  return postJournal(q, {
    bookingId: b.id, agencyId: b.agency_id, kind: 'booking_confirmed', createdBy: actor, memo: 'Booking confirmed',
    lines: [
      { account: 'agent_receivable', amountMinor: b.total_sell_minor, currency: b.currency },
      { account: 'supplier_payable', amountMinor: -b.supplier_cost_converted_minor, currency: b.currency },
      { account: 'net_revenue', amountMinor: -(b.total_sell_minor - b.supplier_cost_converted_minor), currency: b.currency },
    ],
  });
}

export async function issueInvoice(q: Queryable, b: { id: string; agency_id: string; currency: string }, amountMinor: number, kind: 'invoice' | 'credit_note', dueAt: Date | null) {
  const number = await nextReference(q, kind === 'invoice' ? 'INV' : 'CN');
  await q.query(
    `INSERT INTO invoices (number, agency_id, booking_id, kind, currency, amount_minor, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [number, b.agency_id, b.id, kind, b.currency, amountMinor, dueAt]);
  return number;
}
