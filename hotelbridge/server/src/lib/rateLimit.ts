import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errors.js';

/** Fixed-window in-memory limiter. Adequate for a single instance; use a shared store when scaling out. */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = opts.key ? opts.key(req) : req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      if (hits.size > 50_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return next();
    }
    entry.count += 1;
    if (entry.count > opts.max) {
      return next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'));
    }
    next();
  };
}
