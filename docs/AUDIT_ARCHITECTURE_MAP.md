# Growlanzo — Architecture Map (Forensic Audit Reconnaissance)

> Scope: READ-ONLY reconnaissance. This document maps the system as observed in the repository at
> `c:/Users/mdmir/Documents/GROWLANCER`. No source code was modified. Where a fact could not be
> determined from the files, it is marked `UNKNOWN — not found`.
>
> Repository scale (observed via file listing/search):
> - 33 Supabase Edge Functions (`supabase/functions/*`) + 3 shared modules (`_shared/*`).
> - 200+ SQL migrations in `supabase/migrations/` (directory listing truncated at 200 entries; the
>   series spans `20240511_*` → `20270118_*`, with additional files beyond the truncation point,
>   e.g. `20261214_*`, `20261227_*` referenced from search results).
> - ~100 distinct database tables (110 `CREATE TABLE` statements found across migrations; some
>   tables are re-created/reconciled by later migrations).
> - 59 `ENABLE ROW LEVEL SECURITY` statements observed.
> - 82 `CREATE TRIGGER` statements and 300+ `CREATE FUNCTION`/`CREATE OR REPLACE FUNCTION` matches
>   (many are re-definitions of the same routine across successive "fix" migrations).
> - 11 pg_cron jobs, 10 storage buckets.

---

## 1. Stack Inventory

| Concern | Observed value | Evidence |
|---|---|---|
| UI framework | React `^19.0.0` (+ `react-dom ^19.0.0`) | `package.json` |
| SSR / meta-framework | **Vike `^0.4.260`** + `vike-react ^0.6.25` (NOT a plain Vite SPA) | `package.json`, `vite.config.ts` (`vike()` plugin), `pages/` |
| Language | TypeScript `^5.3.3` — **`strict: false`** and every strict sub-flag disabled | `tsconfig.json` |
| Build tool | Vite `^8.0.16` (custom build wrapper `node scripts/build.mjs`) | `package.json`, `vite.config.ts` |
| Package manager | **npm** (`package-lock.json` present; no `yarn.lock` / `pnpm-lock.yaml`) | repo root |
| Test framework | Vitest `^4.1.11` (jsdom, threads pool, `maxWorkers: 1`, v8 coverage) + `@testing-library/react` | `vitest.config.ts`, `package.json` |
| Lint / format | ESLint `^8.56` (typescript-eslint, react-hooks, prettier config); Prettier `^3.2.5` | `.eslintrc.cjs`, `.prettierrc` |
| CSS / styling | TailwindCSS `^3.4.1` + `tailwindcss-animate`; custom Fontshare fonts (Satoshi, Cabinet Grotesk) | `tailwind.config.js`, `index.html` |
| Routing | `react-router-dom ^6.22.0` (client router inside `App.tsx`) | `package.json`, `src/app/App.tsx` |
| State management | React Context only (no Redux/Zustand/MobX). Providers: `AuthProvider`, `I18nProvider`, `ToastProvider`, `ErrorBoundary` | `src/app/App.tsx`, `src/context/AuthContext.tsx` |
| Data fetching | Direct `@supabase/supabase-js ^2.39.0` calls + native `fetch`. No React Query / SWR / Apollo | `src/lib/supabase.ts`, `src/lib/*.ts` |
| Backend runtime | Supabase Edge Functions (Deno) + Postgres (major_version 17) | `supabase/config.toml`, `supabase/functions/` |
| Static production server | Express `^4.22.2` SPA server (`server.js`, port 4173) | `server.js` |
| Error telemetry | `@sentry/react ^10.71.0`; Vercel `@vercel/analytics`, `@vercel/speed-insights` | `package.json` |
| Icons | `lucide-react ^1.8.0` | `package.json` |
| HTTP client | `undici ^6.28.0` (used server-side / edge for outbound calls) | `package.json` |
| Containers | `Dockerfile`, `docker-compose.yml` present (nginx-style static hosting) | repo root |

**Notable config facts**
- `tsconfig.json`: `strict: false`, plus `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`,
  `noUnusedParameters`, etc. all disabled → effectively untyped-ish TypeScript.
- `src/lib/supabase.ts`: auth `flowType: 'implicit'` (deliberate, not PKCE); custom fetch with a
  15s `AbortController` timeout; global headers `X-Client-Info: growlancer-web`, `X-App-Version`.
- `.eslintrc.cjs` `ignorePatterns` excludes `supabase/functions/**` and `scripts/**` → **edge
  functions are not linted in CI**.

---

## 2. Frontend Architecture

### 2.1 Entry & shell
- `src/main.tsx` — Vike/React entry.
- `index.html` — boot splash overlay (pre-hydration) + prerender route list; fonts loaded from Fontshare.
- `src/app/App.tsx` (391 lines) — provider + route tree:
  `ErrorBoundary > AuthProvider > I18nProvider > ToastProvider > Suspense > Routes`.
  Boot-splash teardown via `window.__growlancerBootReady` + double `requestAnimationFrame`.
- `pages/` — Vike page configs (SSR/prerender).

### 2.2 Route map (`src/routes.ts` central `ROUTES` object)
- Public marketing: `HOME /`, `ABOUT`, `FEATURES`, `HOW_IT_WORKS`, `PRICING`, `PHILOSOPHY`, `SAFETY`,
  `GUIDELINES`, `HELP_CENTER`, `CONTACT`, `STATUS`, `CATEGORIES`, `CONTESTS`, `SERVICES` catalog,
  `WAITLIST`, `INTERNSHIPS`, legal pages (Privacy, Terms, Cookies, Refund, EscrowPolicy),
  `REPORT_FEEDBACK`, `DEBUG`.
- Auth: `LOGIN`, `SIGNUP`, `AUTH_CALLBACK`, `ONBOARDING`, email-verification/certificate routes.
- Discovery: `FREELANCERS` search, `PUBLIC.FREELANCER_PROFILE = /freelancer/:freelancerId`,
  `PUBLIC.SERVICE_DETAIL = /services/:serviceId`, `PROJECT_DETAILS`.
- Freelancer dashboard `/dashboard` — guarded by `ProtectedRoute allowedRoles={['freelancer']}` +
  `DashboardLayout`. Pages in `src/pages/dashboard/`: Overview, Contracts, Proposals, ProjectFeed,
  Invites, Services/CreateService, Portfolio, Wallet, Workspace, TimeTracking, Analytics,
  NotificationsCenter, DisputeResolution, IdentityVerification, SkillCertifications, SkillTest,
  SupportTickets, ProfessionalProfile, ContestsDashboard, AIAssistant.
- Client dashboard `/client` — guarded by `allowedRoles={['client']}` + `ClientDashboardLayout`.
  Pages: `ClientDashboard`, Contracts, Proposals, Invites, Matches, Projects/PostProject,
  TeamProjects/TeamProjectDetail, Workspace, Payments, Reviews, Referrals, Settings, Contests/
  ContestCreate, FreelancerSearch, AIAssistant.
- Admin `/admin` — guarded by `AdminAuthGuard` + `AdminDashboardLayout`. Pages in `src/pages/admin/`:
  AdminUsers, AdminProjects, AdminContracts, AdminDisputes, AdminFinance, AdminPayments,
  AdminSubscriptions, AdminReports, AdminUserReports, AdminSupportTickets, AdminWaitlist,
  AdminCertificates, AdminIdentityVerification, AdminInternships, AdminDataIsolation,
  AdminWithdrawals, AdminLogin.
- Fallback: `*` → `NotFoundPage`.

### 2.3 Directory structure (`src/`)
```
src/
  app/          App.tsx (router + providers)
  components/   ~40 shared components (Button, Modal, Toast, AuthGuard, Payment widgets,
                RazorpayCheckout, PayPalCheckout, EscrowPayPalPayment, NotificationToastBridge,
                ErrorBoundary, AIChatSupport, LiveCodeTerminal, admin/*)
  context/      AuthContext.tsx (1470 lines — the auth brain)
  hooks/        useAboutPageMetrics, useCategories, useCountries, useIndustries,
                useProStatus, useReferralsData
  layouts/      MainLayout, DashboardLayout, ClientDashboardLayout, AdminDashboardLayout
  lib/          ~55 modules: supabase client, payments (razorpay/paypal), withdrawal,
                fileUpload, portfolio, reviews, disputes/refunds, kyc/identityVerification,
                aiMatching, telemetry, rateLimiter, analyticsService, browserIdentity,
                disposableEmails, i18n/, services/ (authService, cacheManager, index)
  pages/        ~55 pages + dashboard/ (21) + admin/ (17) + auth/
  styles/       global CSS
  test/         vitest setup + tests (setup stubs VITE_* env so tests run without .env)
  types/        auth and domain types
  utils/        date.ts, validation.ts
  routes.ts     route/constants source of truth (PLATFORM_CONFIG: FEE_PERCENTAGE 5, PRO_PRICE 299, CURRENCY INR)
```

### 2.4 Client auth state — `src/context/AuthContext.tsx` (1470 lines)
- Consumes `supabase`, `clearSupabaseAuthStorage`, `isStaleSessionError` from `src/lib/supabase.ts`.
- Cross-tab sync via `BroadcastChannel('growlancer_auth_sync')` (AUTH_SIGNED_IN / SIGNED_OUT /
  PROFILE_UPDATED / SESSION_REFRESHED).
- Login rate limiting via `src/lib/rateLimiter.ts` (`recordLoginAttempt`, `getLoginDelay`,
  `getRemainingAttempts`).
- Browser-account fingerprinting via `src/lib/browserIdentity.ts` (`recordBrowserAccount`).
- Telemetry via `src/lib/telemetry.ts` (`captureError`, `captureInfo`).
- Delegates profile work to `src/lib/services/authService.ts` (`fetchUserProfile`,
  `createUserProfile`, `createReferralCode`).
- Exposes `signInWithOAuth` for `github` and `linkedin_oidc`, `login`, `signup`, `logout`,
  `getDashboardRoute`, `updateUser`.

### 2.5 Supabase client init — `src/lib/supabase.ts` (554 lines)
- `createClient<Database>(url, anonKey)` from `import.meta.env.VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` (both `.trim()` — a trailing `\n` previously broke auth).
- Throws if either value is missing.
- `auth.flowType: 'implicit'`; `debug: import.meta.env.DEV`; realtime `eventsPerSecond: 100`.
- Exports: `getClient()`, `clearSupabaseAuthStorage()`, `isStaleSessionError()`, `TableName` union
  (lines 135–166), `uniqueChannelName()` (243–246), and a large typed `RpcName` map / RPC wrapper
  object (lines 278–551) covering matching, escrow, MFA, notifications, wallet, payouts, deletion.

---

## 3. Backend Architecture — Edge Functions

`supabase/functions/` — **33 functions** (+ `_shared/`). "Caller auth" = an explicit
`auth.getUser()` / JWT check was observed in the source.

### Shared modules (`supabase/functions/_shared/`)
| File | Purpose |
|---|---|
| `ai.ts` | `AIMessage` type + `callAI(messages, options)`; OpenRouter-compatible chat client. Env: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Defaults: base `https://openrouter.ai/api/v1`, model `deepseek/deepseek-chat-v3-0324`, temp 0.7, max_tokens 8192, top_p 0.95. |
| `brevo.ts` | `sendEmail(opts)` transactional email. Env: `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`. |
| `cors.ts` | CORS header helper (present; not expanded here). |

### Function inventory
| # | Function | Observed purpose | Caller auth |
|---|---|---|---|
| 1 | `admin-data` | Admin data aggregation/console endpoint (multi-branch GET/POST). | Yes (`auth.getUser`) |
| 2 | `admin-signup` | Admin account creation, gated by `ADMIN_SIGNUP_SECRET`. | Yes |
| 3 | `admin-withdrawal` | Admin-triggered RazorpayX payout. | Yes |
| 4 | `ai-assistant` | Authenticated AI assistant chat. | Yes (JWT required) |
| 5 | `ai-matching` | AI project↔freelancer matching. | Yes (JWT required) |
| 6 | `ai-ticket-responder` | AI drafting/responding on support tickets. | Yes |
| 7 | `ai-writer` | AI content writer (usage-metered). | Yes (JWT required) |
| 8 | `avatar-upload` | Avatar upload to storage. | Yes |
| 9 | `delete-account` | Account deletion (immediate path). | Yes |
| 10 | `email-notifications` | Transactional/bulk email dispatch. | Yes |
| 11 | `file-upload` | Generic file upload to storage buckets. | Yes |
| 12 | `internship-applications` | Internship apply/list/update (admin branch). | Yes (GET/PATCH admin verified) |
| 13 | `invoice` | Invoice generation/retrieval. | Yes |
| 14 | `kyc-submit` | KYC submission to provider (Surepass); has dev-mode token path. | Yes |
| 15 | `milestone-auto-release` | Cron job: auto-release milestones. Requires `CRON_SECRET`. | Cron secret |
| 16 | `newsletter-subscribe` | Public newsletter signup → Brevo. | Public (no auth) |
| 17 | `notification-preferences` | Read/write notification preferences. | Yes |
| 18 | `notifications` | Notification list/mutation. | Yes |
| 19 | `paypal` | PayPal order create/capture. | Yes |
| 20 | `paypal-webhook` | PayPal webhook receiver; verifies via `PAYPAL_WEBHOOK_ID` / API. | Signature |
| 21 | `process-deletion` | Cron/user processing of deletion requests. Requires `CRON_SECRET` (or user JWT). | Cron secret / user |
| 22 | `proposal-notifications` | Proposal email notifications. | Yes |
| 23 | `razorpay` | Razorpay order create/verify; also accepts `CRON_SECRET`. | Yes / cron |
| 24 | `razorpay-payout-webhook` | RazorpayX payout webhook; verifies with `RAZORPAY_WEBHOOK_SECRET`. | Signature |
| 25 | `razorpay-webhook` | Razorpay payment webhook; verifies `RAZORPAY_WEBHOOK_SECRET`. | Signature |
| 26 | `request-deletion` | User-initiated deletion request. | Yes |
| 27 | `reviews` | Review create/moderate. | Yes |
| 28 | `security-alert-notify` | Cron: alert admin on `security_alerts`; CRON_SECRET-gated. | Cron secret |
| 29 | `submit-report` | User report/feedback submission. | Yes (user) |
| 30 | `subscription-billing-cron` | Daily subscription billing; CRON_SECRET + Razorpay keys. | Cron secret |
| 31 | `twofa-management` | TOTP MFA enable/disable/verify. | Yes |
| 32 | `verify-document` | Document OCR/verification via vision model (`openai/gpt-4o-mini`). | Yes |
| 33 | `withdrawal` | Freelancer withdrawal → RazorpayX payout. | Yes |

**Auth posture notes**
- Webhook functions (#20, #24, #25) rely on provider signature verification, not Supabase JWT.
- Cron-invoked functions (#15, #21, #28, #30) gate on `CRON_SECRET`; `razorpay` (#23) accepts it too.
- `newsletter-subscribe` (#16) is the only fully public function.
- Deployment workflow uses `supabase functions deploy --no-verify-jwt` (see §9) → JWT enforcement is
  expected inside the code, not at the platform layer.

---

## 4. Database Inventory (from `supabase/migrations/`)

> Series spans `20240511_*` → `20270118_*`. Names below are the observed (de-duplicated) table set;
> many tables are re-created/reconciled by later "fix" migrations, and a few legacy tables were
> intentionally dropped (see Cashfree note in §5).

### 4.1 Tables (~100 distinct; 110 `CREATE TABLE` statements)
Core identity/profile: `profiles`, `freelancer_profiles`, `client_profiles`, `profiles_private`,
`admin_credentials`, `admin_users`, `user_mfa_settings`, `recovery_codes`, `push_tokens`,
`notification_preferences`, `saved_searches`, `saved_payment_cards`, `payout_methods`,
`user_deletion_requests`, `deletion_failures`, `browser` identity-related fields within profiles.

Marketplace/work: `projects`, `project_categories`, `project_skills`, `project_matches`,
`proposals`, `hired_proposals`, `invites`, `contracts`, `contract_files`, `milestones`,
`revision_requests`, `time_entries`, `workspace_tasks`, `workspace_notes`, `workspaces`,
`workspace_members`, `workspace_activity_logs`, `team_projects`, `team_project_roles`,
`team_invitations`, `skill_test_attempts`.

Catalog/ecosystem: `services`, `service_categories`, `service_offers`, `categories`, `subcategories`,
`skills`, `freelancer_skills`, `skills_reference`, `industries`, `countries`, `portfolio_items`,
`skill_certifications`, `credential_verification_tokens`, `credential_version_history`,
`credential_audit_logs`, `verification_rate_limits`, `certificate` codes.

Payments/finance: `escrow`, `transactions`, `wallet*` (consolidated — duplicate wallet tables were
cleaned up), `withdrawals`, `admin_withdrawals`, `razorpay_orders`, `razorpay_transactions`,
`paypal_orders`, `paypal_transactions`, `paypal_disputes`, `payment_webhook_events`,
`payment_audit_logs`, `invoices`, `ledger_entries`, `platform_revenue`, `refunds`, `refund_requests`,
`refund_history`, `cron_settings`.

Trust/safety/KYC: `identity_verifications`, `kyc_provider_config`, `disputes`, `dispute_evidence`,
`dispute_messages`, `dispute_internal_notes`, `fraud_events`, `security_alerts`, `user_reports`,
`rate_limits`, `usage_logs`, `client_errors`.

Contests/support/content: `contests`, `contest_submissions`, `contest_votes`, `contest_comments`,
`reviews`, `review_replies`, `messages`, `notifications`, `support_tickets`, `ticket_messages`,
`contact_inquiries`, `waitlist`, `newsletter_subscribers`, `referrals`, `referral_stats`,
`opportunity_events`, `internship_applications`.

> `UNKNOWN — not found`: a single authoritative live schema dump (no `schema.sql`/`database.types`
> in repo). The type `Database` referenced by `src/lib/supabase.ts` is expected from generated types
> but a generator output file was not located in this pass.

### 4.2 RLS coverage
- 59 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements observed. RLS is enabled across the
  high-value sets: profiles/profile-private, projects/proposals/contracts/escrow/transactions,
  wallets/withdrawals/payout_methods, payments (razorpay/paypal) tables, disputes/refunds, admin
  tables, KYC tables, contests, support, catalog tables.
- Dedicated hardening migrations exist: `20260811000000_add_rls_orphaned_tables.sql`,
  `20260816000000_security_hardening_v6.sql`, `20260905000000_drop_recursive_admin_rls_policies.sql`,
  `20260929000000_fix_project_post_rls.sql`, `20260930000000_fix_null_with_check_policies.sql`,
  `20270101000017_fix_disputes_select_rls.sql`, `20270101000022_fix_ai_matches_client_select_rls.sql`.
- `UNKNOWN — not found`: RLS enablement for `client_errors` (telemetry table) was not confirmed in
  the 59 matches; verify its policy explicitly.

### 4.3 RPC / stored functions (300+ definitions; many re-defined)
Highly security-relevant (`SECURITY DEFINER` suspected) groups:
- **Escrow/contracts**: `create_contract_with_escrow`, `accept_invite_create_contract`, `fund_escrow`,
  `fund_escrow_from_wallet`, `admin_fund_escrow`, `admin_reverse_escrow`, `release_escrow`,
  `_book_escrow_release`, `_refundable_amount`, `request_contract_refund`, `raise_contract_dispute`,
  `resolve_contract_dispute`, `admin_decide_dispute`, `admin_assign_dispute`, `appeal_dispute`,
  `freeze_contract`, `unfreeze_contract`, `auto_release_contract`, `auto_release_milestone`,
  `process_milestone_auto_release`, `release_milestone`, `mark_contract_delivered`,
  `create_service_purchase_contract`, `create_team_role_contract`.
- **Wallet/payouts**: `update_wallet_balance`, `hold_wallet_funds`, `release_wallet_funds`,
  `get_wallet_balance`, `ensure_wallet_for_user`, `process_withdrawal_complete`, `cancel_withdrawal`,
  `process_stale_withdrawals`, `get_payout_methods`, `set_default_payout_method`,
  `delete_payout_method`, `get_admin_commission_balance`, `create_admin_withdrawal`,
  `finalize_admin_withdrawal`, `pay_subscription_with_wallet`.
- **Identity/authorization**: `is_admin_user`, `is_user_admin`, `is_email_taken`,
  `is_email_confirmed`, `email_account_exists`, `is_disposable_email_domain`,
  `block_disposable_email_signup`, `is_user_suspended`, `can_view_project`, `grant_admin_role`,
  `admin_grant_lifetime_premium`, `admin_revoke_lifetime_premium`.
- **KYC**: `kyc_validate_document_number`, `kyc_verify_row`, `auto_verify_kyc`,
  `kyc_reject_duplicate_document`, `kyc_reject_duplicate_identity`, `kyc_guard_submit_fn`,
  `kyc_sync_profile_status_fn`, `admin_set_kyc_provider_config`, `admin_set_kyc_mode`.
- **Matching**: `generate_project_matches`, `upsert_project_matches`,
  `refresh_freelancer_project_matches`, `refresh_role_suggestions`, `calculate_weighted_rating`,
  `recompute_seller_level`, `update_reputation_score`.
- **MFA/notifications/referrals/deletion**: `generate_recovery_codes`, `verify_recovery_code`,
  `enable_user_mfa`, `get_notification_preferences`, `set_notification_preferences`,
  `register_push_token`, `process_referral`, `complete_referral`, `request_account_deletion`,
  `process_account_deletion`, `delete_user_all_data`, `purge_orphan_user_data`,
  `process_due_deletions`, `cleanup_orphaned_data`.

### 4.4 Triggers (82 statements, ~40 distinct)
Auth lifecycle: `on_auth_user_created`, `on_auth_user_deleted`,
`trg_block_disposable_email_signup`. Profile/protection: `protect_privilege_columns`,
`trg_validate_india_phone`, `trg_track_name_change`, `trg_validate_client_gstin`,
`sync_profile_pro_flag_trg`, `trg_recompute_seller_level`. Commerce: `trigger_new_proposal`,
`trigger_contract_completion`, `trigger_escrow_funded`, `trigger_milestone_released`,
`trigger_ensure_wallet_on_signup`, `trigger_ensure_single_default_payout`,
`service_offers_freeze_amount_trigger`. Security: `trg_messages_rate_limit`,
`trg_subscription_client_update_guard`, `trg_subscriptions_trial_guard`,
`trg_kyc_auto_verify`, `trg_kyc_reject_duplicate_document`, `trg_kyc_sync_profile_status`.

### 4.5 Storage buckets (10)
`avatars`, `portfolio-images`, `videos`, `company-logos`, `verification-documents`,
`contract-files`, `dispute-evidence`, `contest-submissions`, `internship_resumes`,
`internship_documents`. (Privacy-hardening migrations exist for internship storage and
contract-files.)

### 4.6 Cron / scheduled jobs (pg_cron — 11)
| Job name | Schedule | Target |
|---|---|---|
| `cleanup-orphaned-data` | `0 3 * * 0` (weekly) | `cleanup_orphaned_data` |
| `cleanup-rate-limits` | `0 3 * * *` | `cleanup_expired_rate_limits` |
| `growlancer-security-drift` | `15 * * * *` | `check_security_drift` |
| `subscription-billing-daily` | `0 0 * * *` | subscription billing function/edge |
| `growlancer-milestone-auto-release` | `5 * * * *` | `process_milestone_auto_release` |
| `kyc-auto-verify` | `*/10 * * * *` | `auto_verify_kyc` |
| `growlancer-stale-withdrawal-recovery` | `*/15 * * * *` | `process_stale_withdrawals` |
| `growlancer-process-pending-refunds` | `*/2 * * * *` | `process_pending_refunds` |
| `growlancer-no-response-auto-dispute` | `0 6 * * *` | `process_no_response_disputes` |
| `growlancer-process-due-deletions` | `0 4 * * *` | `process_due_deletions` |
| `growlancer-close-contests` | `0 * * * *` | `close_expired_contests` |

Related infra: `pg_net` used for cron→edge-function HTTP calls; `pg_cron` enabled in
`supabase/config.toml`; `cron_settings` table tracks schedules.

### 4.7 Constraints / indexes
- `20260610120000_performance_indexes.sql` — dedicated index migration.
- Referential integrity drops exist (e.g. `drop_skill_certifications_user_id_fk`,
  `drop_skill_certifications_unique_constraint`) → FK/unique coverage is **inconsistent and was
  deliberately relaxed** in places. Treat as audit-relevant.
- Schema-drift corrections were required repeatedly (`fix_escrow_schema_drift`,
  `fix_transactions_schema_drift`, `fix_usage_logs_schema`, `subscriptions_live_schema_reconcile`)
  → strong signal that migration history has diverged from the live DB at least 4 times.

---

## 5. External Integrations

| Integration | Role | Evidence |
|---|---|---|
| **Supabase** | Auth, Postgres, Storage, Realtime, Edge Functions | `src/lib/supabase.ts`, `supabase/config.toml`, `supabase/functions/` |
| **Razorpay** | Primary card/netbanking payments + order create/verify (webhook signed) | `razorpay/index.ts`, `razorpay-webhook/index.ts`, `VITE_RAZORPAY_CONFIG_ID`, `RAZORPAY_*` |
| **RazorpayX** | Payouts (freelancer withdrawals, admin withdrawals); fund accounts | `withdrawal/index.ts`, `admin-withdrawal/index.ts`, `razorpay-payout-webhook/index.ts`, `20260928000000_razorpayx_fund_accounts.sql` |
| **PayPal** | Implemented but **disabled in UI** (flip `VITE_PAYPAL_ENABLED`) | `paypal/index.ts`, `paypal-webhook/index.ts`, `src/lib/payments.ts` |
| **Cashfree** | Tables created in `20261001000000_cashfree_tables.sql`, then **dropped/superseded** by `20261003000000_restore_razorpay.sql` (abandoned experiment) | migration comments |
| **Brevo** | Transactional email (EC/notifications/invoices) | `_shared/brevo.ts`, `BREVO_API_KEY` |
| **Supabase Auth email** | Verification / reset sender (self-hosted SMTP or built-in) | `supabase/config.toml` `[auth.email]` |
| **OpenRouter (AI)** | Chat completions (`deepseek/deepseek-chat-v3-0324`) + vision OCR (`openai/gpt-4o-mini`) | `_shared/ai.ts`, `verify-document/index.ts` |
| **Surepass** | KYC document verification provider (+ configurable provider engine) | `kyc-submit/index.ts`, `SUREPASS_*`, `kyc_provider_config` |
| **Sentry** | Frontend error telemetry | `@sentry/react`, `VITE_SENTRY_DSN` |
| **Vercel Analytics / Speed Insights** | RUM metrics | `@vercel/analytics`, `@vercel/speed-insights` |
| **GitHub OAuth / LinkedIn OIDC** | Social login | `AuthContext.signInWithOAuth` |
| **Google Meet** | Interview meeting links | `20260728000000_add_google_meet.sql` |
| **Fontshare** | Web fonts (Satoshi, Cabinet Grotesk) | `index.html` |

---

## 6. Environment Variables (key NAMES only — no values)

### 6.1 Client-exposed (`VITE_` — bundled into the browser)
| Key | Usage |
|---|---|
| `VITE_SUPABASE_URL` | Supabase client + edge-function base URL in every `src/lib/*` integration |
| `VITE_SUPABASE_ANON_KEY` | Supabase client (public anon key) |
| `VITE_APP_VERSION` | `X-App-Version` header |
| `VITE_SENTRY_DSN` | Sentry init |
| `VITE_PAYPAL_ENABLED` | Feature flag (PayPal UI on/off) |
| `VITE_RAZORPAY_CONFIG_ID` | Razorpay Checkout config id |
| `VITE_*` (declared) | `src/vite-env.d.ts` types only `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; the others are used but not typed |

> Anything `VITE_`-prefixed is shipped to the client and must be treated as public.

### 6.2 Server / edge-function only (`Deno.env.get`)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_ACCOUNT_NUMBER`, `RAZORPAY_WEBHOOK_SECRET`,
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_SANDBOX`, `PAYPAL_WEBHOOK_ID`,
`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `APP_URL`, `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
`ADMIN_EMAIL`, `REPORT_EMAIL`, `ADMIN_SIGNUP_SECRET`, `KYC_PROVIDER`, `SUREPASS_BASE_URL`,
`SUREPASS_API_TOKEN`, `KYC_DEV_MODE`, `KYC_DEV_TOKEN`, `KYC_DEV_PROJECT_REF`.

> Also present in `.env.example`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_ACCOUNT_NUMBER`,
> `RAZORPAY_WEBHOOK_SECRET`, `PAYPAL_*`, `AI_*`, `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
> `APP_URL`. `.env.example` deliberately contains key names only.

> **Audit note:** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is used in `createClient` across many
> functions (admin-data, withdrawal, process-deletion, webhooks, cron jobs, kyc-submit, etc.). Any
> path where a service-role client is reachable without a strict `getUser()`/`CRON_SECRET`/signature
> gate is a critical finding.

---

## 7. Data Flow (traced, concrete)

### 7.1 Login → session → role dashboard
1. UI (`LoginModal` / `LoginPage`) → `AuthContext.login(email, password)`.
2. `AuthContext` applies local rate limiting (`src/lib/rateLimiter.ts`) and records browser identity
   (`src/lib/browserIdentity.ts`).
3. Calls Supabase Auth `signInWithPassword` via the trimmed client in `src/lib/supabase.ts`
   (`flowType: 'implicit'`, 15s timeout fetch).
4. On success → `fetchUserProfile` (`src/lib/services/authService.ts`) reads `profiles`
   (+ `profiles_private`) to resolve `role` and onboarding state.
5. `AuthContext` broadcasts `AUTH_SIGNED_IN` over `BroadcastChannel('growlancer_auth_sync')` to sync
   other tabs; `ProtectedRoute`/`AdminAuthGuard` route to `/dashboard`, `/client`, or `/admin`.
6. Failures call `captureError` → `src/lib/telemetry.ts`.

### 7.2 Contract + escrow funding (client hires freelancer)
1. Client accepts a proposal / invite → UI calls RPC wrapper in `src/lib/supabase.ts`.
2. RPC `create_contract_with_escrow` or `accept_invite_create_contract`
   (`20261006000000_accept_invite_contract_rpc.sql`, `20261010000000_fix_hire_idempotency_escrow.sql`)
   inserts `contracts` + `escrow` rows (amount pulled from proposal in
   `20270102000001_contract_amount_from_proposal.sql`).
3. Funding paths: card → `razorpay` edge function (order create + verify) → `razorpay-webhook`
   confirms → escrow marked funded; or wallet → `fund_escrow_from_wallet`
   (`20261028000000_fund_escrow_from_wallet.sql`) which debits the wallet and credits escrow.
4. Triggers `trigger_escrow_funded` fire notification triggers; `transactions` + `ledger_entries`
   rows recorded.
5. Release: `release_escrow` → `_book_escrow_release` → `_refundable_amount` bookkeeping, with
   `platform_revenue` capturing the 5% fee (`PLATFORM_CONFIG.FEE_PERCENTAGE`). Auto-release handled
   by `auto_release_contract` / `auto_release_milestone` (10h window,
   `20260815000000_auto_release_10h.sql`) and cron `growlancer-milestone-auto-release`.
6. Realtime updates propagate to client/freelancer dashboards (`RealtimePostgresChangesPayload` in
   `AuthContext`; realtime enabled for workflow tables).

### 7.3 Withdrawal (freelancer → RazorpayX payout)
1. Freelancer submits on `/dashboard/wallet` → `src/lib/withdrawal.ts` POSTs to
   `${VITE_SUPABASE_URL}/functions/v1/withdrawal` (line ~161/193) with the user JWT.
2. `withdrawal/index.ts` builds an anon client with the caller's `Authorization` header, calls
   `auth.getUser()` (line ~184), then validates balance and inserts a `withdrawals` row and
   RazorpayX payout via `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_ACCOUNT_NUMBER`.
3. RazorpayX posts back to `razorpay-payout-webhook` (signature verified with
   `RAZORPAY_WEBHOOK_SECRET`) → marks withdrawal complete via `process_withdrawal_complete`.
4. Safety nets: cron `growlancer-stale-withdrawal-recovery` (`process_stale_withdrawals`, */15m) and
   `withdrawal_trial_verification` migration (`20261103000000_`).
5. Admin-initiated payouts go through `admin-withdrawal` (+ `create_admin_withdrawal` /
   `finalize_admin_withdrawal` RPCs) and the same payout webhook.

---

## 8. Build / Run / Test Commands (`package.json` scripts)

| Script | Command | Notes |
|---|---|---|
| `dev` | `vite` | Vike dev server (host 0.0.0.0:5173) |
| `build` | `node scripts/build.mjs` | Custom build wrapper (Vike SSR/prerender) |
| `build:check` | `tsc && vite build` | Type-check then bundle |
| `preview` | `vite preview` | |
| `start` | `node server.js` | Express SPA server, port 4173 |
| `start:prod` | `NODE_ENV=production node server.js` | |
| `typecheck` | `tsc --noEmit` | |
| `test` | `vitest run` | |
| `test:watch` | `vitest` | |
| `lint` | `eslint . --ext ts,tsx --report-unused-disable-directives` | Edge functions ignored |
| `lint:fix` | `eslint . --ext ts,tsx --fix` | |
| `format` | `prettier --write "src/**/*.{ts,tsx,css,json}"` | |
| `deploy:backend` | `bash scripts/deploy-backend.sh` | |

`scripts/` also contains manual test/ops tooling: `e2e_*_test.sql` (auto-release, delivery notify,
fraud refund, revision flow), `live_signup_test.mjs`, `live-auth-flow-test.sh`,
`security-audit.mjs`, `push_redirect_urls.mjs`, `verify_auth_state.sql`, `verify_trigger_gone.sql`,
`gen-disposable-blocklist.mjs`, `setup-deployment.sh`.

---

## 9. Deployment Configuration

- **Vercel** (`vercel.json`): framework `vite`, `buildCommand: npm run build`,
  `outputDirectory: dist`, SPA rewrite `/(.*) → /index.html`, and strong security headers incl. a
  CSP allow-list (Razorpay, PayPal, Supabase, Sentry, Fontshare). No `netlify.toml`
  (`public/_redirects` exists but Vercel is the primary host).
- **Supabase** (`supabase/config.toml`): project_id `GROWLANCER`, api schemas
  `["public","graphql_public"]`, `max_rows 1000`, db port `54322`, Postgres `major_version 17`,
  realtime enabled, storage `file_size_limit 50MiB`, auth `site_url http://localhost:5173` with a
  long `additional_redirect_urls` list (growlancer.vercel.app, growlancer.com, www.growlancer.com,
  preview URLs), `jwt_expiry 3600`. Per-function blocks:
  `[functions.razorpay-webhook]`, `[functions.paypal-webhook]`,
  `[functions.razorpay-payout-webhook]`, `[functions.subscription-billing-cron]`,
  `[functions.milestone-auto-release]`, `[functions.security-alert-notify]`,
  `[functions.ai-writer]`.
- **GitHub Actions**:
  - `.github/workflows/ci.yml` — Node 24, `npm install --no-audit --no-fund`; jobs `typecheck`
    (`npm run typecheck`), `lint` (`npm run lint`), `build` (`npm run build` with placeholder VITE
    env). **Only the frontend is CI-gated; edge functions are not linted/type-checked.**
  - `.github/workflows/supabase-deploy.yml` — on CI pass on `main`: `supabase link`,
    `supabase functions deploy --no-verify-jwt`, optionally `supabase db push --include-all --yes`
    (only if `vars.SUPABASE_DB_AUTO_PUSH == 'true'`), then `supabase migration list`. Secrets:
    `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.
  - **`--no-verify-jwt`** means every function must self-enforce auth; misapplication is high risk.
- **Containers**: `Dockerfile`, `docker-compose.yml` present for static hosting; `server.js` is the
  Express fallback.
- **PWA**: `public/manifest.json`, `public/sw.js`, `public/robots.txt`, `public/sitemap.xml`,
  `public/_redirects`, `public/platform-metrics.json`, `public/og-image.png`.

---

## 10. Observability

| Layer | Mechanism | Evidence |
|---|---|---|
| Frontend errors | Sentry (`@sentry/react`) via `VITE_SENTRY_DSN`; `captureError`/`captureInfo` in `src/lib/telemetry.ts` | `package.json`, `src/lib/telemetry.ts` |
| Client-side error table | `client_errors` telemetry table (`20261021000000_client_errors_telemetry.sql`) | migration |
| Security alerting | `security_alerts` table + `security-alert-notify` edge function (emails admin), driven by cron `growlancer-security-drift` (`check_security_drift`, hourly at :15) | migration `20261214000000_security_drift_monitor.sql`, `security-alert-notify/index.ts` |
| Drift monitoring | `check_security_drift` RPC + false-positive fixes (`20270116`, `20270118`) | migrations |
| Audit trails | `credential_audit_logs`, `payment_audit_logs`, `workspace_activity_logs`, `credential_version_history`, `fraud_events` | migrations |
| Usage metering | `usage_logs` (+ `get_ai_writer_usage`, profile-view counter) | migrations |
| Rate limiting | `rate_limits` table + `enforce_message_rate_limit`; client `src/lib/rateLimiter.ts` | migrations, `src/lib/rateLimiter.ts` |
| RUM / analytics | `@vercel/analytics`, `@vercel/speed-insights`; `src/lib/analyticsService.ts` | `package.json`, `src/lib/` |
| App health | Express `/_health` endpoint (`server.js`) | `server.js` |
| Server logging | `console`/Deno logs inside edge functions; `UNKNOWN — not found` for centralized log aggregation | — |

`UNKNOWN — not found`: no structured logging library, no APM/tracing (e.g. OpenTelemetry), and no
alerting integration beyond Brevo email — observability beyond Sentry + DB tables is minimal.

---

## Files of interest for deep audit (highest-risk / most-central)

Ordered by blast radius (auth, money, PII). Paths are repo-relative — this is the recommended
starting set for the follow-up per-file forensic review.

1. `supabase/functions/withdrawal/index.ts` — moves real money to freelancers via RazorpayX;
   service-role client + JWT; balance-trust boundary.
2. `supabase/functions/razorpay-webhook/index.ts` — payment confirmation; signature verification and
   idempotency are critical (fabricated webhook = free escrow).
3. `supabase/functions/razorpay-payout-webhook/index.ts` — payout completion; signature verification.
4. `supabase/functions/subscription-billing-cron/index.ts` — CRON_SECRET + service role + charges
   subscriptions; scheduled, so failures are silent.
5. `supabase/functions/admin-data/index.ts` — broad admin aggregation; multiple service-role clients
   and admin-token branches (largest attack surface for privilege escalation).
6. `src/lib/supabase.ts` — the client + entire RPC wrapper surface (`RpcName` map 278–551); every
   privileged RPC call originates here. Check `flowType: 'implicit'` implications.
7. `src/context/AuthContext.tsx` (1470 lines) — sole authority on role/onboarding gating in the SPA;
   BroadcastChannel sync and rate limiting live here.
8. `supabase/functions/delete-account/index.ts` + `process-deletion/index.ts` +
   `request-deletion/index.ts` — account destruction; CRON_SECRET vs user JWT branching and
   service-role usage.
9. `supabase/migrations/20260922000000_financial_automation.sql` — dense financial automation
   (cron, escrow release, RazorpayX columns, refunds); highest-consequence SQL.
10. `supabase/migrations/20260921000000_refund_dispute_system.sql` — refund/dispute engine with
    money movement and RLS policies.

Secondary (verify after the above): `supabase/functions/kyc-submit/index.ts` (PII + dev-token path
`KYC_DEV_*`), `supabase/functions/file-upload/index.ts` and `avatar-upload/index.ts` (storage
access), `supabase/functions/admin-signup/index.ts` (`ADMIN_SIGNUP_SECRET` provisioning),
`src/lib/withdrawal.ts`, `src/lib/razorpay.ts`, `src/lib/paypal.ts`,
`.github/workflows/supabase-deploy.yml` (`--no-verify-jwt`), `vercel.json` (CSP/CORS).

---

## Key Risk Signals (summary for the audit orchestrator)

- **`--no-verify-jwt` deployment** + service-role keys spread across 30 functions → the entire auth
  boundary is enforced in application code, not platform config.
- **Money paths are the densest risk**: escrow, Razorpay/RazorpayX webhooks, refunds, disputes,
  subscription billing, and wallet RPCs. Repeated "fix" migrations
  (`fix_escrow_schema_drift`, `fix_transactions_schema_drift`, `fix_refund_wallet_double_credit`,
  `fix_wallet_funded_refund_credit`) indicate prior financial correctness bugs.
- **Type-safety disabled** (`strict: false`) and **edge functions un-linted** → runtime-only
  guarantees in the highest-consequence code.
- **Schema drift history** (≥4 forced reconciliations) → migrations are not a reliable description
  of production; live DB must be introspected before trusting any schema assumption.
- **PII exposure surface**: KYC documents, verification buckets, profiles_private, internship
  resumes — several privacy-fix migrations suggest historical storage-policy mistakes.
