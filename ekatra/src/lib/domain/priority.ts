// Follow-up priority. Used to decide whom to call first — never to judge buyers.
// Budget size is deliberately NOT a factor: a high budget is not proof of capacity.

import type { BuyerSituation, Priority } from "@prisma/client";
import { EXPLORING_DAYS, FLEXIBLE_MONTHS } from "./timelines";

export interface PriorityInput {
  commitWithinDays: number | null;
  bookingWithinDays: number | null;
  situation: BuyerSituation;
  possessionWaitMonths: number | null;
  hasLocations: boolean;
  hasBudget: boolean;
  hasConfigOrType: boolean;
  /** At least one live property matches the requirement with no failed must-haves and budget not missed. */
  hasCompatibleProperty: boolean;
  wantsUpcoming: boolean;
}

export function classifyPriority(i: PriorityInput): { priority: Priority; reasons: string[] } {
  const defined = i.hasLocations && i.hasBudget && i.hasConfigOrType;
  const reasons: string[] = [];
  const commit = i.commitWithinDays ?? EXPLORING_DAYS;
  const booking = i.bookingWithinDays ?? -1;
  const readySituation = ["READY_TO_PURCHASE", "COMPARING_SHORTLIST"].includes(i.situation);

  if (commit <= 30 && booking >= 0 && booking <= 30 && readySituation && defined && i.hasCompatibleProperty) {
    reasons.push(`Could commit within ${commit} days`, booking === 0 ? "Booking payment possible immediately" : `Booking payment within ${booking} days`);
    reasons.push("Requirements are well defined", "At least one compatible property is listed");
    return { priority: "A", reasons };
  }
  if (commit <= 90 && i.hasLocations && i.hasBudget) {
    reasons.push(`Expects to decide within ${commit} days`, "Budget and locations defined");
    if (!i.hasCompatibleProperty) reasons.push("No fully compatible property listed yet");
    if (!readySituation) reasons.push("Still has a dependency (funds, loan, sale or pricing)");
    return { priority: "B", reasons };
  }
  if ((commit < EXPLORING_DAYS && commit > 90) || (i.possessionWaitMonths !== null && i.possessionWaitMonths >= 24 && i.possessionWaitMonths !== FLEXIBLE_MONTHS) || i.wantsUpcoming) {
    if (commit > 90 && commit < EXPLORING_DAYS) reasons.push("Purchase planned for later");
    if (i.wantsUpcoming) reasons.push("Interested in upcoming launches");
    if ((i.possessionWaitMonths ?? 0) >= 24) reasons.push("Willing to wait 2+ years for possession");
    return { priority: "C", reasons };
  }
  if (!i.hasBudget) reasons.push("Budget not yet defined");
  if (!i.hasLocations) reasons.push("Locations not yet chosen");
  if (commit >= EXPLORING_DAYS) reasons.push("No purchase timeline yet");
  return { priority: "D", reasons: reasons.length ? reasons : ["Exploring the market"] };
}

export const PRIORITY_LABEL: Record<Priority, { label: string; hint: string }> = {
  A: { label: "A · Ready", hint: "Short timeline, defined needs, compatible property, ready to proceed subject to checks." },
  B: { label: "B · Active", hint: "Comparing actively with a defined budget and locations." },
  C: { label: "C · Future", hint: "Interested in upcoming projects or planning a later purchase." },
  D: { label: "D · Exploring", hint: "Requirements or timeline not yet defined." },
};

export function effectivePriority(computed: Priority, override: Priority | null | undefined): Priority {
  return override ?? computed;
}
