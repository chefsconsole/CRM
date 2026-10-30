import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { h, parse, user } from '../../lib/http.js';
import { AppError, badRequest, conflict } from '../../lib/errors.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { audit } from '../../lib/audit.js';
import { hashPassword, passwordProblem, verifyPassword } from './passwords.js';
import { createSession, revokeSession, SESSION_COOKIE } from './sessions.js';
import { requireUser } from './middleware.js';

// A real hash so unknown-email logins take the same time as wrong-password logins.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

const registerSchema = z.object({
  agency: z.object({
    name: z.string().trim().min(2).max(120),
    legalName: z.string().trim().max(160).optional(),
    countryCode: z.string().trim().length(2).transform((s) => s.toUpperCase()),
    city: z.string().trim().min(2).max(80),
    address: z.string().trim().max(300).optional(),
    phone: z.string().trim().min(5).max(40),
    website: z.string().trim().max(200).optional(),
    registrationNumber: z.string().trim().max(80).optional(),
    sellingCurrency: z.enum(['EUR', 'USD', 'GBP', 'INR', 'AED', 'THB']).default('EUR'),
  }),
  admin: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string(),
  }),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to continue.' }) }),
});

export function authRoutes(ctx: AppContext) {
  const r = Router();
  const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: ctx.config.cookieSecure, path: '/' };
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: ctx.config.appEnv === 'test' ? 1000 : 10, key: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}` });

  r.post('/login', loginLimiter, h(async (req, res) => {
    const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }), req.body);
    const u = await ctx.db.one<{ id: string; password_hash: string; status: string }>('SELECT id, password_hash, status FROM users WHERE lower(email) = $1', [email]);
    const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
    if (!u || !ok || u.status !== 'active') throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const s = await createSession(ctx.db, u.id, ctx.config.sessionTtlHours, { ip: req.ip, userAgent: req.get('user-agent') });
    await ctx.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
    res.cookie(SESSION_COOKIE, s.token, { ...cookieOpts, expires: s.expires });
    res.json({ ok: true, csrfToken: s.csrf });
  }));

  r.post('/logout', h(async (req, res) => {
    if (req.user) await revokeSession(ctx.db, req.user.sessionId);
    res.clearCookie(SESSION_COOKIE, cookieOpts);
    res.json({ ok: true });
  }));

  r.get('/me', requireUser, h(async (req, res) => {
    const u = user(req);
    res.json({
      user: { id: u.id, name: u.name, email: u.email, role: u.role, agencyId: u.agencyId, agencyName: u.agencyName, agencyStatus: u.agencyStatus, hotelId: u.hotelId },
      csrfToken: u.csrfToken,
    });
  }));

  r.post('/register', rateLimit({ windowMs: 60 * 60_000, max: ctx.config.appEnv === 'test' ? 1000 : 5 }), h(async (req, res) => {
    const input = parse(registerSchema, req.body);
    const problem = passwordProblem(input.admin.password);
    if (problem) throw badRequest(problem);
    const exists = await ctx.db.one('SELECT 1 FROM users WHERE lower(email) = $1', [input.admin.email]);
    if (exists) throw conflict('EMAIL_IN_USE', 'An account with this email already exists. Please sign in.');
    const hash = await hashPassword(input.admin.password);
    const a = input.agency;
    const agencyId = await ctx.db.tx(async (q) => {
      const ag = await q.one<{ id: string }>(
        `INSERT INTO agencies (name, legal_name, country_code, city, address, phone, website, registration_number, selling_currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [a.name, a.legalName ?? null, a.countryCode, a.city, a.address ?? null, a.phone, a.website ?? null, a.registrationNumber ?? null, a.sellingCurrency]);
      const u = await q.one<{ id: string }>(`INSERT INTO users (agency_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,'agency_admin') RETURNING id`,
        [ag!.id, input.admin.email, input.admin.name, hash]);
      await audit(q, { actorUserId: u!.id, agencyId: ag!.id, entityType: 'agency', entityId: ag!.id, action: 'registered' });
      return ag!.id;
    });
    res.status(201).json({ ok: true, agencyId, status: 'pending' });
  }));

  return r;
}
