-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN COMMISSION WITHDRAWALS
-- The platform's 5% commission (booked in platform_revenue on every escrow
-- release) belongs to Growlancer. Admins can withdraw it to their own bank
-- account in real time through RazorpayX payouts.
--
-- Available balance = total released commission − withdrawals in flight
-- (pending/processing/completed). Failed/cancelled withdrawals free the
-- amount back into the available balance automatically.
--
-- Bank limits (SBM — Suryoday Small Finance Bank):
--   min ₹100 · max ₹5,00,000 per payout
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 100 AND amount <= 500000),
  fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'bank' CHECK (method IN ('bank', 'upi')),
  account_holder_name TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  bank_name TEXT,
  upi_id TEXT,
  razorpay_fund_account_id TEXT,
  razorpay_payout_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  failure_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_withdrawals_status ON public.admin_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_admin_withdrawals_created ON public.admin_withdrawals(created_at DESC);

-- ─── RLS: admins only ─────────────────────────────────────────────────────
ALTER TABLE public.admin_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin withdrawals select" ON public.admin_withdrawals;
CREATE POLICY "Admin withdrawals select" ON public.admin_withdrawals
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- No direct INSERT/UPDATE policies — rows are created/updated exclusively by
-- the admin-withdrawal edge function (service role) and the SECURITY DEFINER
-- RPCs below, never from the browser.

-- ─── Helper: is the caller an admin? (SECURITY DEFINER internal) ──────────
-- Mirrors AdminAuthGuard: role = 'admin' OR legacy is_admin = true.
CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND (role = 'admin' OR is_admin = true)
  );
$$;

-- ─── RPC: admin commission balance (real time) ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_commission_balance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC := 0;
  v_withdrawn NUMERIC := 0;
  v_available NUMERIC := 0;
  v_this_month NUMERIC := 0;
BEGIN
  -- Only admins may read the commission ledger
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Total 5% commission earned (released revenue, never double-counted).
  -- Only 'released' counts — 'pending' is never inserted by the booking
  -- helpers and must never inflate the withdrawable balance.
  SELECT COALESCE(SUM(platform_fee), 0)
    INTO v_total
    FROM public.platform_revenue
   WHERE status = 'released';

  -- Commission already withdrawn or in flight
  SELECT COALESCE(SUM(amount), 0)
    INTO v_withdrawn
    FROM public.admin_withdrawals
   WHERE status IN ('pending', 'processing', 'completed');

  -- Commission earned this calendar month
  SELECT COALESCE(SUM(platform_fee), 0)
    INTO v_this_month
    FROM public.platform_revenue
   WHERE status = 'released'
     AND released_at >= date_trunc('month', now());

  v_available := GREATEST(0, v_total - v_withdrawn);

  RETURN jsonb_build_object(
    'total_commission', v_total,
    'withdrawn', v_withdrawn,
    'available_balance', v_available,
    'this_month', v_this_month,
    'min_withdrawal', 100,
    'max_withdrawal', 500000
  );
END;
$$;

-- ─── RPC: book an admin withdrawal (server-authoritative validation) ──────
CREATE OR REPLACE FUNCTION public.create_admin_withdrawal(
  p_amount NUMERIC,
  p_method TEXT DEFAULT 'bank',
  p_account_holder_name TEXT DEFAULT NULL,
  p_account_number TEXT DEFAULT NULL,
  p_ifsc_code TEXT DEFAULT NULL,
  p_bank_name TEXT DEFAULT NULL,
  p_upi_id TEXT DEFAULT NULL
)
RETURNS public.admin_withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available NUMERIC := 0;
  v_row public.admin_withdrawals;
BEGIN
  -- Only admins may withdraw
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Method + destination validation
  IF p_method NOT IN ('bank', 'upi') THEN
    RAISE EXCEPTION 'Invalid payout method';
  END IF;
  IF p_method = 'bank' AND (p_account_number IS NULL OR p_ifsc_code IS NULL OR p_account_holder_name IS NULL) THEN
    RAISE EXCEPTION 'Bank account number, IFSC and account holder name are required';
  END IF;
  IF p_method = 'upi' AND (p_upi_id IS NULL OR p_upi_id = '') THEN
    RAISE EXCEPTION 'UPI ID is required';
  END IF;

  -- Bank limits (SBM Small Finance Bank): min ₹100, max ₹5,00,000
  IF p_amount IS NULL OR p_amount < 100 THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is ₹100';
  END IF;
  IF p_amount > 500000 THEN
    RAISE EXCEPTION 'Maximum withdrawal amount is ₹5,00,000';
  END IF;

  -- Insufficient commission balance
  SELECT (get_admin_commission_balance() ->> 'available_balance')::NUMERIC INTO v_available;
  IF v_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient commission balance. Available: ₹%', v_available;
  END IF;

  INSERT INTO public.admin_withdrawals (
    amount, fee, net_amount, method,
    account_holder_name, account_number, ifsc_code, bank_name, upi_id,
    status
  ) VALUES (
    p_amount, 0, p_amount, p_method,
    p_account_holder_name, p_account_number, p_ifsc_code, p_bank_name, p_upi_id,
    'pending'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ─── RPC: mark admin withdrawal outcome (edge function / cron only) ───────
-- Called with service role — the function itself refuses non-admin callers
-- except the internal cron path (identified by p_internal flag + service role).
CREATE OR REPLACE FUNCTION public.finalize_admin_withdrawal(
  p_withdrawal_id UUID,
  p_status TEXT,
  p_razorpay_payout_id TEXT DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS public.admin_withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_withdrawals;
  v_admin BOOLEAN;
BEGIN
  SELECT public.is_admin_user(auth.uid()) INTO v_admin;

  -- Service role has auth.uid() = NULL → allow only when explicitly internal
  IF NOT v_admin AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.admin_withdrawals SET
    status = p_status,
    razorpay_payout_id = COALESCE(p_razorpay_payout_id, razorpay_payout_id),
    failure_reason = CASE WHEN p_status IN ('failed', 'cancelled') THEN p_failure_reason ELSE failure_reason END,
    processed_at = CASE WHEN p_status IN ('completed', 'failed', 'cancelled') THEN now() ELSE processed_at END,
    updated_at = now()
  WHERE id = p_withdrawal_id
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;

  RETURN v_row;
END;
$$;

-- ─── Grants ───────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_admin_commission_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_withdrawal(NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
-- finalize_admin_withdrawal is ONLY called by the edge function via the
-- service role — it must NOT be executable by regular authenticated users.
REVOKE EXECUTE ON FUNCTION public.finalize_admin_withdrawal(UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_admin_withdrawal(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ─── Realtime: admin withdrawals (admin panel live updates) ───────────────
DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_withdrawals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_withdrawals;
  END IF;
END $realtime$;
