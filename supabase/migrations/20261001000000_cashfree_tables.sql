-- ═══════════════════════════════════════════════════════════════════════════
-- CASHFREE PAYMENT SYSTEM (India — primary payment gateway)
-- Migration 20261001000000
-- Creates the Cashfree tables (orders, transactions, webhooks), adds
-- beneficiary/payout columns to payout_methods + withdrawals, and rewires
-- the auto-refund cron to the `cashfree` edge function.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── cashfree_orders ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cashfree_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cashfree_order_id text NOT NULL UNIQUE,
  cf_order_id text,
  payment_session_id text,
  order_type text NOT NULL CHECK (order_type IN ('contract_escrow', 'subscription', 'service_purchase')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'captured', 'failed', 'refunded')),
  contract_id uuid,
  subscription_id uuid,
  description text,
  metadata jsonb,
  payment_id text,
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashfree_orders_user ON public.cashfree_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashfree_orders_contract ON public.cashfree_orders (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashfree_orders_status ON public.cashfree_orders (status) WHERE status = 'created';

-- ─── cashfree_transactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cashfree_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashfree_order_id uuid REFERENCES public.cashfree_orders(id) ON DELETE CASCADE,
  cashfree_payment_id text,
  cashfree_refund_id text,
  transaction_type text NOT NULL CHECK (transaction_type IN ('capture', 'refund')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL,
  method text,
  payer_email text,
  payer_contact text,
  processor_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashfree_transactions_order ON public.cashfree_transactions (cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_cashfree_transactions_payment ON public.cashfree_transactions (cashfree_payment_id) WHERE cashfree_payment_id IS NOT NULL;

-- ─── cashfree_webhooks (idempotency + audit) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cashfree_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'replayed', 'ignored', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashfree_webhooks_type ON public.cashfree_webhooks (event_type, created_at DESC);

-- ─── payout_methods: Cashfree beneficiary id ─────────────────────────────────
ALTER TABLE public.payout_methods
  ADD COLUMN IF NOT EXISTS cashfree_beneficiary_id text;

-- ─── withdrawals: Cashfree payout id ─────────────────────────────────────────
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS cashfree_payout_id text;

CREATE INDEX IF NOT EXISTS idx_withdrawals_cashfree_payout ON public.withdrawals (cashfree_payout_id) WHERE cashfree_payout_id IS NOT NULL;

-- ─── RLS: cashfree_orders (owners manage their own orders) ───────────────────
ALTER TABLE public.cashfree_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cashfree orders" ON public.cashfree_orders;
CREATE POLICY "Users can view own cashfree orders"
  ON public.cashfree_orders
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own cashfree orders" ON public.cashfree_orders;
CREATE POLICY "Users can insert own cashfree orders"
  ON public.cashfree_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own cashfree orders" ON public.cashfree_orders;
CREATE POLICY "Users can update own cashfree orders"
  ON public.cashfree_orders
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── RLS: cashfree_transactions (owners can view) ────────────────────────────
ALTER TABLE public.cashfree_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cashfree transactions" ON public.cashfree_transactions;
CREATE POLICY "Users can view own cashfree transactions"
  ON public.cashfree_transactions
  FOR SELECT
  TO authenticated
  USING (
    cashfree_order_id IN (
      SELECT id FROM public.cashfree_orders WHERE user_id = auth.uid()
    )
  );

-- ─── RLS: cashfree_webhooks (service-role only — no public policies) ─────────
ALTER TABLE public.cashfree_webhooks ENABLE ROW LEVEL SECURITY;

-- ─── Realtime: expose cashfree_orders for live payment status updates ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cashfree_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cashfree_orders;
  END IF;
END $$;

-- ─── Rewire auto-refund cron to the `cashfree` edge function ─────────────────
CREATE OR REPLACE FUNCTION public.process_pending_refunds()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_req RECORD;
  v_processed INT := 0;
  v_url TEXT := 'https://zttwsjehcgaicziqyxpq.supabase.co/functions/v1/cashfree';
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
    -- Queue execution through the edge function (idempotent server-side)
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

-- ─── Stale-withdrawal recovery: now tracks Cashfree payouts ──────────────────
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
      (status = 'processing' AND cashfree_payout_id IS NULL
       AND paypal_payout_id IS NULL
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
      p_provider => 'cashfree',
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

-- ─── get_payout_methods: expose the Cashfree beneficiary id ──────────────────
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
      'cashfree_beneficiary_id', pm.cashfree_beneficiary_id,
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
