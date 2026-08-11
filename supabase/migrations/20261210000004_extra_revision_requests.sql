-- ============================================================================
-- EXTRA REVISION REQUEST SYSTEM (2026-12-10)
--
-- Full workflow for paid revisions beyond the free revisions included in a
-- service/contract:
--
--   1. Client requests N extra revisions (with reason) from the workspace.
--   2. Freelancer accepts (optionally confirming the per-revision price —
--      defaults to their published service extra_revision_price) or rejects.
--   3. On accept, the client pays the total via Razorpay (order_type
--      'revision_payment'). The razorpay edge function adds the paid amount to
--      the contract's escrow and marks the request paid.
--   4. Freelancer delivers the revision; client approves → escrow release as
--      normal (the extra amount is part of the escrow pool).
--
-- Everything is escrow-protected — no off-platform money ever moves.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.revision_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id),
  freelancer_id UUID NOT NULL REFERENCES public.profiles(id),
  revision_count INT NOT NULL DEFAULT 1 CHECK (revision_count >= 1 AND revision_count <= 20),
  per_revision_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (per_revision_price >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_freelancer' CHECK (status IN (
    'pending_freelancer', 'accepted', 'rejected', 'paid', 'completed', 'cancelled'
  )),
  razorpay_order_id TEXT,
  paid_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revision_requests_contract ON public.revision_requests(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revision_requests_status ON public.revision_requests(status);

ALTER TABLE public.revision_requests ENABLE ROW LEVEL SECURITY;

-- Participants + admins can view
DROP POLICY IF EXISTS "Revision request participants view" ON public.revision_requests;
CREATE POLICY "Revision request participants view" ON public.revision_requests
  FOR SELECT
  USING (
    client_id = auth.uid() OR freelancer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- RPC: REQUEST EXTRA REVISIONS (client)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.request_extra_revision(
  p_contract_id UUID,
  p_revision_count INT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_price NUMERIC;
  v_request_id UUID;
  v_total NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;
  IF v_contract.client_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only the client can request extra revisions');
  END IF;

  IF v_contract.status NOT IN ('active', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Extra revisions can only be requested on an active contract');
  END IF;
  IF v_contract.status = 'disputed' OR v_contract.frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract is frozen or under dispute');
  END IF;

  IF p_revision_count IS NULL OR p_revision_count < 1 OR p_revision_count > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Revision count must be between 1 and 20');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please describe the revision needed (min 5 characters)');
  END IF;

  -- One active request at a time
  IF EXISTS (SELECT 1 FROM public.revision_requests
             WHERE contract_id = p_contract_id
               AND status IN ('pending_freelancer', 'accepted')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'An extra revision request is already in progress');
  END IF;

  -- Default per-revision price: the freelancer's published extra-revision rate
  -- from their most recent active service (falls back to 0 → freelancer sets
  -- the price on accept).
  SELECT COALESCE(extra_revision_price, 0) INTO v_price
  FROM public.services
  WHERE freelancer_id = v_contract.freelancer_id
    AND status = 'active'
    AND COALESCE(extra_revision_price, 0) > 0
  ORDER BY updated_at DESC
  LIMIT 1;
  v_price := COALESCE(v_price, 0);
  v_total := round((v_price * p_revision_count) * 100) / 100;

  INSERT INTO public.revision_requests (
    contract_id, client_id, freelancer_id, revision_count,
    per_revision_price, total_amount, reason, status
  ) VALUES (
    p_contract_id, auth.uid(), v_contract.freelancer_id, p_revision_count,
    v_price, v_total, trim(p_reason), 'pending_freelancer'
  ) RETURNING id INTO v_request_id;

  PERFORM public._refund_notify(v_contract.freelancer_id, 'milestone',
    'Extra revision requested',
    'The client requested ' || p_revision_count || ' extra revision(s). Review and accept with a price, or reject.',
    '/dashboard/workspace?contract=' || p_contract_id,
    jsonb_build_object('contract_id', p_contract_id, 'revision_request_id', v_request_id));

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'revision_count', p_revision_count,
    'per_revision_price', v_price,
    'total_amount', v_total,
    'status', 'pending_freelancer'
  );
END $$;

REVOKE ALL ON FUNCTION public.request_extra_revision(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_extra_revision(UUID, INT, TEXT) TO authenticated;

-- ============================================================================
-- RPC: RESPOND TO EXTRA REVISION REQUEST (freelancer)
--     accept + optional price override; reject → notify client
-- ============================================================================
CREATE OR REPLACE FUNCTION public.respond_extra_revision(
  p_request_id UUID,
  p_accept BOOLEAN,
  p_per_revision_price NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_req RECORD;
  v_total NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  SELECT * INTO v_req FROM public.revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Revision request not found');
  END IF;
  IF v_req.freelancer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only the freelancer can respond');
  END IF;
  IF v_req.status <> 'pending_freelancer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request is no longer awaiting your response');
  END IF;

  IF p_accept THEN
    v_total := round((COALESCE(p_per_revision_price, v_req.per_revision_price, 0) * v_req.revision_count) * 100) / 100;
    IF v_total <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Please set a per-revision price to accept');
    END IF;
    UPDATE public.revision_requests
    SET status = 'accepted',
        per_revision_price = COALESCE(p_per_revision_price, v_req.per_revision_price, 0),
        total_amount = v_total,
        responded_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    PERFORM public._refund_notify(v_req.client_id, 'milestone',
      'Extra revision request accepted',
      'The freelancer accepted your extra revision request (' || v_req.revision_count || ' revision(s) at ₹'
        || COALESCE(p_per_revision_price, v_req.per_revision_price, 0) || ' each). Pay the total to continue.',
      '/client/workspace?contract=' || v_req.contract_id,
      jsonb_build_object('contract_id', v_req.contract_id, 'revision_request_id', p_request_id));

    RETURN jsonb_build_object('success', true, 'action', 'accepted',
      'total_amount', v_total, 'status', 'accepted');
  ELSE
    UPDATE public.revision_requests
    SET status = 'rejected', responded_at = now(), updated_at = now()
    WHERE id = p_request_id;

    PERFORM public._refund_notify(v_req.client_id, 'refund',
      'Extra revision request declined',
      'The freelancer declined your extra revision request. You can message them in the workspace to negotiate.',
      '/client/workspace?contract=' || v_req.contract_id,
      jsonb_build_object('contract_id', v_req.contract_id, 'revision_request_id', p_request_id));

    RETURN jsonb_build_object('success', true, 'action', 'rejected', 'status', 'rejected');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.respond_extra_revision(UUID, BOOLEAN, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_extra_revision(UUID, BOOLEAN, NUMERIC) TO authenticated;

-- ============================================================================
-- RPC: MARK REVISION PAID (called by razorpay edge fn after capture)
--     Adds the paid amount to the contract's escrow so it is protected and
--     released only when the client approves the revised work.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_revision_paid(
  p_request_id UUID,
  p_razorpay_order_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_req RECORD;
  v_escrow_id UUID;
BEGIN
  SELECT * INTO v_req FROM public.revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Revision request not found');
  END IF;
  IF v_req.status <> 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Revision request is not in accepted state');
  END IF;
  IF v_req.total_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No amount to credit');
  END IF;

  -- Add the paid amount to the contract escrow pool (idempotent by status).
  UPDATE public.escrow
  SET amount = amount + v_req.total_amount, updated_at = now()
  WHERE contract_id = v_req.contract_id;

  -- If the escrow row doesn't exist yet, create it (defensive).
  IF NOT FOUND THEN
    SELECT id INTO v_escrow_id FROM public.escrow WHERE contract_id = v_req.contract_id;
    IF v_escrow_id IS NULL THEN
      INSERT INTO public.escrow (contract_id, client_id, freelancer_id, amount, status)
      VALUES (v_req.contract_id, v_req.client_id, v_req.freelancer_id, v_req.total_amount, 'pending')
      RETURNING id INTO v_escrow_id;
    END IF;
  END IF;

  UPDATE public.revision_requests
  SET status = 'paid', razorpay_order_id = p_razorpay_order_id, paid_at = now(), updated_at = now()
  WHERE id = p_request_id;

  PERFORM public._refund_notify(v_req.freelancer_id, 'payment',
    'Extra revision payment received',
    'The client paid ₹' || v_req.total_amount || ' for ' || v_req.revision_count
      || ' extra revision(s). Funds are held in escrow until you deliver and the client approves.',
    '/dashboard/workspace?contract=' || v_req.contract_id,
    jsonb_build_object('contract_id', v_req.contract_id, 'revision_request_id', p_request_id));

  RETURN jsonb_build_object('success', true, 'status', 'paid',
    'amount', v_req.total_amount, 'contract_id', v_req.contract_id);
END $$;

REVOKE ALL ON FUNCTION public.mark_revision_paid(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_revision_paid(UUID, TEXT) TO service_role;

-- Realtime for the workspace cards
DO $realtime$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'revision_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.revision_requests;
  END IF;
END $realtime$;
