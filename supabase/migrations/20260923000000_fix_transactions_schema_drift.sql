-- ============================================================================
-- Fix `transactions` schema drift
--
-- Root cause found during production audit:
--   The `transactions` table was created on the live DB WITHOUT the
--   `updated_at` and `currency` columns declared in the original migration
--   (20260617_fix_escrow_auth_and_add_transactions.sql), and `amount` was
--   created as INTEGER instead of NUMERIC(12,2).
--
--   Because `trigger_transactions_updated_at` (BEFORE UPDATE) assigns
--   `NEW.updated_at = NOW()`, EVERY update of the `transactions` table
--   (and every escrow deletion that SET NULLs transactions.escrow_id)
--   failed with:
--     record "new" has no field "updated_at"
--
-- This fix restores the missing columns and widens `amount` so all
-- financial flows (escrow release, refunds, stale-withdrawal recovery)
-- work correctly. Idempotent and safe to re-run.
-- ============================================================================

-- 1. Restore missing columns
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- 2. Widen amount to NUMERIC(12,2) so fractional (paise) amounts are exact
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'amount'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.transactions ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2);
  END IF;
END $$;

-- 3. Ensure the trigger exists (idempotent) now that updated_at is present
DROP TRIGGER IF EXISTS trigger_transactions_updated_at ON public.transactions;
CREATE TRIGGER trigger_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_transactions_updated_at();

-- 4. Backfill updated_at for existing rows
UPDATE public.transactions SET updated_at = COALESCE(updated_at, created_at) WHERE updated_at IS NULL;

-- 5. Backfill currency from wallets where determinable
UPDATE public.transactions t
SET currency = COALESCE(w.currency, 'USD')
FROM public.wallets w
WHERE t.user_id = w.user_id AND (t.currency IS NULL OR t.currency = '');

-- 6. Guard the trigger function itself against future drift (defensive:
--    never fail a money movement because the timestamp column is missing)
CREATE OR REPLACE FUNCTION public.update_transactions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'updated_at'
  ) THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;
