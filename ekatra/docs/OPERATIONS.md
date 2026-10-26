# Operations

## Deploying

1. Provision Postgres and set `DATABASE_URL`, `SESSION_SECRET` (32+ random bytes), `APP_URL`, `CRON_SECRET` and `TZ=Asia/Kolkata`.
2. Run `npm ci && npx prisma migrate deploy && npm run build && npm start`.
3. **Do not run the seed in production**, or set `SEED_TEAM_PASSWORD` and then remove the demo data immediately. Create real team users in **Settings → Team & roles**.
4. Serve the app behind HTTPS. The session cookies are `Secure` in production.

## Scheduled sweep

Call `POST /api/cron/sweep` with `Authorization: Bearer $CRON_SECRET` every hour. It raises alerts for overdue follow-ups (to the assigned rep), published projects that need re-verification, and commissions that are due or overdue. Campaign milestones are raised at the moment demand changes. It is safe to call more often than that: it runs at most once an hour, and every notification is de-duplicated.

## Backups

- Take a nightly `pg_dump -Fc` and keep 30 days. Test a restore every month.
- Back up `STORAGE_DIR` (uploaded documents), or move storage to S3/R2 (see INTEGRATIONS.md).

## Data requests (DPDP)

- **Erasure:** open the buyer and choose **Erase personal data** (Super Admin only). Names, contacts and notes are anonymised and interests are withdrawn. Aggregate counts and the audit log entry are kept.
- **Export:** use **Buyers → Export** (CSV/XLSX, filtered; managers only). Every export is audit-logged.

## Monitoring

- **Admin → Settings → Audit** records logins, exports, erasures, price changes, approvals and setting changes.
- `/admin/notifications` shows rule-driven alerts. Adjust the rules in Settings.
- The rate limiter is in memory (one instance). When you run several instances, replace `src/lib/rate-limit.ts` with Redis or Upstash.
