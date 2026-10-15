-- ============================================================================
-- MR-25 (finding DB-001) — Consolidate baseline schema drift + idempotent drift check
--
-- Background
-- ----------
-- The live database diverged from the migration baseline and was repaired by
-- FOUR ad-hoc "schema drift" migrations applied out of lexical order relative
-- to the surrounding application migrations:
--
--   20260814000000_fix_wallet_funded_refund_credit.sql
--   20260818000000_fix_refund_wallet_double_credit.sql
--   20260920000000_fix_escrow_schema_drift.sql
--   20260923000000_fix_transactions_schema_drift.sql
--
-- Those repairs are correct, but they are scattered, they are not re-asserted
-- anywhere after their point of application, and there is no automated guard
-- that fails loudly if the drift re-appears (e.g. a future table rebuild, a
-- `DROP COLUMN`, or a stale environment provisioned from the pre-drift
-- baseline). This migration:
--
--   1. Re-asserts the CONSOLIDATED baseline schema repairs in ONE ordered,
--      idempotent migration (safe to run against an already-repaired DB):
--        a. contracts.escrow_funded        (restore + backfill)
--        b. projects.status CHECK superset
--        c. transactions.updated_at        (restore)
--        d. transactions.currency          (restore; existing default kept)
--        e. transactions.amount            (widen INTEGER → NUMERIC(12,2))
--        f. trigger_transactions_updated_at + guarded trigger fn
--   2. Adds an idempotent, self-contained drift check:
--        public.check_schema_drift()  — returns a JSONB list of findings and
--        records any NEW findings into public.security_alerts so the existing
--        realtime admin dashboard surfaces them (category = 'schema-drift').
--
-- Design constraints honoured here:
--   * Additive / idempotent only — never drops data-bearing objects.
--   * No historical migration is edited, renamed or deleted.
--   * Every SECURITY DEFINER function gets an explicit `SET search_path`.
--   * Existing column defaults are preserved (transactions.currency default is
--     left untouched — 20261226000000_inr_currency_consistency.sql intentionally
--     set it to 'INR'; this migration does not revert that).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. contracts.escrow_funded — restore (idempotent) + backfill
-- ----------------------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS escrow_funded BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any contract whose escrow is currently funded or already released
-- was funded at some point. COALESCE keeps already-true rows true.
UPDATE public.contracts c
SET escrow_funded = true
WHERE escrow_funded IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM public.escrow e
    WHERE e.contract_id = c.id AND e.status IN ('funded', 'released')
  );

-- ----------------------------------------------------------------------------
-- 2. projects.status CHECK — widen to the workflow superset
--    (old baseline only allowed a subset; frontend + marketplace write
--     'in_progress' / 'active'). Idempotent: drop-then-add.
-- ----------------------------------------------------------------------------
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('open', 'in_progress', 'active', 'completed', 'cancelled'));

-- ----------------------------------------------------------------------------
-- 3. transactions — restore updated_at (trigger dependency) and widen amount
-- ----------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- transactions.currency: add only if missing. Do NOT reset the default — it is
-- 'INR' by deliberate later design (20261226000000_inr_currency_consistency).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

-- Widen amount so fractional (paise/cents) amounts are exact. Guarded so a
-- re-run on an already-numeric column is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'amount'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE public.transactions
      ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2);
  END IF;
END $$;

-- Backfill updated_at for pre-existing rows.
UPDATE public.transactions
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Guarded updated_at trigger + trigger function (explicit search_path)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_transactions_updated_at ON public.transactions;
CREATE TRIGGER trigger_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_transactions_updated_at();

-- Defensive guard: never fail a money movement because the timestamp column is
-- missing. SECURITY DEFINER with an explicit search_path (MR-23 hardening).
CREATE OR REPLACE FUNCTION public.update_transactions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'updated_at'
  ) THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_transactions_updated_at() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Idempotent schema drift check
--    Returns a JSONB array of {category, detail} findings and records any NEW
--    (not-yet-open) findings into security_alerts so the existing realtime
--    admin dashboard surfaces them. Empty array ⇒ no drift.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_schema_drift()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_findings JSONB := '[]'::jsonb;
  v_item     JSONB;
BEGIN
  -- (a) contracts.escrow_funded must exist and be NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts'
      AND column_name = 'escrow_funded' AND is_nullable = 'NO'
  ) THEN
    v_findings := v_findings || jsonb_build_object(
      'category', 'schema-drift',
      'detail', 'contracts.escrow_funded is missing or nullable');
  END IF;

  -- (b) projects.status CHECK must be the workflow superset
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_status_check'
      AND pg_get_constraintdef(oid) LIKE '%in_progress%'
      AND pg_get_constraintdef(oid) LIKE '%cancelled%'
  ) THEN
    v_findings := v_findings || jsonb_build_object(
      'category', 'schema-drift',
      'detail', 'projects.status CHECK is not the workflow superset (open|in_progress|active|completed|cancelled)');
  END IF;

  -- (c) transactions.updated_at must exist (trigger writes it)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
      AND column_name = 'updated_at'
  ) THEN
    v_findings := v_findings || jsonb_build_object(
      'category', 'schema-drift',
      'detail', 'transactions.updated_at is missing (BEFORE UPDATE trigger would fail)');
  END IF;

  -- (d) transactions.currency must exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
      AND column_name = 'currency'
  ) THEN
    v_findings := v_findings || jsonb_build_object(
      'category', 'schema-drift',
      'detail', 'transactions.currency is missing');
  END IF;

  -- (e) transactions.amount must be exact (numeric), not integer
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
      AND column_name = 'amount'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    v_findings := v_findings || jsonb_build_object(
      'category', 'schema-drift',
      'detail', 'transactions.amount is an integer type (must be NUMERIC(12,2))');
  END IF;

  -- (f) the updated_at trigger must be present
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_transactions_updated_at' AND NOT tgisinternal
  ) THEN
    v_findings := v_findings || jsonb_build_object(
      'category', 'schema-drift',
      'detail', 'trigger_transactions_updated_at is missing');
  END IF;

  -- Record any NEW findings (skip ones already open) into security_alerts.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_findings)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = v_item->>'category'
        AND detail = v_item->>'detail'
        AND is_resolved = false
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail, source)
      VALUES ('high', v_item->>'category', v_item->>'detail', 'schema-drift-check');
    END IF;
  END LOOP;

  RETURN v_findings;
END;
$$;

REVOKE ALL ON FUNCTION public.check_schema_drift() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_schema_drift() TO service_role;

-- ============================================================================
-- LIVE-DB VERIFICATION REQUIRED
-- Run these against the live/staging database after applying this migration.
-- Every query below must return the stated expectation.
-- ============================================================================
--
-- V1 — the four consolidated artifacts are present with the right shape:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND ((table_name = 'contracts'    AND column_name = 'escrow_funded')
--       OR (table_name = 'transactions' AND column_name IN ('updated_at','currency','amount')))
--   ORDER BY table_name, column_name;
--   -- EXPECT: contracts.escrow_funded = boolean / NO
--   --         transactions.updated_at = timestamp with time zone
--   --         transactions.currency   = text
--   --         transactions.amount     = numeric
--
-- V2 — projects.status CHECK is the superset:
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conname = 'projects_status_check';
--   -- EXPECT: CHECK (status = ANY (ARRAY['open','in_progress','active','completed','cancelled']))
--
-- V3 — the timestamp trigger exists on transactions:
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.transactions'::regclass AND NOT tgisinternal;
--   -- EXPECT: trigger_transactions_updated_at present
--
-- V4 — the trigger function is hardened (explicit search_path):
--   SELECT prosecdef, proconfig FROM pg_proc
--   WHERE proname = 'update_transactions_updated_at';
--   -- EXPECT: prosecdef = t AND proconfig contains 'search_path=public, pg_catalog'
--
-- V5 — the drift check reports NO findings on a healthy DB:
--   SELECT public.check_schema_drift();
--   -- EXPECT: []  (empty JSONB array)
--
-- V6 — no unresolved schema-drift alerts linger after a clean run:
--   SELECT count(*) FROM public.security_alerts
--   WHERE category = 'schema-drift' AND is_resolved = false;
--   -- EXPECT: 0
--
-- V7 — confirm the consolidation did not regress the currency default set by
--      20261226000000_inr_currency_consistency.sql:
--   SELECT column_default FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'transactions'
--     AND column_name = 'currency';
--   -- EXPECT: 'INR'::text
-- ============================================================================
