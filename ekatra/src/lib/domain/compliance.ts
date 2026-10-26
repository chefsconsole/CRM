import type { DataVerification } from "@prisma/client";

/** A project is promoted publicly only when it is published AND has passed compliance review. */
export function isPubliclyVisible(p: { isPublished: boolean; complianceReviewed: boolean }): boolean {
  return p.isPublished && p.complianceReviewed;
}

export const PUBLIC_PROJECT_WHERE = { isPublished: true, complianceReviewed: true } as const;

/** Facts marked unavailable are hidden rather than shown as if known. */
export function showFact(v: DataVerification): boolean {
  return v !== "UNAVAILABLE";
}

export function needsReverification(lastVerifiedAt: Date | null, now = new Date(), maxAgeDays = 45): boolean {
  if (!lastVerifiedAt) return true;
  return now.getTime() - lastVerifiedAt.getTime() > maxAgeDays * 864e5;
}
