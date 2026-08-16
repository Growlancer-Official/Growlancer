-- ════════════════════════════════════════════════════════════════════════
-- GROWLANCER — INR currency consistency (Part A of launch-ready prompt)
-- Platform is India-first: every currency column defaults to 'INR', existing
-- rows with NULL / 'USD' defaults are backfilled, and money-bearing tables
-- (contracts, services, escrow) get an explicit currency column so no value
-- is ever implied. This is silent prep only — no multi-currency feature yet.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Normalize defaults on tables that already carry a currency column ──
-- (live info_schema: paypal_* + transactions defaulted 'USD', payment_audit_logs NULL)

ALTER TABLE public.paypal_disputes     ALTER COLUMN currency SET DEFAULT 'INR';
ALTER TABLE public.paypal_orders       ALTER COLUMN currency SET DEFAULT 'INR';
ALTER TABLE public.paypal_transactions ALTER COLUMN currency SET DEFAULT 'INR';
ALTER TABLE public.transactions        ALTER COLUMN currency SET DEFAULT 'INR';
ALTER TABLE public.payment_audit_logs  ALTER COLUMN currency SET DEFAULT 'INR';

-- Backfill existing rows with the wrong default (NULL or 'USD') → 'INR'.
-- India-first platform: every stored amount has always been INR in practice.
UPDATE public.paypal_disputes     SET currency = 'INR' WHERE currency IS NULL OR currency NOT IN ('INR');
UPDATE public.paypal_orders       SET currency = 'INR' WHERE currency IS NULL OR currency NOT IN ('INR');
UPDATE public.paypal_transactions SET currency = 'INR' WHERE currency IS NULL OR currency NOT IN ('INR');
UPDATE public.transactions        SET currency = 'INR' WHERE currency IS NULL OR currency NOT IN ('INR');
UPDATE public.payment_audit_logs  SET currency = 'INR' WHERE currency IS NULL OR currency NOT IN ('INR');

-- ── 2. Explicit currency on money-bearing tables that lack the column ─────
-- Contracts, services (incl. packages JSONB) and escrow hold amounts but had
-- no currency column — amounts were implied INR. Add explicit columns.

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.services   ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.escrow     ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

-- ── 3. Guardrails so future inserts never drift back to USD/NULL ─────────
-- Razorpay tables already default 'INR'; make the rest of the money tables
-- defensive too (idempotent, no-op where already correct).

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices', 'razorpay_orders', 'razorpay_transactions', 'refunds',
    'subscription_plans', 'wallets'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'currency'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN currency SET DEFAULT ''INR''', t);
    END IF;
  END LOOP;
END $$;

-- ── 4. Verify — should print exactly 'INR' for every row ─────────────────
DO $$
DECLARE
  bad INT;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT currency FROM public.paypal_disputes
    UNION ALL SELECT currency FROM public.paypal_orders
    UNION ALL SELECT currency FROM public.paypal_transactions
    UNION ALL SELECT currency FROM public.transactions
    UNION ALL SELECT currency FROM public.payment_audit_logs
  ) x WHERE currency IS DISTINCT FROM 'INR';
  IF bad > 0 THEN
    RAISE EXCEPTION 'Currency consistency failed: % rows still not INR', bad;
  END IF;
END $$;
