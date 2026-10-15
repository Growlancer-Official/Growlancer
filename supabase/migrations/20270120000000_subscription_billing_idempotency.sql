-- ============================================================================
-- MR-11 — SEC-002 (§1 P1) — SUBSCRIPTION BILLING IDEMPOTENCY
--
-- Problem:
--   subscription-billing-cron charges each user's saved card (Razorpay token
--   payment) for trial->paid conversions and active renewals. It had NO
--   idempotency guard, so a duplicate or overlapping cron run (retry, manual
--   re-invoke, or an at-least-once pg_net delivery) could charge the SAME
--   subscription twice for the SAME billing period — a real double debit.
--
-- Fix:
--   Add public.subscription_billing_charges — exactly one row per
--   (subscription_id, billing_period). The edge function atomically INSERTs a
--   'pending' claim BEFORE calling the gateway; the UNIQUE constraint makes a
--   second concurrent/repeated run fail with 23505, so it SKIPS the charge.
--   After the attempt the row is finalised to 'charged' (with the gateway
--   payment id) or 'failed'.
--
--   Fail-CLOSED semantics: a crash after gateway success but before finalise
--   leaves the row 'pending', which still blocks any future run for that
--   period. We would rather miss recording one charge than double-debit a user.
--
-- Safe: purely additive, non-destructive and idempotent (IF NOT EXISTS).
-- Touches NO existing table, row, policy or function. Deny-all RLS for
-- anon/authenticated (service_role bypasses RLS) — this is an internal ledger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_billing_charges (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  billing_period       TEXT NOT NULL,          -- 'YYYY-MM' of the period being settled
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'charged', 'failed')),
  amount               NUMERIC(12,2),
  razorpay_payment_id  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_billing_charges_period_unique
    UNIQUE (subscription_id, billing_period)
);

CREATE INDEX IF NOT EXISTS idx_subscription_billing_charges_sub
  ON public.subscription_billing_charges (subscription_id, billing_period);

-- Internal billing ledger: no end-user access. RLS on with NO policies =
-- deny-all for anon/authenticated; service_role bypasses RLS.
ALTER TABLE public.subscription_billing_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_billing_charges FROM anon, authenticated;
GRANT ALL ON public.subscription_billing_charges TO service_role;

COMMENT ON TABLE public.subscription_billing_charges IS
  'MR-11/SEC-002: idempotency ledger for subscription renewal charges. UNIQUE(subscription_id, billing_period) prevents duplicate charges from cron re-runs or overlapping invocations.';

-- ============================================================================
-- LIVE-DB VERIFICATION REQUIRED
--
-- 1) Table + UNIQUE constraint exist:
--      SELECT conname FROM pg_constraint
--       WHERE conrelid = 'public.subscription_billing_charges'::regclass
--       ORDER BY conname;
--      -- expect: subscription_billing_charges_period_unique,
--      --         subscription_billing_charges_pkey
--
-- 2) RLS enabled and NO policies (deny-all for anon/authenticated):
--      SELECT relrowsecurity FROM pg_class
--       WHERE relname = 'subscription_billing_charges';          -- expect true
--      SELECT count(*) FROM pg_policies
--       WHERE tablename = 'subscription_billing_charges';        -- expect 0
--
-- 3) Duplicate claim for the same (subscription_id, billing_period) is REJECTED:
--      INSERT INTO public.subscription_billing_charges (subscription_id, billing_period)
--        VALUES ('<any existing subscriptions.id>', '2027-01');
--      INSERT INTO public.subscription_billing_charges (subscription_id, billing_period)
--        VALUES ('<same subscriptions.id>', '2027-01');
--      -- expect: ERROR 23505 unique_violation
--
-- 4) (cleanup after the check) DELETE FROM public.subscription_billing_charges
--      WHERE billing_period = '2027-01' AND status = 'pending';
-- ============================================================================
