# Growlancer Security Audit Report

**Audit date:** 2026-08-02
**Scope:** All 5 checks from `Growlancer-Security-Audit-Prompts.pdf` (Secret Leak Prevention → Attacker's Perspective Review)
**Target:** React 19 + Vike (SSR) + Express + Supabase · Razorpay + PayPal · escrow/wallets · Supabase Auth + custom MFA · Gemini AI · admin Edge Functions

**Status: 5/5 checks completed. Migration applied to production (`zttwsjehcgaicziqyxpq`), 14 Edge Functions redeployed.**

---

## Check 1 — Secret Leak Prevention

### What was found
| # | Finding | Severity |
|---|---------|----------|
| 1.1 | **PII + sensitive data in `console.log`** across Edge Functions: `admin-data` logged recipient emails *and* certificate verification codes; `withdrawal`, `email-notifications`, `internship-applications`, `newsletter-subscribe`, `proposal-notifications`, `subscription-billing-cron` logged recipient email addresses. | Medium |
| 1.2 | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` correctly client-side only (anon key is public by design — safe **only if RLS covers every table**). | Info |
| 1.3 | Service-role key, `eyJ` JWTs, payment keys: **not found** in `src/` — correctly isolated to Edge Functions. | Pass |

### What was fixed
- **PII-safe logging** — removed recipient emails / verification codes from logs in 7 Edge Functions (`admin-data`, `withdrawal`, `email-notifications`, `internship-applications`, `newsletter-subscribe`, `proposal-notifications`, `subscription-billing-cron`). Subjects only.
- **RLS verified live on production** — query of `pg_class` for the `public` schema returned **zero tables without RLS** (credential tables included after Check 4 fix).

### Accepted risk
- **Razorpay keys are not configured in production at all** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_ACCOUNT_NUMBER` all absent). The `razorpay` function now **fails closed** (returns 500 "Payment service is not configured") until they're set. Zero orders/saved cards exist in prod, so nothing breaks today.
- **`PAYPAL_WEBHOOK_ID` not set** — pre-existing fail-closed (webhook processing disabled). `PAYPAL_SANDBOX=true` means PayPal runs in sandbox mode.
- **No real transactional email is sent** — Brevo was removed; email functions are stubbed (logged, not delivered).

---

## Check 2 — Personal Data Flow Audit

### What was found
| # | Finding | Severity |
|---|---------|----------|
| 2.1 | **Credential verification tables had NO RLS** — `credential_verification_tokens` (raw QR verification tokens), `credential_version_history`, `credential_audit_logs` (admin emails/IPs). Anyone with the anon key could read raw verification tokens via PostgREST. | **High** |
| 2.2 | PII (recipient emails) written to function logs (same as 1.1). | Medium |
| 2.3 | AI flow: `ai-assistant` accepted `user_id` from the **request body** — anyone could impersonate another user and exhaust their AI quota. | **High** |
| 2.4 | MFA recovery codes verified **hashed** (bcrypt `crypt()`) before storage — single-use flag enforced. | Pass |

### What was fixed
- **RLS enabled** on all 3 credential tables (deny-everything for anon/authenticated; SECURITY DEFINER RPCs and service-role admin-data unaffected).
- **PII-safe logging** (shared with Check 1).
- **`ai-assistant` identity from JWT** — `auth.getUser()` replaces body-supplied `user_id`; body user_id rejected. JWT required (401 otherwise).
- **MFA TOTP secret** verified not returned post-setup; recovery codes bcrypt-hashed, single-use.

### Accepted risk
- **AI data sent to Gemini**: message content / project context is still sent (required for the feature). Fields the AI doesn't need (payment, KYC, contact) are not sent; identity now server-derived.
- **Account erasure** (`request-deletion` → `process-deletion`): the SQL erasure functions (`delete_user_all_data`) exist and are ownership-checked; `process-deletion` now requires `CRON_SECRET` or admin JWT — but **no cron caller is configured**, so scheduled processing is dormant until a cron is added (admin-triggered deletion still works).

---

## Check 3 — Pre-Deploy Production Audit

### What was found
| # | Finding | Severity |
|---|---------|----------|
| 3.1 | **`server.js` had no security headers** — no `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, or CSP. | **High** |
| 3.2 | **CSP blocked the app's own assets** — `vercel.json`/`server.js` CSP had `style-src 'self'` and `font-src 'self' data:` but the app loads Google Fonts + Fontshare; `connect-src` lacked `wss://*.supabase.co` (realtime) and the real Sentry ingest DSN. Fonts/branding were broken. | Medium |
| 3.3 | Edge Functions **silently continued** when payment/AI keys were missing (empty-credential API calls instead of clear failures). | Medium |
| 3.4 | `server.js` lint issues (Node globals, unused `next` in error handler). | Low |

### What was fixed
- **Security headers added** to `server.js` (nosniff, DENY framing, HSTS, full CSP).
- **CSP fixed in `vercel.json` + `server.js` + `nginx.conf`** — allows `fonts.googleapis.com`, `fonts.gstatic.com`, `api.fontshare.com`, `wss://*.supabase.co`, Sentry ingest, `checkout.razorpay.com`, PayPal SDK domains.
- **Fail-loud env checks** added to `razorpay`, `paypal`, `ai-assistant` (log at boot + fail-closed 500 at request time) and `razorpay-payout-webhook` (fail-closed on missing webhook secret).
- **`server.js` lint cleaned** (`/* eslint-env node */`, `_next` rename).
- **Rate limiting confirmed** — DB-backed `rate_limits` enforced in 16 functions (withdrawal, paypal, razorpay, 2fa-management, ai-*, avatar/file upload, admin-data, admin-signup, etc.); added to `ai-ticket-responder` (new, 10/min).

### Accepted risk
- **Missing secrets make features fail closed** (see Check 1) — intended behavior, but requires setting `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` and `CRON_SECRET` to activate payments/cron.
- No dedicated OTP/login Edge Function exists (login is Supabase-native); Supabase Auth's built-in rate limiting applies.

---

## Check 4 — Deep Security Audit (escrow / wallets / webhooks / MFA)

### What was found (the big one)
| # | Finding | Severity |
|---|---------|----------|
| 4.1 | **MFA RPCs had no ownership checks** — `get_mfa_status`, `generate_recovery_codes`, `verify_recovery_code`, `get_recovery_codes_count`, `enable_user_mfa`, `disable_user_mfa` accepted any `p_user_id`: read another user's plaintext recovery codes (**account takeover**), force-enable/disable a victim's 2FA. | **Critical** |
| 4.2 | **Account-deletion RPCs had no ownership check** — `request_account_deletion`, `cancel_account_deletion`, `check_deletion_status` (IDOR). | **High** |
| 4.3 | **`get_wallet_balance` IDOR** — read any user's wallet balance. | **High** |
| 4.4 | **`update_wallet_balance` = free money** — any authenticated user could credit their own wallet arbitrarily, then withdraw. **Plus a PUBLIC EXECUTE grant** (default grant) left it callable by anon even after the initial REVOKE — caught during live verification and closed. | **Critical** |
| 4.5 | **`fund_escrow` without payment** — client could mark escrow funded (no captured Razorpay/PayPal order required), then release to freelancer → platform loses money. | **Critical** |
| 4.6 | **`create_contract_with_escrow`** — no amount validation (zero/negative/absurd), no proposal/project ownership check. A legacy **integer overload** had `auth.uid() IS NOT NULL AND auth.uid() != p_client_id` which passes vacuously for anon → anyone could create contracts as any client. | **Critical** |
| 4.7 | **Referral RPCs unauthenticated** — `process_referral`/`complete_referral` could link arbitrary accounts; **referral RLS** let any authenticated user UPDATE any referral row (mark own referral completed → claim rewards). | High |
| 4.8 | **`razorpay create_payout` fund-drain** — any authenticated user could trigger a payout to an arbitrary fund account. | **Critical** |
| 4.9 | **Client-submitted amounts trusted** — `razorpay`/`paypal` `create_order` used body `amount`; refund had no ownership check; PayPal cancel no ownership check. | **High** |
| 4.10 | **`razorpay-payout-webhook` fail-open** — signature verified only "if configured"; unverified payouts could be marked complete. | **High** |
| 4.11 | **`paypal-webhook` raw SQL interpolation** in `transactions` update (`.filter('metadata->>withdrawal_id', 'in', \`(select ...)\`)`). | Medium |
| 4.12 | **`process-deletion` auth spoof** — `authHeader.includes('service_role')` string check → anyone appending "service_role" to a header triggered use of the real service-role key for arbitrary user deletion. | **Critical** |

### What was fixed
**Migration `20260917000000_security_hardening.sql` (applied to production):**
- `auth.uid() = p_user_id` checks on all 13 hardened RPCs (MFA ×6, deletion ×3, wallet, escrow ×2, referral ×2).
- `update_wallet_balance` — REVOKE from `PUBLIC` + `anon` + `authenticated`; `service_role` only (ACL verified live: `{postgres, service_role}`).
- `fund_escrow` — requires a **captured** `razorpay_orders`/`paypal_orders` row; owner-checked.
- `create_contract_with_escrow` — amount `> 0` and `≤ 100000` (aligned with gateway caps), proposal belongs to freelancer + project belongs to client; **legacy integer overload dropped**.
- Referral RLS tightened (participant-only read/update; own-row insert/update; SELECT kept open for the leaderboard).
- RLS enabled on the 3 credential tables.

**Edge Functions (14 redeployed to production):**
- `razorpay` — server-side amount recompute from DB (never trusts body), order-owner check on `verify_payment`, refund owner/admin check, **`create_payout` disabled** (403 → use `withdrawal`).
- `paypal` — fail-closed creds, authoritative amount from contract/subscription-plan/service, subscription-cancel ownership check.
- `paypal-webhook` — capture-amount mismatch guard + parameterized transaction update.
- `razorpay-payout-webhook` — fail-closed HMAC signature verification.
- `process-deletion` — CRON_SECRET or verified admin JWT (spoof check removed).
- `ai-assistant` — JWT identity; `ai-ticket-responder` — rate limiting.

### Accepted risk
- **Trial restart abuse** (delete account + re-signup with a *new email* restarts the free trial) — not fully preventable without device fingerprinting; accepted as industry-standard limitation.
- **Self-referral via second account** — mitigated by email verification + the new `process_referral` auth check; a determined attacker can still farm with new verified emails. Accepted.
- Messaging spam — messaging is realtime/DB-driven; no dedicated server-side per-user send throttle beyond Supabase limits. Accepted for now.

---

## Check 5 — Attacker's Perspective Review

### What was found
| # | Finding | Severity |
|---|---------|----------|
| 5.1 | IDOR on wallet / MFA / deletion RPCs (Check 4.1–4.3) — attacker substitutes another user's ID. | **Critical** |
| 5.2 | Admin bypass via spoofable `service_role` header (Check 4.12). | **Critical** |
| 5.3 | Free-money via `update_wallet_balance` (Check 4.4) and escrow-without-payment (Check 4.5). | **Critical** |
| 5.4 | AI cost-abuse — `ai-assistant` unauthenticated + unthrottled (Gemini LLM credits per call). | High |
| 5.5 | Missing RLS on credential tables (Check 2.1). | **High** |
| 5.6 | Referral farming (Check 4.7). | High |
| 5.7 | Content injection — free-text fields (bio, review, messages, ticket): verified rendered safely by React (no `dangerouslySetInnerHTML` on user content found in audit paths). | Pass |

### What was fixed
- All Check-4 fixes (IDOR, admin auth, escrow, wallet, referral).
- `ai-assistant` now JWT-gated + rate-limited; `ai-ticket-responder` rate-limited; `razorpay`/`paypal` rate-limited.
- RLS coverage verified 100% on `public` tables (live check).
- **OAuth email-confirmation flow** (follow-up hardening): unconfirmed-email GitHub/LinkedIn users are routed to a real-time verify-email gate instead of entering onboarding unverified; `ProtectedRoute` routes unconfirmed OAuth users correctly; onboarding → dashboard redirect is real-time.
- Internal exposure: `.env`, `supabase/.temp`, `.git` not served by Vercel config; `_health` returns plain status only.

### Accepted risk
- **Business-logic edge cases** — promo/discount double-apply on the same contract wasn't deep-verified (no promo engine surfaced in audit paths); escrow amount caps now enforced server-side.
- **No human security review yet** — the PDF itself notes this audit is a complement to, not a replacement for, professional testing before public launch (real money flows through Razorpay/PayPal escrow).

---

## Deployment status

| Item | Status |
|------|--------|
| Migration `20260917000000_security_hardening.sql` | ✅ Applied to prod; `user_invitations` tracked as `20260917000001`; migration list clean |
| 14 Edge Functions redeployed | ✅ razorpay, paypal, paypal-webhook, razorpay-payout-webhook, admin-data, process-deletion, ai-assistant, ai-ticket-responder, withdrawal, email-notifications, internship-applications, newsletter-subscribe, proposal-notifications, subscription-billing-cron — all ACTIVE |
| Legacy vulnerable overload dropped | ✅ `create_contract_with_escrow(uuid,uuid,uuid,integer,uuid)` removed |
| Typecheck + lint | ✅ Clean |
| Code review | ✅ Reviewed, all findings resolved |

## Blocking follow-ups (before going live with payments)
1. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (unlock Razorpay payments/payouts — currently fail-closed).
2. Set `PAYPAL_WEBHOOK_ID` + switch `PAYPAL_SANDBOX=false` for real PayPal webhooks.
3. Configure the `CRON_SECRET` + scheduler for `process-deletion` if you want automated GDPR erasure.
4. Restore a transactional email provider (Brevo was removed) for welcome/verification/notification emails.
5. Human security review of the wallet/withdrawal RPCs before public launch (per PDF guidance).
