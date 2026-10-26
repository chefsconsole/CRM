import type { BenefitStatus } from "@prisma/client";

export interface BenefitLike {
  status: BenefitStatus;
  validUntil: Date | null;
  confirmedAt: Date | null;
}

/** A benefit may be advertised only when the developer confirmed it and it has not lapsed. */
export function isLiveConfirmed(b: BenefitLike, now = new Date()): boolean {
  if (b.status !== "CONFIRMED" || !b.confirmedAt) return false;
  return !b.validUntil || b.validUntil >= now;
}

/** Effective status, treating a lapsed confirmation as expired. */
export function effectiveBenefitStatus(b: BenefitLike, now = new Date()): BenefitStatus {
  if (b.status === "CONFIRMED" && !isLiveConfirmed(b, now)) return "EXPIRED_WITHDRAWN";
  return b.status;
}
