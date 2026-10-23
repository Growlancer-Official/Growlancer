# Growlanzo — MVP Scope and End-to-End Test Plan

Status: **draft for owner approval** · Owner: founder · Last updated: 2026-10-21

This document is the single place that answers two questions:

1. **What is actually in the early-access release?** (§1, §2)
2. **How do we prove it works, and what have we proven so far?** (§4–§6)

It is deliberately blunt. Anything not listed as retained is out of scope, and a
green checkbox here means a named command ran and its output was read — see
[RELEASE-READINESS-REPORT.md](RELEASE-READINESS-REPORT.md) for the evidence.

---

## 1. Retained for early access

| Area | What ships | Where |
| --- | --- | --- |
| Public site | Landing, header/mobile nav, footer, legal + support pages, responsive layout | `src/pages/HomePage.tsx`, `src/layouts/MainLayout.tsx` |
| Auth | GitHub/LinkedIn sign-in, email verification, session handling, logout, role onboarding | `src/context/AuthContext.tsx`, `src/pages/auth/*`, `src/pages/OnboardingPage.tsx` |
| Profiles | Freelancer + client profiles, portfolio, service listings, public discovery/search | `src/pages/dashboard/ProfessionalProfilePage.tsx`, `src/pages/PublicFreelancerProfilePage.tsx`, `src/pages/FreelancersSearchPage.tsx` |
| AI matching | Existing matching that is already wired and rate-limited | `supabase/functions/ai-matching` |
| Projects | Create / edit / publish / browse / detail | `src/pages/ClientPostProjectPage.tsx`, `src/pages/ProjectDetailsPage.tsx` |
| Proposals | Invitations, proposals, status changes, candidate selection | `src/pages/dashboard/ProposalsPage.tsx`, `src/pages/ClientProposalsPage.tsx` |
| Contracts | Acceptance, workspace, messages, private files, milestones, deliverables, approval, completion | `src/pages/dashboard/WorkspacePage.tsx`, `src/pages/ClientWorkspacePage.tsx` |
| Payments | Razorpay order → checkout → signature-verified webhook → escrow/ledger (test mode only until §6 passes) | `supabase/functions/razorpay`, `supabase/functions/razorpay-webhook` |
| Wallet | Balance, ledger and withdrawal **request**; payout action stays disabled until a sandbox payout is reconciled | `src/pages/dashboard/WalletPage.tsx` |
| Reviews | Only for completed, eligible contracts | `src/lib/reviews.ts`, `supabase/functions/reviews` |
| Disputes & support | Raise, respond, admin resolution, support tickets | `src/pages/dashboard/DisputeResolutionPage.tsx` |
| Admin | Users, projects, contracts, payments, finance, withdrawals, disputes, reports, support | `src/pages/admin/*`, `supabase/functions/admin-data` |
| Email | Signup verification, security alerts, project/payment status | `supabase/functions/email-notifications`, `_shared/brevo.ts` |
| Legal | Terms, privacy, refunds, escrow policy, cookies, support contact | `src/pages/TermsPage.tsx` etc. |

**Hard rule:** no surface may claim escrow guarantees, instant payouts, verified
identity, fraud-proofness or measured AI accuracy. Copy is checked by
`src/test/truthfulPlanClaims.test.ts`, `publicMetricsHonesty.test.ts`.

---

## 2. Deferred for early access

Deferred means **disabled at every layer**, not hidden. Each module has a server
switch in [`supabase/functions/_shared/features.ts`](../supabase/functions/_shared/features.ts);
the default is OFF and only `FEATURE_<KEY>_ENABLED=true` turns it on.

| Module | State | Server | UI | Data |
| --- | --- | --- | --- | --- |
| Internships / careers | **Disabled** | `internship-applications` returns **410** for every method before its first read | `/internships`, `/careers` render `FeatureUnavailablePage` | rows preserved; reachable only via authenticated `admin-data` `query` |
| Certificates / skill tests / badges | **Disabled** | `admin-data` public `verify_certificate` + `verify_credential_qr` return **410**; the route no longer reads any row | `/certificate`, `/verify-certificate*` render `FeatureUnavailablePage` | `skill_certifications` untouched |
| In-house KYC submission, badges, auto-verification | **Disabled** | `kyc-submit` only reaches the development adapter with `KYC_DEV_MODE_ALLOWED=true`; otherwise a DB `mode='development'` is downgraded to `production` and an unconfigured provider resolves to `review`, never `verified` | `IdentityVerificationPage` still renders (provider-required checks must not be bypassed); badge/prompt removal is listed in §3 | existing `identity_verifications` rows preserved |
| Subscription billing cron (saved-card renewal, trial conversion) | **Disabled** | `subscription-billing-cron` returns **503 `charged:false`** before any gateway call | `ProSubscriptionPage` still sells the one-off plan | subscriptions + payment history preserved; nothing is cancelled or downgraded |
| Contests | **Not yet gated** — see §7 | Contest edge actions have no separate entrypoint | public `/contests` still routed | — |
| Premium plan (one-off purchase) | **Retained** — see §7 | `razorpay` `subscription` order path | `ProSubscriptionPage` | — |
| Grow Coins / referrals / rewards | **Retained** — see §7 | `grow_coin_*` RPCs | `/dashboard/referrals`, `/client/referrals` | — |
| Standalone AI assistant add-on | Retained but not essential; it is already free and rate-limited | `ai-assistant` | dashboard routes | — |
| Advanced analytics, time tracking, team projects | Retained behind existing dashboard routes; not part of the launch demo | — | — | — |

### Why §7 exists (a documented conflict, not an oversight)

`AGENTS.md` §2 and `CLAUDE.md` §Business Model make **Freelancer Premium
₹299/month** and the **100% merit-based ranking** non-negotiable business rules.
The launch brief asked to defer Premium and Grow Coins entirely. Those two cannot
both be true, so this release keeps the one-off Premium purchase and the Grow
Coin/referral programme **enabled**, and defers only the parts that are either a
security liability (certificates, internships, in-house KYC) or a money risk
(recurring billing). The founder must confirm this reading before launch; flipping
either way is a one-line change in `_shared/features.ts` plus the UI gate.

---

## 3. Deferred-module cleanup checklist (remaining UI work)

Server-side closure is done and tested. The following UI references still point
at deferred modules and must be removed before launch, in this order:

1. `src/routes.ts` → `NAVIGATION.company` still contains `Careers` (`/careers`).
2. `src/layouts/MainLayout.tsx` and the footer → remove internship/certificate links.
3. `src/pages/dashboard/IdentityVerificationPage.tsx` + `ClientSettingsPage.tsx`
   → remove any "verified identity" badge/prompt; keep the provider-required
   payment KYC path.
4. `src/pages/dashboard/SkillCertificationsPage.tsx`, `SkillTestPage.tsx`,
   `src/pages/admin/AdminCertificatesPage.tsx`, `AdminInternshipsPage.tsx`
   → route to `FeatureUnavailablePage`; keep the pages for the later phase.
5. `src/pages/ContestsPage.tsx`, `ContestDetailPage.tsx`, `ContestsDashboardPage.tsx`,
   `ClientContestsPage.tsx`, `ClientContestCreatePage.tsx`
   → gate behind a `contests` feature key (add it to `FeatureKey` + `DEFAULTS`).
6. Marketing copy in `HomePage.tsx` / `FeaturesPage.tsx` → delete internship,
   certificate and contest claims.
7. `pages/prerenderUrls.ts` → keep the URLs (they render the honest page) but
   confirm no deferred URL is advertised in `sitemap`/`robots`.

This checklist is intentionally not claimed as done.

---

## 4. Browser E2E plan (both roles, header → logout)

Tooling: the repo has Playwright scripts under `scripts/e2e/` (not a Playwright
test-runner suite). `npm run e2e:oauth-signup`, `e2e:auth-lifecycle` and the
`scripts/e2e/*.mjs` drivers are the harness. They need a reachable staging URL
and test accounts; without those every step below is **BLOCKED**, never PASS.

### A. Public header, landing, footer

| # | Step | Status |
| --- | --- | --- |
| A1 | Landing at 1440 / 768 / 375 px, no horizontal overflow | PENDING |
| A2 | Logo, every header link, mobile menu, CTAs, footer links | PENDING |
| A3 | Legal + support pages reachable; 404 route; direct deep links | PENDING |
| A4 | Console errors, failed requests, loading states | PENDING |
| A5 | Deferred features are not advertised or linked (§3) | PENDING |
| A6 | No unsupported security/escrow/payout/AI-accuracy claims | PENDING (static: `truthfulPlanClaims.test.ts` PASS) |

### B. Authentication, both roles

| # | Step | Status |
| --- | --- | --- |
| B1 | Fresh client account: required fields, email format, password rules, duplicate registration | PENDING |
| B2 | Verification email → link → verified state; invalid/expired token | PENDING |
| B3 | Login, wrong password, session persistence | PENDING |
| B4 | Same for a fresh freelancer account | PENDING |
| B5 | Role onboarding cannot be bypassed by editing browser state/requests | PENDING |
| B6 | Role-protected routes and APIs reject the wrong role | PENDING |
| B7 | Logout → refresh → Back → saved protected URL → second tab all denied | PENDING |
| B8 | Session expiry / revocation gives a clear error, not a blank page | PENDING |

### C. Client journey

| # | Step | Status |
| --- | --- | --- |
| C1 | Onboarding + profile; validation, edit, refresh persistence, empty states | PENDING |
| C2 | Project draft → edit → publish → detail; invalid budget/scope rejected | PENDING |
| C3 | Search freelancers, filters, profile/portfolio privacy | PENDING |
| C4 | AI matching exposes only allowed public data | PENDING |
| C5 | Invite → pending/accepted/declined → proposals → choose candidate | PENDING |
| C6 | Another client's project/proposals are private (IDOR) | PENDING |
| C7 | Contract accept → workspace → messages → private file upload/download | PENDING |
| C8 | Milestones create/update, deliverable review, revisions, acceptance, completion | PENDING |
| C9 | Review eligibility only after completion | PENDING |
| C10 | Support/dispute + sandbox payment/refund path | PENDING |
| C11 | Cannot alter another client's deliverables, read messages, change amounts, release funds | PENDING |
| C12 | Logout → refresh/Back/protected URL denied | PENDING |

### D. Freelancer journey

| # | Step | Status |
| --- | --- | --- |
| D1 | Onboarding, profile, portfolio, service listing | PENDING |
| D2 | Profile edit, public listing, private fields not exposed | PENDING |
| D3 | No deferred KYC/certificate badge or prompt (§3) | PENDING |
| D4 | Browse/filter projects, submit/edit/withdraw proposal | PENDING |
| D5 | Respond to invitation → proposal accept/reject → contract terms | PENDING |
| D6 | Cannot alter approved scope or unilateral financial amounts | PENDING |
| D7 | Workspace messages, files, milestones, deliverables, revisions, completion | PENDING |
| D8 | Payment/payout status is truthful; unavailable payout is clearly disabled | PENDING |
| D9 | Review only after completion; dispute/support path | PENDING |
| D10 | Cannot read another freelancer's proposals, wallet, files, messages, contracts | PENDING |
| D11 | Logout → refresh/Back/protected URL denied | PENDING |

### E. Admin and operations

| # | Step | Status |
| --- | --- | --- |
| E1 | Admin login, server-side role enforcement, unauthorized denial | PENDING |
| E2 | Audit log entry for a privileged action | PENDING |
| E3 | Handle a report / dispute / refund request / suspicious activity | PENDING |
| E4 | Critical email events arrive in a test inbox; errors log without secrets | PENDING |
| E5 | Backup/restore documented and rehearsed | PENDING (`docs/FOUNDER-RUNBOOK.md`) |

### F. Security and abuse

| # | Step | Status |
| --- | --- | --- |
| F1 | Every sensitive table/RPC/bucket/function tested as anon / own / other / client / freelancer / admin | PARTIAL — `scripts/e2e/pentest-privileges.mjs` needs staging creds |
| F2 | IDOR by substituting project/contract/message/file/wallet/transaction IDs | BLOCKED (needs staging) |
| F3 | XSS, injection-shaped input, oversized/invalid uploads, MIME spoofing, path traversal, CORS, rate limits, brute force | BLOCKED (needs staging) |
| F4 | Webhook bad/missing signature, replay, duplicate, unknown order, wrong amount/currency | PARTIAL — `scripts/e2e/razorpay-webhook-rehearsal.mjs` exists, not run here |
| F5 | Client-side values cannot decide role, price, fees, balance, payout destination, payment state | STATIC PASS (RPC-only money path) — runtime PENDING |
| F6 | Secret scan of bundles, tracked files, logs | PASS (static, `noCommittedSecrets.test.ts`) |
| F7 | Deferred endpoints/cron/jobs remain disabled and can do nothing | **PASS** (see §5, `npm run test:mvp-scope`) |

---

## 5. What is already enforced by code (no human step needed)

`npm run test:mvp-scope` and `src/test/mvpScopeGuard.test.ts` fail the build if
any of these regress:

1. A deferred feature becomes enabled by default.
2. Certificate verification reads a row on the public path.
3. Internships answer any method before the 410 guard.
4. Subscription billing reaches `attemptRenewalCharge` while deferred.
5. The KYC development adapter becomes reachable without `KYC_DEV_MODE_ALLOWED=true`.
6. Any edge function calls `getCorsHeaders` without importing it.
7. A deferred page is rendered by a route instead of `FeatureUnavailablePage`.
8. This document disappears.

---

## 6. Exit criteria for "MVP complete"

A release is only "MVP complete" when **all** of the following are true:

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- [ ] `npm run test:mvp-scope` passes.
- [ ] §4 A–D executed against staging with evidence (screenshots/logs per step).
- [ ] §4 E–F executed, or explicitly accepted as residual risk by the founder.
- [ ] Razorpay **test-mode** payment-in journey completed end to end and reconciled.
- [ ] Payouts either verified in sandbox or disabled in the UI with honest copy.
- [ ] Email delivery verified in a test inbox.
- [ ] Staging migration plan executed once on a restore of production
      (see [STAGING-MIGRATION-AND-ROLLBACK.md](STAGING-MIGRATION-AND-ROLLBACK.md)).
- [ ] §3 cleanup checklist finished and re-tested.

Until then the correct status is **pre-launch**, and the report says so.
