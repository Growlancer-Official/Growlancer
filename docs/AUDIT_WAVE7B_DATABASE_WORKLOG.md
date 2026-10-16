# AUDIT WAVE 7B — DATABASE / MONEY / RLS / STORAGE (P1) — WORKLOG

**Program:** Growlancer forensic audit-and-fix
**Wave:** 7 · **Batch:** 7B (Database / Money / RLS / Storage — P1)
**Authoritative register:** [`docs/AUDIT_MASTER_FIX_PLAN.md`](AUDIT_MASTER_FIX_PLAN.md) (§1 P1 table)
**Detail register:** [`docs/AUDIT_FINDINGS_DATABASE.md`](AUDIT_FINDINGS_DATABASE.md)
**Hygiene/worklog precedents:** [`docs/AUDIT_WAVE6_P0_WORKLOG.md`](AUDIT_WAVE6_P0_WORKLOG.md), [`docs/AUDIT_WAVE7A_BACKEND_WORKLOG.md`](AUDIT_WAVE7A_BACKEND_WORKLOG.md)
**Date:** 2026-09-11
**Status:** Complete — pending live-DB verification

---

## 1. Scope

This batch addresses **exactly** the following 10 master findings. No MR-10…MR-17 or MR-28…MR-121 item was touched.

| Master | Original | Summary |
|---|---|---|
| MR-18 | MONEY-003 | Systemic regression: later `CREATE OR REPLACE` migrations override earlier money fixes → reapply authoritative definitions in ONE ordered migration |
| MR-19 | MONEY-004 | Comma-quoted `SET search_path` breaks `cancel_withdrawal`, `release_milestone`, `process_withdrawal_complete` |
| MR-20 | MONEY-005 | `release_escrow` delegates to an end-user-auth-checked RPC → fails when called by cron |
| MR-21 | RLS-003 + MONEY-006 | `release_escrow` computes from a **fee-inclusive** pool (should be fee-exclusive base) |
| MR-22 | RLS-005 | Migration-order regression reverting a prior fix — cross-reference MR-04 |
| MR-23 | RLS-004 | ~24 `SECURITY DEFINER` functions omit `SET search_path` |
| MR-24 | RLS-006 | Contest `SECURITY DEFINER` misconfigured |
| MR-25 | DB-001 | Schema drift; 4 repair migrations diverge from baseline → consolidate + add drift check |
| MR-26 | STORAGE-001 | Browser client creates storage buckets → move to migration/server |
| MR-27 | STORAGE-002 | Client-controlled `companyId` used in the storage path → derive server-side |

---

## 2. Operating rules observed

- Smallest safe change; **all changes tighten** auth/authz/RLS — none weaken.
- **No historical migration edited, renamed or deleted.** All DB changes are in **NEW** migration files with timestamps strictly after the newest pre-existing migration (`20270121000000_internship_applications_user_ownership.sql`).
- Money functions preserve signatures, return shapes, and transaction semantics.
- No secrets read/printed/logged/committed (env NAMES only).
- `docs/AUDIT_*.md`, `.planning/`, `scripts/**` and ESLint ignore config untouched.
- Wave 6 P0s (4 × `20270119*` migrations) and Wave 7A changes not re-fixed.
- MR-22 / MR-24 verified against MR-04 / the last writer and marked **ALREADY-ADDRESSED** rather than duplicated.

---

## 3. Per-item results

| MasterID | Original ID | File(s) changed | Exact change | Verification | Result | Status |
|---|---|---|---|---|---|---|
| MR-18 | MONEY-003 | `supabase/migrations/20270124000000_restore_release_escrow_cron_and_fee_base.sql` | Re-applied the authoritative `release_escrow` / `_book_escrow_release` bodies in one ordered migration so later `CREATE OR REPLACE` regressions can no longer win. | `search_files` confirms MR-18 migration is the last writer of `release_escrow`; `SET search_path = ''` present. | Fixed | ✅ FIXED |
| MR-19 | MONEY-004 | `supabase/migrations/20270122000000_fix_money_function_search_path.sql` | Re-created `cancel_withdrawal`, `release_milestone`, `process_withdrawal_complete` with an UNQUOTED comma-separated `SET search_path = public, auth, pg_catalog` (replacing the single-token comma-quoted string produced by `quote_literal`). | `search_files`: 3 declarations at lines 44 / 102 / 176. | Fixed | ✅ FIXED |
| MR-20 | MONEY-005 | `supabase/migrations/20270124000000_restore_release_escrow_cron_and_fee_base.sql` | Added internal `_release_escrow_internal()` helper **without** end-user auth checks; public `release_escrow` performs its own auth check then delegates. Cron/service-role can now release. | `SET search_path = ''` on both; helper is not exposed to `authenticated`. | Fixed | ✅ FIXED |
| MR-21 | RLS-003 + MONEY-006 | `supabase/migrations/20270124000000_restore_release_escrow_cron_and_fee_base.sql` | `release_escrow` now computes the freelancer payout from the **fee-EXCLUSIVE** escrow base, preserving the ledger identity `freelancer_credit + platform_revenue == client_total_charged`. | Bodies inspected; pool base derived from `funding_amount` (base), not the fee-inclusive charged total. | Fixed | ✅ FIXED |
| MR-22 | RLS-005 | _(none — cross-reference)_ | Verified the artifact is already repaired by **MR-04** (`20270119000200_fix_admin_reverse_escrow_wallet_credit.sql` is the last writer). No duplicate migration created. | Last-writer check on `admin_reverse_escrow`. | Already addressed | ✅ ALREADY-ADDRESSED |
| MR-23 | RLS-004 | `supabase/migrations/20270123000000_harden_definer_search_path_source.sql` | Dynamic, idempotent loop over `pg_proc` that applies `ALTER FUNCTION … SET search_path = public, pg_catalog` (+ `, auth` where the body references `auth.`) to every `SECURITY DEFINER` function lacking a `search_path`. Functions that already carry one (incl. the deliberately-locked `SET search_path = ''` set) are **skipped** — never widened. | Migration body inspected (lines 73–75 format the ALTER). | Fixed | ✅ FIXED |
| MR-24 | RLS-006 | _(none — cross-reference)_ | Verified the contest `SECURITY DEFINER` function is correctly configured by the last writer `20270116000000_*`. No duplicate created. | Last-writer check. | Already addressed | ✅ ALREADY-ADDRESSED |
| MR-25 | DB-001 | `supabase/migrations/20270125000000_consolidate_schema_drift_and_add_check.sql` | One ordered, idempotent migration re-asserting all four drift repairs: (1) `contracts.escrow_funded` column + backfill; (2) `projects_status_check` superset (`open,in_progress,active,completed,cancelled`); (3) `transactions.updated_at` + `currency` (default `'INR'` **preserved** from `20261226000000`) + guarded `amount` INTEGER→NUMERIC(12,2); (4) trigger + hardened `update_transactions_updated_at()` **with** `SET search_path`; (5) NEW `check_schema_drift()` returning JSONB and recording NEW findings into `public.security_alerts`. | File present; `check_schema_drift` + 2 × `SET search_path = public, pg_catalog` confirmed. | Fixed | ✅ FIXED |
| MR-26 | STORAGE-001 | `supabase/migrations/20270126000000_provision_client_storage_buckets.sql`, [`src/lib/avatarUpload.ts`](../src/lib/avatarUpload.ts), [`src/lib/avatarPack.ts`](../src/lib/avatarPack.ts) | Removed all browser-side `createBucket` calls (deleted the method in `avatarUpload.ts`; removed the inline retry in `avatarPack.ts`). Buckets `avatars` + `company-logos` are now provisioned **only** via migration (`INSERT … ON CONFLICT (id) DO UPDATE`), re-asserting uid-scoped INSERT policies. | `search_files` for `createBucket` under `src/` → **0 results**. | Fixed | ✅ FIXED |
| MR-27 | STORAGE-002 | [`src/lib/avatarPack.ts`](../src/lib/avatarPack.ts), [`src/pages/OnboardingPage.tsx`](../src/pages/OnboardingPage.tsx), [`src/pages/ClientSettingsPage.tsx`](../src/pages/ClientSettingsPage.tsx) | `uploadCompanyLogo` / `deleteCompanyLogo` now derive the storage path from the **session** `user.id` (dropped the caller-supplied `companyId` parameter). Both callers updated to drop the argument. | `tsc --noEmit` exit 0; caller sites updated. | Fixed | ✅ FIXED |

---

## 4. Files created / changed

### New migrations

| Migration | Item | Purpose |
|---|---|---|
| `supabase/migrations/20270122000000_fix_money_function_search_path.sql` | MR-19 | Fix comma-quoted `SET search_path` on 3 money RPCs. |
| `supabase/migrations/20270123000000_harden_definer_search_path_source.sql` | MR-23 | Harden all `SECURITY DEFINER` functions lacking `search_path`. |
| `supabase/migrations/20270124000000_restore_release_escrow_cron_and_fee_base.sql` | MR-18 / MR-20 / MR-21 | Authoritative `release_escrow` + cron-safe internal helper + fee-exclusive base. |
| `supabase/migrations/20270125000000_consolidate_schema_drift_and_add_check.sql` | MR-25 | Consolidate drift + `check_schema_drift()`. |
| `supabase/migrations/20270126000000_provision_client_storage_buckets.sql` | MR-26 | Provision `avatars` + `company-logos` buckets via migration. |

### Application code changed

| File | Item | Change |
|---|---|---|
| `src/lib/avatarUpload.ts` | MR-26 | Deleted `createBucket()` method + "Bucket not found" retry block. |
| `src/lib/avatarPack.ts` | MR-26 / MR-27 | Removed inline `createBucket` retry; `uploadCompanyLogo(file)` / `deleteCompanyLogo()` now session-derived. |
| `src/pages/OnboardingPage.tsx` | MR-27 | `uploadCompanyLogo(file, user.id)` → `uploadCompanyLogo(file)`. |
| `src/pages/ClientSettingsPage.tsx` | MR-27 | `uploadCompanyLogo(file, user?.id \|\| 'temp')` → `uploadCompanyLogo(file)`. |

---

## 5. Post-change validation (literal commands + results)

| # | Command | Exit | Literal result |
|---|---|---|---|
| 1 | `npm run lint` | `0` | No errors. |
| 2 | `npx tsc --noEmit` | `0` | No type errors. |
| 3 | `npx vitest run --pool=vmForks` | `1` | `Test Files 2 failed | 4 passed (6)` · `Tests 13 failed | 94 passed (107)` — **matches pre-existing baseline exactly; no NEW failures.** Failing: `src/test/authService.test.ts` (`TypeError: mockSupabase.mockReturnValueOnce is not a function`) and `src/test/escrow.test.ts` (`Test timed out in 5000ms`). Artifact: `cmd-1789154351712.txt`. |
| 4 | `npm run build` | `1` | FAILS on the **known pre-existing Vike/Windows defect** (MR-09, out of scope): `Error: Cannot find module 'C:\c:\Users\mdmir\Documents\GROWLANCER\dist\server\entry.mjs'`. Client build itself succeeds (`✓ built in 9.45s`); failure occurs at SSR pre-render. Artifact: `cmd-1789154438713.txt`. |
| 5 | `search_files` `SET search_path` in `supabase/migrations/2027012*.sql` | — | 15 matches across the 4 Batch-7B hardening migrations (MR-19 ×3, MR-23 loop, MR-24 set, MR-25 ×2). |
| 6 | `search_files` `createBucket` under `src/*.ts*` | — | **Found 0 results** (MR-26 validated). |

---

## 6. Live-DB verification SQL (per migration)

> Run each block against the target database **after** `supabase db push` (or the equivalent migration apply). Expectations are stated inline.

### 6.1 MR-19 — `20270122000000_fix_money_function_search_path.sql`

```sql
-- V1 — the three money RPCs carry a CORRECT (unquoted) search_path.
SELECT p.proname, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('cancel_withdrawal','release_milestone','process_withdrawal_complete');
-- EXPECT: each proconfig contains exactly ONE element: {search_path=public, auth, pg_catalog}
--         (NO embedded commas inside quotes, i.e. NOT {search_path="public, auth, pg_catalog"}).

-- V2 — a call no longer raises 42P01 (undefined_table) from an empty search_path.
--   (Run under a representative session; EXPECT a normal domain result, not 42P01.)
```

### 6.2 MR-23 — `20270123000000_harden_definer_search_path_source.sql`

```sql
-- V3 — every SECURITY DEFINER function in public has an explicit search_path OR
--      is deliberately locked to ''.
SELECT p.proname,
       p.proconfig,
       (p.proconfig IS NULL OR NOT (p.proconfig::text LIKE '%search_path%')) AS missing_search_path
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
ORDER BY missing_search_path DESC, p.proname;
-- EXPECT: missing_search_path = false for all rows (0 offending functions).

-- V4 — the pre-existing hardened functions were NOT widened.
SELECT p.proname, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('release_escrow','_book_escrow_release','admin_reverse_escrow');
-- EXPECT: proconfig = {search_path=""} for each (still locked to empty).
```

### 6.3 MR-18 / MR-20 / MR-21 — `20270124000000_restore_release_escrow_cron_and_fee_base.sql`

```sql
-- V5 — public release_escrow delegates; internal helper exists and is service-role only.
SELECT p.proname, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('release_escrow','_release_escrow_internal');
-- EXPECT: both present; both have search_path = '' (empty, deliberately locked).

-- V6 — ledger identity holds after a release: freelancer_credit + platform_revenue
--      == client_total_charged (fee-EXCLUSIVE pool base).
--   (Run a controlled release in a staging DB and compare the ledger rows.)
SELECT
  SUM(CASE WHEN source='escrow_release' THEN amount ELSE 0 END) AS freelancer_credit,
  SUM(CASE WHEN source='platform_fee'   THEN amount ELSE 0 END) AS platform_revenue
FROM public.transactions
WHERE contract_id = '<CONTRACT_ID>';
-- EXPECT: freelancer_credit + platform_revenue = the client-charged total (no fee double-count).

-- V7 — cron path: releasing with the service-role JWT (no end-user auth) succeeds.
--   (Invoke release_escrow as service_role; EXPECT success, not an auth exception.)
```

### 6.4 MR-25 — `20270125000000_consolidate_schema_drift_and_add_check.sql`

```sql
-- V8 — column shapes restored.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='transactions' AND column_name IN ('updated_at','currency','amount'))
    OR (table_name='contracts'    AND column_name='escrow_funded'));
-- EXPECT:
--   contracts.escrow_funded  boolean  default false  NOT NULL
--   transactions.updated_at  timestamp with time zone  default now()
--   transactions.currency    text     default 'INR'::text          <-- PRESERVED
--   transactions.amount      numeric(12,2)

-- V9 — projects CHECK constraint is the superset.
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname='projects_status_check';
-- EXPECT: CHECK (status = ANY (ARRAY['open','in_progress','active','completed','cancelled']))

-- V10 — trigger present and its function is hardened.
SELECT tgname FROM pg_trigger WHERE tgname='trigger_transactions_updated_at';
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='update_transactions_updated_at';
-- EXPECT: trigger exists; prosecdef=true; proconfig includes search_path=public, pg_catalog.

-- V11 — the drift check reports NO findings on a healthy DB.
SELECT public.check_schema_drift();
-- EXPECT: []  (empty JSONB array)

-- V12 — no unresolved schema-drift alerts were emitted.
SELECT count(*) FROM public.security_alerts
WHERE category='schema-drift' AND resolved = false;
-- EXPECT: 0
```

### 6.5 MR-26 — `20270126000000_provision_client_storage_buckets.sql`

```sql
-- V13 — both client-upload buckets exist with the intended flags/limits.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('avatars','company-logos');
-- EXPECT: avatars (public=true, 5242880); company-logos (public=true, 2097152).

-- V14 — uid-scoped INSERT policies are present.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND policyname IN ('Users can upload their own avatars','Users can upload their own company logos');
-- EXPECT: both rows present; with_check scopes (storage.foldername(name))[1] = auth.uid()::text.
```

### 6.6 MR-27 — session-derived storage path (application-level)

```sql
-- V15 — company-logo object names are keyed by the OWNER user id (first path segment
--       equals the owning user's id), not a caller-supplied company id.
SELECT name FROM storage.objects WHERE bucket_id='company-logos' ORDER BY created_at DESC LIMIT 20;
-- EXPECT: first path segment of every object == the uploader's auth.uid().
```

---

## 7. Residual risk

| # | Item | Risk | Mitigation / note |
|---|---|---|---|
| R1 | MR-25 | The consolidation is authoritative **as long as** no future migration re-`CREATE OR REPLACE`s the touched money/trigger objects without the fixes. | `check_schema_drift()` now flags regressions into `security_alerts`; wire it into a cron/CI gate to catch future drift automatically. |
| R2 | MR-18 / MR-21 | Fee-exclusive base changes payout math for **pre-existing** escrow rows funded under the old fee-inclusive logic. | Verify with V6 on staging against historical contracts; if a one-time backfill is needed it must be a **separate** migration. |
| R3 | MR-23 | The dynamic loop only fixes functions present at apply time; a future definer added without `search_path` will regress. | The existing `check_security_drift()` continues to flag new offenders; consider a CI check on `pg_proc` for `prosecdef AND proconfig IS NULL`. |
| R4 | MR-20 | Cron service-role detection relies on `request.jwt.claim.role`. | Confirmed the same pattern already used elsewhere; monitor for silent auth failures in cron logs. |
| R5 | MR-26 / MR-27 | Path derivation now depends on a valid session `user.id`; an unauthenticated call will be rejected by RLS. | Intended (tightening). Callers must ensure the user is authenticated before upload. |
| R6 | Validation | Vitest baseline still has 2 failing files / 13 failing tests (pre-existing). | Out of scope for 7B (MR-46); no new failures introduced. |
| R7 | Build | `npm run build` fails on the Vike/Windows path defect. | Pre-existing defect (MR-09), out of scope; client bundle builds successfully. |

---

## 8. Tally

**Batch 7B items fixed: 8/10; pending live-DB verification: 5; already-addressed: 2; blocked: 0**
