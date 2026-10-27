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

## Follow-ups and time zone

- Every follow-up is a record: open, done (with what happened) or cancelled. It can belong to a buyer, a developer, an inventory unit or a negotiation, or be a general task.
- The "next follow-up" date shown on a buyer, developer, unit or negotiation is always the earliest open follow-up for that record. Setting the field creates or moves its follow-up; clearing it cancels that follow-up.
- Marking a buyer *Converted* or *Lost* cancels their open follow-ups.
- **Follow-ups** (sidebar) has tabs for Overdue, Due today, Upcoming, Completed and Cancelled (the last two cover 30 days). "Start here" shows the most urgent item: buyer priority A first, then the longest overdue. Completing a follow-up records the outcome and can schedule the next date in the same step.
- All business dates are **Asia/Kolkata (IST)**. Form dates are read as IST whatever the server's timezone, and "today" and "overdue" use IST day boundaries.

## Approval gates (summary)

| Record | Shown publicly only when |
|---|---|
| Project | Evidence approved by a manager, compliance reviewed, published |
| Inventory unit | Approved, marked public, available, verified in the last 30 days. Owner, contacts, unit number and terms are never shown |
| Price saving on a unit | The comparison is meaningful (current, dated, sourced, like-for-like) **and** a manager accepted the evidence |
| Group benefit / offer | Confirmed with who confirmed it, written evidence, the exact terms and a future validity date |
| Buying group | A project campaign, marked public, on an approved and published project |
