import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { clientInfo } from "./request";

export async function audit(
  actor: { id: string; name?: string } | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  meta?: Prisma.InputJsonValue,
) {
  let ip: string | null = null;
  try {
    ip = (await clientInfo()).ip;
  } catch {
    // outside a request (seed / scripts)
  }
  await db.auditLog.create({
    data: { actorId: actor?.id ?? null, actorLabel: actor?.name ?? "system", action, entityType, entityId: entityId ?? null, meta, ip },
  });
}
