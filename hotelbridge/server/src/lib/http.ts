import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, output } from 'zod';
import { badRequest, unauthorized } from './errors.js';

/** Wrap an async handler so rejections reach the error middleware. */
export const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): output<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest(issues[0] ? `${issues[0].path ? issues[0].path + ': ' : ''}${issues[0].message}` : 'Invalid request', issues);
  }
  return r.data;
}

export function user(req: Request) {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** The authenticated agency id — always from the session, never from the request body or query. */
export function agencyIdOf(req: Request): string {
  const u = user(req);
  if (!u.agencyId) throw unauthorized();
  return u.agencyId;
}
