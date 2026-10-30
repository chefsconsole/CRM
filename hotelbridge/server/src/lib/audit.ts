import type { Queryable } from '../db/pool.js';

export async function audit(
  q: Queryable,
  e: { actorUserId?: string | null; agencyId?: string | null; entityType: string; entityId: string; action: string; details?: unknown },
) {
  await q.query(
    `INSERT INTO audit_log (actor_user_id, agency_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [e.actorUserId ?? null, e.agencyId ?? null, e.entityType, e.entityId, e.action, JSON.stringify(e.details ?? {})],
  );
}
