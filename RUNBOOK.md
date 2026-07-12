# Production Runbook

## Preconditions
- Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Quality gates must pass: lint, typecheck, test, build
- Confirm Supabase RLS and RPC policies are reviewed before release

## Database Backup Strategy
- **Automated Backups**: Supabase Pro plan includes daily backups with 7-day retention
- **Point-in-Time Recovery (PITR)**: Enable in Supabase Dashboard → Database → Backups
  - Supports restoring to any point within the last 7 days (Pro) or 28 days (Team)
  - Required for financial data integrity
- **Manual Snapshots**: Run weekly for additional safety:
  ```bash
  pg_dump --no-owner --no-acl --dbname=postgresql://$DB_URL > growlancer_$(date +%Y%m%d).sql
  ```
- **Restore Procedure**:
  1. Create a new Supabase project
  2. Run `psql -f growlancer_YYYYMMDD.sql` against the new project
  3. Update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in environment
  4. Re-deploy edge functions: `npx supabase functions deploy --project-ref <new-ref>`

## Disaster Recovery Plan
| Scenario | Recovery Steps | RTO | RPO |
|----------|----------------|-----|-----|
| Database corruption | Restore from PITR to point before corruption | 1-2 hours | < 5 min |
| Accidental table drop | Restore from latest daily backup | 2-4 hours | < 24 hours |
| Region outage | Create new project in another region, restore from backup | 4-8 hours | < 24 hours |
| Security breach | Rotate all secrets, restore clean backup, audit logs | 2-4 hours | < 5 min (PITR) |

## Release Procedure
1. Install deps: `npm ci`
2. Verify: `npm run lint && npm run typecheck && npm run test && npm run build`
3. Deploy static bundle from `dist/`
4. Deploy/update edge functions:
   ```bash
   npx supabase functions deploy admin-data --no-verify-jwt
   npx supabase functions deploy paypal
   npx supabase functions deploy razorpay
   npx supabase functions deploy withdrawal
   npx supabase functions deploy paypal-webhook
   npx supabase functions deploy notifications
   npx supabase functions deploy reviews
   npx supabase functions deploy ai-matching
   npx supabase functions deploy ai-assistant
   npx supabase functions deploy internship-applications
   npx supabase functions deploy delete-account
   npx supabase functions deploy twofa-management
   ```
5. Run any new database migrations via Supabase SQL Editor
6. Smoke-check critical routes: `/`, `/login`, `/signup`, `/dashboard`, `/client`
7. Verify admin access: `/admin`

## Incident Response
- **Triage**: Determine user impact, affected surface area, and severity
- **Check**: Browser console errors → Sentry dashboard → Supabase logs → Edge function logs
- **Auth Issues**: Check Supabase Auth health at `/auth/v1/health`
- **Payment Issues**: Verify PayPal/Razorpay dashboard for transaction status
- **Escalate**: If financial data affected, pause new transactions immediately
- **Communication**: Update status page at `/status` and post in company channel

## Rollback
1. Redeploy previous known-good Vercel deployment from dashboard
2. For database: restore from PITR if schema migration caused the issue
3. For edge functions: redeploy previous version:
   ```bash
   npx supabase functions deploy <function-name> --no-verify-jwt
   ```
4. Verify health by loading login and one protected dashboard route
5. Confirm new sessions can sign in and existing sessions refresh
6. Announce rollback completion and begin root-cause analysis

## Post-Incident
- Record timeline, customer impact, and permanent fix
- Add or update automated test covering failure mode
- Update this runbook with lessons learned
- Schedule follow-up: assess whether monitoring/alerting needs improvement
