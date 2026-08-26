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

⚠️ Pending (chhote items): currency-consistency prep (multi-currency future ke liye), team-
project freelancer notification/accept-step.

Jab in dono ka fix aaye, ye status-section update kar dena taaki future sessions ko pata rahe.