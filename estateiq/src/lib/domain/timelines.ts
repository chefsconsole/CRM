// Purchase-commitment, booking and possession timelines are deliberately separate.
// A buyer may commit within 15 days yet happily wait three years for possession.

export const COMMIT_OPTIONS = [
  { days: 7, label: "Within 7 days" },
  { days: 15, label: "Within 15 days" },
  { days: 30, label: "Within 30 days" },
  { days: 45, label: "Within 45 days" },
  { days: 60, label: "Within 60 days" },
  { days: 90, label: "Within 90 days" },
  { days: 180, label: "Within 3–6 months" },
  { days: 365, label: "Within 6–12 months" },
  { days: 730, label: "More than 12 months" },
  { days: 9999, label: "Just exploring for now" },
] as const;

export const BOOKING_OPTIONS = [
  { days: 0, label: "Immediately, subject to final checks and agreed terms" },
  { days: 7, label: "Within 7 days" },
  { days: 15, label: "Within 15 days" },
  { days: 30, label: "Within 30 days" },
  { days: 60, label: "Within 60 days" },
  { days: -1, label: "Not sure yet" },
] as const;

export const POSSESSION_OPTIONS = [
  { months: 0, label: "Ready to move immediately" },
  { months: 6, label: "Within 6 months" },
  { months: 12, label: "Within 12 months" },
  { months: 18, label: "Within 18 months" },
  { months: 24, label: "Within 2 years" },
  { months: 36, label: "Within 3 years" },
  { months: 48, label: "Within 4 years" },
  { months: 60, label: "Within 5 years" },
  { months: 999, label: "Flexible if price and terms are attractive" },
] as const;

export const EXPLORING_DAYS = 9999;
export const FLEXIBLE_MONTHS = 999;

export function commitLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return "Not shared";
  return COMMIT_OPTIONS.find((o) => o.days === days)?.label ?? `Within ${days} days`;
}
export function bookingLabel(days: number | null | undefined): string {
  if (days === null || days === undefined || days < 0) return "Not sure yet";
  return BOOKING_OPTIONS.find((o) => o.days === days)?.label ?? `Within ${days} days`;
}
export function possessionLabel(months: number | null | undefined): string {
  if (months === null || months === undefined) return "Not shared";
  return POSSESSION_OPTIONS.find((o) => o.months === months)?.label ?? `Within ${months} months`;
}

/** Whole months from `now` until `date` (negative when in the past). */
export function monthsUntil(date: Date, now = new Date()): number {
  return (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
}
