-- ============================================================================
-- Payments Enterprise Hardening (Razorpay primary gateway)
-- 1. payment_webhook_events — provider webhook log with unique event_id for
--    duplicate-event idempotency (replay protection)
-- 2. payment_audit_logs — immutable financial audit trail + insert RPC
-- 3. wallets.escrow_balance — available / pending / escrow balance tracking
-- 4. admin_fund_escrow — internal, service-role-only escrow funding (webhooks)
-- 5. fund_escrow — idempotent + credits client escrow balance
-- 6. release_escrow — debits client escrow balance on release
-- 7. get_wallet_balance — returns escrow_balance too
-- ============================================================================

-- ============================================================================
-- 1. PAYMENT WEBHOOK EVENTS (idempotent webhook log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,                                   -- 'razorpay' | 'paypal' | 'razorpay_payout'
  event_id TEXT NOT NULL UNIQUE,                            -- provider event id = idempotency key
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed', 'ignored', 'failed', 'replayed')),
  processed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON public.payment_webhook_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON public.payment_webhook_events(event_type);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Admins can inspect webhook history; writes happen via service_role only
DROP POLICY IF EXISTS "Admins can view webhook events" ON public.payment_webhook_events;
CREATE POLICY "Admins can view webhook events" ON public.payment_webhook_events
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ============================================================================
-- 2. PAYMENT AUDIT LOGS (immutable financial audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role TEXT,                                          -- 'client' | 'freelancer' | 'admin' | 'system'
  action TEXT NOT NULL,                                     -- 'order_created' | 'payment_captured' | 'escrow_funded' | 'refund_issued' | 'withdrawal_requested' | 'webhook_received' | ...
  entity_type TEXT,                                         -- 'contract' | 'razorpay_order' | 'withdrawal' | 'subscription' | 'escrow'
  entity_id TEXT,
  provider TEXT,                                            -- 'razorpay' | 'paypal'
  amount DECIMAL(12,2),
  currency TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_user ON public.payment_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_audit_entity ON public.payment_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_created ON public.payment_audit_logs(created_at DESC);

ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

-- Owners read their own logs; admins read everything; writes via RPC / service role
DROP POLICY IF EXISTS "Users view own payment audit logs" ON public.payment_audit_logs;
CREATE POLICY "Users view own payment audit logs" ON public.payment_audit_logs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all payment audit logs" ON public.payment_audit_logs;
CREATE POLICY "Admins view all payment audit logs" ON public.payment_audit_logs
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- RPC used by edge functions (service_role) and, for own actions, the client.
-- The actor is always derived from auth.uid() unless the caller is service_role.
CREATE OR REPLACE FUNCTION public.insert_payment_audit_log(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_ip_address TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_log_id UUID;
BEGIN
  -- Service-role / definer may attribute to an explicit user (webhooks, system events)
  IF v_actor IS NULL AND p_user_id IS NOT NULL THEN
    v_actor := p_user_id;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_actor
  LIMIT 1;

  INSERT INTO public.payment_audit_logs (
    user_id, actor_role, action, entity_type, entity_id,
    provider, amount, currency, metadata, ip_address
  ) VALUES (
    v_actor, COALESCE(v_role, 'system'), p_action, p_entity_type, p_entity_id,
    p_provider, p_amount, p_currency, COALESCE(p_metadata, '{}'::jsonb), p_ip_address
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_payment_audit_log(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_payment_audit_log(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID) TO service_role;

-- ============================================================================
-- 3. WALLET ESCROW BALANCE
-- ============================================================================
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS escrow_balance DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ============================================================================
-- 4. ADMIN FUND ESCROW — internal, service-role only (used by webhooks)
--    No auth.uid() check: guarded by REVOKE from PUBLIC/anon/authenticated.
--    Idempotent: funding an already-funded contract is a safe no-op.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_fund_escrow(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract RECORD;
  v_escrow_amount NUMERIC;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Idempotency guard: never double-fund
  IF v_contract.escrow_funded THEN
    RETURN TRUE;
  END IF;

  -- How much is held in escrow for this contract (the escrowed bid)
  SELECT COALESCE(amount, 0) INTO v_escrow_amount
  FROM public.escrow
  WHERE contract_id = p_contract_id;

  -- Mark escrow funded
  UPDATE public.escrow
  SET status = 'funded', funded_at = NOW()
  WHERE contract_id = p_contract_id;

  -- Mark contract active
  UPDATE public.contracts
  SET status = 'active', escrow_funded = true, updated_at = NOW()
  WHERE id = p_contract_id;

  -- Advance project
  UPDATE public.projects
  SET status = 'in_progress'
  WHERE id = v_contract.project_id;

  -- Track escrowed funds on the client wallet (escrow balance)
  IF v_escrow_amount > 0 THEN
    INSERT INTO public.wallets (user_id, balance, escrow_balance, currency)
    VALUES (v_contract.client_id, 0, v_escrow_amount, 'USD')
    ON CONFLICT (user_id) DO UPDATE SET
      escrow_balance = public.wallets.escrow_balance + EXCLUDED.escrow_balance,
      updated_at = NOW();
  END IF;

  RETURN TRUE;
END;
$$;

-- Lock it down: only the service role may call this internal RPC
REVOKE EXECUTE ON FUNCTION public.admin_fund_escrow(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fund_escrow(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_fund_escrow(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fund_escrow(UUID) TO service_role;

-- ============================================================================
-- 5. FUND ESCROW — user-facing path: auth check, then delegate to the
--    idempotent internal funding routine
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fund_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN public.admin_fund_escrow(p_contract_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fund_escrow(UUID, UUID) TO authenticated;

-- ============================================================================
-- 6. RELEASE ESCROW — debit the client's escrow balance when funds release
-- ============================================================================
CREATE OR REPLACE FUNCTION public.release_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
BEGIN
  -- Validate auth
  IF p_client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch contract with row lock
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Verify client owns this contract
  IF v_contract.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Get escrow record
  SELECT * INTO v_escrow
  FROM public.escrow
  WHERE contract_id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found for this contract';
  END IF;

  -- Verify escrow is funded
  IF v_escrow.status <> 'funded' THEN
    RAISE EXCEPTION 'Escrow is not in funded state';
  END IF;

  -- Update escrow status
  UPDATE public.escrow
  SET status = 'released', released_at = NOW()
  WHERE contract_id = p_contract_id;

  -- Update contract status
  UPDATE public.contracts
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_contract_id;

  -- Create transaction record for freelancer
  INSERT INTO public.transactions (
    user_id, contract_id, type, amount, status, description
  ) VALUES (
    v_contract.freelancer_id, p_contract_id, 'payment',
    v_contract.freelancer_amount, 'completed',
    'Escrow release for contract #' || p_contract_id::TEXT
  );

  -- Direct wallet update (SECURITY DEFINER bypasses RLS/auth checks)
  UPDATE public.wallets
  SET balance = balance + v_contract.freelancer_amount,
      updated_at = NOW()
  WHERE user_id = v_contract.freelancer_id;

  -- Auto-create wallet if missing (shouldn't happen, but just in case)
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (v_contract.freelancer_id, v_contract.freelancer_amount);
  END IF;

  -- Debit the client's escrow balance (money moved out of escrow)
  UPDATE public.wallets
  SET escrow_balance = GREATEST(escrow_balance - v_escrow.amount, 0),
      updated_at = NOW()
  WHERE user_id = v_contract.client_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_escrow(UUID, UUID) TO authenticated;

-- ============================================================================
-- 7. GET WALLET BALANCE — include escrow balance
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet RECORD;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  INSERT INTO public.wallets (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance, pending_balance, escrow_balance, currency INTO v_wallet
  FROM public.wallets WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'success', true,
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance,
    'escrow_balance', COALESCE(v_wallet.escrow_balance, 0),
    'currency', v_wallet.currency
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID) TO authenticated;

-- Realtime for the audit trail (admin dashboards / compliance viewers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payment_audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_audit_logs;
  END IF;
END $$;
