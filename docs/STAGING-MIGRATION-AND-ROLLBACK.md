# Staging Migration, Rollout and Rollback

Status: **plan — nothing in this document has been executed against production.**
Owner approval is required before step 4.

---

## 0. What this release changes in the database

**Nothing.** The launch-hardening change set is application + edge-function only:

| File | Kind | Database impact |
| --- | --- | --- |
| `supabase/functions/_shared/features.ts` | new module | none |
| `supabase/functions/admin-data/index.ts` | route closed (410) | none — no rows read or written |
| `supabase/functions/internship-applications/index.ts` | all methods 410 | none — historical rows untouched |
| `supabase/functions/subscription-billing-cron/index.ts` | fail-closed before charge | none — no subscription state is touched |
| `supabase/functions/kyc-submit/index.ts` | dev-mode gate | none |
| `supabase/functions/paypal-webhook/index.ts` | missing import fixed | none |
| `src/app/App.tsx`, `src/components/FeatureUnavailablePage.tsx` | route gating | none |
| `scripts/check-mvp-scope.mjs`, `src/test/mvpScopeGuard.test.ts` | guard | none |

That is deliberate: the highest-risk deploy is the one that also changes the
schema. This change can ship **without** a migration, so the rollback is a code
rollback only.

The 298 existing migration files are out of scope for this document except as
the staging baseline (§2).

---

## 1. Preconditions

1. A staging Supabase project that is a **restore of production**, not an empty
   project — RLS bugs only appear with real policy/data shape.
2. `pg_cron` + `pg_net` available; note the scheduled job that calls
   `subscription-billing-cron` (`20260902000000_schedule_subscription_billing_cron.sql`,
   secret fix in `20261211000002_fix_subscription_cron_schedule_secret.sql`).
3. A staging Razorpay **test-mode** key pair; no live keys anywhere.
4. A test inbox for Brevo.
5. `SUPABASE_ACCESS_TOKEN`, project ref and DB URL exported only in the shell —
   never committed, never printed.

---

## 2. Staging sequence

### 2.1 Baseline

```bash
supabase link --project-ref "$STAGING_REF"
supabase migration list           # local vs remote — must be identical before starting
supabase db dump -f /tmp/staging-before.sql   # rollback point (outside the repo)
```

Record the output of `supabase migration list` in the release ticket. A migration
that is present locally but missing remotely is the normal state of this repo;
reconcile it *before* deploying anything.

### 2.2 Apply outstanding migrations (if any)

```bash
supabase db push --dry-run        # read the plan first
supabase db push
```

Order matters and is already encoded in the filenames (`YYYYMMDDHHMMSS_`).
Never reorder, never rename, never edit an applied migration — add a new one.

### 2.3 Apply the edge functions

```bash
supabase functions deploy admin-data internship-applications \
  subscription-billing-cron kyc-submit paypal-webhook --project-ref "$STAGING_REF"
```

`_shared/features.ts` is bundled by each function; there is no separate deploy.

### 2.4 Disable the daily billing job (staging and production)

The runtime guard already refuses to charge, but a daily 503 from `pg_cron` is
noise that hides real failures. Unschedule it once, in the SQL editor, after
confirming the job name:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
-- expect one row whose command references subscription-billing-cron
SELECT cron.unschedule('<jobid from the row above>');
```

Keep the function deployed: re-scheduling the job is all that is needed to
restore billing once the feature is approved.

---

## 3. Validation (run on staging, in this order)

```sql
-- 1) Certificate verification must be gone, not merely empty.
--    Expect HTTP 410 and a body with available:false and no certificate key.
--    (call the function with anon key + {"action":"verify_certificate"})

-- 2) Internships must reject every method.
--    curl -i -X POST .../internship-applications  -> 410
--    curl -i .../internship-applications          -> 410

-- 3) Billing cron must not charge.
--    curl -i -H "Authorization: Bearer $CRON_SECRET" .../subscription-billing-cron
--    -> 503, body contains "charged":false
--    then: SELECT count(*) FROM subscription_billing_charges;  -- unchanged

-- 4) KYC dev mode must be impossible without the opt-in.
--    Set kyc_provider_config.mode='development', submit a PAN with KYC_DEV_MODE_ALLOWED unset
--    -> row status must be 'review' (provider_error), never 'verified'.

-- 5) RLS spot-checks (service-role key NOT used).
--    anon: SELECT * FROM admin_credentials;                -- 0 rows / permission denied
--    anon: SELECT * FROM profiles_private;                 -- 0 rows
--    user A: SELECT * FROM contracts WHERE client_id = B;  -- 0 rows
--    user A: UPDATE wallets SET balance = 999999;          -- denied (no client write policy)
```

Each check must be recorded with the exact command and the observed status code
or row count. "It looked fine in the UI" is not evidence.

---

## 4. Production rollout (needs owner approval)

1. Freeze deploys; announce the window.
2. `supabase db dump` of production to storage outside the repo.
3. Deploy the five edge functions **before** the frontend, so a stale client can
   never reach a route that still leaks data. Order: `admin-data` first
   (removes the PII route), then `internship-applications`,
   `subscription-billing-cron`, `kyc-submit`, `paypal-webhook`.
4. Verify §3 checks 1–4 against production.
5. Deploy the frontend (Vercel) and verify `/internships`, `/careers`,
   `/certificate` render the unavailable page.
6. Unschedule the billing cron (§2.4).
7. Watch logs for 30 minutes: 5xx rate, `grow_coin`/`subscription` warnings,
   auth failures. Roll back on any unexplained 5xx spike.

No production migration is part of this rollout. If a migration becomes
necessary, stop and re-plan — it is a different change with its own review.

---

## 5. Rollback

| Failure | Rollback | Time |
| --- | --- | --- |
| Frontend route gating wrong | Redeploy the previous Vercel build | < 2 min |
| Edge function regression | `supabase functions deploy <name>` from the previous commit | < 5 min |
| Billing must be re-enabled | Set `FEATURE_SUBSCRIPTION_BILLING_ENABLED=true`, redeploy functions, re-schedule the cron job | < 15 min |
| A deferred module must come back | Set `FEATURE_<KEY>_ENABLED=true` **and** revert the UI gate; server accepts immediately, UI needs a deploy | < 30 min |
| Data damage (should be impossible here) | Restore the §4.2 dump into a new project, repoint, verify, then cut over | hours |

The feature switch is the primary rollback for every deferred module: it needs
no code change and no migration. That is why it exists.

---

## 6. Known operational risks

1. **Daily 503s** from the billing cron until §2.4 is done. Harmless, noisy.
2. **Subscription records** for real users are preserved but not renewed while
   billing is off. Do not cancel or downgrade them automatically; the founder
   must decide per account. This is called out in the release report.
3. **Existing certificate URLs** in the wild (shared links, emails) will now show
   the unavailable page. That is intentional — the route leaked PII.
4. **Internship applicants** whose emails contain a status link will land on the
   unavailable page. Support should have a prepared reply.
