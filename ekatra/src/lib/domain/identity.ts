// Contact normalisation used for duplicate detection.

/** Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null when invalid. */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const e = input.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/** Masks personal data for roles that may see aggregate but not identifying details. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  return e164.replace(/^(\+91)(\d{2})\d{6}(\d{2})$/, "$1 $2•••• ••$3");
}
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user!.slice(0, 1)}•••@${domain}`;
}
