# Launch gate — 21 Oct 2026 (live verification)

Branch `launch/mvp-hardening`. Project `zttwsjehcgaicziqyxpq` (Growlanzo, Singapore).
Everything below was run in this session; **PASS** means observed, not inferred.

## 1. Backend — applied and deployed

| Step | Result | Evidence |
|---|---|---|
| `supabase db push --linked --dry-run` | **PASS** | exactly 2 pending: `20270203000000_commission_freelancer_side.sql`, `20270203100000_reviews_write_path_hardening.sql` |
| `supabase db push --linked` | **PASS** | both applied, no other migrations pending |
| Deploy 5 edge functions | **PASS** | `razorpay, paypal, paypal-webhook, reviews, razorpay-payout-webhook` deployed with `--use-api` |
| `rpc/platform_commission(10000)` (service role) | **PASS — 500.00** | REST 200, body `500.00` |
| PayPal create order | **PASS — 503 `paypal_disabled`** | no provider call, no side effect |
| PayPal webhook | **PASS — 503 `paypal_disabled`** | event not acknowledged |
| Payout webhook, no signature | **PASS — 403 `Invalid signature`** | fail closed |
| Direct `reviews` INSERT (anon key) | **PASS — 401 `42501 permission denied`** | browser path closed |
| Direct `reviews` UPDATE (anon key) | **PASS — denied** | same error class |
| `reviews` SELECT | **PASS — 200** | public reputation data still reads |
| `razorpay` `refund_payment` anonymous | **PASS — 401 Unauthorized** | auth required before any action |

## 2. Frontend — real browser, production build

Served `dist/` through `server.js` (same headers as deploy) and driven in Chromium:

| Surface | Result | Notes |
|---|---|---|
| `/` home | **PASS** | hero, 145 categories, honest metrics ("7 members · 1 country"), empty-services state renders an invite, no client-side crash |
| `/pricing` | **PASS** | "₹0 platform fee", "5% deducted from each freelancer payout" |
| `/terms` | **PASS** | §3 Client 0% / Freelancer 5% / ₹10,000→₹9,500; §4A "No platform commission is added" |
| `/refund-policy` | **PASS** | renders, no client-fee claim |
| Signup modal | **PASS** | role gate works — providers unlock only after choosing Freelance/Hire Talent |
| `/dashboard` unauthenticated | **PASS** | redirects to `/` without rendering dashboard data |
| Unknown route | **PASS** | 404 page |
| Console | **PASS (local-only noise)** | Vercel analytics/speed-insights 404 because the static server is not Vercel; Supabase calls all 200 |

Single non-blocking log: `Auth initialization timeout` — the deliberate safety fallback in `AuthContext` (forces `isLoading` false); page content renders regardless. Tracked as P2.

## 3. Still required before public launch (owner: founder)

1. **RazorpayX payouts** — `RAZORPAY_ACCOUNT_NUMBER` is unset; withdrawals cannot reach a bank until set (you are setting it).
2. **KYC** — still in development mode (`A4`). Copy now says "rolling out in phases" instead of "KYC-verified".
3. **Supply** — 0 active services, 0 reviews, 0 open projects: a visitor sees an empty marketplace.
4. **First real test-mode payment** — webhook → escrow → 5% commission → invoice. Needs Razorpay test keys in Supabase secrets; not run here (no authorisation to charge).
5. **Frontend deploy** — the copy/coin-model changes are local; Vercel must build this branch.
6. **Domain** — `APP_URL` still `growlancer.vercel.app` (A6: single change to `https://growlancer.com`).

## 4. Not run (reported, not claimed)

- Authenticated reviews write through the edge function (needs a real OAuth session + completed contract).
- Any Razorpay charge/refund/payout (no live test keys used).
- Load/soak testing.
