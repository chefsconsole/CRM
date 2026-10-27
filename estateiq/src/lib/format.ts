// Indian number, currency, area and date formatting.

const CRORE = 1_00_00_000;
const LAKH = 1_00_000;

function trimZeros(n: number, digits: number) {
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

/** ₹1.25 Cr, ₹85 L, ₹42,000 */
export function formatINR(value: number | null | undefined, opts: { digits?: number } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const digits = opts.digits ?? 2;
  const sign = value < 0 ? "−" : "";
  const v = Math.abs(value);
  if (v >= CRORE) return `${sign}₹${trimZeros(v / CRORE, digits)} Cr`;
  if (v >= LAKH) return `${sign}₹${trimZeros(v / LAKH, digits)} L`;
  return `${sign}₹${Math.round(v).toLocaleString("en-IN")}`;
}

/** ₹2,00,00,000 — exact rupee amount with Indian digit grouping. */
export function formatINRFull(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return `₹${rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function formatPriceRange(min?: number | null, max?: number | null): string {
  if (!min && !max) return "Price on request";
  if (min && max && Math.abs(min - max) > 1) return `${formatINR(min)} – ${formatINR(max)}`;
  return formatINR((min ?? max)!);
}

export function formatBudgetRange(min?: number | null, max?: number | null): string {
  if (!min && !max) return "Not shared";
  if (min && !max) return `From ${formatINR(min)}`;
  if (!min && max) return `Up to ${formatINR(max)}`;
  return formatPriceRange(min, max);
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-IN");
}

export function formatArea(min?: number | null, max?: number | null): string {
  if (!min && !max) return "—";
  if (min && max && min !== max) return `${formatNumber(min)} – ${formatNumber(max)} sq ft`;
  return `${formatNumber((min ?? max)!)} sq ft`;
}

export function formatBhk(bhk: number): string {
  if (bhk === 0) return "Studio";
  return `${trimZeros(bhk, 1)} BHK`;
}

export function formatBhkList(list: number[]): string {
  const uniq = [...new Set(list)].sort((a, b) => a - b);
  if (!uniq.length) return "—";
  if (uniq.length === 1) return formatBhk(uniq[0]);
  return `${uniq.map((b) => (b === 0 ? "Studio" : trimZeros(b, 1))).join(", ")} BHK`;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateFmt.format(new Date(d));
}
export function formatMonth(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return monthFmt.format(new Date(d));
}
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateTimeFmt.format(new Date(d));
}
export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return timeFmt.format(new Date(d));
}

export function relativeTime(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "—";
  const diff = new Date(d).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [365 * 864e5, "year"],
    [30 * 864e5, "month"],
    [7 * 864e5, "week"],
    [864e5, "day"],
    [36e5, "hour"],
    [6e4, "minute"],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [ms, unit] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return "just now";
}

/** +91 98200 12345 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

export function percent(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}
