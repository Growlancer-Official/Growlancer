# CLAUDE.md — Growlancer Codebase Guide

Growlancer is an **AI-powered freelancing marketplace** (Upwork/Fiverr-style). This guide is the map for working in this repo — read it before touching code. It is maintained as the codebase evolves; if you find something wrong or missing, update it.

> **Author's note (2026-08-03):** This document was generated from a deep analysis session. It captures architecture, conventions, security model, and known gotchas. It's written to be *correct*, not exhaustive — verify specifics with a targeted search before making assumptions.

---

## 0. ⚠️ MANDATORY — 5-point security checklist (before EVERY change)

Every change (implement/edit/update/delete) in this repo MUST pass the relevant checks before it is committed/pushed. Follow **`SECURITY_CHECKLIST.md`** — it distills the 5 checks from `Growlancer-Security-Audit-Prompts.pdf` (Secrets → Data Flow → Pre-Deploy → Deep escrow/wallet/webhook → Attacker's Perspective). Prior full run is recorded in `SECURITY_AUDIT_REPORT.md`. Re-check the surfaces your diff touches; keep diffs small and reviewable.

---

## 1. What this is

- **Product:** Freelancers find/hire work; clients post projects and hire talent. Escrow payments, real-time chat, AI matching/assistant, Pro subscriptions, wallet + withdrawals, identity verification, certificates, internships, contests, admin dashboard.
- **Status:** Beta, in active production development. Deployed: `growlancer.vercel.app`. India-first launch, Razorpay primary.
- **Repo:** `https://github.com/Growlancer-Official/Growlancer` — proprietary (LICENSE = All Rights Reserved). 322 commits on `main` (also `origin/develop`).

## 2. Tech stack & architecture

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 + **Vike (SSR/prerender)** + TypeScript |
| Styling | Tailwind CSS 3 |
| State | Zustand (minimal), React Context for auth/toast/i18n |
| Backend | **Supabase** — Postgres 17 + Edge Functions (Deno) + Auth + Storage |
| Payments | **Razorpay** (primary, INR) + PayPal (implemented but gated behind `VITE_PAYPAL_ENABLED=false`) |
| AI | OmniRoute (OpenAI-compatible gateway) via raw REST fetch in edge functions (AI SDK deps unused) |
| Monitoring | Sentry (browser, DSN optional via `VITE_SENTRY_DSN`) |
| Deploy | **Vercel** (frontend) + **Supabase** (backend) + GitHub Actions CI |
| i18n | Lightweight hand-rolled provider, `en.json` / `hi.json` |

### High-level architecture

- **Single repo drives both deploys.** Frontend → Vercel from `main`. Backend → Supabase (linked project ref `zttwsjehcgaicziqyxpq`, CLI v2.107.0) via `supabase db push` + `supabase functions deploy <name>`.
- **Vike wraps React Router.** Vike handles SSR + prerender of public pages; `src/app/App.tsx` contains a normal `react-router` `<Routes>` tree nested inside Vike's `<Layout>`. The Vike entry is a single catch-all `pages/@path/+route.ts` (`/*`) that renders `<App />`.
- **Auth-protected routes are client-side only** — never prerendered, lazy-loaded, gated by `<ProtectedRoute>` / `<AdminAuthGuard>`.
- **Data access is centralized** in `src/lib/services/*` (pure functions, no React) + a typed Supabase client in `src/lib/supabase.ts`.
- **Business logic lives server-side** in PostgreSQL (SECURITY DEFINER RPCs, triggers) and edge functions — the client is deliberately "dumb" for anything financial.

### Key directories

```
src/
  app/App.tsx            — React Router tree (all routes)
  components/            — shared UI (ProtectedRoute, RazorpayCheckout, AIChatSupport, NotificationsPanel…)
  context/AuthContext.tsx— global auth state (large, ~1344 lines)
  layouts/               — MainLayout (public), DashboardLayout (freelancer), ClientDashboardLayout, AdminDashboardLayout
  lib/                   — services, supabase client, config, helpers (see §5)
    services/            — authService, cacheManager
  pages/                 — public, dashboard/ (freelancer), client/..., admin/..., auth/...
  types/supabase.ts      — generated DB types (5240 lines); types/auth.ts
  hooks/                 — useCategories, useReferralsData, useAboutPageMetrics
pages/                   — Vike files (+config.ts, +Layout.tsx, +Head.tsx, +onBeforePrerenderStart.ts)
supabase/
  migrations/            — ~110 SQL migrations (source of truth for schema)
  functions/             — 26 Deno edge functions
  seed_*.sql             — demo data
  config.toml            — local dev config (auth redirect URLs, ports)
scripts/                 — build.mjs, auth diagnostic scripts
```

## 3. Run / build / deploy

```bash
npm install            # use npm install, NOT npm ci (React 19 lockfile quirk — CI uses install too)
npm run dev            # Vite dev server on :5173
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run build          # scripts/build.mjs (Vike prerender → copy dist/client→dist → SPA shell fallback → white-screen guard)
npm start / npm run start:prod   # Express SPA server (server.js) — alternative deploy path
```

- **Local Supabase:** `supabase/config.toml` configured (project "GROWLANCER", API on :54321, Postgres :54322). Auth redirect URLs for localhost:5173 are already listed.
- **Frontend deploy:** push to `main` → Vercel builds (`npm run build`) → `dist/` served with SPA rewrite (`vercel.json` rewrites + `public/_redirects` `/* /index.html 200`).
- **Backend deploy — automated:** on push to `main` touching `supabase/`, `supabase-deploy.yml` deploys all edge functions and (gated) runs `db push`. `supabase-check.yml` dry-runs `db push` on PRs. DB auto-push is gated by GitHub variable `SUPABASE_DB_AUTO_PUSH` until migration-drift reconciliation is done — see **`DEPLOYMENT.md`** (the full runbook: secrets, drift reconciliation, manual commands, troubleshooting).
- **Backend deploy (manual):** `supabase db push` and `supabase functions deploy <name>` via the linked CLI (project `zttwsjehcgaicziqyxpq`). Secrets stay in Supabase dashboard / Vercel env vars — never commit. New env vars needed by a change should be flagged.
- **CI:** `.github/workflows/ci.yml` runs typecheck + lint + build on every push/PR to `main`. Red CI blocks deploy.

### Env vars (see `.env.example`)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_SENTRY_DSN`, `VITE_APP_VERSION`. Server-side (edge functions): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OMNIROUTE_API_KEY`, `OMNIROUTE_BASE_URL`, `OMNIROUTE_MODEL`, `RAZORPAY_KEY_ID/SECRET/ACCOUNT_NUMBER`, `RAZORPAY_WEBHOOK_SECRET`, `PAYPAL_*`, `ADMIN_SIGNUP_SECRET`, `CRON_SECRET`, `APP_URL`.

## 4. Build pipeline — the fragile parts (read before changing builds)

`scripts/build.mjs` is a hardened 5-step pipeline with hard-fail guards. Do NOT "simplify" it casually.

1. `npx vite build` (Vike prerenders public URLs from `pages/+onBeforePrerenderStart.ts`).
2. Deterministic manual copy `dist/client/ → dist/` (Vercel's Vite preset expects `index.html` at `dist/`). Must use manual fs copy, not `fs.cpSync`.
3. Validate `dist/index.html` exists; if prerender was skipped, **generate a fallback SPA shell** from the Vite manifest.
4. **White-screen guard:** hard-fails the build if `dist/index.html` lacks `id="root"`, `id="vike_pageContext"`, or `id="vike_globalContext"` — Vike's client router unconditionally reads these on first render and crashes the boot without them. This has bitten production before.
5. Remove stray `dist/404.html` (was overriding Vercel SPA rewrites).

`vite.config.ts` also has a `vercel-output-workaround` plugin doing the same copy via `closeBundle` (belt & suspenders). Legal pages inject a git-derived `Last Updated` via `__LEGAL_LAST_UPDATED_ISO__` define.

## 5. Frontend data-access conventions

- **`src/lib/supabase.ts`** — the single Supabase client (created synchronously; **`flowType: 'implicit'`** — see §7). Exports:
  - `tables.*` — typed table accessor helpers.
  - `dbFunctions.*` — typed RPC callers. When you add an RPC in SQL, add a matching wrapper here (and to the `RpcName` union) so the frontend stays type-safe.
  - `realtimeChannels.*` — channel factory that appends `:scope:counter` so multiple subscriptions don't hit "cannot add callbacks after subscribe()". Use `realtimeChannels.X(scope).on('postgres_changes', {...}).subscribe()`.
  - `clearSupabaseAuthStorage()`, `isStaleSessionError()` — auth-session hardening helpers.
- **`src/lib/services/`** — `authService.ts` (profile fetch/create, MFA, account deletion) and `cacheManager.ts` (LRU query cache, 6s TTL, `invalidate(pattern)`). Services are pure; pages hold state.
- **`src/lib/dataService.ts`** — big service objects: `projectsService`, `proposalsService`, `contractsService`, `escrowService`, `invitesService`, `transactionsService`. Common pattern: query → filter out **soft-deleted/hard-deleted users** via joined `profiles(deleted_at)` → map/cache. Any new list query that shows public profiles should do the same deleted-user filter.
- **`src/lib/workflowService.ts`** — end-to-end hire flows (`hireFreelancerFromProposal`, etc.) prefer RPC `create_contract_with_escrow`, fall back to `contractsService.createFromProposal`.
- **Route config:** `src/routes.ts` (`ROUTES`, `NAVIGATION`, `PLATFORM_CONFIG`, `DISPOSABLE_EMAILS`). Central config: `src/lib/config.ts` (fees, limits, plans — note `platform_percentage: 5`).
- **Errors/telemetry:** `src/lib/telemetry.ts` (`captureError`/`captureInfo` — currently console-based placeholder).

## 6. Auth subsystem (dense — read the referenced files before touching)

Auth is the most heavily reworked, most fragile area. **Many production bugs lived here.**

- **Client:** `src/lib/supabase.ts` (client), `src/context/AuthContext.tsx` (state/flow), `src/pages/AuthCallbackPage.tsx` (post-auth hub), `src/pages/auth/*`, `src/lib/services/authService.ts`, `src/lib/authAction.ts` (`getPostAuthPath`/`redirectAfterAuth`), `src/lib/rateLimiter.ts` (client login delay), `src/components/ProtectedRoute.tsx`, `ReauthDialog.tsx`.
- **Flow:** email/password signup + login, OAuth (GitHub + LinkedIn), email verification, password reset, magic link, OTP login. Signup requires a role, generates a referral code, and can auto-login after `createUserProfile`.
- **`flowType: 'implicit'` is a deliberate, hard-won decision.** With `pkce`, clicking a confirmation email link on a *different browser/device* than signup fails because the `code_verifier` lives in the signup browser's localStorage. Implicit flow delivers tokens in the URL hash → works cross-device. Do not flip back to pkce without understanding this.
- **Roles:** `freelancer | client | admin`. `ALLOWED_SIGNUP_ROLES = ['freelancer','client']` (no self-serve admin). `normalizeRole` rejects unknown roles. Profiles created via `create_user_profile` SECURITY DEFINER RPC (bypasses RLS for unverified users); fallbacks handle duplicate-email-after-delete.
- **OAuth callback page owns everything** on `/auth/callback` (profile creation, role correction, country gate, redirect). `AuthContext.syncAuthUser` must NOT sign out, create, or consume `growlancer_oauth_role` there — that was the "login works but bounces back" bug.
- **✅ FIXED (2026-08-03) — OAuth session race.** `AuthCallbackPage` now has a race-free fallback: `getSession()` only reads localStorage, and supabase-js's `_initialize`/`detectSessionInUrl` is triggered lazily by `AuthProvider`'s `onAuthStateChange` — AFTER this child effect. So on a fresh GitHub/LinkedIn round-trip the session wasn't in storage yet → "Processing → back to login". The callback now builds the session directly from the URL-hash tokens via `setSession()` (hash params captured at the top of the effect, before the URL can be cleared).
- **Email verification recommendation:** `src/components/EmailVerificationBanner.tsx` shows in client + freelancer settings when `email_confirmed_at` is null, with a resend button — hidden once verified.
- **Redirects use `window.location.replace`** (full reload), not SPA `navigate`, to avoid the ProtectedRoute "navigate-while-user-null" bounce race.
- **Country gate:** OAuth users without a country get the gate; India → `update_user_country` RPC + proceed, other → waitlist.
- **Admin auth:** separate from the profile role system. `profiles.is_admin` OR `role='admin'`; `AdminAuthGuard` + `AdminLoginPage` (real `signInWithPassword` then admin check); persisted `growlancer_admin_session`; `admin-signup` edge function (rate-limited 5/15min/IP, constant-time `ADMIN_SIGNUP_SECRET` compare, `grant_admin_role` RPC). Old `admin_credentials` table is deprecated.
- **MFA:** TOTP via `supabase.auth.mfa` + recovery codes (bcrypt-hashed in `recovery_codes`) + backup email, mirrored in `twofa-management` edge function. All `*_mfa` RPCs enforce `auth.uid() = p_user_id` (IDOR was fixed).
- **Account deletion:** request (7-day cooldown) → process (cron + `process-deletion` edge function, fail-closed auth: `CRON_SECRET` header or admin) → `delete_user_all_data` RPC (cascades ~26 tables) → `auth.users` delete.
- **Stale-session handling:** `clearSupabaseAuthStorage()` force-removes `sb-*-auth-token*` keys; `isStaleSessionError()` only treats 401/user-not-found as dead (transient errors must never log out legit users). Periodic profile checks, BroadcastChannel cross-tab sync (`growlancer_auth_sync`), 24h inactivity logout — all present in AuthContext.
- **Profile creation race protection:** `profileCreationInProgressRef` guard; DB trigger creates profile row synchronously on `auth.users` insert.

## 7. Payments & finance subsystem

- **Money model:** Client pays contract amount + 5% platform fee; freelancer receives the amount. Escrow holds funds until release. Razorpay = primary gateway (INR); PayPal gated.
- **Key tables:** `contracts`, `escrow`, `transactions`, `wallets` (balance/pending_balance/escrow_balance), `razorpay_orders`/`razorpay_transactions`, `paypal_orders`/`paypal_transactions`, `withdrawals`, `payout_methods`, `payment_methods`, `refunds`, `refund_requests`, `disputes`, `platform_revenue`, `invoices`, `ledger_entries`, `payment_webhook_events`, `payment_audit_logs`.
- **Critical RPCs (all SECURITY DEFINER, in migrations):**
  - `create_contract_with_escrow` — validates amount>0 & ≤100000, proposal ownership, project ownership; creates contract+escrow+workspace. **NOTE: this RPC computes `freelancer_amount = amount − 5%` (fee deducted from freelancer), which contradicts `contractsService.createFromProposal` (fee added on top, freelancer gets 100%). The fee model is inconsistent between paths — confirm before changing either.**
  - `fund_escrow` — now **requires a captured payment order** (`razorpay_orders.status='captured'` or paypal equivalent) — prevents funding escrow without paying.
  - `release_escrow` — releases escrow, credits freelancer wallet, and calls `_book_escrow_release` (idempotent: platform_revenue + invoice + double-entry ledger + audit + notifications).
  - Wallet RPCs (`get/update/hold/release_wallet_balance`, `process_withdrawal_complete`, `cancel_withdrawal`) — all enforce `auth.uid()`. **`update_wallet_balance` is REVOKED from anon/authenticated/PUBLIC** (free-money exploit) — service-role/internal only.
  - Refund/dispute system (`20260921000000_refund_dispute_system.sql`): `request_contract_refund`, `admin_decide_dispute`, `_refundable_amount`, `_mark_revenue_refunded`, etc.
  - `get_finance_stats()` — admin revenue dashboard (admin-only).
  - `process_stale_withdrawals()` — cron every 15min, fails stuck payouts and returns funds (never double-pays).
- **Razorpay webhook** (`razorpay-webhook/index.ts`): HMAC-SHA256 signature over raw body, idempotency via `payment_webhook_events.event_id`, reconciles unverified orders, funds escrow once via `admin_fund_escrow`, writes audit trail. **Never process unsigned webhooks.**
- **Finance automation** (`20260922000000_financial_automation.sql`): double-entry ledger, auto-invoices (`GL-YYYYMM-NNNNNN`), `platform_revenue` commission ledger — everything booked server-side, frontend never calculates.
- **Schema-drift history:** `transactions` and `withdrawals` had columns fixed in later migrations (`20260920000000`, `20260923000000`, `20260922000000`). When touching these tables, check the *latest* migration — the base schema and earlier migrations may be stale.
- **✅ FIXED (2026-08-03, edge-function deploy pending) — UI withdrawals now actually pay out.** Previously `withdrawalService.createWithdrawal` held funds + inserted a `withdrawals` row directly (fee 0) and NEVER called the payout edge function — withdrawals sat `pending` until the stale cron failed them. Now `createWithdrawal` routes through the `withdrawal` edge function POST (server-side balance/amount validation, fee, hold, real RazorpayX/PayPal payout, rollback). Also added `process_withdrawal_complete` on successful payout so `pending_balance` is cleared (previously money stayed stuck there forever).
- **✅ FIXED (2026-08-03, edge-function deploy pending) — milestone funding overcharge.** The `razorpay` fn's `create_order` read `escrow.milestones` (no such column) → sum=0 → charged the FULL contract amount when funding selected milestones. Now reads `contracts.milestones` (JSONB) server-side.
- **⚠️ Milestone funding:** milestones live on `contracts.milestones` (JSONB), NOT `escrow` (which has no `milestones` column). When touching milestone funding, read from the contract.
- **Recurring billing is not implemented:** both gateways create one-time capture orders; `subscription-billing-cron` "renews" by extending dates without charging. `subscribeToPlan` activates paid plans before collecting payment.
- **Two competing dispute systems:** the legacy `src/lib/disputeService.ts` writes `disputes` statuses (`pending`, `under_review`, `resolved`, `dismissed`) that violate the new `disputes_status_check` (only `open|investigating|resolved_refunded|resolved_released|cancelled|escalated`) — those inserts fail. The new system is `refundService.ts` RPCs + `admin_decide_dispute`.
- **`refund_payment` manual action** doesn't reverse escrow/`refund_requests` (only the refund webhook does). A lost webhook = stuck refund (retry guard skips non-failed refunds).
- **Escrow-balance diverges by path:** user-verify path uses `fund_escrow` (no wallet `escrow_balance` credit); webhook path uses `admin_fund_escrow` (credits `escrow_balance`); `admin_reverse_escrow` debits it.
- **`CRON_SECRET` is committed in a migration** (`refund_dispute_system.sql`, hardcoded hex) — repo access grants the value that authorizes `execute_refund`. Rotate/secret-ify when possible.
- **Field mismatch:** frontend sends `method`; the withdrawal edge fn expects `withdrawal_method`/`payout_mode`. Fee is `0` in the UI vs 2.9%/2.0% server-side.

## 8. AI subsystem

- **AI runs on OmniRoute** (OpenAI-compatible gateway; env-driven `OMNIROUTE_BASE_URL`/`API_KEY`/`MODEL`). All AI functions fail gracefully to deterministic behavior when the gateway is unreachable.
  - **AI Chat Assistant** (`ai-assistant/index.ts`) — OmniRoute, server-side, role-specific system prompts (freelancer vs client). **Unlimited for both roles** (clients are 100% free; no usage-gating since 2026-08-07). Rate limited 30/60s. Streams SSE to `AIChatSupport.tsx`.
  - **Ticket responder** (`ai-ticket-responder/index.ts`) — same OmniRoute model; inserts a reply into `ticket_messages` and sets ticket to pending. ⚠️ Wired but fragile (see gotchas).
  - **Talent matching** (`ai-matching/index.ts` + client `src/lib/aiMatching.ts`) — real-time deterministic scoring (category overlap, budget, rating) + optional OmniRoute semantic boost with graceful fallback. Writes to `ai_matches`.
- **`ai_matches` table** is the live match table (project_id, freelancer_id, ~10 sub-scores, match_score, unique(project, freelancer)). Written by the RPC or client-side service.
- **Client consumption:** `AIChatSupport.tsx` (streaming, upgrade gate, escalation-to-ticket), `dashboard/AIAssistantPage.tsx` & `ClientAIAssistantPage.tsx` (same component, different `context` prop → different system prompt).

## 9. Marketplace core workflows

- **Lifecycle:** post project (`projects.status='open'`) → match (`generate_project_matches` / client-side matching) → invite (7-day expiry; accepting triggers DB trigger `after_invite_accept_contract` → `create_contract_workspace_from_invite`) → proposal (duplicate-check only; **daily limit `max_proposal_per_day:20` is NOT enforced in code**) → hire (`workflowService.hireFreelancerFromProposal` → `create_contract_with_escrow` RPC or `contractsService.createFromProposal` fallback) → escrow → workspace → milestone → review.
- **⚠️ Project status inconsistency:** RPC paths set project `status='active'`; client-service paths set `'in_progress'`. Open feed only shows `status='open'`. Components must handle both.
- **⚠️ Workspace:** only the RPC path creates a workspace; the `createFromProposal` fallback leaves a contract with no workspace.
- **Messaging:** `messages` table; realtime `subscribeToMessages(userId)` is UNFILTERED (receives every message INSERT — must verify membership). Recent perf fix (`1a80aac`): conversations page does per-contract `.limit(1)` latest-message queries + a lightweight unread count instead of unbounded scans.
- **Notifications:** `notifications` table + edge function (`notifications/index.ts`, rate 30/min) + realtime + push tokens + preferences + archives. Some emitted types (`proposal_accepted`, `internship_application`) aren't in the icon/label maps — they render as generic bell.
- **Reviews:** `reviews` edge function validates contract participation + no duplicates, recomputes freelancer rating via `get_reputation_stats`. Rate 20/min.
- **Categories ecosystem:** **145 top-level categories** (deliberate "category-first" pivot). `categories`/`subcategories`/`skills` tables (seeded). `useCategories` loads the 145 directly (the old nested-hierarchy RPC was retired as too heavy). `get_category_counts_v2` gives per-category open-project + active-service counts. Matching requires a category overlap.
- **Contests & internships:** contests (prizes, submissions, votes) and internships (resume upload to bucket, edge-function submissions). Internship roles are all `isOpen: false` (hard-coded).
- **Support tickets:** `support_tickets` + `ticket_messages`. Realtime subquery filter (`user_id=in.(select...)`) does NOT work in Supabase Realtime.
- **Email sending is globally disabled** — Brevo removed; `sendNotificationEmail` stubs just log and return `false`. Only Supabase Auth's built-in sender (magic link/verification) actually sends. Do not assume "we emailed you" flows work.

## 10. Security model & conventions (read before writing SQL)

- **RLS is the norm** — nearly every table has `ENABLE ROW LEVEL SECURITY` + policies. New tables must enable RLS.
- **Sensitive operations go through SECURITY DEFINER RPCs** that check `auth.uid()` — never expose raw table writes for financial/mfa/deletion/referral data.
- **GRANT discipline:** functions default to PUBLIC execute — explicitly `REVOKE ... FROM PUBLIC` + re-grant to `anon`/`authenticated`/`service_role` as appropriate. Service-role-only for money-moving internals (`update_wallet_balance`, `_book_escrow_release`, `grant_admin_role`, `admin_fund_escrow`, `admin_reverse_escrow`).
- **Edge functions:** use anon key + caller's `Authorization` header to identify the user; never trust a body-supplied userId. Rate-limit via the shared `rate_limits` table + `cleanup_expired_rate_limits`. CORS via hardcoded `ALLOWED_ORIGINS` allowlist. Webhooks verify HMAC signatures over the **raw body** and are idempotent.
- **Audit trail:** `insert_payment_audit_log` for all money events.
- **Abuse hardening** (`20260918000000_abuse_hardening.sql`): message rate limit trigger (30/min), trial guard (one trial per email ever, verified-email required), referral anti-abuse (unique claim, no self-referral).
- **Suspend/delete:** profiles have `deleted_at` (soft) and `suspended_at`. Suspended users are treated as non-existent (`fetchUserProfile` returns null). Deleted-user filtering in every public list.

## 11. Known gotchas & landmines (learned the hard way)

1. **`flowType` is `'implicit'`** — do not change (see §6).
2. **Never flip auto-confirm email triggers casually.** Multiple migrations flip email auto-confirm on/off (`20260726000000_disable_auto_confirm_enable_brevo`, `20260806000000_restore_auto_confirm_trigger`, `20260907000000_re_enable_auto_confirm`, `20260916000000_disable_auto_confirm_enable_email_verification`, `20260915000000_restore_auto_confirm_trigger`). The intent is email verification via Supabase's built-in sender, with auto-confirm as a fallback when SMTP is absent. Understand the current live state before touching.
3. **White-screen guard** in `build.mjs` must never be bypassed.
4. **Schema drift:** several tables (transactions, withdrawals, escrow, usage_logs) were patched post-hoc. Read the LATEST migration for the true column set. The typed `src/types/supabase.ts` is generated and may lag migrations — extended tables/RPCs are union-typed in `supabase.ts`.
5. **Dangling RPC refs exist:** `calculate_match_score`, `get_project_matches_advanced`, `get_monthly_ai_usage`, `get_category_hierarchy` are typed/called but have no SQL definition (or no callers). `ai-matching` edge function and `project_matches` (legacy) table are dead.
6. **`usage_logs` schema mismatch:** migrations define `feature`/`count` but AI code writes `feature_type`/`usage_count` — the live DB was patched manually. Be aware when touching usage counting.
7. **Not all "AI" is AI** — talent matching is heuristics. Don't promise LLM behavior for it.
8. **Client-side rate limiter resets on refresh** — it's a UX delay only; server-side (edge functions + `rate_limits` table) is the real protection.
9. **Notification realtime subquery filters don't work** — use `eq`/`in` on plain columns only.
10. **CORS fallback:** unknown origins silently get `ALLOWED_ORIGINS[0]` headers. Acceptable for now; test any new domain.
11. **`contractsService.createFromProposal` vs RPC fee model differ** (see §7) — changing one without the other breaks money math.
12. **AI usage double-counting:** `AIChatSupport` inserts a `usage_logs` row AND the `ai-assistant` edge function inserts one too — free users get counted twice. Also, the client counts the last 30 days while the server counts the calendar month.
13. **`ai_matches` RLS gap:** migrations only define a SELECT policy for `ai_matches` (own freelancer). The client-side write path (`aiMatching.ts` delete+insert) and client reads would be RLS-denied per the migrations — the live DB was patched manually. Verify before adding client writes.
14. **Ticket-responder prompt injection:** ticket `subject`/`description` go straight into the OmniRoute prompt with only a light filter in `ai-assistant`; the `ai-ticket-responder` has none.
15. **`notificationPreferencesService.resetToDefaults`** — **FIXED (2026-08-03)**: upserted `{ categories: ... }` but the table column is `preferences`; now uses the correct column.
16. **`getUserReviews` averages only the latest 50 reviews** (disagrees with DB-side `get_reputation_stats`).
17. **`invitesService.resend` rewrites `created_at`** — **FIXED (2026-08-03)**: no longer mutates the history timestamp.
18. **Internship GET/PATCH endpoints** — **FIXED (2026-08-03, deployed)**: `internship-applications` GET/PATCH now require an authenticated admin (403 otherwise); POST stays public for applications.
19. **`create_contract_with_escrow` uses `ON CONFLICT DO NOTHING` with no conflict target** (no-op) and paper-overs by selecting the latest existing contract — duplicate contracts are possible.
20. **Notification UI ignores realtime DELETEs** (`NotificationsPanel`/`NotificationToastBridge` only handle INSERT/UPDATE).
21. **`useCategories` realtime-refetches on every open-project/service change** — chatty at scale.
22. **`supabase.functions.invoke` is used for notifications/proposals** and other client→edge-function calls; edge functions authenticate from the caller's JWT.

## 12. Testing

- **No automated tests exist** (no test files, no test runner configured). Quality is guarded by `npm run typecheck` + `npm run lint` + `npm run build` (CI) and manual QA.
- If you add meaningful logic, consider at least a typecheck-clean + build-green change; CI is the safety net.

## 13. Common tasks cheat-sheet

| Task | Where to look |
|---|---|
| Add a DB table/column | New migration in `supabase/migrations/` → typed helper in `src/lib/supabase.ts` → RLS policies |
| Add a server RPC | Migration `create or replace function ... security definer` + GRANTs → `dbFunctions` wrapper + `RpcName` union |
| Add/modify an edge function | `supabase/functions/<name>/index.ts` (Deno) → deploy `supabase functions deploy <name>` |
| Add a page | `src/pages/...` → route in `src/app/App.tsx` (eager import if public/SSR, lazy if protected) → nav in `src/routes.ts` |
| Add a service | `src/lib/` service module following `dataService.ts` patterns → import in pages |
| Fix auth flow | `AuthContext.tsx`, `AuthCallbackPage.tsx`, `authService.ts`, `authAction.ts` |
| Fix payments | Razorpay: `razorpay/index.ts`, `razorpay-webhook/index.ts`, `src/lib/razorpay.ts`; escrow RPCs in migrations |
| Realtime | Table must be in `supabase_realtime` publication (see migration `20260711000001` pattern) + `realtimeChannels` |

---

*Generated 2026-08-03 from a deep analysis session. All five subsystems mapped (framework, auth, AI, marketplace, payments/finance). Findings are maintained here as the codebase evolves.*
