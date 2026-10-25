# Growlanzo — End-to-End Release Readiness Audit

**Date:** 2026-10-25
**Repository audited:** `C:\Users\mdmir\Documents\GROWLANCER` (branch `launch/mvp-hardening`, HEAD `a10a86a`, clean at start)
**Note on source:** the task referenced an uploaded `Growlancer-main (2).zip`. No such archive was present in the workspace; the checked-out repository above was treated as the source of truth. The only archive found locally was `Growlancer-main (1).zip`, which was not used.
**Environment:** Windows 11, Node/npm, built static bundle served locally at `127.0.0.1:4175`. No Docker, no local Supabase, no Razorpay sandbox credentials.

---

## A. Overall result

### CONDITIONAL PASS — SPECIFIC BLOCKERS REMAIN

All executable local quality gates pass (typecheck, lint, 675 unit/contract tests, 12/12 scope invariants, docs inventory, production build). The static security review found **one real, previously unfixed exposure in the deferred credential module**, which is now fixed in code with a regression guard.

It is **not** a full "PASS FOR CONTROLLED RELEASE" because the money path and authenticated journeys were **not executed**: there is no isolated staging database (the Supabase CLI is linked to the hosted production project, and Docker is unavailable), no Razorpay test credentials, and sign-in is OAuth-only (GitHub/LinkedIn) requiring human credentials. Per the audit rules, those legs are marked **BLOCKED / NOT RUN**, never PASS.

The release also still has the pre-existing payout blocker reported by the project's own preflight: `RAZORPAY_ACCOUNT_NUMBER` is unset, so money cannot leave the platform.

---

## B. Test execution summary

| Suite | Total | Passed | Failed | Blocked | Not run | Command / tool | Evidence |
|---|---:|---:|---:|---:|---:|---|---|
| TypeScript | — | ✅ | 0 | 0 | 0 | `npm run typecheck` | exit 0, no diagnostics |
| ESLint | — | ✅ | 0 | 0 | 0 | `eslint . --ext ts,tsx --report-unused-disable-directives` | exit 0 |
| Vitest (unit + contract) | 675 | 675 | 0 | 0 | 0 | `npm test` | 56 files passed, exit 0 (`tmp/full-test.log`) |
| MVP scope invariants | 12 | 12 | 0 | 0 | 0 | `node scripts/check-mvp-scope.mjs` | 12/12, "Scope guard: PASS" |
| Docs inventory | 1 | ✅ | 0 | 0 | 0 | `npm run docs:map` → `--check` | inventory current (665→667 files after fix) |
| Production build | 1 | ✅ | 0 | 0 | 0 | `npm run build` | 61.6 s; `dist/client` 13 MB, `assets` 3.4 MB; no 404.html, `_redirects` active |
| Founder preflight | 1 | ⚠️ | 0 | 1 blocker | 0 | `node scripts/founder-preflight.mjs` | exit 0 but **1 blocker / 7 warnings** |
| Razorpay webhook rehearsal | — | — | — | ✅ | — | `node scripts/e2e/razorpay-webhook-rehearsal.mjs` | needs `RAZORPAY_WEBHOOK_SECRET` + reachable function; neither available |
| OAuth signup / auth lifecycle E2E | — | — | — | — | ✅ | `npm run e2e:oauth-signup`, `e2e:auth-lifecycle` | requires real GitHub/LinkedIn accounts and deployed function secrets |
| Client/Freelancer/Admin authenticated E2E | — | — | — | ✅ | — | Browser (`preview_*`) | no disposable test accounts; linked DB is production |
| Payment execution (test mode) | — | — | — | ✅ | — | Razorpay checkout | no test keys; cannot prove test vs live mode → BLOCKED |
| Payout execution | — | — | — | ✅ | — | RazorpayX | credentials + account number absent |
| Responsive/browser smoke | 6 routes × 3 viewports | ✅ sample | 0 | 0 | remaining routes | Chromium preview | see section F |

---

## C. Feature matrix

Statuses: **PASS** = executed and observed; **CODE** = verified in source/tests but not executed live; **BLOCKED** = prerequisite missing; **N/A** = not part of this release.

| Feature | Client | Freelancer | Admin | Backend | Security | Final |
|---|---|---|---|---|---|---|
| Public homepage / nav / footer | PASS (browser) | PASS | N/A | public RPCs 200 | no console errors | PASS |
| Pricing & 5% honesty copy | PASS | PASS | N/A | canonical commission helper | test blocks "100% to freelancer" claims | PASS |
| Auth (GitHub/LinkedIn only) | BLOCKED (needs real account) | BLOCKED | BLOCKED | OAuth-only surface test passes | JWT verified server-side | BLOCKED |
| Protected routes | PASS (redirect observed) | PASS (same guard) | Guard present | RLS is the real control | `/dashboard/wallet` → `/` unauthenticated | PASS (frontend), DB not exercised |
| Onboarding / profiles | CODE | CODE | N/A | profile trigger + RLS | tests for stale profile reads | CODE |
| Project posting / discovery | CODE | CODE | CODE | RLS + ownership RPCs | IDOR fixes in `20270119000012` | CODE |
| Proposals / invites | CODE | CODE | N/A | edge functions with JWT | invites RPC owner checks | CODE |
| Contracts / milestones / workspace | CODE | CODE | CODE | escrow RPCs | `FOR UPDATE` + guards | CODE |
| Escrow funding (Razorpay) | BLOCKED | N/A | BLOCKED | server-computed amount, ownership check | HMAC webhook, unique `event_id` | CODE / BLOCKED live |
| Release, 5% commission, invoice | N/A | CODE | CODE | `platform_commission()` once | contract tests assert gross/fee/net | CODE |
| Wallet & withdrawals | BLOCKED | BLOCKED | BLOCKED | server-only wallet RPCs | EXECUTE revoked from clients | CODE / BLOCKED live |
| Reviews | CODE | CODE | CODE | writes service-role only | direct writes revoked + unique index | CODE |
| Disputes / support tickets | CODE | CODE | CODE | edge functions | role checks | CODE |
| Referrals / GrowCoins | CODE | CODE | N/A | same-role referral migration | bonus exclusions tested | CODE |
| Premium subscription | CODE | CODE | CODE | billing defers while deferred | no charge before period reserve | CODE |
| Deferred: certificates | **PASS (410 UI)** | PASS | N/A | **was reachable via RPC — fixed** | RLS + EXECUTE revoke (SEC-01) | FIXED |
| Deferred: internships / contests / billing / KYC auto-verify | PASS (gated) | PASS | PASS | 410 fail-closed; scope guard | invariants 12/12 | PASS |
| Admin console / API | N/A | N/A | CODE | admin-data verifies JWT + `is_admin` | 403 on writes to ledger tables | CODE |
| Legal routes (terms/privacy/cookies/refund/escrow) | PASS (loaded, no overflow) | PASS | N/A | static | — | PASS |
| 404 handling | PASS | PASS | PASS | SPA fallback | — | PASS |

### Feature inventory (representative)

| Feature | Route/component | Backend dependency | Role | Existing test | Result | Risk | Evidence |
|---|---|---|---|---|---|---|---|
| Home | `src/pages/HomePage.tsx` | `get_public_platform_metrics`, categories, services | public | `publicMetricsHonesty.test.ts` | PASS | low | browser + RPC 200 |
| Pricing | `PricingPage.tsx` | `platform_commission` semantics | public | `commissionAndPaymentSecurity.test.ts` | PASS | low | browser |
| Login | `LoginModal` / `OAuthButtons` | Supabase Auth OAuth | public | `oauthOnlyAuthSurface.test.ts` | BLOCKED live | med | snapshot shows GitHub/LinkedIn only |
| Dashboard gate | `ProtectedRoute.tsx` | session | authed | `authRouteSurface.test.ts` | PASS (redirect) | low | `/dashboard/wallet` → `/` |
| Deferred cert page | `CertificateVerifyPage.tsx` | none (410) | public | `mvpScopeGuard` | PASS | low | 410 copy rendered |

---

## D. Security findings

### SEC-01 — P1 — Deferred credential tables exposed without RLS; public RPC returned intern PII — **FIXED**

**Where:** `supabase/migrations/20260806000000_credential_verification_portal.sql` (tables `credential_verification_tokens`, `credential_version_history`, `credential_audit_logs`, `verification_rate_limits`) and `20270203100000_reviews_write_path_hardening.sql` (`reviews_duplicate_archive`).

**Reproduction (static, deterministic):**
1. `grep -i "enable row level security"` across all migrations → no statement names any of the five tables.
2. `grep -i "create policy"` → no policy targets them.
3. The `CREATE TABLE` statements have no accompanying `REVOKE`, so the Supabase default schema privileges remain for `anon`/`authenticated`, and PostgREST exposes tables that are not RLS-protected.
4. `verify_credential_by_token(text)` is `SECURITY DEFINER`, granted to `anon`, and returns `to_jsonb(skill_certifications)` + `to_jsonb(token row)` + the **entire `internship_applications` row**. The gated page returns 410, so this RPC was the only live path — and it bypassed the deferral.

**Impact:** with only the public anon key: read QR tokens, admin e-mail/IP audit rows, rate-limit identifiers and archived reviews; invoke public token verification and receive applicant PII (name/contact/application fields) without authentication. No evidence of exploitation was checked (production logs were not accessed).

**Fix:** `supabase/migrations/20270205000000_credential_surface_lockdown.sql`
- `ENABLE ROW LEVEL SECURITY` on all five tables.
- `REVOKE ALL ... FROM anon, authenticated` + explicit `GRANT ALL ... TO service_role`.
- `REVOKE EXECUTE` on `verify_credential_by_token(text)` from `anon, authenticated`, `GRANT` to `service_role` only.
- Comments document why re-enabling needs a PII-free function.

**Why it cannot break a live flow:** every credential RPC call site is `src/lib/credentialVerification.ts`, reachable only from the feature-flagged (OFF) certificates page; no Edge Function calls these RPCs, and `admin-data` uses table operations with its service-role client. `20270119000012` already made the admin mutation RPCs admin-only.

**Regression guard:** `src/test/credentialSurfaceLockdown.test.ts` (17 tests): RLS present for each table, revokes present, no policy grants `anon`/`authenticated`/`PUBLIC`, public RPC closed, rationale documented.

**Retest:** targeted suite 44/44 passed; full suite 675/675; scope guard 12/12; SQL syntax guard 7/7.

### Controls re-verified in source (not newly found)

| Control | Result | Evidence |
|---|---|---|
| Razorpay webhook signature over raw body, fail-closed when secret missing | PASS | `razorpay-webhook` lines 37–55, 164–175; `commissionAndPaymentSecurity.test.ts` |
| Webhook idempotency | PASS | deterministic event key, unique `event_id`, `already_processed` short-circuit, guarded RPCs |
| Server-side order amount / ownership | PASS | `razorpay/index.ts` reads contract, checks `client_id === user.id`, computes from DB values |
| Payout webhook signature in constant time | PASS | `razorpay-payout-webhook` + static test |
| Admin authorization | PASS | `admin-data` verifies JWT via `getUser()` then `profiles_private.is_admin`; 403 on ledger writes |
| Cron functions | PASS | `CRON_SECRET` bearer checks on milestone release, billing, security alerts |
| Reviews write path | PASS | authenticated INSERT/UPDATE dropped, grants revoked, unique index, archive table |
| RLS coverage | PASS (after fix) | 96 tables created; 358 policies; 109+5 `ENABLE ROW LEVEL SECURITY`; 0 explicit disables |
| Storage buckets | PASS (source) | per-user folder policies for avatars/portfolio; contract files service-role |
| Secrets in bundle/source | PASS | `noCommittedSecrets.test.ts`; grep of `dist/` for service-role/live keys → none |
| CORS allow-list | PASS | `cors.test.ts`, single `_shared/site.ts` |

### Remaining security/quality observations (not fixed — need owner decision or environment)

| ID | Severity | Observation | Evidence |
|---|---|---|---|
| OBS-01 | P2 | `Auth initialization timeout` (12 s) fires on every cold page load in the built app (7/7 loads). Init is signalled info-only, so no error is thrown, but auth-dependent UI can stay unhydrated for up to 12 s. Likely the retry loop exhausting `MAX_INIT_RETRIES`; production telemetry should confirm the underlying `getSession` error. | `AuthContext.tsx:185,600-625`; browser console |
| OBS-02 | P3 | 21 interactive elements under 32×32 px on the mobile login/home view (360 px). Does not block use; touch-target guideline is 44×44. | browser measurement |
| OBS-03 | P3 | Referral invite image still composes the legacy `/UpdatedLogo.png` mark, while the site uses the final wordmark. Cosmetic brand inconsistency. | `src/lib/referralShare.ts:34` |
| OBS-04 | P3 | Typography is loaded from `cdn.fontshare.com` at runtime; an outage degrades to fallback fonts (no functional failure) and adds a third-party request. | browser network log |

---

## E. Financial reconciliation

**Executed sandbox transaction: NONE — BLOCKED.** No Razorpay test key/secret, no `RAZORPAY_WEBHOOK_SECRET`, no local Supabase, and the linked project is production. Per the audit rules, no real or unverifiable payment was attempted.

**Static trace of the intended ₹10,000 example (code, not a live run):**

| Step | Expected | Source evidence | Result |
|---|---|---|---|
| Checkout amount | ₹10,000 (client pays pool, no fee) | `razorpay/index.ts` builds `fundingAmount` from `contracts.amount`/milestones; test forbids `fundingAmount + fee` | CODE |
| Escrow funded | `escrow_funded = true`, contract status advanced once | `fund_escrow_from_wallet` locks row, rejects "Escrow is already funded" | CODE |
| Release gross | ₹10,000 | `_release_escrow_internal` | CODE |
| Commission | ₹500 (`ROUND(gross * 0.05, 2)`) | `platform_commission()` single helper | CODE |
| Freelancer net | ₹9,500 | `v_net := GREATEST(v_gross - v_fee, 0)`; wallet credit `v_net` | CODE |
| Invoice | total = pool (₹10,000), fee booked once | `_book_escrow_release`: `v_gross, 0, v_net, v_gross`; `platform_revenue` credit `v_fee` | CODE |
| Webhook replay | no double fund/credit | unique `event_id` + `already_processed` + idempotent RPCs | CODE (not replayed live) |
| Wallet/ledger reconciliation | balanced | `commissionAndPaymentSecurity.test.ts`, `escrow.test.ts`, `mvpScopeGuard.test.ts` (release 5% / net) | CODE |

No duplicate-commission regression was found in the current source: the historical "client pays fee" strings are explicitly forbidden by tests, and the release path withholds exactly one 5% using one helper.

---

## F. Responsive / browser matrix

Browser: Chromium via the preview tool. Bundle: `dist` served at `http://127.0.0.1:4175`.
Viewports executed: **360×800**, **390×844**, **1440×900**. Not executed: 768×1024, 1366×768, Firefox/WebKit.

| Route | 360 | 390 | 1440 | Overflow | Console errors | Failed requests |
|---|---|---|---|---|---|---|
| `/` | PASS | PASS | PASS | none | 0 (1 info telemetry per load) | 1 `net::ERR_ABORTED` (media range) |
| `/pricing` | not run | PASS | PASS | none | 0 | 0 |
| `/login` (modal) | PASS | PASS | PASS | none | 0 | 0 |
| `/dashboard/wallet` (unauth) | not run | not run | PASS (redirect → `/`) | — | info "Protected route blocked" | 0 |
| `/certificate` | not run | PASS (410 copy) | PASS | none | 0 | 0 |
| `/this-route-does-not-exist` | PASS | PASS | PASS | none | 0 | 0 |

Observations: light-only theme verified in the rendered DOM (no `.dark` class, no theme button anywhere in `src`, cream `rgb(255,248,238)` body); favicon resolves to `/UpdatedLogo.png`; all brand images loaded (0 broken images); public Supabase RPCs returned 200.

Not verified in browser: authenticated dashboards, workspace, wallet, admin console, payment checkout (blocked, see G).

---

## G. Environment blockers

Names only; no values were read into this report.

| Blocker | Consequence |
|---|---|
| No Docker / local Supabase; CLI linked to hosted `Growlanzo` project | no isolated DB; creating test users would mutate the production project → authenticated E2E not run |
| `RAZORPAY_ACCOUNT_NUMBER` missing | preflight blocker; payouts cannot leave the platform |
| `RAZORPAY_WEBHOOK_SECRET` not present locally | webhook rehearsal + signature tests cannot execute |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` not available to this session | cannot prove test mode → payment execution BLOCKED |
| OAuth provider accounts (GitHub/LinkedIn) not available | signup/login E2E not executed |
| `CRON_SECRET` not in local env | cron endpoints not invoked |
| `PAYPAL_ENABLED` off | PayPal is intentionally disabled server-side; no test |
| Font/tab tooling limitations | 768/1366 and non-Chromium engines not exercised |

Present locally (names): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_VERSION`, `VITE_SENTRY_DSN`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_SANDBOX`, `APP_URL`, `VITE_RAZORPAY_CONFIG_ID`, plus `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_PAYPAL_CLIENT_ID` in `.env.local` (never printed).

---

## H. Fixes made

| File | Change | Why |
|---|---|---|
| `supabase/migrations/20270205000000_credential_surface_lockdown.sql` | new | enables RLS, revokes client grants on 5 tables, closes the anon PII RPC |
| `src/test/credentialSurfaceLockdown.test.ts` | new | 17 regression tests pinning the lockdown |
| `docs/blueprint/INVENTORY.md` | regenerated | project-map gate expects the new file count |

**Tests added:** 17. **Tests rerun:** full suite 675 passed / 56 files; targeted security + SQL + scope 44 passed; typecheck 0; lint 0; build OK; docs check OK.

**Residual risk:** the migration is not applied to the hosted database. It is additive and security-positive, but applying it is a production change — the owner must run it through the normal drift-check → `supabase db push` pipeline. Merging to `main` triggers that pipeline automatically. Revoking `verify_credential_by_token` also means the deferred certificate module cannot be re-enabled without a PII-minimal replacement (documented in the migration).

---

## I. Release checklist

| Gate | Status | Note |
|---|---|---|
| Build | PASS | 61.6 s, static bundle complete |
| Typecheck | PASS | 0 diagnostics |
| Lint | PASS | 0 findings |
| Unit/contract tests | PASS | 675/675 |
| MVP scope invariants | PASS | 12/12 |
| Auth & authorization | PASS (code) / BLOCKED (live) | OAuth-only; admin + RPC guards verified in source |
| Client core workflow | BLOCKED | needs disposable accounts + isolated DB |
| Freelancer core workflow | BLOCKED | same |
| Admin workflow | BLOCKED | same |
| RLS & private files | PASS (source) / **action required** | SEC-01 fixed in migration; must be applied |
| Payments / escrow / commission | PASS (code) / BLOCKED (sandbox) | server-side amounts, HMAC, idempotency verified statically |
| Payouts | **FAIL / BLOCKED** | `RAZORPAY_ACCOUNT_NUMBER` unset; RazorpayX not enabled |
| Feature flags / deferred modules | PASS | 12/12, gated UI + API; RPC bypass closed |
| Responsive UI (sampled) | PASS | no overflow/console errors on tested routes; full matrix not run |
| SEO / legal pages | PASS | routes render; sitemap/robots preflight checks pass |
| Secrets hygiene | PASS | no secrets in bundle/source tests |
| Documentation | PASS | inventory regenerated; this report added |

---

## Bottom line

The codebase is in good shape for a **controlled** launch: gates are green, the money model is coherent in code, and the deferred-module boundary is now enforced at the database too. Two things still prevent an unconditional go-live:

1. **Apply the new lockdown migration** (and review it) before/with the next backend deploy.
2. **Run the authenticated + Razorpay test-mode E2E once** in an isolated environment, and enable payouts (`RAZORPAY_ACCOUNT_NUMBER`) if withdrawals are part of launch.

Until those are done, the honest verdict remains **CONDITIONAL PASS — specific blockers remain**, not a full pass.
