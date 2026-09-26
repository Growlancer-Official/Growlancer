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

📋 **Launch readiness — founder ke liye single checklist: `docs/LAUNCH-READINESS.md`.** Har baaki
blocker ek owner-action + verification step ke saath hai (A: real money se pehle zaroori config/
supply, B: engineering backlog jo go-ahead mangta hai, C: verified-working cheezein taaki dobara
na ki jaayein). Koi bhi naya blocker mile to usi file me update karo, ye section nahi phulana.

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

✅ Stale-profile-column cleanup + launch-data wipe (Sep 20, 2026, `20270119000009`) — pichhle
sweep ke baad bhi 9 DB functions `profiles` ke un columns ko padh rahe the jo `20261221000000` ne
`profiles_private` me bhej diye the. Sab runtime par 42703 dete the, aur `EXCEPTION WHEN OTHERS`
me chhup jaate the: `process_referral` har referral code reject karta tha;
`request_account_deletion` / `process_account_deletion` chalti hi nahi thi (account deletion shuru hi
nahi hota); `delete_user_all_data` ek hi statement me role+email padhta tha apne handler ke andar →
dono NULL → role-specific row aur saari email-scoped PII (waitlist/newsletter/contact/internship)
deletion ke baad bachi rehti thi; `purge_orphan_user_data` har run fail; `is_admin_user` /
`is_user_suspended` dead-but-broken; `admin_signup` (anon-callable SECURITY DEFINER + hardcoded
secret) live wapas aa gaya tha; `handle_new_user` / `handle_new_profile_private` orphaned. Do grant
holes bhi band: `process_account_deletion` PUBLIC ko granted tha bina caller-check ke (jaan-boojh ke
delete), aur dono admin checks anon-executable the. Migration me 3 fail-closed assertions hain, aur
lambi bodies retype karne ke bajaye patch ki gayi hain (anchor mismatch = migration fail, silent no-op
nahi). `db push` ne dava diya tha ki `process_referral`/`request_account_deletion` ke DEFAULTs
drop nahi kiye ja sakte (42P13) — isliye wo defaults waise hi rakhe gaye.

⚠️ CI ka drift-gate bug (fix ho gaya): pre-push check har naye migration file ko "local-only drift"
maan ke fail kar deta tha — matlab repo ke through koi naya migration deploy hi nahi ho sakta tha
(silently). Ab `pre` mode me sirf **remote-only** (DB me hai, repo me nahi) hi drift hai aur pending
migration pass ho jaata hai; `db push` ke baad naya `post` step dono direction check karta hai.

✅ Live launch data clean (Sep 20, 2026) — 8 test accounts (`qafreelancer`, `qaclient`, `playtest`,
`freelancer.test@mydomain.com`, `client.test@mydomain.com`, 3 `e2e.*@growlancer-test.com`)
`delete_user_all_data` se fully cascade karke delete kiye (har ek `errors: []`, aur `email_scoped` step
chala = upar wala fix proven). Ab live: contracts/escrow/reviews/projects/services/transactions
**0**, aur `get_public_platform_metrics()` → `{escrow: 0, reviews: 0, satisfaction: null, countries: 2}`.
Bache 6 profiles real accounts hain (founder + signups), isliye About/Home aise dikhte hain:
**Members 6 · Escrow ₹0 · Satisfaction "New" · Countries 2** — sab DB-backed, koi fake number nahi.
About ka real-time canvas ab **har typing cycle par fresh DB values** padhta hai (`LiveCodeTerminal`
`onCycle` → `refresh()`, aur pehle `countries` hook me hardcoded `null` tha → "— countries" print hota
tha). Realtime channel sirf un tables par hai jo anonymous visitor sach me padh sakta hai (profiles,
reviews) — escrow ki RLS policy sirf contract parties ko deti hai, isliye wo ab public page par
subscribe nahi hota (warna unauthorized console error). Marketing copy se "join thousands of
clients" claim bhi hata diya.

✅ CI self-seeding + fail-closed guard (Sep 23, 2026 — `src/test/ciGuardrails.test.ts`) — test
accounts production me permanently nahi rehte: CI job unhe start par seed karti hai aur `always()`
teardown step se hata deti hai (`scripts/e2e/remove-test-accounts.mjs`, idempotent,
"already_absent" par safe). Ab guard **self-skip nahi karta** — dekho neeche wala ✅ entry: missing
secret = job RED, aur founder ke paas sirf **ek** secret add karna hai (`SUPABASE_SERVICE_ROLE_KEY`;
`SUPABASE_URL` ab `VITE_SUPABASE_URL` se fallback leta hai, aur chhe `E2E_*` secrets already set hain
— `gh secret list` se verified).

✅ Launch-readiness closure (Sep 20, 2026, `20270119000010`) — `request_account_deletion` ne
`pg_proc` reading ke baad BHI kaam nahi kiya: ek real user se chalane par `23502` aaya, kyunki
`user_deletion_requests.confirm_token` / `confirm_token_expires_at` NOT NULL hain bina default ke aur
INSERT dono nahi de raha tha (aur `notifications.link` likh raha tha, jo column exist hi nahi karta —
sahi naam `action_url` hai). Matlab account deletion pehle se hi **kabhi** start nahi ho sakta tha.
Ab token 64-hex-char UUID entropy ke saath generate hota hai + fail-closed assertion NOT NULL columns
check karta hai. Asli user bankar end-to-end verify kiya (create → sign-in → profile → referral →
deletion request → full cascade): **9/9 checks**, `delete_user_all_data` `errors: []` aur
`email_scoped` step chala; throwaway account `finally` me khud ko delete kar deta hai. **Lesson:** do
round catalog-reading ne wo constraint nahi dekha jo ek asli call ne turant pakad liya — schema
introspection write-time rejection nahi dikha sakti.

✅ Signup silent-failure band — signup ke peeche ab koi DB trigger nahi hai (`handle_new_user`
orphaned tha, drop kar diya), isliye profile row sirf browser ke `create_user_profile` call se banti
hai — aur wo failure `devWarn` tha jab user ko "Account created successfully" dikh raha tha. Ab dono
fallbacks `console.error` karte hain aur user ko saaf message milta hai (auth account sach me banta
hai, isliye failure report karna galat hota aur email occupied hone ki wajah se user phas jaata).

✅ `admin-data` money-path band (defect #22 closed) — `wallets` / `escrow` / `transactions` par
insert/update/delete ab 403, read jaise tha waise. In rows ko sirf SECURITY DEFINER RPCs se badalna
hota hai (Security Principle §2); app ka har call-site read ya realtime subscription hai, isliye koi
capability nahi gayi.

✅ Cookie banner overlap fix — first-visit banner `fixed bottom-0` hai aur dashboard/client sidebar
full-height, isliye Homepage/Logout live consent tak unreachable the. Ab banner apni **measured**
height `--consent-banner-h` me publish karta hai (ResizeObserver, narrow screens ke wrap ke liye) aur
dono sidebars `100vh` se subtract karte hain — unset = `0px`, yaani jinhone already answer kar diya
unke liye layout bilkul same. 3 tests contract lock karte hain.

✅ CI gate theek — authenticated audit ab seed-capability par gated hai (service key + teeno
passwords), `E2E_FREELANCER_EMAIL` par nahi. Stale secret gate kholé rakhta tha aur accounts gone the
→ job credentials par fail hota tha, product par nahi. **UPDATE (Sep 23, 2026):** ye "missing config
= pass skip" policy ab ULAT di gayi hai — neeche wali fail-closed entry dekho. Silent skip hi
asli defect tha: green check ek aise guardrail ke upar baith raha tha jo kabhi chala hi nahi.

✅ Country stat + ownership fix (Sep 20, 2026, `20270119000011`) — "Countries with members" 1 hi
country ko 2 dikha raha tha: OAuth country-gate `IN` bhejta hai, onboarding `India`, aur
count(DISTINCT) dono ko alag gin raha tha. Ab `normalize_country()` reference table se canonical
name store karta hai (dono paths converge), purani rows backfill, metric normalized value ginta hai.
Saath me `update_user_country` arbitrary `p_user_id` accept kar raha tha bina caller check ke (koi bhi
user kisi ka bhi country badal sakta tha) — ab owner-only. Verify: do throwaway accounts se 6/6
(owner `IN` → `India`; cross-user write → Unauthorized, victim untouched); live: 6 profiles,
stored `India`, metric `{countries: 1}`, About `6 / ₹0 / New / 1`.

✅ Authorization hardening + signup repair (Sep 22, 2026, `20270119000012`) — systematic IDOR +
EXECUTE-grant audit: **21 functions** ko caller-ownership/admin guard mila (13 notification/push/
wallet-read/match RPCs arbitrary `p_user_id` le rahe the → koi bhi kisi ka bhi notifications/push
tokens/wallet balance padh sakta tha; `create_user_profile` anon-callable tha aur kisi ka bhi profile
overwrite kar sakta tha; `get_team_role_contract`, `generate_project_matches`/`upsert_project_matches`,
`generate_credential_token`, aur credential audit writers bina check ke). **20 functions server-only**
(anon+authenticated se EXECUTE revoke, service_role re-granted + asserted) — including
`update_wallet_balance` (owner-branch se self-credit ho raha tha), `hold/release_wallet_funds` +
`process_withdrawal_complete` (withdrawal edge ab apne service-role client se call karta hai),
payment/webhook internals, cron/maintenance, `get_user_email` (PII). `cleanup_verification_rate_limits`
bhi server-only (uska 15-min DELETE hi public verify ka live window tha) → `cleanup-verification-rate-limits`
cron add hua; shared `cleanup_expired_rate_limits` jaan-boojh ke callable rakha (24h se purani rows hi
delete karta hai, ~16 edge functions use karte hain). `create_user_profile` par `anon` grant bacha
(email confirmation on hone par signUp ke turant baad session nahi hota) — guard sirf just-signed-up
auth row ko create karne deta hai, existing profile overwrite nahi. Saath me real bug fix:
`create_user_profile` `referral_code` `profiles` se padh raha tha (42703 since `20261221000000`) — yaani
har real signup RPC par fail ho kar browser ke fallback par ja raha tha.
**Dry-run ne 3 defects pakde** (rolled-back transaction, live DB par): lowercase `begin` par case-
sensitive anchor fail; `get_wallet_balance_v2` ka poora body single line me hai (whole-line anchor nahi
milta); aur single-line body par guard ka trailing `-- comment` baaki body ko kha jaata tha. Ab anchor =
verbatim body me pehla word-boundary BEGIN (case-insensitive) + whole-line cross-check, aur injection
newline ke saath band hota hai. Verify: catalog-confirmed grants, 10 functional probes (owner pass /
cross-user Unauthorized / anon signup-create pass / service_role pass / admin-only pass) + poora
assertion block (21/20/19 counts) live par rolled-back transaction me chala; typecheck + 178 tests +
build clean; naya `src/test/serverOnlyRpcs.test.ts` list migration se padh kar enforce karta hai ki koi
app code server-only RPC ka naam dobara na likhe.

✅ Privilege-column lock (Sep 22, 2026, `20270119000013`) — independent deep-audit pass ne `20270119000012`
ke BAAD ek aur class pakdi: **self-writable trust columns**. (a) `profiles_private.is_admin` —
`20261221000000` ne flag ko `profiles` se yahan move kiya, par naye table ko na column-locked RLS policy
mili (sirf `USING/WITH CHECK (auth.uid() = id)`) na protect-trigger, aur ACL table-wide UPDATE/INSERT
deta tha → probe me self `is_admin=true` **ALLOWED rows=1**. Impact sirf flag-flip nahi: `admin-data` ka
`verifyAdminSession` **sirf** `profiles_private.is_admin` padhta hai, yaani ek PATCH = poora admin proxy
(saare users ki email/PII, payments, escrow, contracts, suspension writes). Saath hi
`suspended_at`/`suspend_reason`/`banned_at` bhi self-writable the → suspended/banned user khud apna ban
hata sakta tha (ALLOWED rows=1). (b) **Reputation columns**: `profiles.rating`/`total_reviews` aur
`freelancer_profiles.rating`/`total_reviews`/`reputation_score`/`weighted_rating` kisi guard me nahi the →
self `rating=5.0, total_reviews=999` **ALLOWED rows=1**; ye wahi numbers hain jo client-side search,
matches, proposals, invites aur "top rated" gate render karte hain → merit-based ranking promise ka direct
break. Fix (dono layers, codebase ke existing patterns): table-wide UPDATE/INSERT revoke + sirf
client-write columns (`id, email, phone, referral_code, onboarding_completed, created_at, updated_at`) ka
column-grant, plus `protect_profiles_private_privilege_columns()` BEFORE INSERT OR UPDATE trigger
(INSERT bhi, warna naya row `is_admin=true` ke saath aata hai); reputation ke liye dono purane guard
extend hue aur `update_reputation_score` (in columns ka **akela** legitimate writer, review-trigger se
chalta hai) ko `app.bypass_privilege_check` flag mila. Legit paths intact (dry run): service_role admin
suspend ALLOWED, signup-shape INSERT ALLOWED, email update ALLOWED, `complete_onboarding()` definer path
ALLOWED, `update_reputation_score` ALLOWED; self-writes BLOCKED (ACL 42501, aur ACL jaan-boojh kar wapas
kholne par trigger P0001). **Dry-run ne 2 harness bugs bhi pakde** (stale `app.bypass_privilege_check`
phases ke beech leak ho raha tha; test ka lazy regex zero-width match kar ke vacuous pass de raha tha) —
dono fix hue aur negative-control se prove hue. Verify: typecheck + 185 tests (7 naye
`src/test/profilesPrivatePrivilegeGuard.test.ts`) + build clean. Details: report §13.

✅ Runtime pentest + self-detecting drift monitor (Sep 22, 2026, `20270119000014`) — §13 ne SQL-level
(rolled-back) probes se locks prove kiye the; browser PostgREST/RLS/ACL ke through aata hai, isliye
ab **real HTTP pentest** bhi hai: `scripts/e2e/pentest-privileges.mjs` ek throwaway account banata hai
(service-role admin API, `email_confirm`), uske real JWT se 8 escapes try karta hai, phir usi
full-cascade path se account delete karta hai (`finally` me, isliye interrupted run bhi kuch nahi
chhodta). Result: `is_admin` self-grant / suspension self-lift / INSERT-with-is_admin → 403 `42501`;
`profiles.rating` + `freelancer_profiles` reputation inflate → 400 `P0001`; wallet self-credit +
`hold_wallet_funds` → 403 `42501`; `grant_admin_role` non-admin → Unauthorized; values unchanged
(is_admin/suspension/rating/role/balance sab), legit paths (`create_user_profile`, onboarding flag,
`complete_onboarding()`, profile name) intact, teardown 0 leftovers (live counts wapas 6). **Probe ne
apni hi ek galti pakdi** (same trap as §13.6): `HTTP 200 []` ko failure samajh raha tha, jabki wo
"0 rows matched" hai — account ke paas `freelancer_profiles` row hi nahi thi, isliye guard reach hi
nahi hua; ab script pehle row banata hai aur escape ka faisla **rows-changed** se karta hai, HTTP
status se nahi. Saath me class **self-detecting** ho gayi: naya server-only
`self_writable_trust_columns()` (trust-shaped column + `authenticated` UPDATE + owner-scoped policy +
koi `protect_*` trigger nahi) aur `check_security_drift()` usko hourly sweep karta hai
(`self_writable_trust_column` alert, admin/role ke liye `critical`) — koi naya cron nahi, existing
alert-email path hi use hota hai. Migration **positive control** ke saath aata hai: apne transaction me
ek violator table banata hai, detector se usse flag karwata hai, drop karta hai, phir live schema se
**0 findings** maangta hai — yaani detector toota ho to deploy fail hota hai. Dry run (live DB,
rolled back): positive control flagged, baseline 0, `check_security_drift()` 0 return, 0 alerts.
Negative control (exception list me chupke `profiles_private.is_admin` daalna) unit test fail karta
hai. Verify: `npm run typecheck` + **188 tests** (10 `profilesPrivatePrivilegeGuard.test.ts` me) +
build clean. Details: report §14 (runtime table + drift monitor).

✅ Member count honest + ghosts gone (Sep 23, 2026, `20270119000015`) — jo 2 **ghost profiles**
(`pemin@` / `piveme@growlancer.com`, Aug 28) flagged the, wo migration ke andar hi
`purge_orphan_user_data()` se hat gaye (idempotent, fail par poora rollback, aur post-purge assertion
ki koi orphan bacha nahi). Saath me `get_public_platform_metrics()` ab `memberCount` deta hai = living
profiles ⋈ `auth.users` (yaani jo abhi bhi sign-in kar sakte hain), `profiles.count` nahi — live ab
**4** (pehle 6). Hook ka purana `profiles` count-query bhi hata diya: members ab usi RPC ke
`memberCount` se aata hai, isliye ek hi source-of-truth hai. **Regression jo isi pass me pakdi gayi:**
us hook me `.join('auth.users', …)` likha gaya tha, jo supabase-js me exist hi nahi karta (typecheck
fail) — ab hata diya.

✅ Escrow money-path runtime pentest + 3 live fixes (Sep 23, 2026, `20270119000016`) — §14 ka harness
gaye ab **teen** throwaway accounts (client + freelancer + ek non-party) ke saath poora money path
real HTTP par drive karta hai: `create_contract_with_escrow` → fund → release → dispute → withdraw,
har step par cross-party / non-admin / **anonymous** attempt (refuse hona chahiye) + owner path
(kaam karna chahiye). 72 checks, 34 escape attempts. Pehle run me 7 failures:
**(a) HIGH** — `raise_contract_dispute` `anon` ke liye EXECUTE-granted tha aur uska guard
`auth.uid() NOT IN (…)` NULL-safe nahi (anon ke liye `NULL NOT IN` = NULL = falsy, guard fire h
i nahi karta) → ek unauthenticated request kisi bhi contract ka escrow freeze kar sakta tha; wahi shape
`create_contract_with_escrow` (`p_client_id <> auth.uid()`, anon ne **contract bana diya**) aur
`cancel_withdrawal` (held funds balance me wapas) me bhi thi. Fix do layer me: 30 money/contract RPCs
se `PUBLIC, anon` ke grants revoke (`authenticated` + `service_role` re-grant; `get_public_platform_metrics`
jaan-boojh kar chhoda — public marketing pages usi se chalte hain), PLUS teeno guards ko `auth.uid()
IS NULL` se NULL-safe banaya. **(b) HIGH** — `withdrawals` par `authenticated` ki INSERT + UPDATE
dono policies thi (`UPDATE` me `WITH CHECK` hi nahi tha): user khud ka `completed` withdrawal row
forge kar sakta tha aur amount `999999` likh sakta tha — dono probe ne production par lande. Dono
policies drop (writer sirf withdrawal edge fn = service_role, aur owner-guarded `cancel_withdrawal()`
RPC; app sirf SELECT karta hai, capability koi nahi gayi). **(c) CRITICAL regression** —
`should_bypass_privilege_check()` flag ko `current_setting('app.bypass_privilege_check', true)::boolean`
se padhta tha; transaction-local `set_config` **pooled connection** par commit ke baad placeholder ko
empty string chhod jata hai, aur agli request par `''::boolean` → `22P02` → us connection par profile
writes 400 ho jaate the (`complete_onboarding`, subscription/KYC/admin-grant — sab ye flag set karte
hain). Harness me 5/5 reproduce hua; `NULLIF(current_setting(…, true), '')` se fix. Iske saath hi
class **self-detecting** hai: hourly `check_security_drift()` ab `anon_reachable_money_rpc()` (0
baseline) aur `client_writable_money_tables()` (0 baseline) sweep karta hai, dono ke **positive
control** migration ke andar hi (planted violator flag hona chahiye, warna deploy fail), aur poora
migration live par rolled-back transactions me dry-run hua. Verify: typecheck + 188 tests + build
clean; deploy ke baad pentest **72/72 pass**. Details: report §15.

✅ Team Projects contract isolation (Sep 23, 2026, `20270119000017`) — verify kiya ki ek member ka
dispute / refund / milestone outcome doosre member ke escrow ko touch nahi karta. Pehle saare live
`escrow` writers (17 `UPDATE escrow` sites) padhe: design contract-scoped hai (`WHERE contract_id = …`)
aur escrow RLS participants-only — par 3-role runtime probe ne **teen real defects** nikaale:
**F1 BLOCKER** — team contract **kabhi ban hi nahi sakta tha**: `create_team_role_contract` design se
`project_id = NULL` bhejta hai, par `contracts.project_id` NOT NULL tha → har call `23502`, yaani Team
Projects ne aaj tak kisi ko hire hi nahi kiya tha (team tables live bane the, repo migration
`20261229000000` ek-character stub hai, isliye drift pakda nahi gaya). **F2 HIGH** — koi bhi signed-in
user kisi aur ke team project par contract attach kar sakta tha (SECURITY DEFINER, `team_projects`
ownership check hi nahi; guard NULL-unsafe) + arbitrary freelancer ko fake "You've been hired!"
notification. Ab `auth.uid() IS NULL` bail-out + explicit ownership check + **one role = one contract**
(role → `filled`). **F3 HIGH** — hourly auto-release milestone ko `released` mark karta tha par escrow
`funded` reh jaata tha aur freelancer ko **0.00** credit hota tha, client ke aggregate `escrow_balance`
me phantom funds chhoot jaate the — jo doosre contracts ke release `GREATEST(…, 0)` se kaat-te the;
yahi ek jagah thi jahan ek member ka outcome doosre ke accounting tak pahunch sakta tha. Runtime par
ab proven: A ka dispute sirf A ka escrow freeze karta hai (B/C `funded` + `active`), B ka release A/C
rows ko chhoota hi nahi, C ka refund A/C ko nahi, cross-member release/dispute/refund/milestone sab
refused, B A ka escrow padh nahi sakta. **Flagged, not changed:** `freeze_contract`/`unfreeze_contract`
dono parties ka `wallets.is_frozen` set karte hain (team project me wo shared client wallet hai) — par
us column ka koi reader nahi hai, isliye semantics nahi badle. Details: report §16.

✅ Cron ka service-role check legacy GUC padh raha tha (Sep 23, 2026, `20270119000018`) — §16 ka F3
fix bhi actually kaam **nahi** kar raha tha: `release_escrow` ne service-role branch ko legacy singular
`current_setting('request.jwt.claim.role', …)` se probe kiya, jo current PostgREST set hi nahi karta
(plural `request.jwt.claims` JSON set hota hai; Supabase ka `auth.role()` dono padhta hai). Cron ke
liye bhi probe `''` → `Unauthorized` → milestone `released`, wallet **0.00**, escrow `funded`. Wahi
stale probe `auto_release_contract` (delivered-but-unpaid path, pehle koi probe nahi tha) me bhi thi.
Catalog sweep: schema me sirf yahi **2** functions legacy singular parameter padhte the. Fix: shared
`is_service_role_context()` dono idioms probe karta hai (`current_setting('role')` + `auth.role()`,
NULL-safe — plain session `none` deta hai), aur dono functions usi ko use karte hain. Saath me naya
server-only detector `stale_jwt_claim_check()` (match se pehle SQL comments strip karta hai, warna
fix ke apne comments hi flag ho jate) ab hourly `check_security_drift()` me sweep hota hai — fix se
pehle baseline par usne **exactly wahi 2 toote functions** flag kiye, aur migration me **positive**
(planted violator flag hona chahiye) + **negative** (sirf prose me naam ho to flag nahi) dono controls
hain. Harness ke escrow aggregates ab hard-coded nahi hain, live invariant hain:
`escrow_balance == sum(escrows still held)` — koi bhi cross-member leak isko tod dega. Is pass me apne
hi 2 defects pakde: (i) `count(*) FROM public.check_security_drift()` **hamesha 1** deta hai (function
scalar `integer` return karta hai) — assertion kabhi fail ho hi nahi sakti thi; ab direct call +
`src/test/serviceRoleContextGuard.test.ts`; (ii) hard-coded `3 × rate` expectation galat thi; aur
(iii) reason-based probe ka predicate `errorCode()` par bana tha, jo `code || message` deta hai —
SQLSTATE ke saath message drop ho jata hai, isliye "refusal ne apni wajah batayi" wali assertion
kabhi pass ho hi nahi sakti thi (escape har run me sahi refuse ho raha tha, probe use failure bata
raha tha); ab `errorReason()` helper. Sab live DB par rolled-back transactions me dry-run hua.
Verify (Backend Deploy **#20** ke baad, LIVE): typecheck + **193 tests** + build clean; pentest
**103 checks / 40 escapes / 0 failures** — service-role milestone leg ab escrow release karke
freelancer ko **5000.00 credit** karta hai (pehle `false` / `0.00`), aur teeno jagah
`escrow_balance == sum(held escrows)` hold karta hai (20000=20000, 20000=20000, 15000=15000); live
schema: dono functions helper use karte hain, legacy singular parameter kahin nahi,
`stale_jwt_claim_check()` = **0** findings, monitor usse sweep karta hai, `anon` dono naye functions
execute nahi kar sakta, open alerts 0. Details: report §17.

✅ Ek poora Razorpay chain real test-mode me drive kiya (Sep 23, 2026) — naya
`scripts/e2e/razorpay-chain.mjs`: throwaway client + freelancer + real contract, phir gateway chain,
aur **wahi step report karta hai jahan chain rukti hai**. Script **live keys par chalne se mana karta
hai** (`key_id_mode === 'test'` hona zaroori), kyunki live run sach me paisa move kar sakta hai.
Nateeja: deployed credentials **configured aur authenticating** hain, mode = `test`; `create_order`
ne **asli gateway order** diya (`order_TfORNMzB0QuleL`), amount server-side DB se aaya (₹5000 contract
+ ₹250 flat 5% = ₹5250, client koi price nahi bhejta); forged `verify_payment` signature → `Invalid
payment signature`; unsigned webhook → `401`, aur escrow `pending` hi raha (fail-closed). Escrow
funding (wallet path) + milestone release kaam karte hain — freelancer ko **₹5000.00 credit** hua.
**Do break points, dono honest:** (1) **payment authorization interactive hai** — Razorpay ke hosted
checkout me hi hoti hai, koi script complete nahi kar sakti (ye gap nahi, sahi posture hai: forged
signature aur unsigned webhook dono refuse hote hain) — isliye **webhook → escrow-funding leg** sirf
ek real (test-mode) human payment se exercise ho sakta hai, aur wo abhi tak production me kabhi chala
nahi; (2) **last mile:** `POST /v1/payouts` → **404 `The requested URL was not found on the server`**
= RazorpayX Payouts product account par enabled nahi hai (function ise config/not-ready maan ke
**queue** karta hai, hard-fail nahi) — isliye aaj **platform se paisa bahar nahi ja sakta**: release
wallet credit karta hai, withdrawal queue hoti hai. Money integrity hold kari: queued withdrawal ne
wallet `balance 4000 / pending 1000` chhoda (funds **held, lost nahi**), retry cron
(`growlancer-stale-withdrawal-recovery`, har 15 min) maujood hai, teardown clean (`errors: []`), aur
`--keep` se bache 6 accounts bhi usi cascade se hat gaye. Probe ke 4 apne defects bhi pakde/fix kiye
(order-id ka path `data.razorpay_order.id`; `razorpay_orders.amount` **rupees** me hai paise me nahi;
`razorpay_payout_id` + `failure_reason` column naam; client wallet zero + `payout_methods.details`
NOT NULL) — inme se 3 wrong-column/wrong-unit galtiyan thi, logic error nahi. Details: report §18.

✅ AI providers live-verified (Sep 23, 2026) — naya `scripts/e2e/ai-providers.mjs` real signed-in session se
poochta hai ki teen AI functions sach me model call kar rahe hain ya chup-chaap deterministic par gir rahe
hain. Ye zaroori tha kyunki teeno **alag tareeke se** fail hote hain: `ai-assistant`/`ai-writer` key
missing par 500 "AI service is not configured" dete hain (fail closed), `ai-writer` gateway reject par
**502** deta hai, par `ai-matching` **hamesha 200 `success`** deta hai — key na ho ya dead ho to sirf
`ai_enhanced: false` aata hai, jo bahar se bilkul healthy dikhta hai. Probe pehle poori prerequisite
state seed karta hai (throwaway client + aisa throwaway freelancer jiska category+skills project se
match kare + project) warna `candidates.length === 0` ki wajah se `ai_enhanced` false aata hai
credentials ki wajah se nahi. **Nateeja: teeno WORKING** — `ai-assistant` live SSE me
`model="deepseek/deepseek-chat-v3-0324"` ke saath asli output ("PONG"), `ai-writer` asli text
("Landing Page Design for Small Bakery Business"), `ai-matching` `ai_enhanced=true` + model-authored
`ai_score=100` / reason. **Vacuous pass nahi:** anonymous call teeno par **401** deta hai (agar 200
aata to verdict bekaar hota). Teardown clean, DB baseline par wapas (4 profiles, 0 projects,
0 ai_matches, 0 orphans). Probe ke 3 apne defects bhi pakde/fix kiye: `create_user_profile` ke param
naam (`p_id/p_email/p_name/p_role/p_referral_code` — galat naam par PostgREST **404** deta hai, aur
response ignore karne se missing profile baad me FK violation bankar nikla), `delete_user_all_data`
me extra args (wahi 404), aur pehla version unfalsifiable tha (isi liye 401 boundary check add hua).
Details: report §20.

✅ Whole-surface runtime audit — payout PII leak band (Sep 25, 2026, `20270119000019`) — naya
`scripts/e2e/surface-audit.mjs` poore surface par chalta hai (113 tables, 233 functions, 298
policies): anon-executable SECDEF helpers caller-supplied id ke saath, 22 owner-scoped tables
do signed-in users ke beech, 47 private tables anon ke saamne, cross-tenant workspaces (positive
control ke saath), aur DB invariants. **10 real failures mile**, teen CRITICAL: (a)
`get_payout_methods(p_user_id)` ne ek **anon** caller ko doosre user ki poora payout details de
diye (upi_id, bank, IFSC, holder name, masked account, email, phone) — runtime par `LEAKED 4
payout row(s)`; (b) `delete_payout_method` ne anon se victim ka payout method **delete kar diya**
(`{"success":true}`); (c) `set_default_payout_method` ne anon se default flip kar diya. Root cause:
guard `IF p_user_id <> auth.uid()` tha — anon ke liye `auth.uid()` NULL hai, to comparison NULL, to
branch chala hi nahi. Class ab **paanch** functions me thi (usme `release_milestone` aur
`process_withdrawal_complete` bhi, jo aaj reachable nahi par wahi accident par depend karte the) —
isi liye ab one-off fix ke bajaye detector hai. Saath me: `update_reputation_score` (merit-ranking
columns ka akela writer) anon-callable tha, `_refund_audit`/`_refund_history_event`/`_refund_notify`
bina guard ke anon-callable the (anon ne payment audit row **insert** kar li), aur **workspace RLS
toota hua tha** — `42P17 infinite recursion detected in policy for workspace_members` (har
authenticated read HTTP 500) aur usi clause me `wm.workspace_id = wm.workspace_id` ta utology (sirf
recursion fix karna cross-tenant leak deta). Membership test ab `is_workspace_member(ws, user)`
SECURITY DEFINER helper me — ids **arguments** se — jo dono ek saath band karta hai; rolled-back
transaction me 2 seeded workspaces par prove: own members/logs/workspace = 1, doosre ka = 0.
`service_offers` insert check aur ek dead `razorpay_transactions` policy bhi theek. Naye detectors
`null_unsafe_auth_guard()` + `self_referential_policy_predicate()` (dono me positive **aur**
negative control migration ke andar) ab hourly sweep me hain. Harness ke **5 apne defects** bhi
fix hue (PostgREST insert ka khaali body → null ids, shared row ordering, invalid `role: 'owner'`,
HTTP 500 ko "blocked" ginna, aur FK error ko refusal samajhna). Verify: typecheck + lint + **213
tests** + build clean; 9 negative controls RED/GREEN; risky parts live par rolled-back
transactions me dry-run. Details: report §21 (+ §21.9 neeche).

✅ Deploy blocker clear + usi deploy ne apni hi ek defect pakdi (Sep 25, 2026) — pehle
`SUPABASE_SERVICE_ROLE_KEY` repo secret set hua (local `.env.local` se stdin ke through, value kabhi
print/commit nahi hui), phir Backend Deploy re-run: fail-closed guard ✓, drift check ✓ — aur
**`db push` FAIL** hua: `syntax error at or near "' || chr(10) ||" (SQLSTATE 42601)`, statement 17.
Wajah: `20270119000019` ke `DO $patch_guards$` body me ek quote kam thi (`''Unauthorized');` ki jagah
`''Unauthorized'');` chahiye tha) → literal ek token pehle band, `' || chr(10) ||` naya literal ban
gaya. Ye typecheck + lint + build + **213 tests** + 10 guard tests + 9 negative controls sab pass
karke nikla — kyunki wo sab migration ko TEXT ki tarah padhte hain; kisi ne parser se nahi poocha
(wahi §18/§13.6 lesson, ek level gehra).

✅ Naya lexical guard — `src/test/sqlMigrationSyntax.test.ts` (5 tests) poore **269 migrations** ko ek
asli single-pass lexer se check karta hai (single-quoted literals + `''`, `E'…'` escape strings — repo
inka use karta hai, double-quoted identifiers, `--` aur nested `/* */`, aur `$tag$` bodies jo **in
place** lex hote hain — tag STACK, recursion+offset nahi — isliye `DO` body ke andar ka stray quote
apni asli line par pakda jaata hai, jahan ye defect tha). Har finding ka `line` aur `snippet` ek hi
number se aate hain. Guard banate waqt 3 cheezein seekhi: (a) pehla version toote migration ko
**clean** batata tha — `$tag$` bodies opaque the aur uska synthetic control isliye pass ho gaya tha ki
usme COMMENT line nahi thi (`line-comment` ka reset `switch` me likha tha jahan newline branch
`continue` kar chuki hoti hai → pehle `--` ke baad lexer hamesha "comment me" reh kar sab kuch pass
kar deta tha, yaani chup-chaap guard karna band — bilkul isi session wali class); (b) valid SQL bhi
reject ho raha tha: repo legit `'{` … `}'::jsonb` multi-line JSON templates likhta hai (4) aur
`$g$…$g$` strings jinme closing tag se pehle `-- comment` hota hai (21) — inke liye rule: **jo tag
body ko band karta hai wo us body ka content nahi ho sakta**, isliye body ke andar comment state se
closing tag jeetta hai; (c) recursion ke offset se line numbers ek se off ho rahe the → poora offset
arithmetic hata diya. **Controls:** asli defect asli migration me wapas daala → **RED, line 287 par**
(sahi line); restore → **GREEN**, file byte-identical. Verify: typecheck + lint + **218 tests** (17
files) clean; 269 migrations lexically clean. Details: report §21.9.

✅ `20270119000019` LIVE (Sep 25, 2026) — secret add hone ke baad deploy ne **apne aap 3 defect**
nikaale, ek-ek karke: (1) `db push` par `syntax error ... 42601` (ek quote kam, `DO` body me) → fix +
naya lexer guard; (2) phir migration ka **apna positive control** fail hua: `self_referential_policy_predicate()`
sirf qualified spelling (`x.y = x.y`) match karta tha, planted `owner_id = owner_id` chhoot raha tha →
dono spellings add, control ab **dono** plant karke dono demand karta hai (`v_count <> 2` = deploy fail);
(3) phir `has_function_privilege('anon', ('public.'||fn||'(uuid)')::regprocedure, ...)` par
`function "public.delete_payout_method(uuid)" does not exist` (42883) — asli signature `(uuid, uuid)`
hai, yaani **fail-closed assertion jo apne schema ke baare me galat ho wo fail-closed nahi hota, sirf
fail hota hai** → ab OID se resolve hota hai (pg_proc.oid), naam+arglist guess nahi. Teeno fix push karne
se pehle live par read-only verify kiye gaye (baseline: trio ke 3 anon grants, internals ke 4 app-role
grants, `null_unsafe_auth_guard()` baseline = theek wahi 5 functions jo ye migration patch karti hai,
post-rewrite detector 0, koi overload nahi). **Deploy ke baad LIVE:** `db push` ✓, drift-check ✓, saare
edge functions redeploy ✓, pentest ✓, aur naya **whole-surface audit 110 checks / 0 failure / 3 vacuous**
(pehle 10 failures the — 9 fix ho gaye, aur 10th `get_profile_views` ko **public-by-design** reclassify
kiya: public freelancer profile page visitor ko count dikhata hai; harness me ab explicit
`PUBLIC_BY_DESIGN` allowlist hai jiski membership khud check hoti hai, aur probe ab bhi fail karega agar
wo counter ki jagah rows/PII lautaye). **Flagged (product call, fail nahi kiya):** `record_profile_view`
bhi anon-callable hai aur **likhta** hai — koi bhi bina login kisi bhi freelancer ka public view-counter
badha sakta hai (vanity metric, data leak nahi) — harness me `observe` note ke roop me dikhta hai. Details:
report §21.10 + §21.11.

✅ Browser layer pehli baar poora chala — aur uske ne teen fixture defects pakde (Sep 26, 2026,
`20270119000020` + `20270119000021`) — secret add hone ke baad CI ka element-audit job pehli baar
*actually* chala: anonymous strict 336 loads/0 flags, seed ✓, login 3/3, authenticated dashboard 72/0,
client 72/0, admin 51/0 — phir logout-flow freelancer ke pehle step par fail hua ("login reaches
dashboard — still at /"). Teeno defects ek hi shape ke the: **fixture wo state prove nahi kar sakta tha
jo audit maanta hai.** (a) **CRITICAL** — `create-test-accounts.mjs` account lookup
`GET /auth/v1/admin/users?email=…` se karta tha, jise **GoTrue chup-chaap ignore** karta hai (page 1
lauta deta hai; live par bogus email aur real email bilkul same response dete hain) → `users[0]` ek **asli
user** nikla aur seed ne uske upar `PUT /admin/users/<id>` (password reset) + `create_user_profile`
(name/email overwrite) chalaya; `grant_admin_role` refuse hua to `is_admin` false hi raha (20270119000013
ka guard hold kiya). Evidence: `profiles.name_changed_at` = 2026-09-25T09:57:52Z (seed step ki pehli
second), `auth.users.updated_at` same date; victim GitHub OAuth signup tha (password uska login path nahi).
(b) **`grant_admin_role`** service-role caller ko `200` + `{"success":false,"error":"Unauthorized: admins
only"}` deta tha (auth.uid() NULL) → admin sweep admin **login screen** ko "admin" ginne wala tha; ab
`is_service_role_context()` (§17 helper) accept karta hai, admin-check intact, OID se asserted; seed
`is_admin` REST se read-back karta hai aur `login.mjs` admin **console** maangta hai (stored session kaafi
nahi). (c) Seeded accounts `onboarding_completed=false`/`country=null` the — `getPostAuthPath()` aise
profile ko `/onboarding` bhejta hai, isliye "login reaches dashboard" kabhi pass ho hi nahi sakta tha; ab
seed wahi do values likhta hai jo app ka onboarding likhta hai + read-back. **Repair:** `20270119000020`
ne victim ka `name`/`email` wapas kiya (app ke apne rule se: `user_metadata.name` → email local part) aur
seed ka chhoda hua `name_changed_at` clear kiya, narrow predicate + fail-closed assertions ke saath; live
verify: `mdmirankhan78` / `mdmirankhan78@gmail.com` / `leaks=0`. Leaked password hash se restore nahi ho
sakta tha, isliye admin API se fresh random value se replace kiya (value kabhi print nahi hui; account
GitHub se sign-in karta hai). Local browser layer (same accounts, production build): logout-security
**5/5 × 3 roles**, dashboard 72/0, client 72/0; 6 naye guardrail tests + negative controls (dono defect
wapas daal ke RED, restore par GREEN). Details: report §22.

**Final green run `36237099675` (Sep 26, CI #green):** anonymous 336/0, authenticated dashboard 72/0 + client 72/0 + admin 51/0, logout 5/5 × 3 roles, teardown `removed=3 failed=0` — pehli baar poora browser layer (guard → seed → login → sweeps → logout-security → cleanup) ek hi run me green hua.

✅ ai-matching ownership band (Sep 26, 2026, `78e5f43`) — pichhla ⚠️ ab history hai: jo user project
ka client nahi hai wo pehle `200 success` + `ai_enhanced=true` + asli match list paata tha (runtime par
proven), yaani koi bhi signed-in account kisi ko bhi project-id par real AI spend karwa sakta tha aur
uske `ai_matches` rows likhwa sakta tha — wahi class jo `20270119000012` ne 21 doosre functions me band
ki thi. Ab project fetch WHERE clause me hi owner-scoped hai (`client_id = authData.user.id`, identity
verified JWT se, request body se nahi) aur rate-limit insert, AI gateway spend aur `ai_matches` rewrite
— teeno se PEHLE chalta hai; non-owner ko `404 Project not found` milta hai. Reorder ne ek subtle
doosra hole bhi band kiya: per-minute rate-limit `project_id` par keyed thi, yaani non-owner kisi ka
bucket flood karke owner ka matching 429-block kar sakta tha. Runtime proof (Backend Deploy
`36253003395` ke baad live probe): non-owner → *ENFORCED, HTTP 404*, owner path `ai_enhanced=true`
(model-authored scores), teardown clean. Probe ab hard assert karta hai (`not_enforced` = run RED), aur
`src/test/aiMatchingOwnership.test.ts` (7 tests, negative control ke saath) source-level guard hai.
Suite: **232 tests / 19 files**.

⚠️ Flagged (follow-up pass, is money-path change me mass-revoke nahi kiya): **33** SECURITY DEFINER
functions abhi bhi `anon` ko EXECUTE-granted hain — PUBLIC default ACL har `DROP`+`CREATE` par wapas
aa jata hai, isliye pehle ke hardening ke baad bhi ye wapas aa gaye. Zyadatar NULL-safe hain
(`grant_admin_role` → "Unauthorized: admins only"), par bina session reachable nahi hone chahiye.
`20270119000016` ne money-touching waale revoke kar diye; baaki account/MFA/referral helpers report §15.7
me listed hain. Dhyan: `is_user_admin()` ko grant **rakhna hi** hai — wo RLS policy
(`user_reports_admin_all`) ke andar evaluate hota hai, revoke karne se policy hi toot jayegi.

✅ CI pentest wired (Sep 23, 2026) — `backend-deploy.yml` me `db push` + functions deploy ke BAAD
ek step `scripts/e2e/pentest-privileges.mjs` chalata hai (throwaway accounts, real JWTs, real HTTP).
`SUPABASE_URL` project-ref se derive hota hai (REST/edge endpoint — pooler DSN **nahi**, wo sirf
migration steps ke liye hai). **UPDATE (Sep 23, 2026):** is step ka `::notice::` + `exit 0` skip path
hata diya gaya hai — ab missing secret par deploy **RED** hota hai (aur pre-flight guard ke wajah se
kuch deploy hone se PEHLE hi fail ho jaata hai). Details neeche wali fail-closed entry me.

✅ Guardrails ab fail-closed hain — skipped guardrail green nahi dikhta (Sep 23, 2026) — asli defect
status-reporting ka tha, code ka nahi: authenticated element-audit + logout-security pass
`can_seed_e2e` par gated the, aur privilege pentest ka apna `::notice:: ... SKIPPED; exit 0` tha.
Secret missing = step chup-chaap skip + job SUCCESS = green check ek aise guardrail ke upar jo kabhi
chala hi nahi (aur isi wajah se CI ke "dashboard/client/admin sweeps kabhi fail nahi hue" — wo chalte
hi nahi the). Ab: (a) `ci.yml` me ek pehla **Guard — authenticated-audit secrets present (fail-closed)**
step hai jo Chrome download/build se PEHLE har required secret assert karta hai aur missing par
`::error::` ke saath `exit 1` deta hai (naam ke saath, plus one-line setup instructions) — `can_seed_e2e`
gate poori tarah hata diya; (b) `login.mjs` ko `--require-all` mila — creds missing ya login fail hon
to throw + non-zero (pehle `return null` se role chup-chaap drop hota tha, aur step me
`if [ -f .e2e/<role>.json ]` wrappers the isliye aadha-adhoora sweep bhi green ho jaata tha) — ab teenon
storage states on-disk assert hote hain, teenon audits + teenon logout flows unconditional; (c)
`backend-deploy.yml` me **Guard — pentest secrets present (fail-closed)** pre-flight step hai jo
`db push`/functions deploy se PEHLE fail karta hai (jis deploy ki security verification nahi chali wo
successful deploy count nahi hoga) aur pentest step me skip path hi nahi bacha. Sirf ek honest skip
tolerated hai: **fork PR** (GitHub fork-triggered workflows ko repo secrets deta hi nahi) — wo bhi
`::warning::` ke saath "NOT RUN" bolta hai, aur `pull_request` event + fork flag dono check hote hain
isliye push run par wo bypass nahi ban sakta (verified). **Founder action: sirf ek secret chahiye —
`SUPABASE_SERVICE_ROLE_KEY`** (baaki sab `gh secret list` me maujood hai; `SUPABASE_URL` ab
`secrets.SUPABASE_URL || secrets.VITE_SUPABASE_URL` se aata hai). Jab tak wo nahi hai, main par CI ka
element-audit job aur backend deploy **jaan-boojh kar RED** rahenge — yahi feature hai. Verify: 10
naye `src/test/ciGuardrails.test.ts` assertions (job-env ke har credential ka guard me hona,
`exit 0` sirf fork branch me, deploy guard ka ordering, koi `continue-on-error` nahi), **4 negative
controls** (guard ka `exit 1`→`exit 0`, `can_seed_e2e` wapas, pentest ka skip wapas, deploy guard
hatana — chaaron par test RED hua aur file byte-restore hui), aur dono guards ka bash logic **chala ke**
verify kiya (8/8: present→pass, koi bhi secret missing→fail naam ke saath, fork PR→honest skip,
fork flag push run par ignore). Negative assertion comments strip karke lagti hai (warna "purana gate
kyun hataya" wala comment hi test fail kar deta) — wahi §18 lesson.

⚠️ Flagged (chhota, dead-column hygiene — is pass me nahi chhua): `certifications.verified`,
`freelancer_skills.is_verified`, `payout_methods.is_verified`, `services.rating` bhi owner-update policy
+ no trigger ke saath self-writable hain, LEKIN poore app/edge codebase me inhe koi padhta hi nahi (4
columns = 0 readers) — isliye blast-radius badhane ke bajaye flag kiya. Jab in tables ko koi use kare,
`20270119000013` ka pattern laga dena (ACL column-grant ya guard + assertion).

⚠️ Pending (jaan-boojh ke chhoda, plan report §11.6 me): heading hierarchy (defect #11) — 89 `<h3>`
hain dashboard/client/admin pages me aur wo ek hi construct nahi (kuch card headers = H2 hone chahiye,
kuch card ke andar ke sub-headings jinme H3-under-H2 sahi hai). Class signature se distinguish nahi hota
aur audit artifacts sirf skip count rakhte hain, selectors nahi — isliye blind promotion accepted
cosmetic skip ko galat outline se badal sakta hai. Per-page review chahiye, wahi jo originally log
hua tha.

⚠️ Pending (chhote items): currency-consistency prep (multi-currency future ke liye), team-
project freelancer notification/accept-step.

✅ CI element-audit job ka purana red band (Sep 26, 2026) — pehle wali "`E2E_FREELANCER_*` secret
stale" wajah ab history hai: `--rotate --push-secrets` ne email+password dono repo secrets ko seed ke
hardcoded emails se align kar diya, aur uske baad ka fail (logout-flow step 1) asli fixture defect tha
(`onboarding_completed=false`), jo `20270119000020`/seed fix ke saath gaya. E2E accounts ab CI ke apne
seed/teardown cycle me rehte hain (production me permanently nahi). Details: report §9.3 + §22.

⚠️ Flagged (founder ka call chahiye): `admin-data` proxy `wallets` / `escrow` / `transactions` par
bhi direct write karta hai — money tables Security Principle §2 ke hisaab se sirf SECURITY DEFINER
RPCs se change hone chahiye. UI in write-paths ko use karta nazar nahi aata, par ye money-path
decision hai — chup-chaap change nahi kiya (report §9.2).

Jab in dono ka fix aaye, ye status-section update kar dena taaki future sessions ko pata rahe.