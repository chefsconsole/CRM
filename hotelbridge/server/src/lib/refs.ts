import type { Queryable } from '../db/pool.js';

/** Human-friendly, unique, non-guessable-enough references: HB-7Q4K2M style with a DB sequence. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export async function nextReference(q: Queryable, prefix: string): Promise<string> {
  const row = await q.one<{ n: number }>("SELECT nextval('reference_seq') AS n");
  let n = row!.n * 7919 + 13; // spread sequential numbers
  let s = '';
  for (let i = 0; i < 6; i++) { s = ALPHABET[n % ALPHABET.length] + s; n = Math.floor(n / ALPHABET.length); }
  return `${prefix}-${s}`;
}
