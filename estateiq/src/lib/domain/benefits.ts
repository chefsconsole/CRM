import type { BenefitStatus } from "@prisma/client";

export interface BenefitLike {
  status: BenefitStatus;
  validUntil: Date | null;
  confirmedAt: Date | null;
}

/**
 * A benefit may be advertised only when the developer confirmed it, its validity is known and it
 * has not lapsed. (Evidence and terms are enforced when it is marked confirmed — see below.)
 */
export function isLiveConfirmed(b: BenefitLike, now = new Date()): boolean {
  if (b.status !== "CONFIRMED" || !b.confirmedAt || !b.validUntil) return false;
  return b.validUntil >= now;
}

/** Effective status, treating a lapsed (or undated) confirmation as not live. */
export function effectiveBenefitStatus(b: BenefitLike, now = new Date()): BenefitStatus {
  if (b.status === "CONFIRMED" && !isLiveConfirmed(b, now)) return b.validUntil ? "EXPIRED_WITHDRAWN" : "UNDER_NEGOTIATION";
  return b.status;
}

/** What is missing before a benefit can be marked confirmed. Empty = OK. */
export function benefitConfirmationProblems(b: { confirmedBy: string | null; evidenceNote: string | null; evidenceDocumentId: string | null; description: string | null; validUntil: Date | null }, now = new Date()): string[] {
  const out: string[] = [];
  if (!b.confirmedBy) out.push("who at the developer confirmed it");
  if (!b.evidenceNote && !b.evidenceDocumentId) out.push("the written evidence (letter, email or signed term sheet)");
  if (!b.description) out.push("the exact terms and conditions");
  if (!b.validUntil) out.push("how long it is valid");
  else if (b.validUntil < now) out.push("a validity date in the future");
  return out;
}
