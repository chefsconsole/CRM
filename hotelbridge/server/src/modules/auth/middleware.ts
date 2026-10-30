import type { NextFunction, Request, Response } from 'express';
import type { AppContext } from '../../context.js';
import { STAFF_ROLES, type Role } from '../../../../shared/domain.js';
import { AppError, forbidden, unauthorized } from '../../lib/errors.js';
import { loadSession, SESSION_COOKIE, type SessionUser } from './sessions.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: SessionUser } }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Endpoints that establish a session or accept anonymous submissions; they never act on an existing session.
const CSRF_EXEMPT = ['/api/auth/login', '/api/auth/register', '/api/public/'];

/** Attach the session user (if any) and enforce CSRF on state-changing requests. */
export function sessionMiddleware(ctx: AppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE];
      if (token) {
        const user = await loadSession(ctx.db, token);
        if (user) {
          req.user = user;
          if (UNSAFE.has(req.method) && !CSRF_EXEMPT.some((p) => req.originalUrl.startsWith(p)) && req.get('x-csrf-token') !== user.csrfToken) {
            return next(new AppError(403, 'CSRF', 'Your session token is missing or out of date. Please refresh the page.'));
          }
        }
      }
      next();
    } catch (e) { next(e); }
  };
}

export const requireUser = (req: Request, _res: Response, next: NextFunction) => (req.user ? next() : next(unauthorized()));

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const requireStaff = (...roles: Role[]) => requireRole(...(roles.length ? roles : STAFF_ROLES));

/** Agency users of an ACTIVE (verified) agency. Pending agencies can sign in but cannot search or book. */
export function requireActiveAgency(req: Request, _res: Response, next: NextFunction) {
  const u = req.user;
  if (!u) return next(unauthorized());
  if (!u.agencyId || (u.role !== 'agency_admin' && u.role !== 'agency_agent')) return next(forbidden('This area is for travel agency accounts.'));
  if (u.agencyStatus !== 'active') return next(new AppError(403, 'AGENCY_NOT_ACTIVE', 'Your agency account is awaiting verification. You will be able to search and book once it is approved.'));
  next();
}
