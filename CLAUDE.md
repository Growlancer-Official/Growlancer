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

## Standing Rule: Har Change → Audit → Deploy (MANDATORY — founder ne explicit bola hai)

Har koi bhi change (fix/feature/refactor) complete hone par, HAR BAAR, bina pooche:
1. **Security audit** — full uncommitted diff ko upar diye Security Principles ke against scan karo
   (secrets, money-path client-trust, RLS, webhook fail-open, IDOR, request-body user_id).
   Untracked files bhi check karo (test artifacts me keys/logs ho sakte hain — `tests/e2e-artifacts/`
   aur `.e2e/` gitignored hain, kabhi commit mat karna).
2. **Verify** — `npm run typecheck` + `npm test` + (UI changes par) `npm run build`.
3. **Frontend + Backend DONO push to `origin main` REAL-TIME** — frontend push = Vercel deploy;
   backend changes (`supabase/functions/**`, `supabase/migrations/**`, `supabase/config.toml`) push =
   **`backend-deploy.yml` auto-runs**: migration drift-check (fail-closed) → `db push` → saare edge
   functions redeploy. Matlab frontend aur backend HAMESHA saath deploy hote hain, real-time me.
   "Deploy on GitHub" ka matlab yahi hai: commit hoke push ho gaya to dono deploy ho gaye. User ko
   report me hamesha batao: kya commit hua, push hua ya nahi, aur deploy-abhi-live hai ya pending.

### Backend deploy rules (naya — founder directive: backend bhi all-time real-time push)
- **Repo = source-of-truth, live DB nahi.** Koi bhi DB/RPC/RLS change pehle migration file me,
  phir push (workflow apply karega). Dashboard/SQL-Editor se direct production change KABHI nahi.
- **Backend push se pehle LOCAL drift-check**: `npx supabase migration list` — ek bhi
  local≠remote row = pehle resolve karo, push mat karo (workflow bhi fail-closed gate hai).
- **Functions deploy hamesha repo se** (workflow loop, `_shared` skip). Manual `functions deploy`
  sirf emergency me, uske baad turant commit+push taaki repo wapas source-of-truth ho.
- **Secrets**: functions ke secrets `npx supabase secrets list` se naam-verify hota hai; VALUES
  kabhi print/commit nahi karni. Repo me `SUPABASE_ACCESS_TOKEN` GitHub secret chahiye (one-time).
- **Money-path migration** (escrow/wallet/RLS) push = money-touching change — push se pehle
  Security Principles §2/§9 checklist khud se verify karo, phir hi push.

## Current Status (jaise-jaise fix hote gaye, ye section update karte rehna)

✅ Poora security audit complete — RLS (SELECT/UPDATE/DELETE saari policies), 27+ edge
functions, saari RPC grants — sab verified/fixed (wallet-balance direct-manipulation, escrow
amount-tampering, open RLS policies, webhook fail-open, IDORs — sab close ho chuke).

✅ Business model implement — packaging, ₹299 subscription, pricing-transparency pages,
merit-based ranking confirmed.

✅ Team Projects feature — multi-freelancer, independent-contracts architecture, live.

✅ KYC real-time engine (Sep 2026) — `kyc-submit` edge function, provider abstraction
(Surepass/Deepvue switch via 1 adapter), duplicate-identity protection (DB trigger +
pre-flight), realtime status flips, email gate, rate limits.

⚠️ KYC provider — abhi `kyc_provider_config.mode = 'development'` (admin panel se toggle):
users auto-verify instantly, rows honestly labelled `provider='dev_mode'`. Revenue aate hi
admin → Verification → Production + provider token (SIRF REAL provider se VERIFIED; dev rows
dobara real verify karne honge). `document_hash` live par GENERATED column hai — function se
kabhi write mat karna (428C9 error, silent pending-fail cause tha).

✅ Pre-launch E2E hardening (Sep 16, 2026) — device-matrix + fullsite sweeps (13 devices /
41 routes), auth+nav flow harness (`scripts/e2e/`), mobile viewport-meta launch-blocker,
SPA-fallback hydration (#418) fix (`vite.config.ts` boot-splash), `server.js` static-first
fallback, ~40 a11y/heading fixes. Report: `docs/PRE-LAUNCH-TEST-REPORT.md`. Test artifacts
`tests/e2e-artifacts/` gitignored (console captures me anon-key JWTs ho sakte hain).

✅ Element-level UI audit (Sep 16-18, 2026) — `scripts/e2e/element-audit.mjs` (111 URLs ×
375/768/1280, 5 groups) + interactive checks + **authenticated sweep** (real session per role).
Defect log: 12 entries — 2 High (waitlist fake-success; CORS allow-list blocked every
browser edge-function call outside `localhost:5173`), 4 Medium, 2 Low fixed; 2 Low open
(dashboard card headers H3-directly-under-H1 → tracked refactor; cookie-consent banner
overlaps the dashboard sidebar's Homepage/Logout until dismissed → design call, flagged
not changed). The 5 raw-noise classes from the authenticated pass were harness
false-positives and were fixed IN the harness, not silenced. Post-fix: 336 authenticated
loads, 0 issues; logout-flow 5/5 × 3 roles. Full detail: `docs/UI-ELEMENT-AUDIT-REPORT.md`
§4 + §8.
Report: `docs/UI-ELEMENT-AUDIT-REPORT.md`. dashboard/SupportTicketsPage ab routed hai
(`/dashboard/support-tickets` + `/client/support-tickets`, dono sidebars) — orphan defect fixed.
Authenticated runs (LIVE in CI since `a3cb3a5`, Sep 17): 3 permanent E2E test-accounts
(`scripts/e2e/create-test-accounts.mjs` — idempotent; emails in gitignored `.env.e2e`,
secrets `E2E_*_EMAIL/_PASSWORD` in repo; admin profile role server-side 'admin' via
bypass-hook one-off migration, repaired out of history) → CI builds with real (public)
`VITE_SUPABASE_URL`/`_ANON_KEY` secrets so `login.mjs` reaches the live backend →
authenticated element-audit per role-group + `logout-flow.mjs` (back-button security).
GitHub Actions log me credentials `***`-masked print hote hain — logs share karna safe. CI: `.github/workflows/ci.yml` (typecheck+tests+build+
element-audit on every push/PR) — **first green full run: #413** (`28a0e86`). CI strict-audit
debugging: failures surface as `::error::` annotations (check-runs API se public-readable,
logs/artifacts admin-token-gated hain); runner uses Linux DejaVu fonts → header/nav layouts
jo Windows par fit hain wahan overflow kar sakte hain (fixed: nav apna scroll-container).
Expected-error console noise is downgraded to `console.warn` in lib code so strict-audit
stays green.

✅ Profiles-PII fallout sweep (Sep 20, 2026) — migration `20261221000000` ne `email`,
`onboarding_completed`, `suspended_at`, `is_admin` aur `bio` `profiles` se hata diye the, par kuch
call-sites peeche reh gaye the → poore admin console ke tables khaali aa rahe the (metrics, users,
projects, contracts, payments, subscriptions, certificates), aur `subscription-billing-cron`,
`milestone-auto-release`, `email-notifications`, `ai-matching` bhi chup-chaap fail ho rahe the.
Fix: naya shared helper `src/lib/adminProfileDirectory.ts` (naam `profiles` se, email
`profiles_private` se) + `admin-data` me `profiles_private` allow (column-guard ke saath: `is_admin`
/ `email` / `phone` proxy se write nahi ho sakte). CORS recurrence bhi close hui — 16 edge
functions apni purani private allowlist (sirf `localhost:5173` + prod) chal rahe the aur `kyc-submit`
/ `verify-document` `*` wildcard de rahe the; sab `_shared/cors.ts` par aa gaye, aur
`src/test/cors.test.ts` ab fail karta hai agar koi dobara apna CORS likhe. Admin a11y ke 5 inputs +
2 icon-buttons fix, `login.mjs` tokenless session likhne se mana karta hai, CSP me
`cdn.fontshare.com` add. Real data render hone par 3 aur galat column-name nikle (`projects.skills`,
`subscriptions.end_date`, aur `invoices` allow-list me hi nahi tha) — teeno live schema ke against fix.
Verify (dono backend deploys ke baad, LIVE): typecheck + 150 tests + build clean; dashboard 72/0,
client 72/0, **admin 51 loads par 0 raw flags** (real rows ke saath); admin-data probes 200+, `is_admin`
write 403 (column guard hold karta hai), CORS preflight matrix sahi, login 3/3 roles. Deploy: `511da5e`
+ `f6b61a4` pushed to main (Backend Deploy ✓, drift-check clean). Details:
`docs/UI-ELEMENT-AUDIT-REPORT.md` §9.

⚠️ Pending (chhote items): currency-consistency prep (multi-currency future ke liye), team-
project freelancer notification/accept-step.

⚠️ Known CI red (Sep 20, 2026): CI ka element-audit job fail ho raha hai kyunki `E2E_FREELANCER_*`
GitHub secret stale hai — Supabase auth logs me `400 invalid_credentials` (client/admin login theek
chal rahe hain, local `.env.e2e` se teeno roles login karte hain). Fix: repo me
`node scripts/e2e/create-test-accounts.mjs --push-secrets` (ya `--rotate --push-secrets`). Login
helper ab ye reason khud report karta hai (timeout ki jagah). Details: report §9.3.

⚠️ Flagged (founder ka call chahiye): `admin-data` proxy `wallets` / `escrow` / `transactions` par
bhi direct write karta hai — money tables Security Principle §2 ke hisaab se sirf SECURITY DEFINER
RPCs se change hone chahiye. UI in write-paths ko use karta nazar nahi aata, par ye money-path
decision hai — chup-chaap change nahi kiya (report §9.2).

Jab in dono ka fix aaye, ye status-section update kar dena taaki future sessions ko pata rahe.