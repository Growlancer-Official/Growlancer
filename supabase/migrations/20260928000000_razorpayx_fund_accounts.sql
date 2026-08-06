-- ═══════════════════════════════════════════════════════════════════════════════
-- RazorpayX fund account IDs for INR payouts
-- RazorpayX /v1/payouts requires a fund_account_id created server-side via
-- POST /v1/fund_accounts (bank_account or vpa). The raw account number / UPI ID
-- is NOT accepted. This column stores the RazorpayX fund account ID so payouts
-- can be executed reliably without leaking PII to the client.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'razorpay_fund_account_id'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN razorpay_fund_account_id TEXT;
  END IF;
END $$;

-- ─── get_payout_methods: also return the RazorpayX fund account id ───────────
CREATE OR REPLACE FUNCTION public.get_payout_methods(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_array();
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pm.id,
      'type', pm.type,
      'label', pm.label,
      'email', pm.email,
      'phone', pm.phone,
      'account_holder_name', pm.account_holder_name,
      'account_number', CASE
        WHEN pm.account_number IS NOT NULL THEN '****' || RIGHT(pm.account_number, 4)
        ELSE NULL
      END,
      'routing_number', CASE
        WHEN pm.routing_number IS NOT NULL THEN '****' || RIGHT(pm.routing_number, 4)
        ELSE NULL
      END,
      'bank_name', pm.bank_name,
      'ifsc_code', pm.ifsc_code,
      'upi_id', pm.upi_id,
      'razorpay_fund_account_id', pm.razorpay_fund_account_id,
      'is_default', pm.is_default,
      'created_at', pm.created_at,
      'updated_at', pm.updated_at
    )
    ORDER BY pm.is_default DESC, pm.created_at DESC
  ) INTO v_result
  FROM public.payout_methods pm
  WHERE pm.user_id = p_user_id;

  IF v_result IS NULL THEN
    v_result := '[]'::jsonb;
  END IF;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payout_methods(uuid) TO authenticated;
