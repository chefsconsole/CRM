import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import type { AppContext } from './context.js';
import { AppError } from './lib/errors.js';
import { h, parse } from './lib/http.js';
import { log } from './lib/log.js';
import { rateLimit } from './lib/rateLimit.js';
import { sessionMiddleware } from './modules/auth/middleware.js';
import { authRoutes } from './modules/auth/routes.js';
import { agentRoutes } from './modules/agency/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { partnerRoutes } from './modules/partner/routes.js';

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', ctx.config.isProduction ? 1 : false);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60_000, max: ctx.config.appEnv === 'test' ? 100_000 : 600 }));
  app.use(sessionMiddleware(ctx));

  app.get('/api/health', h(async (_req, res) => {
    await ctx.db.one('SELECT 1');
    res.json({ ok: true, environment: ctx.config.appEnv, database: ctx.db.driver });
  }));

  app.get('/api/public/config', (_req, res) => {
    res.json({
      environment: ctx.config.appEnv,
      isProduction: ctx.config.isProduction,
      sandboxSupplier: ctx.config.sandboxSupplierEnabled,
      contactEmail: ctx.config.publicContactEmail ?? null,
      contactPhone: ctx.config.publicContactPhone ?? null,
    });
  });

  app.post('/api/public/applications', rateLimit({ windowMs: 60 * 60_000, max: ctx.config.appEnv === 'test' ? 1000 : 5 }), h(async (req, res) => {
    const b = parse(z.object({
      kind: z.enum(['hotel', 'distribution']),
      organisation: z.string().trim().min(2).max(160), contactName: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email(), phone: z.string().trim().max(40).optional(),
      countryCode: z.string().trim().length(2).toUpperCase().optional(), city: z.string().trim().max(80).optional(),
      website: z.string().trim().max(200).optional(),
      details: z.object({ rooms: z.number().int().min(1).max(5000).optional(), category: z.string().max(40).optional(), message: z.string().max(3000).optional(), channelManager: z.string().max(120).optional() }).default({}),
      consent: z.literal(true, { errorMap: () => ({ message: 'Please agree to be contacted about your application.' }) }),
    }), req.body);
    await ctx.db.query(`INSERT INTO partner_applications (kind, organisation, contact_name, email, phone, country_code, city, website, details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [b.kind, b.organisation, b.contactName, b.email, b.phone ?? null, b.countryCode ?? null, b.city ?? null, b.website ?? null, JSON.stringify(b.details)]);
    res.status(201).json({ ok: true });
  }));

  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/agent', agentRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api/partner', partnerRoutes(ctx));
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Not found')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if ((err as any)?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed request body.' } });
    }
    log.error('unhandled error', { path: req.path, error: (err as Error)?.message, stack: ctx.config.isProduction ? undefined : (err as Error)?.stack });
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again, and contact support if it keeps happening.' } });
  });

  return app;
}
