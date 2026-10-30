/** Strip secrets and guest personal data before anything is written to supplier logs. */
const SECRET_KEYS = /pass(word)?|secret|token|api[-_]?key|authorization|signature|card|cvv|iban/i;
const PII_KEYS = /^(first(name)?|last(name)?|name|email|phone|guests?|leadGuestName|passport|dob|address)$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[depth]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.test(k)) out[k] = '[redacted]';
      else if (PII_KEYS.test(k)) out[k] = '[pii]';
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
