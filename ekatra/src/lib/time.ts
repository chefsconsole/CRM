// Business time is Asia/Kolkata (IST, UTC+05:30, no daylight saving). These helpers never rely on the
// server's own timezone, so "today", "overdue" and form dates mean the same thing everywhere.

const IST_OFFSET_MS = 330 * 60_000;

/** Parses a form value. "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm" are read as IST wall-clock time. */
export function parseISTInput(v: string | null | undefined): Date | null {
  if (!v) return null;
  const s = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const [, y, mo, d, h = "00", mi = "00", se = "00"] = m;
    const utc = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +se) - IST_OFFSET_MS;
    const out = new Date(utc);
    return Number.isNaN(out.getTime()) ? null : out;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The IST calendar day containing `d`, as [start, end) instants. */
export function istDay(d = new Date()): { start: Date; end: Date } {
  const shifted = d.getTime() + IST_OFFSET_MS;
  const startShifted = shifted - (((shifted % 864e5) + 864e5) % 864e5);
  const start = new Date(startShifted - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 864e5) };
}

/** "YYYY-MM-DD" for the IST date of `d` (for <input type="date">). */
export function toISTDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DDTHH:mm" in IST (for <input type="datetime-local">). */
export function toISTDateTimeInput(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** Whole IST calendar days from today to `d` (negative = in the past). */
export function istDaysFromToday(d: Date, now = new Date()): number {
  return Math.round((istDay(d).start.getTime() - istDay(now).start.getTime()) / 864e5);
}

export type DueBucket = "OVERDUE" | "TODAY" | "UPCOMING" | "UNSCHEDULED";

export function dueBucket(due: Date | null | undefined, now = new Date()): DueBucket {
  if (!due) return "UNSCHEDULED";
  const { start, end } = istDay(now);
  if (due < start) return "OVERDUE";
  if (due < end) return "TODAY";
  return "UPCOMING";
}
