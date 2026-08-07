-- ═══════════════════════════════════════════════════════════════════════════
-- RESTORE RAZORPAY (revert Cashfree backend wiring)
-- Migration 20261003000000
-- The repo was reverted to the full Razorpay implementation (checkout, saved
-- cards, RazorpayX payouts). This migration removes the Cashfree tables and
-- columns created by 20261001000000 and rewires the DB functions (refund cron,
-- stale-withdrawal recovery, get_payout_methods) back to the Razorpay versions.
-- The USD→INR wallet fixes from 20261002000000 are preserved (platform is INR).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Drop Cashfree tables (all empty — no real orders ever existed) ─────
DROP TABLE IF EXISTS public.cashfree_webhooks;
DROP TABLE IF EXISTS public.cashfree_transactions;
DROP TABLE IF EXISTS public.cashfree_orders;

-- ─── 2. Drop Cashfree columns ───────────────────────────────────────────────
ALTER TABLE public.payout_methods
  DROP COLUMN IF EXISTS cashfree_beneficiary_id;

ALTER TABLE public.withdrawals
  DROP COLUMN IF EXISTS cashfree_payout_id;

-- ─── 3. Rewire auto-refund cron → razorpay edge function ────────────────────
CREATE OR REPLACE FUNCTION public.process_pending_refunds()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_req RECORD;
  v_processed INT := 0;
  v_url TEXT := 'https://zttwsjehcgaicziqyxpq.supabase.co/functions/v1/razorpay';
  v_cron_secret TEXT;
BEGIN
  SELECT value INTO v_cron_secret FROM public.cron_settings WHERE key = 'cron_secret';
  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RETURN 0;
  END IF;
  FOR v_req IN
    SELECT rr.*, c.client_id AS contract_client_id
    FROM public.refund_requests rr
    JOIN public.contracts c ON c.id = rr.contract_id
    WHERE rr.status IN ('auto_approved', 'approved')
      AND NOT EXISTS (SELECT 1 FROM public.refunds r WHERE r.refund_request_id = rr.id AND r.status <> 'failed')
    LIMIT 10
  LOOP
    IF v_cron_secret IS NOT NULL AND v_cron_secret <> '' THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_cron_secret
        ),
        body := jsonb_build_object(
          'action', 'execute_refund',
          'data', jsonb_build_object('refund_request_id', v_req.id)
        )
      );
    END IF;
    v_processed := v_processed + 1;
  END LOOP;
  RETURN v_processed;
END;
$function$;

-- ─── 4. Stale-withdrawal recovery → tracks RazorpayX payouts ────────────────
CREATE OR REPLACE FUNCTION public.process_stale_withdrawals()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_wd RECORD;
  v_processed INT := 0;
BEGIN
  FOR v_wd IN
    SELECT * FROM public.withdrawals
    WHERE (
      -- Processing without a provider id for > 4 hours = stuck (never fired)
      (status = 'processing' AND razorpay_payout_id IS NULL AND paypal_payout_id IS NULL
       AND created_at < now() - interval '4 hours')
      OR
      -- Pending without any movement for > 72 hours
      (status = 'pending' AND created_at < now() - interval '72 hours')
    )
    LIMIT 50
  LOOP
    UPDATE public.withdrawals
    SET status = 'failed',
        failure_reason = 'Automatically cancelled by the system (payout could not be initiated in time)',
        updated_at = now()
    WHERE id = v_wd.id;
    -- Return the held funds to the wallet
    UPDATE public.wallets
    SET balance = balance + v_wd.amount,
        pending_balance = GREATEST(pending_balance - v_wd.amount, 0),
        updated_at = now()
    WHERE user_id = v_wd.user_id;
    UPDATE public.transactions
    SET status = 'failed',
        description = 'Withdrawal auto-cancelled by the system'
    WHERE metadata->>'withdrawal_id' = v_wd.id::TEXT;
    PERFORM public.insert_payment_audit_log(
      p_action => 'withdrawal_auto_failed',
      p_entity_type => 'withdrawal',
      p_entity_id => v_wd.id::TEXT,
      p_provider => 'razorpay',
      p_amount => v_wd.amount,
      p_currency => 'INR',
      p_metadata => jsonb_build_object('reason', 'stale_payout_recovery'),
      p_user_id => v_wd.user_id
    );
    PERFORM public._refund_notify(v_wd.user_id, 'payment',
      'Withdrawal cancelled — funds returned',
      'A withdrawal could not be processed in time and was automatically cancelled. The full amount is back in your wallet.',
      '/dashboard/wallet', jsonb_build_object('withdrawal_id', v_wd.id));
    v_processed := v_processed + 1;
  END LOOP;
  RETURN v_processed;
END;
$function$;

-- ─── 5. get_payout_methods → RazorpayX fund account id ──────────────────────
CREATE OR REPLACE FUNCTION public.get_payout_methods(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- ─── 6. Preserve INR wallet fixes (from reverted 20261002000000) ────────────
ALTER TABLE public.wallets
  ALTER COLUMN currency SET DEFAULT 'INR';

UPDATE public.wallets SET currency = 'INR' WHERE currency = 'USD';
