# Growlanzo — Launch Review

**Date:** 20 October 2026 · **Scope:** whole public site, legal/policy pages, uncommitted Grow Coin work, live configuration.
**Measured, not assumed:** every live number below comes from `npm run preflight` and read-only SQL against production (`zttwsjehcgaicziqyxpq`) on this date.

---

## Verdict

**Public paid launch: NO.**
**Invite-only beta with money handled manually: YES, with the caveats below.**

The engineering is in good shape — typecheck, lint, **541 tests**, and the production build all pass; authorization and escrow isolation are runtime-proven; the public pages are honest about member count and marketplace emptiness. What blocks launch is not code quality. It is: **money cannot leave the platform**, **no real payment has ever completed**, **the marketplace has zero listings**, **email delivery is (still) unverified**, **KYC auto-verifies anyone**, and **the legal pages do not name the company or a grievance contact**.

| Gate | State today | Evidence |
|---|---|---|
| Money **in** | Code path rehearsed, but **never executed for a real payment** | `razorpay_orders = 0`, `transactions = 0`, `invoices = 0` |
| Money **out** | **Impossible** | `RAZORPAY_ACCOUNT_NUMBER` unset; RazorpayX Payouts returns 404 → withdrawals queue |
| Marketplace | **Empty** | `services (active) = 0`, `reviews = 0` |
| Members | 7 (real) | `get_public_platform_metrics()` |
| KYC | **Development mode** — anyone verifies instantly | `kyc_provider_config.mode = 'development'`, `identity_verifications = 0` |
| Email | **Unverified this pass** | Brevo IP restriction (A9); admin test could not run without a session |
| Legal identity | **Missing** | no company name / address / CIN / GSTIN / grievance officer on any page |
| CI / build | Green | typecheck 0, lint 0, 541 tests, build complete |

---

## 1. Hard blockers (founder action)

These are already tracked in [LAUNCH-READINESS.md](LAUNCH-READINESS.md); they are repeated here because they are still true on 20 Oct.

1. **A1 — enable RazorpayX Payouts + set `RAZORPAY_ACCOUNT_NUMBER`.** Until then every withdrawal ends `Queued — payout service not configured yet`. The wallet UI simultaneously promises payouts "usually within 24 hours" — that sentence is currently false in production. Do not take real money while this is true.
2. **A2 — one real test-mode payment by hand.** This is the single biggest unproven journey (webhook → escrow funded → 5% commission → invoice). The code path is rehearsed with a signed synthetic event; a human card has never run it.
3. **A9 — Brevo authorised-IP restriction.** Every transactional email is a logged no-op until the Brevo setting is changed. I could not re-verify it today: `.e2e/brevo-test.mjs` requires an admin session and returned `401`.
4. **A4 — KYC production provider.** Anyone can currently get a Verified badge through development mode. This also matters for Grow Coins (see §3.1).
5. **A8 — supply.** Zero active service listings. A visitor can browse a working site and buy nothing.
6. **A10 (new) — legal identity + grievance officer.** Terms §14 says disputes are governed by "the laws of the jurisdiction of the Platform's incorporation" but never name the entity, address, or jurisdiction. Privacy §9 promises a "designated Data Protection Officer" without a name or contact. India's IT Rules 2021 and DPDP grievance-redressal expectations, plus Razorpay onboarding, all need a real legal name, registered address and a named grievance contact. This is a two-line content change **once you supply the details** — do not invent them.
7. **A11 (new) — Grow Coin is built but not deployed.** The migration and both edge functions are uncommitted; the feature is invisible in production until the normal backend deploy runs.

---

## 2. What I changed in this pass

All changes are in the working tree; **nothing was committed, pushed or deployed.**

### 2.0 A live security regression (4 open HIGH alerts)

The readiness doc said "0 open security alerts". It was not true: `security_alerts` held **4 unresolved HIGH rows**, created by the hourly drift monitor on 16 Oct, and `null_unsafe_auth_guard()` still returns **three** functions today.

Root cause: `20270122000000_fix_money_function_search_path` re-created `cancel_withdrawal`, `process_withdrawal_complete` and `release_milestone` from **pre-hardening source bodies** while repairing a malformed `search_path` — silently reverting the NULL-safe guards added by `20270119000016/19`. Same class as the `release_escrow` regression that `20270124000000` caused.

| Function | Old (live) guard | Why it matters |
|---|---|---|
| `process_withdrawal_complete` | `v.user_id <> auth.uid() AND NOT EXISTS (...)` | `auth.uid()` NULL → `NULL AND ...` → falsy → an anonymous caller could complete any pending withdrawal: `pending_balance` deducted, row marked `completed`, no money paid |
| `cancel_withdrawal` | `p_user_id <> auth.uid()` | anon with a known withdrawal id + owner id can cancel the payout and move funds back to balance |
| `release_milestone` | `v_contract.client_id <> auth.uid()` | anon could mark milestones released on any contract |

**Currently unreachable over HTTP** because `anon` has no EXECUTE on any of the three. That is the only reason this is a fail-closed hardening rather than an active breach — and it is exactly the kind of invariant that a future blanket grant would break (the project has already had one).

Fix: `supabase/migrations/20270130000000_restore_null_safe_money_guards.sql` re-states the three functions with **identical bodies and grants**, changing only the predicates to `auth.uid() IS NULL OR ... IS DISTINCT FROM auth.uid()`. It asserts the detector is clean, refuses to apply otherwise, and resolves the 4 stale alerts **only if** both detectors report zero. Verified in a rolled-back live transaction: after the new body, `null_unsafe_auth_guard()` no longer flags `cancel_withdrawal`, and a NULL-auth call returns `Unauthorized` instead of proceeding.

### 2.1 Grow Coin money-path fixes (three real defects)

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | `redeem_grow_coins_for_premium` did a plain `INSERT INTO subscriptions` | `subscriptions` has `UNIQUE (user_id, plan_id)`, and **both live Premium subscribers already own a `premium_monthly` row** → every coin redemption raised `23505` for exactly the users most likely to redeem | Upsert on `(user_id, plan_id)`, same pattern as `create_user_subscription()` |
| 2 | `redeem_reserved_grow_coins` did not re-check the ledger sum | A hold that expired during checkout stops reducing the *available* balance, so the same coins could back a second order; redeeming both would push the balance negative | Lock the profile row and refuse when `SUM(ledger) < coins`; the caller already raises a `redemption_shortfall` review flag |
| 3 | Cash/Premium redemption had no role check | The agreed model gives cash/Premium to freelancers; clients are discount-only — any client with 100 coins could convert them to withdrawable wallet cash | `role IN ('freelancer','admin')` guard on both RPCs with an explicit message |

Verified by **rolled-back transactions on the live database**: the premium path moved an existing `cancelled` subscriber row to `active / grow_coins / future end`; the reservation path refused a 100-coin debit against a 50-coin balance (balance unchanged) and debited a funded order exactly once (replay was a no-op). Zero rows persisted.

### 2.2 False public claims removed

| Page | Claim | Now |
|---|---|---|
| Home hero fallback | "0.3s Match Time · **95% Fit Accuracy** · 5min To Hire" — never measured | "5% Flat Fee · 100% To Freelancer · ₹0 To Start" |
| Home features | "ID-verified and skill-certified badges on **every** profile" | "Freelancers can complete identity verification and skill tests — badges appear when verified" |
| Home features | "**Instant** wallet payouts" | "Released funds land in your wallet, then withdraw to your bank or UPI" |
| Pricing | "full refund before work is **delivered**" (refund policy says *before work begins*) | "before escrow-funded work begins" |
| Refund policy | "**Fraud-proof** delivery checks" | "Fraud checks on delivery" |
| Refund policy | "disputes and refunds are **rare on Growlanzo**" (no completed contract exists) | describes the verification process instead of a track record |
| Profile builder | "100% complete profile gets **5x** more client invitations" | "A complete profile gives clients more reasons to invite you" |
| Cookies | listed "Analytics Cookies" | cookieless analytics (Vercel aggregate + Sentry errors), matching what actually runs |

### 2.3 Not changed (your call)

- **Withdrawal copy** (`WalletPage`, Terms) promising 24 hours / 2% RazorpayX fee, and Terms "PayPal withdrawals are coming soon". These become true after A1/A5; softening them now would have to be reverted. They are false **today**.
- **Terms §3**: "Platform fees may be updated from time to time" contradicts the fixed flat-5% promise. Reword only with your sign-off.
- **Grow Coin has no Terms/Privacy coverage.** Before the programme goes live it needs: no cash value except redemption, no expiry, bonus clawback on fraud, tax responsibility on the recipient, and a note that leaderboard names are public. I did not write legal text unilaterally.

---

## 3. Remaining findings

### 3.1 HIGH — dev-mode KYC would pay referrals for nothing

`award_referral_bonus_if_eligible` treats any `identity_verifications.status = 'verified'` row as real engagement. In development mode the engine verifies **every** submission instantly (`provider = 'dev_mode'`). One referrer can therefore farm 10 coins per throwaway account, capped at 20 paid bonuses/month = **₹200/month cashable**, for zero real work.

Options (pick one before enabling coins):
- require `provider <> 'dev_mode'` in the eligibility check (clean, but no KYC payouts until A4), **or**
- keep dev-mode awards but do not allow cash redemption until A4, **or**
- accept it as a known, capped beta cost.

This is a money decision, so I left the code as-is.

### 3.2 MEDIUM — public leaderboard exposes names by default

`get_grow_coin_leaderboard` is anon-callable and publishes `profiles.name` + avatar for anyone with a completed referral. The spec asked for a public leaderboard, so this is intended — but the Privacy Policy does not mention it, and there is no opt-out. Either add a line to Privacy or add a "show me on the leaderboard" preference.

### 3.3 LOW — self-detection does not cover the new coin tables

The hourly `check_security_drift()` sweeps trust columns, anon-reachable money RPCs and client-writable money tables. It does not know about `grow_coin_ledger` / `grow_coin_reservations`. The migration asserts their grants **at deploy time**; a later migration could silently widen them with nothing to catch it. Natural backlog item, not a launch blocker.

### 3.4 LOW — team-project copy implies a matching step that may not exist

Home says "Add a role → AI matches in real time". Team-project creation collects roles; I did not find a per-role AI matching surface. Verify before leaving that sentence up.

---

## 4. Security audit of the uncommitted diff

Checked against the project's Security Principles: no secrets, no client-supplied price/discount, no request-body `user_id`, no new RLS write policy, no fail-open webhook change.

- Discount is derived server-side from the authoritative package/contract amount; the client sends a **coin count only**, and client-supplied `grow_coins_used` / discount metadata is stripped before storage.
- Coins are **held** at order creation and **debited only after capture** (verify or webhook, both idempotent). A failed payment releases, never debits.
- Reservation + redemption RPCs are `service_role`-only with JWT identity; award RPC is server-only; balance RPC is self-only; ledger has SELECT-own RLS and **no** INSERT/UPDATE/DELETE policy.
- `get_grow_coin_balance` refuses a `p_user_id` that is not the caller.
- No balance column exists; every figure is `SUM(amount)`.

The three defects in §2.1 were the only money-path issues found.

---

## 5. Verification run (this pass)

```
npm run typecheck   → 0
npm run lint        → 0
npm test            → 541 passed / 46 files
npm run build       → complete (dist/client, spa fallback, 404 absent)
sql lexer guard     → all 295 migrations lexically clean (incl. 20270130000000)
live dry-runs       → premium upsert ✓, reservation refusal ✓, single debit + replay no-op ✓,
                      NULL-safe guard (Unauthorized) + detector clears ✓ (all rolled back, 0 rows persisted)
```

Not run / not verifiable here: signed-in browser sweeps (needs the seeded test accounts), Brevo delivery (needs an admin session), and the real payment card (needs a human).

---

## 6. Recommended path

```
A1  payouts enabled + account number      ← money can leave
A2  one real test-mode payment            ← money can arrive
A9  Brevo IP restriction                  ← users can be told anything at all
A4  KYC production provider               ← Verified means verified
A10 legal name + grievance contact        ← legally required pages
A8  5–20 real service listings            ← there is something to buy
then: deploy Grow Coin (migration + razorpay + razorpay-webhook), add coin terms,
      re-run this review, and only then open public signup.
```

Until A1 and A2 are both done, the honest public posture is **invite-only beta**, with every payment and payout handled by hand.
