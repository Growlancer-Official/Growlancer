# Growlancer — Launch Readiness Checklist

**Owner: Muhammad (founder).** Every item below is an **action only you can take** — a dashboard
setting, a secret, a product decision — followed by the exact way to prove it is done. Anything that
could be verified or fixed in code has already been verified and is listed in **§C**.

Last verified: **2026-09-23**. Live state at that moment: 4 real members, 4 wallets all zero,
**0** contracts / escrow / withdrawals / orders / transactions / invoices / revenue / KYC rows,
0 orphan profiles, **0 open security alerts**.

> Honest scope: this lists what is *proven to work* and what is *still unproven*. Nobody can promise
> "no error, anywhere, ever" — the same pass that wrote this found four defects in its own probes.

---

## §A — Blocking. Do not take real money until these are done.

### A1. Enable RazorpayX Payouts, and set the account number

**Why:** money cannot leave the platform. `POST /v1/payouts` answers
`404 The requested URL was not found on the server`, which the withdrawal function treats as
"payout service not configured" and therefore **queues** the withdrawal — the freelancer's funds are
safely *held* (`balance 4000 / pending 1000` in the verified run), not lost, and a retry cron runs
every 15 minutes. But a queued withdrawal is not a paid freelancer.

**Also verified:** the edge-function secret list contains `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
and `RAZORPAY_WEBHOOK_SECRET` — and **no `RAZORPAY_ACCOUNT_NUMBER`**, which the payout code reads.

**Your action**
1. Activate the **Payouts** product on your RazorpayX account (Razorpay dashboard → Payouts).
2. Set the secret: `npx supabase secrets set RAZORPAY_ACCOUNT_NUMBER=<your-account-number> --project-ref zttwsjehcgaicziqyxpq`

**How to verify it is done**
- `node scripts/e2e/razorpay-chain.mjs` → the final payout leg completes instead of stopping.
- Or in the DB: a `withdrawals` row reaches `status = 'completed'` with `razorpay_payout_id` set and
  `failure_reason` null. Today every attempt ends `Queued — payout service not configured yet`.

---

### A2. Run one real test-mode payment by hand (proves money can come *in*)

**Why:** this is the single biggest unproven journey. `razorpay_orders = 0`, `transactions = 0`,
`invoices = 0`, `platform_revenue = 0` — so the **webhook → escrow funding** leg, the 5% commission
booking, the invoice and the ledger have **never executed in production**. You would discover
whether they work on your first real customer, which is the worst possible time.

What *is* already proven (test mode): an order is created on the real gateway with a **server-derived**
amount (₹5250 = ₹5000 contract + ₹250 flat 5%; the client sends no price), a forged
`verify_payment` signature is refused, and an unsigned webhook is refused with `401`, leaving escrow
`pending` (fail-closed).

The authorisation step itself cannot be automated — it happens inside Razorpay's hosted checkout —
so this one requires you, by hand.

**Your action:** log in as a client, create/fund a contract's escrow, and pay with a **test-mode card**
from your Razorpay dashboard's test-card list (test mode is confirmed active on the deployed keys).

**How to verify it is done** — all five must be true right after the payment:

```sql
select status, amount from escrow order by created_at desc limit 1;         -- 'funded', amount = contract + exactly 5%
select count(*) from transactions where created_at > now() - interval '1 hour';  -- >= 1
select count(*) from invoices    where created_at > now() - interval '1 hour';  -- >= 1 (if invoicing is expected here)
select status from razorpay_orders order by created_at desc limit 1;        -- no longer 'pending'
select * from platform_revenue order by created_at desc limit 1;            -- the 5% row, once revenue is booked
```

If webhook → funding does **not** happen, the escrow stays `pending` while the client has been
charged: that is the failure mode to look for, and it is the reason this item exists.

---

### A3. Add `SUPABASE_SERVICE_ROLE_KEY` as a GitHub repository secret — **now also blocks a live security fix**

**Why:** it blocks more than it looks. Verified consequences today:

| blocked thing | evidence |
|---|---|
| the authenticated audit + logout-security pass in CI | job fails in 5s at the guard: *"Authenticated audit + logout security DID NOT RUN — missing repository secret(s): SUPABASE_SERVICE_ROLE_KEY"* |
| **every backend deploy** | Backend Deploy #21 failed at step 6; drift check, `db push`, migrations verify, functions deploy and the pentest were all **skipped** |
| the privilege + money-path pentest | never runs automatically |
| any future migration (including the fix for §B1) | `db push` is behind the same guard |
| **a critical fix that is already written and committed** | `20270119000019` (anon payout-PII read, anon destructive delete, broken workspace RLS) cannot reach production until this secret exists |

**Your action:** Supabase dashboard → Project Settings → API → **service_role** key → GitHub →
Settings → Secrets and variables → Actions → New repository secret → name `SUPABASE_SERVICE_ROLE_KEY`.

Nothing else is missing: the six `E2E_*` secrets and `VITE_SUPABASE_URL` already exist, and
`SUPABASE_URL` now falls back to `VITE_SUPABASE_URL`, so it does not need adding.

**How to verify it is done**
- `gh secret list -R Growlancer-Official/Growlancer` shows `SUPABASE_SERVICE_ROLE_KEY`.
- CI's **Element audit** job turns green and its step list shows *Seed E2E test accounts*,
  *Authenticated audit + logout security* and *Remove E2E test accounts* **ran** (today they cannot).
- A backend deploy reaches the pentest step and passes:
  `node scripts/e2e/pentest-privileges.mjs` → **103 checks / 40 escapes / 0 failures**.

---

### A4. Move KYC out of development mode (or accept it in writing)

**Why:** anyone currently gets verified instantly. `kyc_provider_config.mode = 'development'`,
`identity_verifications` has **0 rows**, and the edge-function secret list contains **no KYC provider
token at all** — so production KYC is not merely unlaunched, it is uncredentialed. For a platform
moving money this is a fraud and compliance gap, not a cosmetic one.

**Your action**
1. Get a real provider token (Surepass / Deepvue — the engine is provider-abstracted).
2. `npx supabase secrets set <PROVIDER>_API_KEY=<token> --project-ref zttwsjehcgaicziqyxpq`
3. Admin console → Verification → switch mode to **Production**.

**How to verify it is done**
- `select mode from kyc_provider_config;` → `production`.
- Run one real KYC on a throwaway account → an `identity_verifications` row appears with
  `provider` **not** `dev_mode` and a real status transition. Rows created in dev mode are honestly
  labelled `provider='dev_mode'` and must be re-verified after the switch.

---

### A5. PayPal — keep it off, and switch it in one atomic change

**Why:** PayPal is deliberately not launched: the UI is gated by `VITE_PAYPAL_ENABLED`
("PayPal — Coming Soon") and the payout rail is blocked server-side with an explicit 400. The
deployed `PAYPAL_SANDBOX` secret's SHA-256 digest matches `sha256("true")`, i.e. **sandbox**.

**The trap to avoid:** `PAYPAL_SANDBOX` also gates the *payment* functions (`paypal`,
`paypal-webhook`). If someone flips `VITE_PAYPAL_ENABLED=true` in Vercel without flipping
`PAYPAL_SANDBOX`, a **sandbox** payment would be accepted and could fund real escrow with test money.

**Your action:** when (and only when) you launch PayPal, make one change that does all of it —
live `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, `PAYPAL_SANDBOX=false`, and only then
`VITE_PAYPAL_ENABLED=true`.

**How to verify it is done:** `npx supabase secrets list` no longer shows
`b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b` (the digest of `true`) for
`PAYPAL_SANDBOX`; then one small real PayPal payment lands as a live-mode order.

---

### A6. Confirm `APP_URL` is the domain you actually want

**Why:** the deployed `APP_URL`'s digest matches `sha256("https://growlancer.vercel.app")`, and
**9 edge functions** use it for email links, invitation links and payment redirects. If
`growlancer.com` is your production domain, customers are currently being sent to the Vercel domain
in every email.

**Your action:** if growlancer.com is canonical, set it:
`npx supabase secrets set APP_URL=https://growlancer.com --project-ref zttwsjehcgaicziqyxpq`

**How to verify it is done:** the `APP_URL` digest changes away from
`d7273ed7f18aa479214f09c76cebd8a72ca844349b08e861cf883676465870d1`; click a link in a real
notification email → it opens on the production domain.

---

### A7. Make the guardrails actually enforced (branch protection)

**Why:** `main` is **not protected** — `GET .../branches/main/protection` returns
`404 "Branch not protected"`. So a red CI run is a *signal only*; it blocks nothing mechanically.
(The deploy workflow is different: its pre-flight guard genuinely stopped a deploy — Backend Deploy
#21 shipped nothing.)

**Your action:** GitHub → Settings → Branches → add a rule for `main` → require status checks:
**Typecheck (tsc)**, **Lint (eslint)**, **Unit tests + Production build**, **Element audit
(375/768/1280)**. (A3 must be done first, or the audit check can never pass.)

**How to verify it is done:** `gh api repos/Growlancer-Official/Growlancer/branches/main/protection`
returns the rule with `required_status_checks` listing the four checks; a deliberately failing push
shows *"merging is blocked"*.

---

### A8. Put something in the marketplace (content, not code)

**Why:** `services = 0` and `reviews = 0`. A new visitor lands on a working site with **nothing to
buy**, which no test and no fix can repair. This is the one blocker that is entirely about
supply and demand, not engineering.

**Your action:** onboard the first **5–20 real freelancers**, each with at least one real active
service listing — or run an invite-only beta with concierge matching until that exists.

**How to verify it is done:** `select count(*) from services where status = 'active';` > 0, and a
fresh visitor can browse a real listing, open a freelancer profile, and start a hire.

---

### Recommended order

```
A3 (unblocks all backend work)
 → A2 (prove money in)            → A1 (prove money out)
 → A4, A5, A6 (one-time config decisions)
 → A7 (lock the gates)
 → A8 (supply)                    → §B backlog
```

A2 and A1 together are the "can this platform actually move money" gate. Everything else in §A is a
setting or a supply problem.

---

## §B — Engineering backlog. Needs your go-ahead; not launch-blocking.

| # | Item | Evidence | Owner action | Verify |
|---|---|---|---|---|
| B0 | **The whole-surface audit findings are fixed in code but NOT deployed** — an unaauthenticated caller could read/delete any payout method, `update_reputation_score` was anon-callable, three internal refund writers had no guard, and the workspace RLS policies were recursive (HTTP 500 for every signed-in user) *and* tautological | all of it reproduced at runtime by `scripts/e2e/surface-audit.mjs`; fix is committed as `20270119000019` with two new detectors | **do A3** — it is the single action that unblocks this deploy | `node scripts/e2e/surface-audit.mjs` → 0 failures, and the workspace positive control passes |
| B1 | **`ai-matching` never checks project ownership** | verified at runtime: a signed-in non-owner got `200 success`, `ai_enhanced=true` and a real match list — i.e. real AI spend and `ai_matches` rows against someone else's project | say go; one migration with an owner check (**blocked by A3**) | `node scripts/e2e/ai-providers.mjs` → *non-owner matching: ENFORCED* |
| B2 | **`admin-data` proxies direct writes to money tables** (`wallets`, `escrow`, `transactions`) — Security Principle §2 says these change only via `SECURITY DEFINER` RPCs | flagged in report §9.2; no UI path appears to use them | decide: remove the write passthrough or scope it to `service_role` | probe returns **403** for those writes, reads still work |
| B3 | **SECURITY DEFINER helpers still reachable without a session** | measured today: **86 of 204** `public` SECURITY DEFINER functions satisfy `has_function_privilege('anon', …)` (broad measure; includes PUBLIC default grants — report §15.7's explicit-grant count was 33). Money-touching ones were already revoked; the hourly monitor reports 0 open alerts | decide the revoke list. **Do not revoke `is_user_admin()`** — RLS policies evaluate it and the policies would break | the listing matches your intended set; `select public.check_security_drift();` → 0 |
| B4 | **Dead columns, self-writable** (`certifications.verified`, `freelancer_skills.is_verified`, `payout_methods.is_verified`, `services.rating`) | 4 columns, **0 readers** in app/edge code — so no live impact, deferred to avoid blast radius | apply the §13 pattern (ACL column-grant or guard + assertion) when you first use these tables | a self-update probe on each column is blocked |
| B5 | **Heading hierarchy** — 89 `<h3>` under an `<h1>` on dashboard/client/admin pages | audit tracked a count, not selectors, so blind promotion could make the outline *worse* | per-page review (the tasks are cosmetic) | audit reports 0 unjustified H3-under-H1 |
| B6 | **Currency-consistency prep** for multi-currency later | amounts are INR-first today; PayPal is the USD rail | confirm the target behaviour before building | a single currency-source-of-truth module + tests |
| B7 | **Team-project freelancer notification / accept step** | freelancers are notified of a team role hire but there is no accept step | decide the desired flow | a hired freelancer can accept/decline, and the role state reflects it |
| B8 | **Client-side AI fallback is invisible** | the frontend falls back to a deterministic engine when the edge AI call fails — users (and you) cannot tell a real AI match from a degraded one | decide whether to surface/telemetry it | a forced-fallback run emits a visible, countable signal |

---

## §C — Verified working. Do not re-do these; re-run the command if in doubt.

| Area | Proven | Re-verify with |
|---|---|---|
| Authorization + money-path locks | **103 checks, 40 escape attempts, 0 failures** against production: anon / cross-party / non-admin refused at every step, owner paths still work | `node scripts/e2e/pentest-privileges.mjs` |
| Whole-surface breadth | **113 tables / 233 functions / 298 policies** walked over real HTTP: 47 private tables unreadable by anon, 22 owner-scoped tables unreadable across users, 23 anon-executable helpers probed with a real victim id, DB invariants + the four drift sweeps | `node scripts/e2e/surface-audit.mjs` (exits 1 while §B0 is undeployed) |
| Escrow isolation across team members | one member's dispute/release/refund leaves the others untouched; `escrow_balance == sum(held escrows)` at every step | same script |
| AI providers are real | all three **call a model** — assistant streams SSE as `deepseek/deepseek-chat-v3-0324`, writer returns real text, matching returns `ai_enhanced=true` with model-written scores; anonymous calls are refused `401`. Independently, the deployed `AI_MODEL` digest **matches `sha256("deepseek/deepseek-chat-v3-0324")`** | `node scripts/e2e/ai-providers.mjs` |
| Gateway security posture | forged `verify_payment` signature → `Invalid payment signature`; unsigned webhook → `401` with escrow left `pending` (fail-closed) | `node scripts/e2e/razorpay-chain.mjs` |
| Signup / deletion / referral chain | 9/9 end-to-end as a real user; `delete_user_all_data` returns `errors: []`; no orphan profiles | — |
| Honest public numbers | member count counts only accounts that can still sign in (**4**, not 6); escrow ₹0 is real, not placeholder | `select * from get_public_platform_metrics();` |
| Financial write paths | wallet/escrow/transactions are not client-writable; withdrawal rows can no longer be forged or amount-tampered | pentest script (pass A) |
| Cron payouts | service-role milestone release now credits for real (`credited=5000.00`, previously `false / 0.00`) | pentest script (service-role leg) |
| Frontend health | live site loads with **0 console errors**; all assets and public RPCs return 200 | open the site, watch the console |
| Build health | typecheck + lint + **203 tests** + production build all clean | `npm run typecheck && npm run lint && npm test && npm run build` |
| Self-detection | hourly `check_security_drift()` sweeps trust columns, anon-reachable money RPCs, client-writable money tables and stale JWT-claim guards — currently **0 findings, 0 open alerts** | `select public.check_security_drift();` |

---

## The three-sentence version

Money can currently come **in** only through paths nobody has ever exercised end to end, and cannot
go **out** at all until RazorpayX Payouts is enabled and `RAZORPAY_ACCOUNT_NUMBER` is set — so the
honest readiness state is **"invite-only beta with money handled manually"**, not public launch.
The engineering underneath is in better shape than expected: authorization, escrow isolation, the AI
features, the webhooks' fail-closed posture and the build are all verified working, and the remaining
code findings are a short backlog rather than a rewrite. The fastest path to public launch is
**A3 → A2 → A1** — unblock the guardrails, prove money in by hand once, prove money out once.
