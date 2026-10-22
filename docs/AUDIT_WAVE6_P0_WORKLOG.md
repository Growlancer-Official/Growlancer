# Wave 6 — P0 Remediation Worklog

**Program:** Growlanzo forensic audit-and-fix
**Scope:** Master-fix-plan P0 items (`docs/AUDIT_MASTER_FIX_PLAN.md`), master IDs **MR-01 … MR-09**
**Repo root:** `c:/Users/mdmir/Documents/GROWLANCER`
**Date:** 2026-09-11
**Operator:** Wave 6 automation

---

## 1. Summary of changes

| MasterID | Finding | File(s) changed | Exact change summary | Verification performed | Result | Status |
|---|---|---|---|---|---|---|
| **MR-01** | CORS / uncaught ReferenceError (HTTP 500) | `supabase/functions/paypal-webhook/index.ts` | Added `import { getCorsHeaders } from '../_shared/cors.ts';`. Moved `const origin = req.headers.get('origin')` and `const corsHeaders = getCorsHeaders(origin)` (plus the `OPTIONS` early-return) from *before* the `try {` to *inside* it. The call previously referenced an undefined symbol outside the guarded block → uncaught `ReferenceError`. | `npx tsc --noEmit`; `npm run lint`; manual review of guards | PASS | **FIXED** |
| **MR-02** | `admin_credentials` RLS not scoped to `authenticated` + table in realtime publication | `supabase/migrations/20270119000000_fix_admin_credentials_rls_and_realtime.sql` (new) | `DROP POLICY` on the permissive prior policy and recreate `FOR SELECT` / `FOR ALL` **`TO authenticated`** with `USING`/`WITH CHECK (public.is_admin_user(auth.uid()))`. Guarded `DO $$ … $$` drops `admin_credentials` from `supabase_realtime` (tolerates `undefined_object`). Idempotent. TIGHTENS access only. | Authored; **not applied** (no live DB). Static review + LIVE-DB verification SQL embedded. | PASS (static) | **FIXED-PENDING-LIVE-DB-VERIFY** |
| **MR-03** | `admin_decide_dispute` split path drops wallet-funded credit; ledger identity broken | `supabase/migrations/20270119000300_fix_admin_decide_dispute_wallet_credit.sql` (new) | `CREATE OR REPLACE FUNCTION public.admin_decide_dispute(...)` restored **verbatim** from the authoritative `20260818000000_fix_refund_wallet_double_credit.sql`: wallet-funded detection (`razorpay_payment_id IS NOT NULL` OR paypal `status IN ('captured','refunded')`), wallet credit re-applied in **both** the `client_refund` and `split` branches, preserving return shape and transaction semantics. `SET search_path = ''`; grants tightened to `authenticated`. | Authored; **not applied**. Static review + LIVE-DB verification SQL embedded. | PASS (static) | **FIXED-PENDING-LIVE-DB-VERIFY** |
| **MR-04** | Newest `admin_reverse_escrow` silently reverts the earlier wallet-credit fix | `supabase/migrations/20270119000200_fix_admin_reverse_escrow_wallet_credit.sql` (new) | Determined the chronologically newest in-repo definition is `20260920000000_fix_escrow_schema_drift.sql` (which dropped the wallet credit). New migration re-applies the corrected logic from `20260818000000` verbatim, `SET search_path = ''`, grants tightened. | Authored; **not applied**. Static review + LIVE-DB verification SQL embedded. | PASS (static) | **FIXED-PENDING-LIVE-DB-VERIFY** |
| **MR-05** | IDOR — `get_wallet_balance` trusted a client-supplied `p_user_id`; browser helper sent it | `supabase/migrations/20270119000100_fix_get_wallet_balance_auth_derived.sql` (new) + `src/lib/supabase.ts` + `src/lib/withdrawal.ts` + `src/lib/analyticsService.ts` | **Migration:** redefine `public.get_wallet_balance` to derive identity from `auth.uid()` and **ignore** `p_user_id` (retained only for signature compatibility); `SET search_path = public, pg_temp`; `REVOKE … FROM PUBLIC, anon`, `GRANT … TO authenticated, service_role`; `NOTIFY pgrst`. **Frontend:** `dbFunctions.getWalletBalance()` now takes **no id** and calls the in-repo fixed `get_wallet_balance` (previously `get_wallet_balance_v2`, a function that has **no migration** — live-DB drift — and trusted `p_user_id`). Call sites updated: `withdrawal.ts` (×2) and `analyticsService.ts` (×1). | Search: no client id passed; `npx tsc --noEmit`; `npm run lint`. Migration not applied. | PASS | **FIXED-PENDING-LIVE-DB-VERIFY** |
| **MR-06** | Browser called `supabase.auth.admin.deleteUser(...)` (impossible client-side) | `src/lib/services/authService.ts` | `deleteAuthAccount` replaced the `auth.admin` call with `supabase.functions.invoke('delete-account', { method: 'POST' })`. Preserved `{ success, error? }` contract; handles both `error` and `data.success === false`; catches thrown errors. `userId` is now **diagnostics only** (server derives target from the verified session). Comment reworded to remove the literal admin token. | `search_files` `auth\.admin` under `src/` → **0 results**; `npx tsc --noEmit`; `npm run lint` | PASS | **FIXED** |
| **MR-07** | Telemetry wrote `event_id = null` into a NOT-NULL UNIQUE column and discarded `message`; errors swallowed | `src/lib/telemetry.ts` | Added `generateEventId()` (`crypto.randomUUID()` with timestamp+random fallback). `persistError` now always supplies a non-null unique `event_id` and a guaranteed-string `message`; insert `.catch` now logs `console.error`. `captureError` forwards the message (`persistError({ ...(payload||{}), message })`). Insert failures surfaced consistently with MR-08. | `search_files` `event_id:\s*null` under `src/` → **0 results**; `npx tsc --noEmit`; `npm run lint` | PASS | **FIXED** |
| **MR-08** | Sentry initialized only when the DSN *starts with* `https://`; malformed-but-present DSN silently skipped; catch swallowed | `pages/+client.ts` | Trim DSN; validate with `new URL()` (`https:`/`http:`); if present-but-malformed → **fail loud** (`console.error` + telemetry `captureError`), otherwise initialize Sentry. Init `.catch` now logs. No DSN hardcoded; SSR-safe (`window`/`load` guarded). | `npx tsc --noEmit`; `npm run lint` | PASS | **FIXED** |
| **MR-09** | `npm run build` fails: Vike emits malformed Windows path `C:\c:\Users\…` → `ERR_MODULE_NOT_FOUND` | *(none — deferred by instruction)* | Third-party/platform defect in vendored `@brillout/vite-plugin-server-entry`. Not patched (must not edit vendored Vike). Deferred to Wave 9. | `npm run build` | FAIL (pre-existing) | **BLOCKED** |

### Migration layout choice

**One migration per concern (4 files), not combined.** Rationale: the four DB fixes are independent root causes with independent live-DB verification queries and independent idempotency. Keeping them separate preserves audit traceability (1 master ID ↔ 1 file), lets each be applied/verified/rolled back in isolation, and avoids a single large migration masking which finding remains unverified. All four share the `20270119*` namespace and sort **after** the newest pre-existing migration (`20270118000000`).

### Note on `get_wallet_balance_v2` (live-DB drift — surfaced by MR-05)

`src/types/supabase.ts` declares both `get_wallet_balance` and `get_wallet_balance_v2`, but **no migration in the repo defines `get_wallet_balance_v2`**. The pre-fix frontend helper called `v2`, so the MR-05 migration (which fixes `get_wallet_balance`) would **not** have covered the real call path. This was resolved by pointing the frontend at the in-repo, now-fixed `get_wallet_balance`, and by adding a **schema-drift sweep** to the MR-05 verification SQL (item d) that lists *every* live `get_wallet_balance%` variant so a stray `v2` (or any other variant) can be neutralised on the live DB.

---

## 2. Post-change validation — literal command output

### (1) `npm run lint` → **PASS (exit 0)**

```
> growlancer@0.0.1 lint
> eslint . --ext ts,tsx --report-unused-disable-directives
```
*(no warnings, no errors; command exited 0)*

### (2) `npx tsc --noEmit` → **PASS (exit 0, 0 errors)**

```
(no output — strict:false project compiled with 0 errors)
```

### (3) `npx vitest run --pool=vmForks` → **matches documented baseline (2 files / 13 tests FAIL)**

```
 Test Files  2 failed | 4 passed (6)
      Tests  13 failed | 94 passed (107)
   Duration  50.14s
```

Failing suites (pre-existing; **unrelated to Wave 6 changes**, not fixed per instruction):

```
 FAIL  src/test/authService.test.ts > fetchUserProfile (with Supabase mock) > returns full profile for a valid active user
TypeError: mockSupabase.mockReturnValueOnce is not a function
 ❯ src/test/authService.test.ts:186:8

 FAIL  src/test/authService.test.ts > fetchUserProfile (with Supabase mock) > overrides role with admin when is_admin=true in profiles_private
TypeError: mockSupabase.mockReturnValueOnce is not a function
 ❯ src/test/authService.test.ts:221:8

 FAIL  src/test/escrow.test.ts > escrowService.release > returns false if escrow row does not exist
Error: Test timed out in 5000ms.
 ❯ src/test/escrow.test.ts:85:3

 … (escrow.test.ts: 11 timeout failures across escrowService.release / getByContract / hireFreelancerFromProposal)
```

Baseline parity: **2 failing files / 13 failing tests / 94 passing** — identical count to the pre-change baseline recorded in the task specification.

### (4) `npm run build` → **FAIL (expected; MR-09, pre-existing, not fixed)**

```
> growlancer@0.0.1 build
> node scripts/build.mjs

[1/5] Running vite build...
vite v8.0.16 building client environment for production...
✓ 2315 modules transformed.
✓ built in 12.80s
[vercel-output] Copying dist/client/ → dist/...
[boot-splash] Injected boot splash into 2 HTML file(s)
vite v8.0.16 building ssr environment for production...
✓ 229 modules transformed.
vike v0.4.260 pre-rendering HTML...
Error: Cannot find module 'C:\c:\Users\mdmir\Documents\GROWLANCER\dist\server\entry.mjs'
 imported from C:\Users\mdmir\Documents\GROWLANCER\node_modules\@brillout\vite-plugin-server-entry\dist\esm\runtime\autoImporter.js
    at finalizeResolution (node:internal/modules/esm/resolve:271:11)
    …
    at Module.loadServerEntry (.../@brillout/vite-plugin-server-entry/dist/esm/runtime/autoImporter.js:3:46)
✗ Vite build failed: Command failed: npx vite build
```

Root cause unchanged from baseline: the vendored Vike server-entry plugin concatenates the drive-relative path (`C:\` + `c:\Users\…`) producing an invalid module specifier. Per instruction, the vendored third-party code is **not** patched; deferred to Wave 9.

### (5) `search_files` — `auth\.admin` under `src/**` → **0 results (empty)**

```
Found 0 results.
```

### (6) `search_files` — `event_id:\s*null` under `src/**` → **0 results (empty)**

```
Found 0 results.
```

---

## 3. Live-DB verification SQL (Tasks E–H)

> These migrations are **authored but not applied** (no live database access in this environment). Apply the four new migrations in timestamp order, then run the SQL below. Each is embedded at the foot of its migration file as well.

### MR-02 — `20270119000000_fix_admin_credentials_rls_and_realtime.sql`

```sql
-- (a) Every admin_credentials policy MUST be scoped to `authenticated` with an
--     admin predicate. There must be no role-less / PUBLIC policy.
SELECT polname, polroles::regrole[] AS roles, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.admin_credentials'::regclass;
-- Expect: roles = {authenticated} for every row; using_expr references is_admin_user(auth.uid()).

-- (b) anon must NOT be able to read the table.
SET ROLE anon;
SELECT count(*) FROM public.admin_credentials;   -- Expect: permission denied / 0 rows
RESET ROLE;

-- (c) The table must NOT be in the realtime publication.
SELECT 1 FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_credentials';
-- Expect: 0 rows.
```

### MR-05 — `20270119000100_fix_get_wallet_balance_auth_derived.sql`

```sql
-- (a) Definition derives identity from auth.uid() and ignores p_user_id.
SELECT pg_get_functiondef('public.get_wallet_balance(uuid)'::regprocedure);
-- Expect: WHERE user_id = v_uid ; SET search_path = public, pg_temp.

-- (b) IDOR closed — as user A, requesting user B's wallet returns A's own.
SELECT public.get_wallet_balance('<USER_B_UUID>'::uuid);
-- Expect: A's own balance, never B's.

-- (c) anon cannot execute.
SET ROLE anon;
SELECT public.get_wallet_balance();              -- Expect: permission denied
RESET ROLE;

-- (d) DRIFT SWEEP — list every live get_wallet_balance* variant.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'get_wallet_balance%'
ORDER BY p.proname;
-- Expect ONLY get_wallet_balance(uuid). For any other variant (e.g. get_wallet_balance_v2):
--   DROP FUNCTION public.<name>(<args>);   -- if unused, or re-create auth-derived like this migration,
--   then REVOKE EXECUTE FROM PUBLIC, anon; GRANT TO authenticated, service_role;
```

### MR-04 — `20270119000200_fix_admin_reverse_escrow_wallet_credit.sql`

```sql
-- (a) Newest in-repo definition is superseded; body credits the wallet for wallet-funded escrows.
SELECT pg_get_functiondef('public.admin_reverse_escrow(uuid,uuid,text)'::regprocedure);
-- Expect: wallet-funded branch does UPDATE wallets SET balance = balance + v_escrow.amount
--         AND inserts a transactions row; SET search_path = ''.

-- (b) Ledger identity holds after a reversal (freelancer_credit + platform_revenue == client_total_charged).
--     Run against a reversed wallet-funded escrow and assert the invariant.
```

### MR-03 — `20270119000300_fix_admin_decide_dispute_wallet_credit.sql`

```sql
-- (a) Both decision branches credit the wallet for wallet-funded escrows.
SELECT pg_get_functiondef('public.admin_decide_dispute(uuid,text,numeric,text)'::regprocedure);
-- Expect: v_wallet_funded detection and wallet credit in BOTH client_refund and split branches;
--         SET search_path = ''.

-- (b) Ledger identity after a `split` decision on a wallet-funded dispute.
--     SELECT (freelancer credit + platform revenue) - client_total_charged;  -- Expect: 0
```

---

## 4. Residual risk / not fixed

- **MR-09 — `npm run build` remains broken (BLOCKED, deferred to Wave 9).** Malformed Windows path emitted by vendored `@brillout/vite-plugin-server-entry` (`C:\c:\Users\…\dist\server\entry.mjs`) → `ERR_MODULE_NOT_FOUND` during Vike SSR prerender. This is a third-party/platform defect; vendored Vike must not be edited in this wave. Until resolved, production SSR build is unavailable via this pipeline.
- **MR-02 / MR-03 / MR-04 / MR-05 migrations are NOT applied.** They are authored and statically reviewed only. Until applied to the live database and verified with the SQL in §3, the corresponding security/money defects remain exploitable/mis-computing in the live environment.
- **Live-DB schema drift (`get_wallet_balance_v2` and any other un-migrated variants).** The repo contains no definition of `get_wallet_balance_v2`, yet the environment's generated types declare it. The frontend no longer calls it, but a live `v2` (or other variant) that trusts a client-supplied id may still be directly reachable via PostgREST. Verification item **MR-05 (d)** must be run and any such variant dropped/re-created.
- **`analyticsService.getFreelancerAnalytics(freelancerId)`** now requests the **authenticated** user's wallet regardless of the passed `freelancerId`. Confirmed safe for the only caller (`AnalyticsPage.tsx` passes `user.id`); if a future caller renders another user's analytics, the wallet figure would be that of the viewer and the function signature (`freelancerId`) becomes misleading — follow-up cleanup recommended (not a P0 security issue).
- **Vitest baseline failures (2 files / 13 tests)** and the **Node 24 `threads`-pool collection error** remain; explicitly out of scope for Wave 6 (must not fix vitest here).
- **No secrets were read, printed, or committed.** `.env.local` values were never echoed; only key names referenced. No RLS/security control was weakened; all RLS/policy and grant changes tighten access (`TO authenticated`, `REVOKE … FROM PUBLIC, anon`).

---

P0 items fixed: 8/9; pending live-DB verification: 4; blocked: 1
