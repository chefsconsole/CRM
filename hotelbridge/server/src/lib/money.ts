/**
 * Authoritative money arithmetic. Amounts are integer minor units (e.g. cents) paired with an
 * ISO-4217 currency. All multiplication goes through BigInt so no floating point ever touches a total.
 */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF']);
export const FX_SCALE = 100_000_000n; // rates stored as rate * 1e8

export function minorDigits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export function assertMinor(n: number, label = 'amount'): number {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be an integer number of minor units, got ${n}`);
  return n;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => assertMinor(a + assertMinor(b)), 0);
}

/** Divide with half-up rounding (away from zero for halves) using BigInt. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const neg = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return neg ? -q : q;
}

/** amount * bps / 10000, half-up. 1 bps = 0.01%. */
export function applyBps(amountMinor: number, bps: number): number {
  assertMinor(amountMinor);
  return Number(divRound(BigInt(amountMinor) * BigInt(Math.round(bps)), 10_000n));
}

/** Ratio of part/whole in basis points (e.g. margin). Returns 0 when whole is 0. */
export function ratioBps(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Number(divRound(BigInt(part) * 10_000n, BigInt(whole)));
}

/** Convert using a recorded rate: 1 unit of `from` = rateScaled/1e8 units of `to`. */
export function convert(amountMinor: number, from: string, to: string, rateScaled: number): number {
  assertMinor(amountMinor);
  if (from === to) return amountMinor;
  const shift = minorDigits(to) - minorDigits(from);
  let num = BigInt(amountMinor) * BigInt(rateScaled);
  let den = FX_SCALE;
  if (shift > 0) num *= 10n ** BigInt(shift);
  if (shift < 0) den *= 10n ** BigInt(-shift);
  return Number(divRound(num, den));
}

/** Round up to the next whole currency unit (e.g. 123.01 → 124.00). */
export function roundUpToUnit(amountMinor: number, currency: string): number {
  const unit = 10 ** minorDigits(currency);
  return Math.ceil(amountMinor / unit) * unit;
}

/** Parse a decimal string like "123.45" into minor units without floating point. */
export function parseDecimal(value: string, currency: string): number {
  const digits = minorDigits(currency);
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid amount "${value}"`);
  const frac = (m[3] ?? '').padEnd(digits, '0');
  if (frac.length > digits) throw new Error(`Amount "${value}" has more than ${digits} decimal places`);
  const n = Number(m[2]) * 10 ** digits + (frac ? Number(frac) : 0);
  return assertMinor(m[1] ? -n : n);
}

/** Parse a decimal FX rate string ("1.08345") into the 1e8-scaled integer. */
export function parseRate(value: string): number {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid FX rate "${value}"`);
  const n = Number(m[1]) * 1e8 + Number((m[2] ?? '').padEnd(8, '0'));
  if (n <= 0) throw new Error('FX rate must be positive');
  return assertMinor(n);
}
