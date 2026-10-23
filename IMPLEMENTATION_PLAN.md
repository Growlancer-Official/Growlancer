# IMPLEMENTATION PLAN — MVP hardening (21 Oct 2026)

Branch: `launch/mvp-hardening`. No deploy, no production data, no real money.

## 1. State actually found in this tree (inspected, not assumed)

| Area | Current state |
|---|---|
| Public certificate/credential verification (`admin-data`) | Already deferred: `verify_certificate` / `verify_credential_qr` return 410 with no service-role read. Server flag lives in `supabase/functions/_shared/features.ts` (fail-closed). |
| KYC dev mode (`kyc-submit`) | Already gated by a deploy-level env gate (`KYC_DEV_MODE_ALLOWED`) **and** a DB row; dev verdicts are labelled `dev_mode` and cannot be confused with a provider verdict. |
| `paypal-webhook` CORS import | resolved (imports `_shared/cors.ts`). |
| Razorpay **payout** webhook HMAC | **BROKEN**: key imported with usages `['verify']` then `crypto.subtle.sign()` is called → `InvalidAccessError` on every delivery, so valid payout webhooks fail. |
| `refund_payment` (`razorpay` fn) | **Direct provider refund** still reachable by the payer (non-admin) with a client-supplied amount — bypasses the refund-request workflow. |
| PayPal server kill-switch | missing: only the frontend `VITE_PAYPAL_ENABLED` exists. |
| `reviews` RLS | `INSERT` allowed for `authenticated` guarded only by `auth.uid() = reviewer_id`; no uniqueness on (reviewer, contract) → direct PostgREST duplicate/relationship-bypass insert. |
| Commission model | Client is charged `contract + 5%` at checkout **and** the release path withheld another 5% (`v_net := v_gross - v_fee`) → effective ~10% take. |

## 2. Commission policy — conflict and decision

- Previous session recorded a founder decision for **Option A** (client pays +5 %, freelancer keeps 100 %) and an uncommitted migration `20270203000000_commission_model_option_a.sql` implementing it.
- The current founder instruction (§2 of the master prompt) states the opposite and is authoritative:
  - client pays **only** the agreed amount — no platform commission on the client checkout,
  - Growlanzo's **5 % is deducted from the freelancer's eligible released earnings** (₹10,000 → ₹500 fee → ₹9,500 net),
  - no UI may say "freelancer receives 100 %" or "client pays 5 % extra".
- **Implemented here: freelancer-side 5 %.** The Option A migration is replaced (it was never committed or applied).

Invariants enforced by the new migration:
```
client_charged  = contract pool
freelancer_net  = pool - round(pool * 0.05, 2)
platform_fee    = pool - freelancer_net
ledger: escrow debit pool = wallet credit net + platform_revenue credit fee
```
Open items flagged, not invented: tip treatment (currently inside the escrow pool, therefore commissionable) and the 2 % payout-provider fee are **pending founder/legal confirmation** and are not presented as fact in copy.

## 3. Fix order

1. `20270203000000_commission_freelancer_side.sql` — release pays `pool − 5 %`; booking books fee on the released gross; invoice total = what the client paid (pool); wallet funding debits the pool only; invite contracts store net.
2. Checkout stops adding 5 % — `razorpay` (contract / service / contest), `paypal` (same three), `src/lib/config.ts`, `dataService`.
3. Payout webhook: correct HMAC-SHA256 verification (raw bytes, hex, constant-time compare, fail closed).
4. `refund_payment`: stop executing provider refunds directly; require an approved refund request (admin/cron `execute_refund` only).
5. PayPal: server kill-switch `PAYPAL_ENABLED` (default **false**) in `paypal` + `paypal-webhook` before any side effect.
6. Reviews: drop direct `INSERT/UPDATE` policies, add `UNIQUE (reviewer_id, contract_id)` (NULL-safe), keep the edge function as the only writer.
7. Copy: Terms §3, Home hero, Pricing, FAQ/support topics, escrow policy — freelancer-side 5 %, client pays the agreed amount.
8. Tests + gate: `typecheck`, `vitest`, `test:mvp-scope`, `build`, plus SQL syntax guard.

## 4. Explicitly not done / blocked

- Live provider calls, sandbox charges, DB migrations applied to any hosted project (no credentials, no authorisation).
- Legal sign-off on refund windows, the 2 % payout fee and tip commission.

---

## 5. Results (this pass)

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` | **PASS** | `tsc --noEmit`, no output |
| `npm run lint` | **PASS** | eslint, no findings |
| `npm test` | **PASS** | 53 files / 633 tests (plus the new guard file: 21 tests) |
| `npm run test:mvp-scope` | **PASS** | 12/12 invariants |
| `npm run build` | **PASS** | `Build complete in 58.9s` |
| `npm run docs:map` | **PASS** | INVENTORY.md regenerated (new migration + test counted) |
| SQL applied to a database | **NOT RUN** | no project credentials; migration ships unapplied |
| Razorpay/PayPal sandbox calls | **NOT RUN** | no credentials; code review + static guards only |

### Fixed in this pass
1. Commission model unified to **freelancer-side 5 %** across SQL (release, booking, invite contracts, wallet funding) and both checkout edge functions; UI/legal copy reconciled (Terms §3/§4A, Pricing, Home, Escrow Policy, support topics).
2. Payout webhook HMAC repaired (key usage `sign`, raw bytes, length check + constant-time compare, fail closed).
3. Direct `refund_payment` provider call removed — refunds only via approved `refund_request` → cron-guarded `execute_refund`.
4. PayPal server kill switch `PAYPAL_ENABLED` (default **false**) on both the payment and webhook functions.
5. Reviews: direct PostgREST `INSERT/UPDATE` revoked, `UNIQUE (reviewer_id, contract_id)` added, duplicates archived (not silently deleted), edge function writes with the service role after its own checks.
6. Money endpoints' rate limiter now **fails closed** on a store error (razorpay + paypal).

### Still open (reported, not claimed)
- Apply both migrations and run the DB verification queries in a staging project.
- Provider sandbox E2E (valid/invalid signature, replay, concurrent, partial refund) needs credentials.
- Withdrawal/other edge functions' rate limiters were not audited in this pass.
- Refund-Policy page wording/timelines and the 2 % payout fee still need founder/legal confirmation.
- Historical contracts funded under the old "+5 % at checkout" model are untouched; they keep their recorded amounts.
