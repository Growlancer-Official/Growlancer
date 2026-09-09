# CLAUDE.md — Growlancer Project Context

Ye file Growlancer repo ke root me rakho (`/CLAUDE.md`). Claude Code isse automatically padhta
hai har session ke shuru me — isliye ye poora context hamesha available rahega, bina baar-baar
explain kiye.

---

## Project kya hai

Growlancer — India-first AI-powered freelancing platform. Founder/CEO: Muhammad. Tech stack:
React/Vite frontend, Supabase (Postgres + Auth + Edge Functions + Storage), Razorpay + PayPal
for payments, RazorpayX for payouts.

---

## Business Model (FINAL — ye badalna nahi hai bina explicit confirmation ke)

- **Platform commission: flat 5%** — client se liya jaata hai, package/contract price ke upar.
  Koi doosra hidden fee nahi. Ye kabhi bhi badalna nahi hai bina explicit instruction ke.
- **Freelancer subscription: ₹299/month, single flat plan** — no yearly, no team plans, no
  separate AI-only plan. Purely optional.
- **Packaging (3-tier: Basic/Standard/Premium)** — sabhi freelancers ke liye FREE, kabhi bhi
  subscription ke peeche gate mat karna.
- **Client AI features: free for lifetime** — kabhi bhi paywall na dikhana clients ko, sirf
  backend me fair-use rate-limit se protect karna (abuse-protection, promise nahi todhna).
- **Ranking/matching/search-visibility: 100% merit-based, kabhi bhi subscription/payment se
  influenced nahi.** `is_pro` ya koi bhi paid-flag kabhi bhi scoring/sorting logic me factor
  nahi honi chahiye. Ye non-negotiable hai — "pay-to-win" iss platform ke core-promise ke
  khilaf hai.
- **Withdrawal/payout processing fee (~2%)** — ye Razorpay/PayPal ka actual transfer cost hai,
  platform ka profit nahi. Pricing/legal pages par commission se hamesha ALAG dikhana.
- **Team Projects**: ek client project ke andar multiple INDEPENDENT contracts (ek per
  freelancer/role) — har contract ka apna escrow/milestone/dispute, ek member ka issue doosre
  ko affect nahi karta. 5% commission har individual contract par lagta hai, koi separate
  "team fee" nahi.

---

## Security Principles (poore codebase audit se seekhe gaye — HAMESHA follow karo)

Ye patterns humne kai rounds ke deep security audit se establish kiye hain. Koi bhi naya code
likhte waqt, agar in principles se conflict ho, to ruk ke flag karo, chup-chap continue mat
karo:

1. **Kisi bhi client-sent amount/price/quantity ko kabhi bhi bharosa mat karo agar wo paisa
   move karta hai.** Payment order create karte waqt, ya koi bhi financial value process karte
   waqt, hamesha server-side database se authoritative value fetch karo (contract.amount,
   package.price, etc.) — client sirf ID/reference bheje, value nahi.

2. **Wallet balance, escrow status, subscription status — ye sab SIRF `SECURITY DEFINER` RPCs
   se change hone chahiye, kabhi bhi direct table UPDATE se nahi.** RLS UPDATE policies in
   financial tables (wallets, escrow, contracts, transactions) par bilkul honi hi nahi chahiye
   end-users ke liye — agar koi naya RLS policy likh rahe ho `FOR UPDATE`, ruk ke socho ki
   `WITH CHECK` clause specific columns/values restrict karta hai ya nahi, "USING(true)" jaisi
   universal policy kabhi mat likhna bina `TO service_role` scope kiye.

3. **Webhooks (payment gateway se aane wale) hamesha fail-closed hone chahiye** — agar signing
   secret missing/invalid hai, request reject karo, kabhi bhi processing skip karke aage mat
   badhne do.

4. **Admin-only actions me hamesha server-side role-check ho** (`profiles.role = 'admin'`
   query karke verify karo) — sirf client-side route-guard par kabhi bhi bharosa mat karo.

5. **Scheduled/cron edge functions me hamesha `CRON_SECRET` verify karo** — koi bhi authenticated
   user (ya anon) directly hit na kar sake.

6. **Kabhi bhi request body se `user_id` accept karke uspar operate mat karo** — hamesha
   `auth.getUser()` se mila caller ka apna ID use karo. Agar kisi resource (ticket, contract,
   dispute) par action lena hai, uski ownership caller ke ID se verify karo, request body ke
   kisi field se nahi.

7. **Naye database function/RPC likhte waqt hamesha migration file me commit karo** — kabhi
   bhi sirf Supabase Dashboard/SQL Editor/MCP se directly production database me create mat
   karo bina migration file banaye. Repo hi source-of-truth honi chahiye, live DB nahi.

8. **RLS SELECT policies bhi audit karo, sirf UPDATE nahi** — koi bhi table jisme private/
   sensitive data hai (financial records, match-scores, private submissions), uski SELECT
   policy specific ownership/participant check kare, generic `auth.role() = 'authenticated'`
   se poori table publicly-readable mat chhodo.

9. **Koi bhi naya money-moving RPC likho to check-list follow karo:** (a) caller ki ownership
   verify, (b) amount server-side se derive/verify, (c) idempotency guard (double-execution na
   ho), (d) row-level locking (`FOR UPDATE`) agar balance change ho raha hai, (e) proper
   transaction/ledger entry record ho.

---

## Code Quality Standards

- **Koi bhi khaali `catch {}` block mat likho** — hamesha console.error/log + user-facing
  toast/error-message do. Silent failures kabhi accept nahi.
- **Native `alert()`/`window.confirm()` kabhi use mat karo** — existing `ConfirmModal.tsx` /
  `Toast.tsx` components use karo.
- **Har naye feature ke baad build/test karo**, aur jo pehle se kaam kar raha tha (especially
  escrow/payment/auth flows) usko regression-test karo — kuch tootha nahi ye confirm karke hi
  aage badho.
- **Koi bhi dummy/placeholder/mock data production code me mat chhodo.** Agar koi feature
  incomplete hai, usse clearly TODO/comment se flag karo — silently fake data se cover mat
  karo jo real jaisa lage.
- **Naya edge function banate waqt hamesha check karo**: auth check chahiye ya nahi (agar
  chahiye, `auth.getUser()` call karo), rate-limiting chahiye ya nahi (AI/cost-heavy calls ke
  liye hamesha chahiye), aur CORS config sahi hai.

---

## Kaam karne ka tareeka (behavioral instructions)

- Jab bhi koi naya feature ya fix maanga jaaye, **pehle upar diye security-principles aur
  business-model constraints ke against check karo** — agar koi conflict lage (jaise koi
  suggestion jo ranking ko paid-bias de de, ya koi RLS policy jo bahut open ho), **implement
  karne se pehle flag karo**, chup-chap implement mat karo.
- **Real-time, production-grade code likho har baar** — koi bhi "yahan baad me fix karenge"
  wala shortcut, koi bhi hardcoded/fake response jo asli lage but real na ho — ye explicitly
  mना hai.
- Jab bhi koi naya migration/RPC/edge-function banao, existing patterns (jo upar security
  principles me hain) follow karo — naya alag pattern mat invent karo bina reason ke.
- Agar koi request ambiguous lage ya multiple approaches ho sakte hain, ek reasonable default
  choose karke proceed karo (assumption clearly bata do), poori tarah ruk mat jaao — but agar
  security/money/business-model se related decision hai, to confirm zaroor karo pehle.
- Jab kaam complete ho jaaye, ek chhota summary do ki kya change hua, kya test kiya, aur agar
  koi cheez abhi bhi verify karni baaki hai (jaise dashboard secrets set karna) wo explicitly
  bata do.

---

## Current Status (jaise-jaise fix hote gaye, ye section update karte rehna)

✅ Poora security audit complete — RLS (SELECT/UPDATE/DELETE saari policies), 27+ edge
functions, saari RPC grants — sab verified/fixed (wallet-balance direct-manipulation, escrow
amount-tampering, open RLS policies, webhook fail-open, IDORs — sab close ho chuke).

✅ Business model implement — packaging, ₹299 subscription, pricing-transparency pages,
merit-based ranking confirmed.

✅ Team Projects feature — multi-freelancer, independent-contracts architecture, live.

✅ 2026-09-07 hourly security scan: sab 16 findings resolved — 9 open_storage_write + 1
hold_wallet_funds definer false positives theek kiye (20270117010000/…18000000 monitor
render-aware + search_path pinned), aur last genuine issue (authenticated internship resume
policy) harden kar diya — resumes/ + .pdf-only, monitor me accepted-exception whitelist,
stale alert resolved (20270119000000). Bucket private, admin-only signed-URL reads.

✅ KYC real-time engine (Sep 2026) — `kyc-submit` edge function, provider abstraction
(Surepass/Deepvue switch via 1 adapter), duplicate-identity protection (DB trigger +
pre-flight), realtime status flips, email gate, rate limits.

✅ 2026-09-07 completeness pass — About-page "countries" metric live (RPC + hook,
20270119000001), team-role hire in-app notification (20270119000002, type 'contract',
best-effort — contract stays pending till client funds), dead `getResumeUrl` removed.
Currency prep already centralized in `src/lib/currency.ts` (remaining ₹ hits are
comments). Routes/useParams audit clean; edge-function auth + rate-limit coverage
verified. TODO/FIXME count == 0 outside the one accepted internship email review note.

✅ 2026-09-08 live E2E playtest (freelancer ↔ client, real browser) — full loop verified:
freelancer onboarding → project-feed apply → client Accept & Hire → wallet-fund escrow
(5% fee math correct) → freelancer sees active contract + notifications. Defects found &
fixed live: team-project "Add Role" edit form was blank/duplicating (ClientPostTeamProjectPage
now honors `?edit=`), team-role creation crashed on non-existent `row_to_jsonb` in
`refresh_role_suggestions` (20270119000003, applied), and wallet-funded escrow notification
rendered raw NUMERIC scale ("INR 7875.0000000000000000") — RPC now `to_char`-formats +
stored rows repaired (20270119000004, applied), and contracts showed "Started —" even
when active — `admin_fund_escrow` now sets `start_date` on funding + backfill
(20270119000005, applied). Service-layer tests added: teamProjects
(17 tests). Full suite 124 tests green.

✅ 2026-09-08 mobile E2E playtest (Playwright, iPhone 12 / SE / Pixel 5
emulation, real auth against live DB) — ROOT CAUSE found & fixed: vike SSR
head (`pages/+Head.tsx`) had NO viewport meta, so phones fell back to Chrome's
980px layout viewport → whole site rendered zoomed-out tiny (~0.4×), which is
why auth/verified-badge/layout all looked broken on mobile. Viewport meta added
(`width=device-width, initial-scale=1, viewport-fit=cover`) — now 390px layout,
scale 1.0, 0 horizontal overflow on home/dashboard/verification/contracts.
Second fix: cookie banner (`fixed bottom-0 z-50`) covered the mobile menu's
Login/Sign Up (menu was `z-40`) → menu raised to `z-[60]` (below Z_MODAL=100).
Repeatable regression suite: `npm run test:e2e:mobile` (scripts/playtest-mobile.mjs)
— 3 devices × 11 checks (layout overflow, tap targets, menu, login, drawer,
verification, contracts, logout, client login) — 0 failures.

✅ 2026-09-09 full pre-launch QA round (real-time, all sections):

- **Admin panel revived (was fully dead)**: `profiles_private.is_admin` was false for
  every admin (migration-drift from 20261221000000), so every admin-data call 401'd →
  all stats showed 0. Fixed data-sync + broken `grant_admin_role` RPC (referenced
  non-existent `user_id` column; PK is `id`) in 20270119000006. Also added
  `profiles_private` to admin-data ALLOWED_TABLES (AdminUsersPage private-merge was
  always 403), admin SELECT/UPDATE policies on support_tickets/ticket_messages
  (20270119000007 — admin panel had never seen tickets), and AdminDashboard
  queries migrated off removed `profiles.suspended_at`/`email` columns
  (users/contracts/payments/projects/subscriptions pages now private-merge emails).
- **Admin suspend flow fixed**: native `prompt()` replaced with ConfirmModal + reason
  input; suspend persists to `profiles_private` via adminUpdate; status badge now
  reflects suspension (was always "Active"). Suspend → reactivate round-trip verified.
- **Support tickets routed**: SupportTicketsPage was fully built but unrouted —
  added `/dashboard/tickets` + `/client/tickets` routes and sidebar links; live
ticket create → admin reply → DB round-trip verified.
- **Wallet/top-up UX**: negative top-up amounts now hide the checkout button with an
  inline hint (server-side ₹50–₹1,00,000 bounds were already solid).
- **“Total Earnings” stat fixed**: no longer counts active (escrow-held) contracts as
  earned — escrow shows in its own stat; double-count removed.
- **Mobile dashboard deep-dive (37 pages, 375px)**: audit script
  `scripts/audit-mobile-dashboard.mjs`; fixed every substantiated defect — chat
  manage/copy buttons 32→40px, notifications copy-ref 30→40px, client projects &
  invites ⋮ menus 32→40px, referrals copy 16px→40px hit area, services
  edit/delete 28→36px, analytics timeframe buttons ≥36px, certification/test cards
  stack cleanly with truncate, client reviews rating grid stacks 4→2 cols on phones.
  Remaining audit flags verified as false positives (content-sized inner divs inside
  healthy stacked layouts). Final: 0 overflow, 0 tiny targets on all 37 pages.
- Full suite 124 tests green; `test:e2e:mobile` 0 failures — now 0 WARNINGS too
  (the old SSR hydration warning is gone after the head fixes).

✅ 2026-09-09 (later) **KYC CORS blocker fixed + full money-loop E2E**:
- **CRITICAL**: `kyc-submit` (and 5 more functions: invoice, email-notifications,
  paypal, verify-document, razorpay-payout-webhook) had CORS Allow-Headers WITHOUT
  `x-app-version`, but the global supabase client attaches `x-app-version` to EVERY
  request → browser preflight failed → `functions.invoke` = "Failed to fetch" →
  PAN verification stuck on "In Progress" FOREVER (dev-mode never flipped,
  production would too). Fixed headers (x-app-version, x-app-name added) and
  deployed all 6 — live-verified: KYC now completes in seconds.
- Withdrawal E2E with real flow: add UPI payout method → ₹1,000 withdraw →
  KYC gate fired (fail-closed ✓) → after dev-KYC verify → withdrawal submitted,
  balance 7500→6500, debit txn pending, reference ID shown. Money-math correct.
- Payout "Add Method" earlier silent-failure was a session flake, not a bug —
  re-verified working (row created, list refreshes, RazorpayX link attempt).
- What ONLY the user can do before real launch: (1) flip KYC to production +
  provider token (dev rows must re-verify), (2) Razorpay LIVE keys (currently
  test mode — top-ups/escrow would take test money only), (3) BREVO_API_KEY
  secret (emails silently skipped without it — logged only), (4) production
  domain + env vars on Vercel (vercel.json exists; vike SSR build noted),
  (5) RazorpayX payout activation + webhook URL config for auto-withdrawals.

⚠️ KYC provider — abhi `kyc_provider_config.mode = 'development'` (admin panel se toggle):
users auto-verify instantly, rows honestly labelled `provider='dev_mode'`. Revenue aate hi
admin → Verification → Production + provider token (SIRF REAL provider se VERIFIED; dev rows
dobara real verify karne honge). `document_hash` live par GENERATED column hai — function se
kabhi write mat karna (428C9 error, silent pending-fail cause tha).

⚠️ Pending (chhote items): currency-consistency prep is done (centralized formatter).
Team-project freelancer NOTIFICATION is done (in-app hire notice); a separate
freelancer ACCEPT-STEP (explicit accept before contract creation) is not implemented
by design — contracts stay 'pending'/unfunded until the client funds them, so no
money moves without the freelancer's involvement.

Jab in dono ka fix aaye, ye status-section update kar dena taaki future sessions ko pata rahe.