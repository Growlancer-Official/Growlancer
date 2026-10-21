# Growlancer — Release Readiness Report

Date: 2026-10-21 · Branch: `launch/mvp-hardening` · Baseline commit: `2011d7f`
Audience: founder / release owner
Status vocabulary: **PASS** (ran, output read), **FAIL** (ran, wrong result),
**BLOCKED** (cannot run here — reason given), **NOT RUN** (not attempted).

---

## 1. Verdict

**Growlancer is not launch-ready yet.** It is materially closer than it was:
five confirmed security defects are closed and guarded by tests, the deferred
modules now fail closed at the API instead of leaking data, and the full local
quality gate is green.

What is still missing is not code — it is **evidence from a staging
environment**: the payment-in journey, payouts, email delivery, RLS on live
policies, and the two browser journeys. Those are BLOCKED here because this
workspace has no staging URL, no E2E accounts and no provider sandbox keys.

Two product decisions also need the founder before launch (§5).

---

## 2. What was verified in this pass

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **PASS** — exit 0, no errors |
| Lint | `npm run lint` | **PASS** — exit 0, no warnings |
| Unit + integration | `npm test` | **PASS** — 51 files, 602 tests |
| Scope guard (new) | `npm run test:mvp-scope` | **PASS** — 8/8 invariants |
| Production build | `npm run build` | **PASS** — 61.1 s, dist validated |
| Built-artifact check | grep of `dist/{internships,careers,certificate,verify-certificate}/index.html` | **PASS** — each prerendered page contains the unavailable copy |
| Browser E2E | `node scripts/e2e/auth-lifecycle.mjs --base=…` | **BLOCKED** — harness now runs and fails closed: *"missing SUPABASE_URL / VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, E2E_FREELANCER_EMAIL/PASSWORD, E2E_CLIENT_EMAIL/PASSWORD. Refusing to exit 0"* |
| Staging RLS / grants | — | **BLOCKED** — no staging project credentials in this workspace |
| Razorpay test-mode payment-in | — | **BLOCKED** — no test-mode keys; not simulated on purpose |
| Payout sandbox | — | **BLOCKED** — provider setup incomplete, per the previous review |
| Email delivery (Brevo) | — | **BLOCKED** — no test inbox configured |
| Dependency audit (`npm audit`) | — | **NOT RUN** — registry install took >3 min and was abandoned; not claimed as clean |
| Edge-function typecheck | `deno check` | **NOT RUN** — Deno is not installed in this workspace. The function changes are covered by the static guard tests only |

The two build artefacts that matter were checked as artefacts, not inferred from
a green exit code: the prerendered HTML for `/internships`, `/careers`,
`/certificate` and `/verify-certificate` each contains
*"not part of the early-access release"*, and `/contests` does not.

For the E2E line specifically: `playwright-core` was declared in
`devDependencies` but missing from `node_modules`. It was installed with
`--no-save --no-package-lock`, so `package.json` and `package-lock.json` are
unchanged. The harness then ran and refused to exit 0 without staging config —
which is the correct behaviour, and the exact opposite of the skipped-guardrail
failure this repo has hit before.

---

## 3. Security findings from the previous review

| # | Finding | Status now | Evidence |
| --- | --- | --- | --- |
| A | Public certificate/QR verification returned full certificate records + internship applicant rows | **FIXED** | `admin-data` returns `410` with `available:false` and reads no row. Guard test asserts the branch contains no `.from(`, `.select(`, `internship_applications` or raw token |
| B | Subscription cron charged saved cards without the `subscription_billing_charges` idempotency ledger | **MITIGATED (not eliminated)** | Cron now returns `503 {charged:false}` before any gateway call unless `FEATURE_SUBSCRIPTION_BILLING_ENABLED=true`. **The missing ledger use is still latent** and must be fixed before billing is ever re-enabled |
| C | KYC could auto-verify via a development adapter | **FIXED** | DB `mode='development'` is downgraded to `production` unless `KYC_DEV_MODE_ALLOWED=true`; the auto-verify adapter is unreachable without it, and an unconfigured provider resolves to `review` |
| D | Internship application updated from an email address alone | **FIXED (by closure)** | The whole function answers `410`; the reapply-by-email path cannot run. Historical rows preserved |
| E | `paypal-webhook` called `getCorsHeaders` without importing it | **FIXED** | Import added. Every request — including OPTIONS — previously died with `ReferenceError` before signature verification. A repo-wide test now fails if any function calls it without importing it |
| F | `admin_credentials` had a PUBLIC-scoped RLS policy and was in the Realtime publication | **FIXED IN MIGRATION, UNVERIFIED LIVE** | `20270127000000_fix_admin_credentials_rls_and_realtime.sql` drops the PUBLIC policy, re-scopes to `authenticated` + `is_admin_user`, and unpublishes the table. **A migration existing is not a policy being deployed** — staging check required (§4) |
| G | NULL-auth guards on money RPCs | **FIXED IN MIGRATION, UNVERIFIED LIVE** | `20270130000000_restore_null_safe_money_guards.sql` rejects `auth.uid() IS NULL`, checks ownership, and self-asserts the guard is present |
| H | Payment-in, payouts, email never proven | **BLOCKED** | See §2 |

### Why B is "mitigated", not "fixed"

Disabling the cron removes the risk but leaves the defect. If billing is turned
back on without an idempotency insert on `(subscription_id, billing_period)`,
a re-run (retry, double cron, manual invoke) can charge twice. That is now a
documented precondition for re-enabling, not a launch blocker, because billing
ships off.

---

## 4. Staging verification still required (cannot be done here)

These are the checks that turn "fixed in the repo" into "fixed in production":

1. `admin_credentials`: `SELECT` as `anon` returns nothing; as a non-admin
   `authenticated` user returns nothing; as an admin returns rows.
2. `profiles_private`, `wallets`, `escrow`, `transactions`, `withdrawals`:
   confirm no client `INSERT/UPDATE` policy; confirm anon gets nothing.
3. Every money RPC: anonymous call rejected; cross-user call rejected;
   duplicate call idempotent.
4. `kyc-submit` with `mode='development'` and no opt-in → row ends `review`.
5. Billing cron with `CRON_SECRET` → `503 charged:false`, and
   `subscription_billing_charges` row count unchanged.
6. Certificate/internship/QR endpoints → `410`, no `certificate`, `token` or
   applicant field in the body.
7. Razorpay test-mode: order → checkout → webhook → ledger → escrow state;
   then replay the webhook and confirm no double ledger entry.

Each must be recorded with the command and the observed response. The plan and
rollback are in [STAGING-MIGRATION-AND-ROLLBACK.md](STAGING-MIGRATION-AND-ROLLBACK.md).

---

## 5. Decisions only the founder can make

1. **Premium / Grow Coins vs the launch brief.** The brief asked to defer
   Premium, subscriptions and the referral/reward programme. `AGENTS.md` §2 and
   `CLAUDE.md` make Freelancer Premium ₹299/month and merit-only ranking
   non-negotiable business rules. This release keeps the **one-off Premium
   purchase** and the **Grow Coin/referral programme** enabled, and defers the
   recurring billing cron (money risk), certificates, internships and in-house
   KYC (PII risk). Confirm this, or say which side wins — each flip is a
   one-line change in `_shared/features.ts`.
2. **Existing subscriptions.** If any live subscriber exists, billing is now
   paused for them. Someone must decide: honour paid access manually, notify
   them, or re-enable billing after the idempotency fix. Nothing is cancelled or
   downgraded automatically.
3. **Contests.** Not gated yet (no PII/money defect, but it is in the deferred
   list). Gate or keep — either is defensible; it needs a decision before the
   UI cleanup in the scope doc §3.

---

## 6. What changed in this pass

| File | Change |
| --- | --- |
| `supabase/functions/_shared/features.ts` | **new** — fail-closed feature switch + `410` helper |
| `supabase/functions/admin-data/index.ts` | public certificate/QR verification route replaced with `410`; no row read |
| `supabase/functions/internship-applications/index.ts` | every method `410` before the first DB read |
| `supabase/functions/subscription-billing-cron/index.ts` | returns `503 charged:false` before any gateway call |
| `supabase/functions/kyc-submit/index.ts` | `KYC_DEV_MODE_ALLOWED` opt-in; DB dev-mode downgraded; adapter unreachable |
| `supabase/functions/paypal-webhook/index.ts` | missing `getCorsHeaders` import |
| `src/components/FeatureUnavailablePage.tsx` | **new** — honest unavailable screen (410 semantics in the UI) |
| `src/app/App.tsx` | internships, careers, certificate and verify-certificate routes gated |
| `src/test/mvpScopeGuard.test.ts` | **new** — 13 regression tests |
| `scripts/check-mvp-scope.mjs` | **new** — CLI scope guard |
| `package.json` | `test:mvp-scope` script |
| `docs/MVP-SCOPE-AND-E2E-TEST-PLAN.md` | **new** |
| `docs/STAGING-MIGRATION-AND-ROLLBACK.md` | **new** |
| `docs/blueprint/INVENTORY.md` | regenerated by `npm run docs:map` (derived) |

No database migration is part of this change set. That is what makes the
rollback a code rollback (§0 of the migration doc).

---

## 7. Honest position on "ready for 1M users"

Seven test accounts are **not** traction, and passing local tests is **not**
capacity. Before a public launch at real volume, these remain unproven:

- **Database**: connection limits, index coverage on `projects`/`proposals`/
  `contracts`/`messages`, and query plans at realistic row counts. Not measured.
- **Realtime**: channel fan-out per workspace, and the cost of the
  `grow_coin_ledger` subscription per user.
- **Payments**: the happy path is untested end-to-end in sandbox; webhook replay
  behaviour is untested.
- **Abuse**: rate limits exist, but no load or brute-force test has been run.
- **Support**: the founder runbook exists; nobody has been through a real
  dispute yet.
- **Legal**: entity name, support contact and refund wording must match the
  actual operating entity — do not invent either.

The correct public statement today is **early access**, not "ready for a million
users". The code is closer than the evidence is; the next milestone is the
staging evidence in §4, not another feature.
