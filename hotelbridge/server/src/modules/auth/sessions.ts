import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '../../db/pool.js';
import type { Role } from '../../../../shared/domain.js';

export const SESSION_COOKIE = 'hb_session';
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface SessionUser {
  sessionId: string; csrfToken: string;
  id: string; email: string; name: string; role: Role; agencyId: string | null; hotelId: string | null;
  agencyStatus: string | null; agencyName: string | null;
}

/** The raw token lives only in the cookie; the database stores its SHA-256. */
export async function createSession(q: Queryable, userId: string, ttlHours: number, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + ttlHours * 3_600_000);
  await q.query('INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, sha256(token), csrf, expires, meta.ip ?? null, (meta.userAgent ?? '').slice(0, 200)]);
  return { token, csrf, expires };
}

export async function loadSession(q: Queryable, token: string): Promise<SessionUser | null> {
  const row = await q.one<any>(
    `SELECT s.id AS session_id, s.csrf_token, u.id, u.email, u.name, u.role, u.agency_id, u.hotel_id, a.status AS agency_status, a.name AS agency_name
       FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN agencies a ON a.id = u.agency_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`, [sha256(token)]);
  if (!row) return null;
  return {
    sessionId: row.session_id, csrfToken: row.csrf_token, id: row.id, email: row.email, name: row.name, role: row.role,
    agencyId: row.agency_id, hotelId: row.hotel_id, agencyStatus: row.agency_status, agencyName: row.agency_name,
  };
}

export async function revokeSession(q: Queryable, sessionId: string) {
  await q.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
}
