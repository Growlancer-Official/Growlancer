-- ============================================================
-- SECURITY HARDENING v5 — Table-level RLS lockdown + RPC guards
--
-- Closes the "v4 audit" findings (Priority 0 + related):
--   a) wallets:        remove direct user UPDATE — balance must only
--                      change through SECURITY DEFINER RPCs
--   b) razorpay_orders: remove open UPDATE (USING(true) WITH CHECK(true))
--                      — any authenticated user could edit ANY row
--   c) transactions:   remove user INSERT — users could forge transaction
--                      records; every writer is a SECURITY DEFINER RPC
--   d) resolve_contract_dispute: was granted to authenticated with NO
--                      admin check (created live, never committed).
--                      Now admin-guarded + definition committed to repo.
--   e) Tighten ACLs on money-moving RPCs (drop PUBLIC/anon grants —
--                      defense-in-depth; internal checks stay).
--   f) NEW mark_milestone_status SECURITY DEFINER RPC — replaces the raw
--                      contracts.update() in the workspace (which silently
--                      failed because contracts has NO UPDATE policy).
--                      Validated + party-scoped + dispute-frozen.
-- ============================================================

-- ── a) wallets: no direct user UPDATE ───────────────────────────────
DROP POLICY IF EXISTS "Users can update own wallet" ON public.wallets;

-- ── b) razorpay_orders: no open UPDATE (edge functions use service_role,
--        which bypasses RLS anyway) ───────────────────────────────────
DROP POLICY IF EXISTS "Edge function can update razorpay orders" ON public.razorpay_orders;

-- ── c) transactions: no user INSERT (all writers are SECURITY DEFINER) ─
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;

-- ── d) resolve_contract_dispute — admin-only + committed definition ──
-- This function was created live (never in the repo) with NO admin check
-- and granted to authenticated. Revoke client roles entirely; the modern
-- admin path is admin_decide_dispute (already admin-guarded).
REVOKE ALL ON FUNCTION public.resolve_contract_dispute(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_contract_dispute(UUID, TEXT) FROM anon, authenticated;

-- Old version returned BOOLEAN; the new one returns JSONB — return type cannot
-- be altered in place, so drop first (nothing calls it client-side).
DROP FUNCTION IF EXISTS public.resolve_contract_dispute(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.resolve_contract_dispute(
  p_dispute_id UUID,
  p_resolution TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_dispute RECORD;
  v_contract RECORD;
  v_escrow RECORD;
  v_freelancer_amount NUMERIC;
BEGIN
  -- Admin-only: ordinary users can never resolve their own dispute.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  SELECT * INTO v_dispute FROM public.disputes WHERE id = p_dispute_id AND status = 'open';
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Open dispute not found');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = v_dispute.contract_id;
  SELECT * INTO v_escrow FROM public.escrow WHERE contract_id = v_dispute.contract_id;
  v_freelancer_amount := COALESCE(v_contract.freelancer_amount, v_contract.amount, 0);

  IF p_resolution = 'refund' THEN
    UPDATE public.disputes SET status = 'resolved_refunded', resolved_at = NOW(), resolved_by = auth.uid()
    WHERE id = p_dispute_id;
    UPDATE public.escrow SET status = 'refunded' WHERE id = v_escrow.id;
    UPDATE public.contracts SET status = 'cancelled', escrow_funded = false, updated_at = NOW()
    WHERE id = v_contract.id;
    UPDATE public.wallets SET escrow_balance = GREATEST(escrow_balance - COALESCE(v_dispute.amount, 0), 0)
    WHERE user_id = v_dispute.client_id;
    INSERT INTO public.transactions (user_id, contract_id, escrow_id, amount, type, source, description, status)
    VALUES (v_dispute.client_id, v_dispute.contract_id, v_escrow.id, COALESCE(v_dispute.amount, 0),
            'credit', 'escrow', 'Contract dispute resolved: Full refund to client', 'completed');
  ELSIF p_resolution = 'release' THEN
    UPDATE public.disputes SET status = 'resolved_released', resolved_at = NOW(), resolved_by = auth.uid()
    WHERE id = p_dispute_id;
    UPDATE public.escrow SET status = 'released', released_at = NOW() WHERE id = v_escrow.id;
    UPDATE public.contracts SET status = 'completed', escrow_funded = false, end_date = CURRENT_DATE, updated_at = NOW()
    WHERE id = v_contract.id;
    UPDATE public.wallets SET balance = balance + v_freelancer_amount WHERE user_id = v_dispute.freelancer_id;
    INSERT INTO public.transactions (user_id, contract_id, escrow_id, amount, type, source, description, status)
    VALUES (v_dispute.freelancer_id, v_dispute.contract_id, v_escrow.id, v_freelancer_amount,
            'credit', 'escrow', 'Contract dispute resolved: Funds released to freelancer', 'completed');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid resolution (use refund or release)');
  END IF;

  RETURN jsonb_build_object('success', true, 'resolution', p_resolution);
END $$;

-- Fresh DROP+CREATE resets grants to PUBLIC — lock it back down to service_role.
REVOKE ALL ON FUNCTION public.resolve_contract_dispute(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_contract_dispute(UUID, TEXT) TO service_role;

-- ── e) Tighten ACLs — money-moving RPCs: drop PUBLIC + anon grants ──
-- (authenticated + service_role remain; each function has its own internal
-- auth check, this is defense-in-depth so unauthenticated callers cannot
-- even attempt them.)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_decide_dispute', 'release_milestone', 'process_withdrawal_complete')
      AND pg_function_is_visible(p.oid)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', 'public', r.proname, r.args);
  END LOOP;
END $$;

-- ── f) mark_milestone_status — server-validated milestone updates ────
CREATE OR REPLACE FUNCTION public.mark_milestone_status(
  p_contract_id UUID,
  p_milestone_index INT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_milestones JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  -- Only the two parties may touch a contract's milestones.
  IF v_contract.client_id <> auth.uid() AND v_contract.freelancer_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: not a party to this contract');
  END IF;

  -- Milestones are frozen while a dispute is open.
  IF v_contract.status = 'disputed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Milestone actions are frozen while this contract is in dispute');
  END IF;

  IF p_status NOT IN ('pending', 'in_progress', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid milestone status');
  END IF;

  IF v_contract.milestones IS NULL OR jsonb_typeof(v_contract.milestones) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No milestones on this contract');
  END IF;

  IF p_milestone_index < 0 OR p_milestone_index >= jsonb_array_length(v_contract.milestones) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Milestone index out of range');
  END IF;

  v_milestones := jsonb_set(v_contract.milestones, ARRAY[p_milestone_index::TEXT, 'status'], to_jsonb(p_status));
  UPDATE public.contracts SET milestones = v_milestones, updated_at = NOW() WHERE id = p_contract_id;

  RETURN jsonb_build_object('success', true, 'milestones', v_milestones);
END $$;

-- Fresh CREATE grants EXECUTE to PUBLIC by default — revoke anon, keep
-- authenticated + service_role.
REVOKE ALL ON FUNCTION public.mark_milestone_status(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_milestone_status(UUID, INT, TEXT) TO authenticated;
