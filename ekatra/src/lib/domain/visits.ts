import type { VisitStatus } from "@prisma/client";

export interface VisitSlot {
  id?: string;
  scheduledAt: Date;
  durationMins: number;
  assignedToId: string | null;
  buyerId: string;
  status: VisitStatus;
}

const INACTIVE: VisitStatus[] = ["CANCELLED", "COMPLETED", "RESCHEDULED", "REQUESTED"];
/** Travel buffer between two visits handled by the same representative (Mumbai traffic). */
export const TRAVEL_BUFFER_MINS = 30;

export interface VisitConflict {
  visitId?: string;
  reason: "REPRESENTATIVE_BUSY" | "BUYER_BUSY";
}

export function findVisitConflicts(candidate: VisitSlot, existing: VisitSlot[]): VisitConflict[] {
  const start = candidate.scheduledAt.getTime();
  const end = start + candidate.durationMins * 60_000;
  const out: VisitConflict[] = [];
  for (const v of existing) {
    if (v.id && v.id === candidate.id) continue;
    if (INACTIVE.includes(v.status)) continue;
    const vs = v.scheduledAt.getTime();
    const ve = vs + v.durationMins * 60_000;
    if (candidate.assignedToId && v.assignedToId === candidate.assignedToId) {
      const buf = TRAVEL_BUFFER_MINS * 60_000;
      if (start < ve + buf && vs < end + buf) {
        out.push({ visitId: v.id, reason: "REPRESENTATIVE_BUSY" });
        continue;
      }
    }
    if (v.buyerId === candidate.buyerId && start < ve && vs < end) out.push({ visitId: v.id, reason: "BUYER_BUSY" });
  }
  return out;
}
