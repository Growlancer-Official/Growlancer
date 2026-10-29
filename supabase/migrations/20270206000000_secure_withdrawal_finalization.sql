-- Withdrawal state must only be finalized after a provider event/response has
-- been verified by the server. Previously authenticated users could execute
-- process_withdrawal_complete on their own pending withdrawal, while the
-- service-role caller was rejected by its auth.uid() NULL guard. The edge
-- function ignored that refusal and could report success with held funds.
--
-- Both terminal transitions now run atomically, are idempotent on same-state
-- retries, and are callable only by server-side service_role functions.

CREATE OR REPLACE FUNCTION public.process_withdrawal_complete(p_withdrawal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_withdrawal RECORD;
  v_wallet wallets%ROWTYPE;
BEGIN
  IF NOT public.is_service_role_context() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF v_withdrawal.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  IF v_withdrawal.status = 'failed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A failed withdrawal cannot be completed');
  END IF;

  IF v_withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is not in a processable state');
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_wallet.pending_balance < v_withdrawal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient pending balance');
  END IF;

  UPDATE public.wallets
  SET pending_balance = pending_balance - v_withdrawal.amount,
      updated_at = NOW()
  WHERE user_id = v_withdrawal.user_id;

  UPDATE public.withdrawals
  SET status = 'completed',
      processed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_withdrawal_id;

  UPDATE public.transactions
  SET status = 'completed',
      description = 'Withdrawal completed (' || v_withdrawal.method || ')'
  WHERE user_id = v_withdrawal.user_id
    AND metadata->>'withdrawal_id' = p_withdrawal_id::text;

  IF NOT FOUND THEN
    INSERT INTO public.transactions (user_id, type, amount, status, description, source, metadata)
    VALUES (v_withdrawal.user_id, 'withdrawal', v_withdrawal.amount, 'completed',
            'Withdrawal completed (' || v_withdrawal.method || ')',
            'withdrawal', jsonb_build_object('withdrawal_id', p_withdrawal_id));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_withdrawal_failure(
  p_withdrawal_id UUID,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_withdrawal RECORD;
  v_wallet wallets%ROWTYPE;
BEGIN
  IF NOT public.is_service_role_context() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF v_withdrawal.status = 'failed' THEN
    RETURN jsonb_build_object('success', true, 'already_failed', true);
  END IF;

  IF v_withdrawal.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A completed withdrawal cannot be refunded');
  END IF;

  IF v_withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is not in a processable state');
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_wallet.pending_balance < v_withdrawal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient pending balance');
  END IF;

  UPDATE public.wallets
  SET balance = balance + v_withdrawal.amount,
      pending_balance = pending_balance - v_withdrawal.amount,
      updated_at = NOW()
  WHERE user_id = v_withdrawal.user_id;

  UPDATE public.withdrawals
  SET status = 'failed',
      failure_reason = p_failure_reason,
      processed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_withdrawal_id;

  UPDATE public.transactions
  SET status = 'failed',
      description = 'Withdrawal failed: ' || COALESCE(p_failure_reason, 'Payout failed at provider')
  WHERE user_id = v_withdrawal.user_id
    AND metadata->>'withdrawal_id' = p_withdrawal_id::text;

  IF NOT FOUND THEN
    INSERT INTO public.transactions (user_id, type, amount, status, description, source, metadata)
    VALUES (v_withdrawal.user_id, 'withdrawal', v_withdrawal.amount, 'failed',
            'Withdrawal failed: ' || COALESCE(p_failure_reason, 'Payout failed at provider'),
            'withdrawal', jsonb_build_object('withdrawal_id', p_withdrawal_id));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.process_withdrawal_complete(UUID) IS
  'Finalizes provider-confirmed withdrawals atomically; execution is service-role only.';
COMMENT ON FUNCTION public.process_withdrawal_failure(UUID, TEXT) IS
  'Returns held wallet funds only after provider failure; execution is service-role only.';

REVOKE ALL ON FUNCTION public.process_withdrawal_complete(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_complete(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.process_withdrawal_failure(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_failure(UUID, TEXT) TO service_role;

DO $assert$
BEGIN
  IF has_function_privilege('anon', 'public.process_withdrawal_complete(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.process_withdrawal_complete(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.process_withdrawal_failure(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.process_withdrawal_failure(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'withdrawal finalizers must not be callable by browser roles';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.process_withdrawal_complete(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.process_withdrawal_failure(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must be able to finalize provider-confirmed withdrawals';
  END IF;

  IF pg_get_functiondef('public.process_withdrawal_complete(uuid)'::regprocedure)
       NOT LIKE '%is_service_role_context%'
     OR pg_get_functiondef('public.process_withdrawal_failure(uuid,text)'::regprocedure)
       NOT LIKE '%is_service_role_context%' THEN
    RAISE EXCEPTION 'withdrawal finalizers must verify the service-role request context';
  END IF;

  IF pg_get_functiondef('public.process_withdrawal_complete(uuid)'::regprocedure)
       NOT LIKE '%A failed withdrawal cannot be completed%'
     OR pg_get_functiondef('public.process_withdrawal_failure(uuid,text)'::regprocedure)
       NOT LIKE '%A completed withdrawal cannot be refunded%' THEN
    RAISE EXCEPTION 'withdrawal finalizers must reject conflicting terminal-state transitions';
  END IF;
END;
$assert$;
