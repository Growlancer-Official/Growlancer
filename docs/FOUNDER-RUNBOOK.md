# Growlancer — Founder Runbook

**Owner: Muhammad.** This is the *operator* playbook: the exact clicks, the exact commands, and the
exact way to prove each step worked. It is the companion to
[LAUNCH-READINESS.md](LAUNCH-READINESS.md), which explains *why* each item is blocking — this file
tells you *how*, in what order, and what breaks if you do it in the wrong order.

> **The one rule:** one item at a time → verify → then the next. Every step below has a
> `How to verify` line. If a step does not verify, **stop** and fix it; do not stack the next step on
> top of an unverified one. That is how the last four production defects were introduced.

Project ref used everywhere: **`zttwsjehcgaicziqyxpq`**
Secrets are set with: `npx supabase secrets set <NAME>=<value> --project-ref zttwsjehcgaicziqyxpq`
Run everything from the repo root (`C:/Users/mdmir/Documents/GROWLANCER`).

---

## §0. Before anything: run the pre-flight

```bash
node scripts/founder-preflight.mjs
```

It is **read-only** — no writes, no migrations, no deploys. It prints:

1. which edge-function secrets are configured (names only — it never prints a value or a digest),
2. digest-verified settings (it can tell you *that* `APP_URL = https://growlancer.com` without ever
   printing the value),
3. the live state an anonymous visitor can already see,
4. custom-domain readiness (static checks),
5. and a `NEXT ACTIONS` list.

`--strict` exits non-zero if a blocker remains, so you can chain it in a shell check.

Last run (2026-10-06): **1 blocker** (`RAZORPAY_ACCOUNT_NUMBER`) and 7 warnings.

---

## §1. RazorpayX Payouts — money going **out** (A1) 🔴 blocker

**Symptom today:** `POST /v1/payouts` returns
`404 The requested URL was not found on the server`. The withdrawal function treats that as
"payout service not configured" and **queues** the withdrawal, so the freelancer's money is *held*
(`balance 4000 / pending 1000`), never lost — but never paid either. A retry cron
(`growlancer-stale-withdrawal-recovery`, every 15 min) keeps trying.

**Steps**

1. Log in to the Razorpay dashboard → **RazorpayX** → activate the **Payouts** product.
   This needs your business KYC to be approved on RazorpayX (it is a separate product from the
   payments gateway, and separate activation).
2. Fund the RazorpayX **current account** — a payout with an empty balance fails with a different
   error and looks like a code bug.
3. Find your **source account number** (RazorpayX → Account details). It looks like a long numeric
   string.
4. Set it:
   ```bash
   npx supabase secrets set RAZORPAY_ACCOUNT_NUMBER=<account-number> --project-ref zttwsjehcgaicziqyxpq
   ```

**How to verify**

- `node scripts/founder-preflight.mjs` → the `RAZORPAY_ACCOUNT_NUMBER is NOT set` ❌ is gone.
- `node scripts/e2e/razorpay-chain.mjs` → the final payout leg completes instead of stopping at the
  404. (That script refuses to run against live keys on purpose — `key_id_mode === 'test'` is
  required, because it really moves money.)
- In the DB: a `withdrawals` row reaches `status = 'completed'` with `razorpay_payout_id` set and
  `failure_reason` null.

**Rollback:** unset the secret (`npx supabase secrets unset RAZORPAY_ACCOUNT_NUMBER --project-ref …`).
Withdrawals go back to queueing — funds still safe.

---

## §2. One real test-mode payment (A2) 🔴 blocker — prove money can come **in**

**Why this is blocking:** `razorpay_orders = 0`, `invoices = 0`, `transactions = 0`,
`platform_revenue = 0`. The **webhook → escrow funding → 5% commission → invoice → ledger** chain has
**never run in production**. You do not want to discover it is broken on your first real customer.

**What is already proven (test mode, real gateway):**
- an order is created with a **server-derived** amount — ₹5250 for a ₹5000 contract (₹250 = flat 5%);
  the client sends no price at all,
- a forged `verify_payment` signature is refused,
- an unsigned webhook is refused with `401` and escrow stays `pending` (fail-closed),
- the milestone-release leg credits the freelancer (₹5000.00 verified).

**What cannot be automated:** the card authorisation happens inside Razorpay's hosted checkout. There
is no API path to it by design — that is the correct posture, not a gap.

**Steps**

1. Confirm the deployed keys are **test** mode: `node scripts/e2e/razorpay-chain.mjs` prints the mode
   and refuses to continue if it is `live`.
2. Log in to the app as a **client** (use a real account, not a test account — test accounts are
   deleted by the E2E teardown).
3. Create/fund a contract's escrow, and pay using a **test card** from
   Razorpay dashboard → **Test mode → Test cards**.
4. Wait for the webhook (a few seconds).

**How to verify** — all five must be true immediately after the payment:

```sql
select status, amount from escrow order by created_at desc limit 1;               -- 'funded', amount = contract + exactly 5%
select count(*) from transactions    where created_at > now() - interval '1 hour'; -- >= 1
select count(*) from invoices        where created_at > now() - interval '1 hour'; -- >= 1
select status from razorpay_orders order by created_at desc limit 1;              -- no longer 'pending'
select * from platform_revenue order by created_at desc limit 1;                  -- the 5% row
```

**If webhook → funding does NOT happen:** the escrow stays `pending` while the client has genuinely
paid. Do **not** fix it by hand in the database — every one of those tables is
security-definer-RPC-only by design (Security Principle §2). Check the webhook delivery log in the
Razorpay dashboard first: the most common cause is a webhook URL / secret mismatch, not code.

---

## §3. PayPal — the atomic switch (A5) 🟡 do not do this early

**Current state (digest-verified by the pre-flight): `PAYPAL_SANDBOX = true`.**
PayPal is implemented end-to-end but hidden from the UI (`VITE_PAYPAL_ENABLED` is not `true`).

**The trap — this is the whole reason this section exists:** if you only flip
`VITE_PAYPAL_ENABLED=true` while the backend still points at sandbox, customers pay **fake sandbox
money** and the app funds a **real** escrow. That is free money for anyone who notices.

**Correct order — strictly this order:**

1. In the PayPal developer dashboard, switch the app from sandbox to **Live** and create a **Live**
   webhook pointing at:
   `https://zttwsjehcgaicziqyxpq.supabase.co/functions/v1/paypal-webhook`
   Subscribe to at least: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`,
   `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`.
2. Set the backend secrets **first**, while the UI is still hidden:
   ```bash
   npx supabase secrets set \
     PAYPAL_CLIENT_ID=<live-client-id> \
     PAYPAL_CLIENT_SECRET=<live-client-secret> \
     PAYPAL_WEBHOOK_ID=<live-webhook-id> \
     PAYPAL_SANDBOX=false \
     --project-ref zttwsjehcgaicziqyxpq
   ```
3. Verify the backend flipped before touching the UI:
   `node scripts/founder-preflight.mjs` → `PAYPAL_SANDBOX = false`, and the
   "PayPal is in sandbox" warning is gone.
4. Only now reveal it in the UI: Vercel → Project → Settings → Environment Variables →
   `VITE_PAYPAL_ENABLED=true` (Production) → **Redeploy** (Vite inlines `VITE_*` at build time, so a
   redeploy is required — changing the variable alone does nothing).
5. Run one real low-value PayPal payment end-to-end and check the same five queries as §2.

**Rollback:** set `PAYPAL_SANDBOX=true`, restore the sandbox keys, then set
`VITE_PAYPAL_ENABLED=false` and redeploy. Hiding the UI first is the safe direction.

---

## §4. KYC — leave development mode (A4) 🟡

**Current state:** `kyc_provider_config.mode = 'development'` — users auto-verify instantly and the
rows are honestly labelled `provider = 'dev_mode'`. That is fine for testing, not for launch.

**Steps**

1. Get a real provider token (Surepass, or whichever adapter is wired) and set:
   ```bash
   npx supabase secrets set SUREPASS_API_TOKEN=<token> SUREPASS_BASE_URL=<base-url> KYC_PROVIDER=surepass --project-ref zttwsjehcgaicziqyxpq
   ```
2. In the app: **admin → Verification → switch mode to Production** (this writes
   `kyc_provider_config`, which only an admin can do, server-side verified).
3. **Re-verify the `dev_mode` rows.** They are honestly labelled, but they are not real
   verifications. Anyone holding one has to go through the real flow once the provider is live.

**How to verify:** submit one KYC through the real provider as a throwaway account and confirm the
row lands as `provider = '<provider>'` with `status = 'approved'` and a real `document_hash`.

> Reminder: `document_hash` is a **GENERATED** column on live. Never write it from a function — it
> raises `428C9` and the row silently stays `pending`.

---

## §5. Custom domain `growlancer.com` — the complete switch 🟢

This is now **much smaller than it used to be.** Every backend site URL goes through one resolver
(`supabase/functions/_shared/site.ts`), so switching domains is *one secret*, not a code hunt.

### 5.0 First, fix one thing in your local `.env`

`.env` currently has `APP_URL=growlancer.vercel.app` — **without a scheme**. That is not a valid
absolute URL, and it is the input to `scripts/push_redirect_urls.mjs`, which writes the live Supabase
`site_url`. Fix it to:

```
APP_URL=https://growlancer.com
```

The pre-flight flags this (`local APP_URL is not an absolute http(s) URL`) and the scripts now
**refuse to run** on a malformed value rather than writing a broken `site_url`.

### 5.1 Do it in this order

| # | Where | What to do | Why in this order |
|---|-------|-----------|-------------------|
| 1 | Vercel → Project → **Domains** | Add `growlancer.com` **and** `www.growlancer.com`; set the apex as **Primary**; make `www` redirect to the apex; keep `growlancer.vercel.app` as an alias | The old URL must keep working until the new one does |
| 2 | Your DNS registrar | Point the domain at Vercel (Vercel shows the exact A/CNAME records). Wait for "Valid Configuration" | Nothing else can be verified before this resolves |
| 3 | Supabase Auth config | `node scripts/push_redirect_urls.mjs` — sets `site_url` + the full redirect allow-list (apex, `www`, vercel.app, previews, localhost) for **every** auth email and OAuth return | Auth emails must land on the new domain *before* you announce it |
| 4 | Edge function secret | `npx supabase secrets set APP_URL=https://growlancer.com --project-ref zttwsjehcgaicziqyxpq` | Instant on next invocation — **no redeploy needed**. This single change moves every email logo, footer link, subscription/dashboard button, PayPal return URL and AI-attribution header |
| 5 | Sentry (if enabled) | Add `growlancer.com` / `www.growlancer.com` to the project's allowed origins / domain settings | Otherwise browser events from the new origin are dropped |
| 6 | Brevo | Verify the **sender domain** (`growlancer.com`) — SPF + DKIM records. Then set `EMAIL_FROM="Growlancer <no-reply@growlancer.com>"` and `EMAIL_REPLY_TO=support@growlancer.com` | Until the domain is verified, Brevo only delivers to your own inbox |
| 7 | Google Search Console (+ Bing) | Add the `growlancer.com` property and submit `https://growlancer.com/sitemap.xml` | The sitemap already points at `.com`, so indexing can start immediately |

### 5.2 What does **not** need changing (verified, do not waste time)

| Thing | Why it is already fine |
|-------|------------------------|
| `supabase/functions/_shared/cors.ts` | Already allows `growlancer.com` **and** `www` alongside the Vercel origin. It is a *multi*-domain allow-list by design and must stay that way during the transition |
| `public/sitemap.xml`, `public/robots.txt` | Already `https://growlancer.com` |
| `vercel.json` | Contains only security headers and a CSP. **No site URL.** `connect-src`/`script-src` list Razorpay, PayPal, Supabase, fonts, Sentry — payment/API hosts, not your own domain |
| Razorpay | No app-domain configuration at all. Checkout returns to the app via the SDK, and the webhook URL points at the Supabase function |
| PayPal | Same — the webhook URL points at the Supabase function, not the app domain |
| GitHub / LinkedIn / Google OAuth apps | Their authorized callback is `https://zttwsjehcgaicziqyxpq.supabase.co/auth/v1/callback` — the Supabase endpoint. **It does not change when your app domain changes.** (An OAuth app's optional "homepage URL" is cosmetic.) |
| Frontend code | No absolute site URL anywhere in `src/` (`grep` verified). The app derives everything from `window.location` / `VITE_SUPABASE_URL`, so there is no `VITE_SITE_URL` to set in Vercel |
| `index.html` | No canonical / `og:url` tags to update |
| `supabase/config.toml` | Already lists the `.com` auth redirects. It is **local dev config** — nothing in CI pushes it. ⚠️ Its `site_url` is `http://localhost:5173`; never run `supabase config push` without fixing that line first |
| `supabase/functions/_shared/site.ts` | The `FALLBACK_SITE_URL` constant is only used when the `APP_URL` secret is missing. Optional cleanup after the switch |

### 5.3 Cosmetic / non-runtime (change whenever, never blocks launch)

`README.md`, `CONTRIBUTING.md`, `RAZORPAY_TESTING_GUIDE.md`, `growlancer.postman_collection.json`
(the `APP_URL` variable), `scripts/create_test_users.mjs` (a console message), `nginx.conf`
(Docker/self-host CSP — only relevant if you ever deploy the Docker image instead of Vercel),
`pages/+Head.tsx` + `pages/+config.ts` (Vike SSR metadata — already `.com`; the app builds with Vite,
so this path is unused), historical docs under `docs/`, and the dated entries in `CLAUDE.md`.

### 5.4 How to verify the switch

```bash
node scripts/founder-preflight.mjs      # APP_URL digest should read https://growlancer.com
```

Then, in a fresh browser:
1. `https://growlancer.com` loads and `https://growlancer.vercel.app` redirects to it.
2. Sign-up on the new domain → the verification email link opens `https://growlancer.com/...`.
3. Log out and sign back in with GitHub **and** LinkedIn.
4. Trigger one transactional email (e.g. a support-ticket reply) → the logo URL and footer links in
   the raw email point at `https://growlancer.com`.

---

## §6. Branch protection (A7) 🟡 5 minutes

`main` is currently unprotected, so a force-push or a bad merge can land straight in production
(Vercel deploys `main`, and `backend-deploy.yml` runs `db push` on it).

```bash
gh api -X PUT repos/Growlancer-Official/Growlancer/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["CI"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

**How to verify:** GitHub → Settings → Branches → `main` shows "Protected"; `gh api
repos/Growlancer-Official/Growlancer/branches/main/protection` returns JSON instead of `404`.

---

## §7. Real supply before you advertise (A8) 🟡

**Live today:** `active services = 0`, `reviews = 0`. The homepage honestly says
*"Trusted by 5 members across 1 country"* — that honesty is deliberate, and the platform metrics are
DB-backed (never hardcoded). But an empty marketplace converts nobody.

**Order that costs nothing:**
1. Publish 5–10 **real** service packages (the 3-tier Basic/Standard/Premium packaging is free for
   every freelancer — never gate it behind the ₹299 subscription).
2. Get the first 2–3 reviews from real completed work. Never seed fake reviews: `rating`,
   `total_reviews` and `reputation_score` are trigger-protected precisely because they drive
   merit-based ranking.
3. Confirm ranking is untouched by payment status: `is_pro` must never appear in any scoring or
   sorting path (this is non-negotiable and is checked by the drift monitor).

**How to verify:** `node scripts/founder-preflight.mjs` → `active services` and `reviews posted` are
non-zero; the homepage trust line updates by itself.

---

## §8. Recurring operations

| Cadence | What | Command / where |
|---------|------|-----------------|
| After **every** change | Typecheck + tests + build | `npm run typecheck && npm test && npm run build` |
| After every change | Push to `main` (Vercel + Backend Deploy run automatically) | `git push origin HEAD:main` |
| Weekly | Launch pre-flight | `node scripts/founder-preflight.mjs` |
| Weekly | Security drift + alerts | `select count(*) from security_alerts where resolved = false;` → expect 0. The hourly sweep emails you on anything new |
| Weekly | Queued withdrawals | `select count(*) from withdrawals where status = 'queued';` → expect 0 once §1 is done |
| Monthly | Rotate `CRON_SECRET` | Set both sides together (the env secret **and** `cron_settings.cron_secret`) — the crons accept either, so a half-rotation can never silently break them |
| Monthly | Review CI runs | GitHub → Actions → `CI` and `Backend Deploy` must be green |

---

## §9. What the code already does for you (so you never have to remember it)

- **One place for the site URL.** `supabase/functions/_shared/site.ts` reads the `APP_URL` secret. A
  guard test (`src/test/siteUrlGuard.test.ts`) **fails CI** if any edge function hardcodes a
  Growlancer URL again, or reads `APP_URL` directly instead of going through the resolver.
- **Domain-switch pre-flight.** `scripts/founder-preflight.mjs` verifies the deployed `APP_URL`
  *by digest* — you can confirm the exact value without it ever being printed.
- **Fail-closed config writers.** `scripts/push_redirect_urls.mjs` refuses to write a malformed
  origin to the live Supabase `site_url`.
- **Money paths.** Wallet/escrow/subscription changes only through security-definer RPCs; webhooks
  fail closed; every withdrawal leaves a ledger row; the escrow invariant
  `escrow_balance == sum(held escrows)` is asserted by the runtime pentest.
- **Merit-based ranking.** `is_pro` is never read by any scoring path, and the hourly drift monitor
  flags any self-writable trust column (rating, admin flag, suspension, wallet balance).

---

## §10. If something breaks

1. **Stop pushing.** Verify state before changing anything.
2. `node scripts/founder-preflight.mjs` and read the `NEXT ACTIONS` list.
3. Check the deploy pipelines: GitHub → Actions → `Backend Deploy` and `CI`. `db push` is
   **fail-closed**: a drift or a failed assertion stops the deploy *before* anything is applied.
4. Money tables are read-only for applications by design. If a balance looks wrong, capture
   `wallets`, `escrow`, `transactions` and `withdrawals` rows — do **not** hand-edit them.
5. Rollback for each step is listed inline above.
