// Rule-driven notification engine. Rules are editable in Admin → Settings → Notifications.

import type { Role } from "@prisma/client";
import { db } from "./db";
import { sendEmail } from "./email";

export const NOTIFICATION_EVENTS: { event: string; label: string; description: string; audienceRoles: Role[]; email: boolean }[] = [
  { event: "buyer.registered", label: "New buyer registration", description: "A buyer submits an inquiry or joins a buying group.", audienceRoles: ["SUPER_ADMIN", "OPERATIONS_MANAGER"], email: false },
  { event: "campaign.milestone", label: "Campaign milestone", description: "A buying campaign reaches 50%, 75% or 100% of its target.", audienceRoles: ["SUPER_ADMIN", "OPERATIONS_MANAGER"], email: true },
  { event: "followup.overdue", label: "Overdue follow-up", description: "A buyer's next follow-up date has passed.", audienceRoles: ["OPERATIONS_MANAGER"], email: false },
  { event: "developer.responded", label: "Developer response", description: "A developer response is recorded on a negotiation.", audienceRoles: ["SUPER_ADMIN", "OPERATIONS_MANAGER"], email: false },
  { event: "visit.requested", label: "Site visit requested", description: "A buyer requests a site visit or callback.", audienceRoles: ["SUPER_ADMIN", "OPERATIONS_MANAGER"], email: false },
  { event: "project.reverify", label: "Pricing needs re-verification", description: "A published project's information has not been verified for 45 days.", audienceRoles: ["OPERATIONS_MANAGER"], email: false },
  { event: "commission.due", label: "Commission payment due", description: "A commission's expected payment date is within 7 days or overdue.", audienceRoles: ["SUPER_ADMIN"], email: false },
];

export interface NotifyPayload {
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
  /** Additional specific recipients (e.g. the assigned representative). */
  userIds?: string[];
}

export async function notify(event: string, payload: NotifyPayload) {
  const def = NOTIFICATION_EVENTS.find((e) => e.event === event);
  const rule = await db.notificationRule.findUnique({ where: { event } });
  if (rule && !rule.enabled) return 0;
  const roles = rule?.audienceRoles ?? def?.audienceRoles ?? ["SUPER_ADMIN"];
  const recipients = await db.user.findMany({
    where: { active: true, OR: [{ role: { in: roles } }, { id: { in: payload.userIds ?? [] } }] },
    select: { id: true, email: true },
  });
  if (!recipients.length) return 0;
  if (rule?.inApp ?? true) {
    await db.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id,
        event,
        title: payload.title,
        body: payload.body,
        link: payload.link,
        dedupeKey: payload.dedupeKey,
      })),
      skipDuplicates: true,
    });
  }
  if (rule?.email ?? def?.email) {
    const base = process.env.APP_URL ?? "http://localhost:3000";
    for (const u of recipients)
      await sendEmail(u.email, payload.title, `${payload.body ?? ""}\n\n${payload.link ? base + payload.link : ""}`.trim());
  }
  return recipients.length;
}
