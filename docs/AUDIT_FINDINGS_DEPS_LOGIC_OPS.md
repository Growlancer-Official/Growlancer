# Growlancer — Forensic Dependency, Business-Logic & Observability Audit

**Audit date:** 2026-09-11
**Auditor:** Code mode (read-only forensic audit)
**Scope:** Dependency health, end-to-end business-logic/edge-case trace, observability coverage, error-handling consistency, and build/test baseline.

> **Scope discipline:** No application source file was modified, formatted, or refactored during this audit. The only file written is this document. `npm audit fix`, `npm update`, and mutating installs were **not** run.

**Cross-references (do not duplicate — see these docs for pre-existing IDs):**
- Architecture: [`docs/AUDIT_ARCHITECTURE_MAP.md`](./AUDIT_ARCHITECTURE_MAP.md)
- Backend security: [`docs/AUDIT_FINDINGS_BACKEND_SECURITY.md`](./AUDIT_FINDINGS_BACKEND_SECURITY.md) — IDs `SEC-* / API-* / AI-* / STORE-*`
- Database: [`docs/AUDIT_FINDINGS_DATABASE.md`](./AUDIT_FINDINGS_DATABASE.md) — IDs `DB-* / RLS-* / STORAGE-* / MONEY-*`
- Frontend: [`docs/AUDIT_FINDINGS_FRONTEND.md`](./AUDIT_FINDINGS_FRONTEND.md) — IDs `FE-* / PERF-* / UI-* / A11Y-* / SEO-* / FE-SEC-*`

New ID namespaces introduced here: `DEP-*`, `LOGIC-*`, `EDGE-*`, `OBS-*`, `ERR-*`.

---

## 1. BASELINE VERIFICATION RESULTS

Environment: Windows 10, Node **v24.19.0** (matches [`.nvmrc`](../.nvmrc) = 24), npm 11.17.0, `"type": "module"`.

`node_modules` **is present**, so all runtime verification commands were executable.

| # | Command | Result | Exit code | Literal outcome |
|---|---------|--------|-----------|-----------------|
| 1 | `npm run lint` | **PASS** | **0** | No ESLint errors or warnings emitted. |
| 2 | `npx tsc --noEmit` | **PASS** | **0** | **0 TypeScript errors.** |
| 3 | `npx tsc --noEmit --strict` | **PASS** | **0** | **0 TypeScript errors under `--strict`.** |
| 4 | `npx vitest run` | **FAIL** | **1** | Collection error — configured pool `threads` fails on Node 24 (worker pool error before any test executes). |
| 5 | `npx vitest run --pool=vmForks` | **FAIL** | **1** | `2 failed | 4 passed` test **files**; `13 failed | 94 passed` **tests**. |
| 6 | `npm run build` | **FAIL** | **1** | Vike SSR prerender crashes — malformed Windows module specifier `C:\c:\Users\...` → `ERR_MODULE_NOT_FOUND`. |

### 1.1 Build failure root cause

[`node_modules/@brillout/vite-plugin-server-entry/dist/esm/runtime/autoImporter.js`](../node_modules/@brillout/vite-plugin-server-entry/dist/esm/runtime/autoImporter.js:4) exports a `paths` object whose entry is consumed by [`importServerProductionEntry.js`](../node_modules/@brillout/vite-plugin-server-entry/dist/esm/runtime/importServerProductionEntry.js:25) during prerender. On Windows the absolute path is concatenated with the drive letter already present, producing `C:\c:\Users\...`, which Deno/Node cannot resolve.

- **Evidence:** Build stderr terminates with `ERR_MODULE_NOT_FOUND` for the doubled-drive path.
- **Classification:** Toolchain/platform defect (third-party plugin), **not** an application-source defect.
- **Verification method:** Runtime only (see §7).

### 1.2 Test failure note

The default `threads` pool is broken at collection time; `--pool=vmForks` is required to reach assertions. Failures are concentrated in escrow/auto-release suites (async timeouts) and an authService mock-shape defect (`mockReturnValue is not a function`). These are **test-harness defects**, not evidence of runtime product breakage — but they mean **CI currently cannot run green** (§6, `OBS-06`).

---

## 2. FINDINGS TABLE

### 2.1 Dependency findings (`DEP-*`)

| ID | Severity | Area | File(s):line | Root cause | Impact | Recommended fix | Verification method |
|----|----------|------|--------------|------------|--------|-----------------|---------------------|
| DEP-01 | P2 | Deps | [`package.json`](../package.json:24) `dependencies` | `undici` is declared as a **production** dependency but is never imported anywhere in `src/`, `pages/`, `scripts/`, or `supabase/functions/`. | Dead weight in the deploy bundle/install surface; supply-chain exposure with zero benefit. | Remove `undici` from `dependencies`. | Static: `search_files` for `from 'undici'` / `require('undici')` → 0 hits. Runtime: reinstall + build. |
| DEP-02 | P2 | Deps | [`package.json`](../package.json:24), [`server.js`](../server.js:53) | `express` and `compression` are pulled in for a local `server.js` static host, but production on Vercel never executes `server.js` (SSR is served by Vike/Vercel). | Two unused prod dependencies + their transitive advisories (`body-parser`, `qs`) inflate the vulnerability surface. | Move `express`/`compression` to `devDependencies`, or delete them and `server.js` if Vercel-only. | Static: confirm no prod import path references `server.js`. Runtime: deploy without them. |
| DEP-03 | P2 | Deps | `package-lock.json` | **19 duplicate multi-version package families** (same package resolved at ≥2 versions). | Larger install, potential dual-instance bugs (e.g. React context identity, React duplication). | Add `overrides` where a single version is safe; dedupe via lockfile regeneration **after** compatibility review. | Static: lockfile family analysis. |
| DEP-04 | P1 | Deps | [`audit-deps.json`](../audit-deps.json:1) | `npm audit --json`: **11 vulnerabilities — 5 high, 6 moderate, 0 critical.** Directly implicated: `express`, `postcss`, `react-router-dom`; transitive: `body-parser`, `qs`, `brace-expansion`, `js-yaml`, `nanoid`, `browserslist`, `baseline-browser-mapping`. | Known advisories in shipped dependency graph. | Upgrade `react-router-dom` (advisory-backed), `postcss`, and drop/upgrade `express`. **Verify each is a safe semver range before applying** — no blind bumps. | Static: `audit-deps.json`. Runtime: `npm audit` after upgrade. |
| DEP-05 | P2 | Deps | [`audit-outdated.json`](../audit-outdated.json:1) | **Semver-major drift:** `eslint` 8.57.1 → 10, `tailwindcss` 3.4.19 → 4, `typescript` 5.9.3 → 7, `vitest` 4.1.11 → 5, `express` 4 → 5. | Missing fixes/features; growing upgrade debt. Tailwind 3→4 and TS 5→7 are **breaking** (config/codemod required). | Upgrade **incrementally**, one major at a time, on a branch; Tailwind 4 and TS 7 require dedicated migrations, not blind bumps. | Runtime: build + full test after each bump. |
| DEP-06 | P3 | Deps | [`audit-outdated.json`](../audit-outdated.json:16) | `@types/node` installed at **26.1.1**, which is *ahead of* the registry's latest (22.20.2) and ahead of the actual runtime (Node 24). | Type surface can advertise APIs that don't exist at runtime. | Pin `@types/node` to a version aligned with Node 24. | Static: compare `@types/node` vs `node -v`. |

### 2.2 Business-logic findings (`LOGIC-*`)

| ID | Severity | Area | File(s):line | Root cause | Impact | Recommended fix | Verification method |
|----|----------|------|--------------|------------|--------|-----------------|---------------------|
| LOGIC-01 | P1 | Money/Escrow | [`dataService.ts:686`](../src/lib/dataService.ts:686) (`escrowService.release`), [`dataService.ts:604`](../src/lib/dataService.ts:604) (`contractsService.complete`) | `release()` only flips `escrow.status → 'released'` and `contracts.status → 'completed'`. It performs **no wallet/ledger credit** and **no `transactions` insert**. `complete()` likewise flips statuses only. | If any UI path calls these client-side helpers instead of the authoritative RPC (`release_milestone_rpc` / `auto_release_milestone`), the freelancer's balance is never credited while the escrow is marked released — **silent loss of owed funds** and a contract state that no longer reflects the ledger. | Route all release/completion through the server-side RPCs that credit the ledger; remove or hard-fail the client-side status-only helpers. | Runtime: fund → approve → assert freelancer wallet delta and a `transactions` row. |
| LOGIC-02 | P0 | Auth | [`authService.ts:366`](../src/lib/services/authService.ts:366) | `deleteAuthAccount()` calls `supabase.auth.admin.deleteUser(userId)` from the **browser** Supabase client. `auth.admin.*` requires the `service_role` key, which must never ship to the browser. | Either always fails (anon key lacks privilege) — leaving accounts undeleted after the 7-day cooldown — or, if a privileged key were ever embedded, exposes full admin auth control. | Remove from client; account deletion must go exclusively through the `process-deletion` edge function ([`supabase/functions/process-deletion/index.ts`](../supabase/functions/process-deletion/index.ts:8)), which already enforces CRON_SECRET/admin JWT. | Static: confirm no client call site. Runtime: trigger deletion → assert `auth.users` row removed. |
| LOGIC-03 | P2 | Auth/2FA | [`authService.ts:438`](../src/lib/services/authService.ts:438) onward | MFA surface relies on `authRpc(...)` + client `mfa.*`; `enrollMFA` only `console.error`s if recovery-code generation fails ([`authService.ts:498`](../src/lib/services/authService.ts:498)). | User can complete 2FA enrollment **with zero recovery codes** and never be told — lockout risk if the authenticator is lost. | Treat recovery-code generation as mandatory; abort enrollment or surface a blocking warning. | Runtime: enroll → force `generate_recovery_codes` failure → assert UI blocks. |
| LOGIC-04 | P2 | Subscription | [`subscriptionHelpers.ts:64`](../src/lib/subscriptionHelpers.ts:64) (`subscriptionService`) + [`subscription-billing-cron/index.ts`](../supabase/functions/subscription-billing-cron/index.ts:155) | Renewal correctness depends on the cron calling the real `attemptRenewalCharge`; the client helper layer can locally flip subscription state, risking divergence from the billing ledger. | Potential period extension shown client-side without a matching charge — **free renewal** if the client path is trusted. | Make the cron the single source of truth for date extension; client helpers read-only. | Runtime: run cron with a forced-charge-failure sandbox account → assert `past_due`, not extended. |

### 2.3 Edge-case findings (`EDGE-*`)

| ID | Severity | Area | File(s):line | Root cause | Impact | Recommended fix | Verification method |
|----|----------|------|--------------|------------|--------|-----------------|---------------------|
| EDGE-01 | P1 | Double-submit | [`AuthContext.tsx:1176`](../src/context/AuthContext.tsx:1176) (`signup`), [`AuthContext.tsx:1049`](../src/context/AuthContext.tsx:1049) (`login`) | Guarding is React-state/`loading`-flag based, not idempotency-key based. A rapid double-click or retry after a slow response can fire two `signUp`/`signInWithPassword` calls. | Duplicate signup attempts, duplicate referral-code creation (`createReferralCode`), duplicate emails, confusing dual error surfaces. | Disable on first click **and** add a client-side request token; rely on the server `is_email_taken` RPC + DB unique constraint as backstop. | Runtime: throttle network to 3G, double-click submit, observe request count. |
| EDGE-02 | P1 | Refresh mid-flow | [`OtpLoginPage.tsx:23`](../src/pages/auth/OtpLoginPage.tsx:23), [`OtpLoginPage.tsx:71`](../src/pages/auth/OtpLoginPage.tsx:71) | OTP attempt counter (`attempts`, limit 5) and resend cooldown are **client-side React state**, reset to 0 every refresh (`setAttempts(0)`). | Brute-force of an 8-digit OTP is trivially enabled by refreshing/clearing state — client lock is cosmetic. | Enforce attempt limits server-side (GoTrue rate limits + a DB `rate_limits` row keyed by email/IP), not in component state. | Runtime: verify `verifyOtp` rejects after N server-side attempts across fresh sessions. |
| EDGE-03 | P2 | Refresh mid-flow | [`rateLimiter.ts:19`](../src/lib/rateLimiter.ts:19) | Login progressive-delay store is an **in-memory `Map`**; comment itself notes it "resets on page refresh." | Brute-force delay is bypassable by refreshing; false sense of protection. | Keep client delay as UX only; ensure persistent server-side lockout exists and document it. | Runtime: 11 failed logins, refresh, assert server still blocks. |
| EDGE-04 | P1 | Back/expired session | [`AuthCallbackPage.tsx:125`](../src/pages/AuthCallbackPage.tsx:125) (`getSession` 7×500ms retry ladder) | The callback page implements a **multi-strategy recovery ladder** (getSession → PKCE → implicit hash → refreshSession → raw localStorage). Complex, timing-dependent; back-button re-entry can replay a partially-consumed one-time token. | Consumed/expired `token_hash`/PKCE code re-entry yields opaque errors; user may land on homepage via the rescue path ([`authAction.ts:105`](../src/lib/authAction.ts:105)). | Ensure tokens are single-use with clear "link already used / expired" messaging for every ladder rung; guard re-entry. | Runtime: exercise each rung + browser back. |
| EDGE-05 | P2 | Large data | [`analyticsService.ts:47`](../src/lib/analyticsService.ts:47) (`getFreelancerAnalytics`, 9 parallel queries), [`refundService.ts:199`](../src/lib/refundService.ts:199) (`select('*')`) | Analytics fan-out and unbounded `select('*')` reads have **no pagination/limit**. | For high-volume freelancers/contracts, slow queries and large payloads; potential memory/timeout pressure. | Add `.limit()`/range pagination and targeted column selection. | Runtime: seed thousands of rows, measure latency/payload. |
| EDGE-06 | P2 | Malformed/empty | [`refundService.ts:205`](../src/lib/refundService.ts:205), `:216`, `:227`, `:238`, `:261` | Read helpers return `[]` on **any** `error`, collapsing "no rows" and "query failed" into the same empty result. | Dispute/refund UIs silently render "nothing here" during an outage or RLS denial — user-visible data loss illusion, no error surfaced. | Return `{ data, error }` (or throw) so callers can distinguish empty from failed; surface an error state. | Runtime: revoke RLS → assert UI shows error, not empty. |
| EDGE-07 | P2 | Null-tolerant parsing | [`subscriptionHelpers.ts:34`](../src/lib/subscriptionHelpers.ts:34) (`isProSubscription`), [`analyticsService.ts:230`](../src/lib/analyticsService.ts:230) (`buildMonthlyEarnings`) | Defensive `?? 0` / default branches mean a **malformed or missing field renders as a legitimate zero** rather than an error. | Silent wrong values (e.g. earnings show 0 during partial failure) that look authoritative. | Distinguish "absent" from "zero"; log/flag schema mismatches. | Runtime: feed `null`/missing fields, assert surfaced warning. |

### 2.4 Observability findings (`OBS-*`)

| ID | Severity | Area | File(s):line | Root cause | Impact | Recommended fix | Verification method |
|----|----------|------|--------------|------------|--------|-----------------|---------------------|
| OBS-01 | P0 | Error tracking | [`pages/+client.ts:7`](../pages/+client.ts:7) | Sentry initializes **only if** `VITE_SENTRY_DSN` is set **and** starts with `https://` (`if (SENTRY_DSN && SENTRY_DSN.startsWith('https://'))`). | If the env var is absent/misconfigured in any environment, **there is zero client error tracking** — production errors vanish. Silent failure mode. | Fail loud at deploy time if DSN missing in production; add a build-time assertion / health check. | Runtime: inspect deployed bundle + confirm an event reaches Sentry. |
| OBS-02 | P1 | Error tracking | [`pages/+client.ts:26`](../pages/+client.ts:26) | The Sentry dynamic import `.catch(() => {})` **swallows** load failures silently. | If the Sentry chunk fails to load (CSP, network, ad-block), monitoring is silently dead with no signal. | Log/queue a fallback signal on catch; consider `console.error` so at least the console records it. | Runtime: block the Sentry chunk, assert a fallback signal. |
| OBS-03 | P0 | Error tracking | [`telemetry.ts:56`](../src/lib/telemetry.ts:56) → [`telemetry.ts:31`](../src/lib/telemetry.ts:31) | `captureError(message, payload)` **discards `message`** (passes `payload || {}` into `persistError`), while `persistError` inserts `event_id: payload.eventId || null` into a `NOT NULL UNIQUE` column. The overwhelming majority of call sites pass only `{ source: 'auth' }` with **no `eventId`/`message`**. | Two failures compound: (1) inserts violate the `NOT NULL` constraint and are silently dropped by `.catch(() => undefined)`; (2) even if they succeeded, the human-readable `message` is never stored. The promised "every `ERR-<ts>-<rand>` is traceable" guarantee in the docstring is **false**. | Generate `event_id` server-side (DEFAULT) or client-side fallback when absent; persist the `message` argument. | Runtime: trigger a captured error, assert a `client_errors` row appears with a non-null `event_id` and the message text. |
| OBS-04 | P2 | Metrics | [`public/platform-metrics.json:3`](../public/platform-metrics.json:3) | Published metrics are placeholders: `paymentsProcessedInr: 0`, `avgSatisfactionPercent: null`, `countriesWithMembers: null`. | Public/About surface shows fabricated-or-empty business metrics; no pipeline populates them. | Wire a build/deploy step (or a serverless job) to write real aggregates, or remove the fields from the public surface. | Runtime: inspect rendered About page against DB aggregates. |
| OBS-05 | P1 | Health coverage | [`StatusPage.tsx:19`](../src/pages/StatusPage.tsx:19) | StatusPage checks only client-reachable systems (DB / Realtime / AI / PayPal), polling every 120s. **No coverage of edge functions, cron jobs (11 pg_cron jobs), or payment webhooks.** | The highest-risk money paths (webhooks, billing cron, payout/webhook processing) are **unmonitored** — failures are invisible until a user complains. | Add synthetic probes / failure counters for `razorpay-webhook`, `razorpay-payout-webhook`, `subscription-billing-cron`, `milestone-auto-release`, `withdrawal`. | Runtime: kill a function, assert status page/locator reflects it. |
| OBS-06 | P1 | CI signal | repo-wide | Test toolchain is red: default `threads` pool fails at collection on Node 24; `vmForks` yields `13 failed | 94 passed`. | A permanently-red suite provides **no regression signal** — real breakage can't be distinguished from known test-harness noise. | Fix the pool config ([`vitest.config.ts`](../vitest.config.ts)) and the mock-shape/timeout defects so CI is green; then gate on it. | Runtime: green `npx vitest run` in CI. |
| OBS-07 | P2 | Correlation | [`telemetry.ts`](../src/lib/telemetry.ts:1) / edge functions | No end-to-end correlation ID threads a frontend action → edge function → DB row. Webhook handlers insert audit rows but nothing ties a user-reported failure to the server record. | Cross-tier debugging is guesswork; a user's "it failed" cannot be traced to the exact webhook/order. | Introduce/propagate a request correlation ID (header + `client_errors` + audit logs). | Runtime: submit with an ID, trace it across tiers. |

### 2.5 Error-handling consistency findings (`ERR-*`)

| ID | Severity | Area | File(s):line | Root cause | Impact | Recommended fix | Verification method |
|----|----------|------|--------------|------------|--------|-----------------|---------------------|
| ERR-01 | P1 | Swallowed errors | [`telemetry.ts:41`](../src/lib/telemetry.ts:41), [`telemetry.ts:42`](../src/lib/telemetry.ts:42) | `.catch(() => undefined)` + bare `catch {}` swallow all telemetry failures. | Combined with `OBS-03`, telemetry is effectively write-only into a void — failures are invisible. | Log to console with a distinct tag on telemetry failure; never silently discard. | Static + runtime: assert a console signal on forced insert failure. |
| ERR-02 | P2 | Inconsistent shapes | [`refundService.ts`](../src/lib/refundService.ts:199) (reads → `[]`) vs mutators (return `{ success, error }`) | **Two incompatible error contracts** in the same module: reads collapse errors to `[]`; writes return `{ success, error? }`. | Callers cannot rely on a single pattern; empty-vs-error is undecidable for reads (`EDGE-06`). | Standardize a discriminated result type across the service. | Static: audit call sites. |
| ERR-03 | P2 | Inconsistent surfacing | [`AuthContext.tsx:94`](../src/context/AuthContext.tsx:94) (`devError`), auth pages | Frontend error surfacing mixes toast, inline `setError`, `console`, and silent dev-only logging; backend returns vary between `{ error }` strings, thrown errors, and empty arrays. | Users see inconsistent messaging; some failures are silent, others leak raw messages. | Define a single frontend error-normalization layer mapping backend errors → user-safe messages. | Static: enumerate call sites. |
| ERR-04 | P2 | Leaked internals | [`OtpLoginPage.tsx:63`](../src/pages/auth/OtpLoginPage.tsx:63), [`AuthContext.tsx`](../src/context/AuthContext.tsx:1176) | Several branches fall back to `otpError.message` / raw error text after only partially mapping known cases. | Raw provider/DB messages can leak implementation detail to end users. | Replace remaining raw-message fallbacks with generic user-safe copy (log the raw text internally). | Static: enumerate fallback branches; runtime: trigger unmapped errors. |
| ERR-05 | P3 | Double error surface | [`AuthContext.tsx:1159`](../src/context/AuthContext.tsx:1159) | On total login failure the code both clears `user`/`session` **and** returns an error; combined with page-level handling this can produce duplicate/racing UI states. | Confusing UX; potential flash of unauthenticated shell. | Single owner for the failure UI. | Runtime: force total-failure login, observe transitions. |

---

## 3. BUSINESS-JOURNEY TRACE SUMMARY (frontend → API → DB)

All nine journeys were traced with `file:line` evidence. Outcome column notes whether an authoritative, server-side, idempotent path exists.

| # | Journey | Authoritative backend | Notable risk found |
|---|---------|-----------------------|--------------------|
| 1 | Signup + onboarding | [`AuthContext.tsx:1176`](../src/context/AuthContext.tsx:1176) `signup`; `is_email_taken` pre-flight; anti-enumeration via `identities.length === 0`; referral inline/deferred | `EDGE-01` (double-submit), email-send fallback auto-login path |
| 2 | Login (OAuth / OTP / magic link / 2FA) | [`AuthCallbackPage.tsx`](../src/pages/AuthCallbackPage.tsx:38) recovery ladder; [`OtpLoginPage.tsx`](../src/pages/auth/OtpLoginPage.tsx:48); [`MagicLinkPage.tsx`](../src/pages/auth/MagicLinkPage.tsx:14); MFA in [`authService.ts:438`](../src/lib/services/authService.ts:438) | `EDGE-02`/`EDGE-03` (client-only limits), `EDGE-04` (callback re-entry), `LOGIC-03` (MFA recovery codes) |
| 3 | Client posts project → proposal → hire (escrow funded) | [`workflowService.ts:14`](../src/lib/workflowService.ts:14) `createContractWithEscrow` (+ fallback); [`razorpay/index.ts:557`](../supabase/functions/razorpay/index.ts:557) `verify_payment` → `fund_escrow` | Server amount recomputation + `NaN‖<=0‖>100000` guard present (safe) |
| 4 | Milestone delivery → auto-release → payout | [`milestone-auto-release/index.ts`](../supabase/functions/milestone-auto-release/index.ts:59) (10h, skips disputed/frozen); `release_milestone_rpc` | `LOGIC-01` if client-only `escrowService.release` path is used instead |
| 5 | Withdrawal / payout to bank | [`withdrawal/index.ts`](../supabase/functions/withdrawal/index.ts:161) (config-error → QUEUE holding funds; real failure → rollback) | `create_payout` correctly **removed (403)** in [`razorpay/index.ts:1103`](../supabase/functions/razorpay/index.ts:1103) |
| 6 | Subscription purchase + billing cron | [`subscription-billing-cron/index.ts:155`](../supabase/functions/subscription-billing-cron/index.ts:155) real `attemptRenewalCharge`; failure → `past_due` | `LOGIC-04` if client helper state is trusted over cron |
| 7 | Service order + tip + negotiable offer | Migration [`20260812000000_service_tips_negotiable_offers.sql`](../supabase/migrations/20260812000000_service_tips_negotiable_offers.sql:1): `service_offers` + RLS + **amount-freeze trigger** + notify trigger | Strong: price frozen after freelancer responds; server reads amount from row before payment |
| 8 | Refund / dispute | [`refundService.ts:121`](../src/lib/refundService.ts:121) → `request_contract_refund`, `admin_decide_dispute`, evidence/messages RPCs | `EDGE-06`/`ERR-02` (reads collapse errors to `[]`) |
| 9 | Account deletion | [`request-deletion/index.ts`](../supabase/functions/request-deletion/index.ts:49) (3/hr DB rate limit) → [`process-deletion/index.ts`](../supabase/functions/process-deletion/index.ts:8) (CRON_SECRET/admin JWT) | `LOGIC-02` (browser call to `auth.admin.deleteUser`) |

**Journey 7 highlight (safe by design):** RLS permits the client to update `service_offers.amount` **only while `status = 'pending'`**, and the `service_offers_freeze_amount_fn` trigger raises `'Offer amount is frozen after the freelancer responded'` on any post-response amount change — with a documented rationale that the Razorpay function reads the amount server-side from the row. This is a correct anti-tampering pattern.

---

## 4. CONFIRMED SAFE (with evidence)

The following were specifically checked and found **correct**; they are recorded to prevent re-litigation and to bound severity.

| Item | Evidence |
|------|----------|
| Server-side amount authority (no client price trust) | [`razorpay/index.ts:440`](../supabase/functions/razorpay/index.ts:440) recomputes from DB and rejects `NaN ‖ <= 0 ‖ > 100000`; `revision_payment` (:419) and `contest_prize` (:401) recompute server-side. |
| Payment webhook HMAC is fail-closed | [`razorpay-webhook/index.ts:37`](../supabase/functions/razorpay-webhook/index.ts:37) `verifySignature` + constant-time `safeEqual` (:28). |
| Webhook idempotency | Unique `payment_webhook_events.event_id` gates re-processing in [`razorpay-webhook/index.ts`](../supabase/functions/razorpay-webhook/index.ts:126). |
| Payout webhook double-credit guard | Terminal-status idempotency skip in [`razorpay-payout-webhook/index.ts:102`](../supabase/functions/razorpay-payout-webhook/index.ts:102) prevents re-releasing wallet funds. |
| Refund wallet double-credit fix | Migration [`20260818000000_fix_refund_wallet_double_credit.sql`](../supabase/migrations/20260818000000_fix_refund_wallet_double_credit.sql:1). |
| Account-deletion auth hardened | Old spoofable `includes('service_role')` check replaced; [`process-deletion/index.ts:17`](../supabase/functions/process-deletion/index.ts:17) now requires CRON_SECRET **or** a verified admin JWT. |
| Payout endpoint locked down | `create_payout` deliberately returns 403 in [`razorpay/index.ts:1103`](../supabase/functions/razorpay/index.ts:1103). |
| `client_errors` RLS | Insert allowed only when `user_id = auth.uid()` **or** both `user_id`/`event_id` are null — mitigates spoofed inserts. |
| Negotiable-offer amount freeze | `service_offers_freeze_amount_fn` trigger + pending-only client UPDATE policy. |
| Sentry PII protection | `replayIntegration({ maskAllText: true, blockAllMedia: true })` in [`pages/+client.ts`](../pages/+client.ts:13). |

---

## 5. SEVERITY ROLL-UP

| Severity | Count | IDs |
|----------|-------|-----|
| **P0** | 3 | `LOGIC-02`, `OBS-01`, `OBS-03` |
| **P1** | 9 | `DEP-04`, `LOGIC-01`, `EDGE-01`, `EDGE-02`, `EDGE-04`, `OBS-02`, `OBS-05`, `OBS-06`, `ERR-01` |
| **P2** | 15 | `DEP-01`, `DEP-02`, `DEP-03`, `DEP-05`, `LOGIC-03`, `LOGIC-04`, `EDGE-03`, `EDGE-05`, `EDGE-06`, `EDGE-07`, `OBS-04`, `OBS-07`, `ERR-02`, `ERR-03`, `ERR-04` |
| **P3** | 2 | `DEP-06`, `ERR-05` |

**Top 5 by risk:** `LOGIC-02` (browser admin-API call), `OBS-03` (telemetry silently discards every captured error), `OBS-01` (Sentry can be entirely off), `LOGIC-01` (status-only release path can skip ledger credit), `EDGE-02` (client-only OTP brute-force guard).

---

## 6. OBSERVABILITY BLIND SPOTS (critical workflows with NO coverage)

1. **Payment webhooks** (`razorpay-webhook`, `razorpay-payout-webhook`) — no health probe or failure counter; a silently-failing HMAC/DB path shows only as "user paid but nothing happened."
2. **Cron jobs** (11 pg_cron jobs incl. `subscription-billing-cron`, `milestone-auto-release`) — no visibility into whether a run succeeded, was skipped, or threw.
3. **Edge-function failures** generally — `StatusPage.tsx` checks only client-reachable DB/Realtime/AI/PayPal.
4. **Client error capture is non-functional in practice** (`OBS-03` + `ERR-01`) — the `client_errors` table is the single most important observability asset and it does not receive the data it claims to.
5. **No correlation IDs** across frontend → edge function → DB (`OBS-07`), so even recorded failures cannot be joined.
6. **Public business metrics are placeholders** (`OBS-04`).

---

## 7. REQUIRES RUNTIME / LIVE VERIFICATION

These cannot be conclusively resolved by static reading or a broken build/test toolchain:

1. **`npm run build` on Windows** — the SSR autoImporter `C:\c:\...` bug is platform-specific; confirm whether a Linux/CI/Vercel build succeeds (this determines whether it is a local-dev-only blocker).
2. **`npx vitest run --pool=vmForks`** — 13 failures need to be triaged as harness defects vs. real regressions; cannot be trusted until the pool config is fixed.
3. **Full auth flows** — OAuth callback ladder, OTP, magic link, 2FA enrollment/recovery, and the email-confirm gate require a live Supabase project.
4. **Sentry DSN presence** in the actual production/hosted environment (`OBS-01`).
5. **Razorpay/PayPal live or sandbox payloads** — webhook signature verification, capture idempotency, refund lifecycle, payout terminal states.
6. **`client_errors` insert behaviour** — verify the `event_id`/message defect (`OBS-03`) reproduces against the live schema.
7. **RLS behaviour** under a real non-admin JWT for refund/dispute reads (`EDGE-06`).
8. **Concurrency** — double-click (`EDGE-01`) and rapid resubmit against a real endpoint.

---

*End of audit document.*
