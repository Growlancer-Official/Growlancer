-- ============================================================================
-- Refund, Cancellation, Escrow & Dispute Resolution System
--
-- Production-grade workflows comparable to Upwork / Fiverr / Freelancer.com.
-- Everything is automatic; only real disputes require manual admin action.
--
-- Components:
--   1. refund_requests     — cancellation / refund state machine (all cases)
--   2. refunds             — provider refund tracking (Razorpay refund id,
--                            status, retries, timeline)
--   3. refund_history      — immutable per-request timeline events
--   4. dispute_evidence    — screenshots / PDF / ZIP uploads per dispute
--   5. dispute_messages    — party-to-party conversation on a dispute
--   6. dispute_internal_notes — admin-only notes
--   7. contracts  + escrow + wallets + disputes ALTERs (freeze, decisions)
--   8. RPCs for every workflow step (SECURITY DEFINER, auth-checked)
--   9. pg_cron automation: pending-refund executor + no-response auto-dispute
-- ============================================================================

-- ============================================================================
-- 1. REFUND REQUESTS (cancellation / refund state machine)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  milestone_index INT,                                   -- for milestone-based cancels
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  requested_to UUID REFERENCES public.profiles(id),      -- freelancer (case 3) or null (auto)
  request_type TEXT NOT NULL CHECK (request_type IN (
    'client_cancel_before_work',   -- Case 1: 100% auto refund
    'freelancer_decline',          -- Case 2: auto refund
    'client_cancel_after_start',   -- Case 3: freelancer accepts → refund remaining; rejects → dispute
    'milestone_cancel',            -- Case 4: only remaining escrow refundable
    'payment_failure',             -- automatic refund type
    'duplicate_payment',           -- automatic refund type
    'quality_dispute',             -- manual refund type
    'fraud',                       -- manual refund type
    'abuse',                       -- manual refund type
    'contract_violation',          -- manual refund type
    'admin_decision'               -- manual refund type
  )),
  reason TEXT NOT NULL,
  description TEXT,
  refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,        -- max refundable escrow amount
  status TEXT NOT NULL DEFAULT 'pending_freelancer' CHECK (status IN (
    'pending_freelancer', 'pending_admin', 'auto_approved',
    'approved', 'rejected', 'cancelled', 'completed', 'failed'
  )),
  decision_by UUID REFERENCES public.profiles(id),
  decision_at TIMESTAMPTZ,
  decided_amount NUMERIC(12,2),
  provider_refund_id TEXT,                               -- Razorpay refund id
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_contract ON public.refund_requests(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON public.refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_requested_by ON public.refund_requests(requested_by);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- Participants (client/freelancer on the contract) can view; admins view all
DROP POLICY IF EXISTS "Refund request participants view" ON public.refund_requests;
CREATE POLICY "Refund request participants view" ON public.refund_requests
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.contracts c
            WHERE c.id = contract_id AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 2. REFUNDS (provider refund tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_request_id UUID REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'razorpay',             -- 'razorpay' | 'paypal'
  provider_refund_id TEXT,                               -- Razorpay refund.id
  provider_payment_id TEXT,                              -- Razorpay payment.id
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN (
    'initiated', 'processing', 'completed', 'failed', 'retry_pending'
  )),
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_request ON public.refunds(refund_request_id);
CREATE INDEX IF NOT EXISTS idx_refunds_contract ON public.refunds(contract_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Refund participants view" ON public.refunds;
CREATE POLICY "Refund participants view" ON public.refunds
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.contracts c
            WHERE c.id = contract_id AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 3. REFUND HISTORY (immutable timeline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.refund_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_request_id UUID NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  event TEXT NOT NULL,                                   -- 'requested','approved','rejected','completed','failed','dispute_created',...
  actor_id UUID REFERENCES public.profiles(id),
  actor_role TEXT,                                       -- 'client'|'freelancer'|'admin'|'system'
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_history_request ON public.refund_history(refund_request_id, created_at);

ALTER TABLE public.refund_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Refund history participants view" ON public.refund_history;
CREATE POLICY "Refund history participants view" ON public.refund_history
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.refund_requests rr
            JOIN public.contracts c ON c.id = rr.contract_id
            WHERE rr.id = refund_request_id AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 4. DISPUTE EVIDENCE (screenshots / PDF / ZIP)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES public.profiles(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  file_size INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON public.dispute_evidence(dispute_id);

ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;

-- Dispute participants + admins can view evidence; participants can upload
DROP POLICY IF EXISTS "Dispute evidence view" ON public.dispute_evidence;
CREATE POLICY "Dispute evidence view" ON public.dispute_evidence
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.disputes d
            WHERE d.id = dispute_id AND (d.client_id = auth.uid() OR d.freelancer_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Dispute evidence upload" ON public.dispute_evidence;
CREATE POLICY "Dispute evidence upload" ON public.dispute_evidence
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.disputes d
            WHERE d.id = dispute_id AND (d.client_id = auth.uid() OR d.freelancer_id = auth.uid()))
    AND uploader_id = auth.uid()
  );

-- ============================================================================
-- 5. DISPUTE MESSAGES (party conversation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON public.dispute_messages(dispute_id, created_at);

ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dispute messages view" ON public.dispute_messages;
CREATE POLICY "Dispute messages view" ON public.dispute_messages
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.disputes d
            WHERE d.id = dispute_id AND (d.client_id = auth.uid() OR d.freelancer_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Dispute messages send" ON public.dispute_messages;
CREATE POLICY "Dispute messages send" ON public.dispute_messages
  FOR INSERT
  WITH CHECK (
    (EXISTS (SELECT 1 FROM public.disputes d
             WHERE d.id = dispute_id AND (d.client_id = auth.uid() OR d.freelancer_id = auth.uid()))
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    AND sender_id = auth.uid()
  );

-- ============================================================================
-- 6. DISPUTE INTERNAL NOTES (admin-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dispute_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_notes_dispute ON public.dispute_internal_notes(dispute_id);

ALTER TABLE public.dispute_internal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dispute notes admin only" ON public.dispute_internal_notes;
CREATE POLICY "Dispute notes admin only" ON public.dispute_internal_notes
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 7. ALTER EXISTING TABLES
-- ============================================================================

-- 7z. NOTIFICATIONS: widen type CHECK to include refund/dispute/reminder/admin
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK ((type)::text = ANY (ARRAY['proposal','invite','contract','message','payment','escrow','review','system','refund','dispute','reminder','admin']::text[]));

-- 7a. CONTRACTS: work-started marker (distinguishes Case 1 vs Case 3),
--     cancellation request fields, fraud freeze
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS freelancer_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_requested_by UUID,
  ADD COLUMN IF NOT EXISTS cancellation_status TEXT DEFAULT 'none' CHECK (cancellation_status IN (
    'none', 'pending_freelancer', 'pending_admin', 'approved', 'rejected'
  )),
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;

-- 7b. ESCROW: widen status to support frozen (fraud) and disputed states
ALTER TABLE public.escrow DROP CONSTRAINT IF EXISTS escrow_status_check;
ALTER TABLE public.escrow
  ADD CONSTRAINT escrow_status_check
  CHECK (status IN ('pending', 'funded', 'released', 'refunded', 'frozen', 'disputed'));

-- 7c. WALLETS: fraud-freeze flag (blocks withdrawals)
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

-- 7d. DISPUTES: decision / assignment / appeal columns.
--     The live table already uses client_id/freelancer_id/amount (NOT the old
--     migration's raised_by/raised_against) — add decision machinery on top.
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS decision TEXT CHECK (decision IN (
    'client_refund', 'freelancer_release', 'split', 'dismiss'
  )),
  ADD COLUMN IF NOT EXISTS decision_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS admin_assigned_to UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS appeal_status TEXT DEFAULT 'none' CHECK (appeal_status IN (
    'none', 'requested', 'approved', 'rejected'
  )),
  ADD COLUMN IF NOT EXISTS appeal_reason TEXT,
  ADD COLUMN IF NOT EXISTS appeal_decided_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS appeal_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Widen dispute status (keep existing values + investigating)
ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_status_check;
ALTER TABLE public.disputes
  ADD CONSTRAINT disputes_status_check
  CHECK (status IN ('open', 'investigating', 'resolved_refunded', 'resolved_released', 'cancelled', 'escalated'));

-- 7e. WITHDRAWALS: block processing when the wallet is frozen (fraud)
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS freeze_note TEXT;

-- 7f. WALLET WITHDRAWAL GUARD: frozen wallets cannot hold/withdraw funds.
--     Re-created here so fresh deploys carry the fraud-freeze guard too.
CREATE OR REPLACE FUNCTION public.hold_wallet_funds(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  -- Lock the wallet row
  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  -- FRAUD FREEZE GUARD: frozen wallets cannot withdraw
  IF v_wallet.is_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your wallet is frozen pending review. Withdrawals are disabled until the review is completed.');
  END IF;
  -- Check sufficient balance
  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_wallet.balance, 'pending_balance', v_wallet.pending_balance);
  END IF;
  -- Move funds from balance to pending_balance
  UPDATE wallets
  SET balance = balance - p_amount, pending_balance = pending_balance + p_amount, updated_at = now()
  WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION public.hold_wallet_funds(UUID, NUMERIC) TO authenticated;

-- ============================================================================
-- 8. STORAGE BUCKET for dispute evidence (private, RLS-scoped)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dispute-evidence',
  'dispute-evidence',
  false,
  20971520, -- 20MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/zip']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/zip']::text[];

-- Users upload into their own folder (auth.uid())
DROP POLICY IF EXISTS "Dispute evidence upload objects" ON storage.objects;
CREATE POLICY "Dispute evidence upload objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dispute-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Dispute participants read via signed URLs; admins read all
DROP POLICY IF EXISTS "Dispute evidence read signed" ON storage.objects;
CREATE POLICY "Dispute evidence read signed" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispute-evidence'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================================================
-- 9. RPC: NOTIFY + AUDIT helpers (SECURITY DEFINER, called from other RPCs)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._refund_notify(
  p_user_id UUID, p_type TEXT, p_title TEXT, p_message TEXT, p_action_url TEXT, p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_action_url, COALESCE(p_metadata, '{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public._refund_audit(
  p_user_id UUID, p_action TEXT, p_entity_type TEXT, p_entity_id TEXT,
  p_amount NUMERIC, p_currency TEXT, p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.insert_payment_audit_log(
    p_action => p_action,
    p_entity_type => p_entity_type,
    p_entity_id => p_entity_id,
    p_provider => 'razorpay',
    p_amount => p_amount,
    p_currency => p_currency,
    p_metadata => p_metadata,
    p_user_id => p_user_id
  );
EXCEPTION WHEN OTHERS THEN NULL; -- audit must never break the workflow
END $$;

CREATE OR REPLACE FUNCTION public._refund_history_event(
  p_refund_request_id UUID, p_event TEXT, p_actor_id UUID,
  p_actor_role TEXT, p_note TEXT, p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.refund_history (refund_request_id, event, actor_id, actor_role, note, metadata)
  VALUES (p_refund_request_id, p_event, p_actor_id, p_actor_role, p_note, COALESCE(p_metadata, '{}'::jsonb));
END $$;

-- ============================================================================
-- 10. RPC: COMPUTE REFUNDABLE AMOUNT (milestone-aware)
--     = escrow.amount − sum of already-released milestones. Released milestones
--     are never automatically refunded.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._refundable_amount(p_contract_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_escrow_amount NUMERIC;
  v_released NUMERIC := 0;
  v_ms JSONB;
BEGIN
  SELECT COALESCE(amount, 0) INTO v_escrow_amount FROM public.escrow WHERE contract_id = p_contract_id;

  SELECT milestones INTO v_ms FROM public.contracts WHERE id = p_contract_id;

  IF v_ms IS NOT NULL THEN
    -- Only funds actually moved OUT of escrow are non-refundable.
    -- 'completed' (submitted, awaiting approval) and 'approved' are still held
    -- in escrow, so they remain refundable.
    SELECT COALESCE(SUM((elem->>'amount')::NUMERIC), 0) INTO v_released
    FROM jsonb_array_elements(v_ms) AS elem
    WHERE (elem->>'status') IN ('released', 'paid');
  END IF;

  RETURN GREATEST(v_escrow_amount - v_released, 0);
END $$;

-- ============================================================================
-- 11. RPC: REQUEST CANCELLATION / REFUND (client) — Cases 1, 3, 4
-- ============================================================================
CREATE OR REPLACE FUNCTION public.request_contract_refund(
  p_contract_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL,
  p_milestone_index INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
  v_refundable NUMERIC;
  v_request_id UUID;
  v_request_type TEXT;
  v_work_started BOOLEAN;
BEGIN
  -- Auth: only the contract client may request
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Contract not found'); END IF;
  IF v_contract.client_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only the client can request a refund');
  END IF;

  -- Guards: no refund if already completed / already cancelled / disputed / frozen
  IF v_contract.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This contract is already closed');
  END IF;
  IF v_contract.status = 'disputed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This contract is under dispute — resolve the dispute first');
  END IF;
  IF v_contract.frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This contract is frozen pending review');
  END IF;
  IF EXISTS (SELECT 1 FROM public.refund_requests
             WHERE contract_id = p_contract_id AND status IN ('pending_freelancer','pending_admin','approved','auto_approved')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A refund request is already in progress');
  END IF;

  SELECT * INTO v_escrow FROM public.escrow WHERE contract_id = p_contract_id;
  v_refundable := public._refundable_amount(p_contract_id);

  -- No money to refund?
  IF v_refundable <= 0 AND v_contract.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No refundable funds in escrow');
  END IF;

  -- Work-started detection: freelancer marked started, or any milestone released/paid
  v_work_started := v_contract.freelancer_started_at IS NOT NULL;
  IF NOT v_work_started THEN
    SELECT bool_or((elem->>'status') IN ('released','paid','completed','approved')) INTO v_work_started
    FROM jsonb_array_elements(COALESCE(v_contract.milestones, '[]'::jsonb)) AS elem;
    v_work_started := COALESCE(v_work_started, false);
  END IF;

  -- Determine request type + flow
  IF p_milestone_index IS NOT NULL THEN
    v_request_type := 'milestone_cancel';
  ELSIF NOT v_work_started THEN
    v_request_type := 'client_cancel_before_work';
  ELSE
    v_request_type := 'client_cancel_after_start';
  END IF;

  INSERT INTO public.refund_requests (
    contract_id, milestone_index, requested_by, requested_to,
    request_type, reason, description, refund_amount,
    status
  ) VALUES (
    p_contract_id, p_milestone_index, auth.uid(), v_contract.freelancer_id,
    v_request_type, p_reason, p_description, v_refundable,
    CASE WHEN v_request_type = 'client_cancel_before_work' THEN 'auto_approved' ELSE 'pending_freelancer' END
  ) RETURNING id INTO v_request_id;

  -- Case 1: before work → auto-refund immediately (no freelancer approval needed)
  IF v_request_type = 'client_cancel_before_work' THEN
    UPDATE public.contracts
    SET cancellation_requested_by = auth.uid(),
        cancellation_status = 'approved'
    WHERE id = p_contract_id;

    PERFORM public._refund_history_event(v_request_id, 'requested', auth.uid(), 'client',
      p_reason, jsonb_build_object('request_type', v_request_type, 'auto_approved', true));
    PERFORM public._refund_history_event(v_request_id, 'approved', NULL, 'system',
      'Automatic refund: work had not started', jsonb_build_object('amount', v_refundable));
  ELSE
    UPDATE public.contracts
    SET cancellation_requested_by = auth.uid(),
        cancellation_status = 'pending_freelancer'
    WHERE id = p_contract_id;

    PERFORM public._refund_history_event(v_request_id, 'requested', auth.uid(), 'client',
      p_reason, jsonb_build_object('request_type', v_request_type));
  END IF;

  -- Notifications
  PERFORM public._refund_notify(auth.uid(), 'refund',
    'Refund request submitted',
    'Your refund request for contract #' || p_contract_id::TEXT || ' has been submitted.', '/client/contracts',
    jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));
  PERFORM public._refund_notify(v_contract.freelancer_id, 'refund',
    CASE WHEN v_request_type = 'client_cancel_before_work'
         THEN 'Contract closed — automatic refund'
         ELSE 'Cancellation request — your response required' END,
    CASE WHEN v_request_type = 'client_cancel_before_work'
         THEN 'The client cancelled before work started. Escrow will be refunded automatically.'
         ELSE 'The client has requested cancellation. Accept to refund the remaining escrow, or reject to open a dispute.' END,
    '/dashboard/contracts',
    jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));

  -- Case 1 / Case 2 / automatic types → trigger refund execution (edge fn via cron)
  IF v_request_type IN ('client_cancel_before_work', 'milestone_cancel') THEN
    -- Escrow reversal happens in the refund-executor; here we just queue it.
    PERFORM public._refund_audit(auth.uid(), 'refund_requested', 'contract', p_contract_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('request_id', v_request_id, 'type', v_request_type));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_type', v_request_type,
    'refund_amount', v_refundable,
    'status', (SELECT status FROM public.refund_requests WHERE id = v_request_id)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.request_contract_refund(UUID, TEXT, TEXT, INT) TO authenticated;

-- ============================================================================
-- 12. RPC: FREELANCER DECLINES PROJECT BEFORE START (Case 2) — auto refund
-- ============================================================================
CREATE OR REPLACE FUNCTION public.freelancer_decline_contract(p_contract_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_refundable NUMERIC;
  v_request_id UUID;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Contract not found'); END IF;
  IF v_contract.freelancer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF v_contract.freelancer_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have already started work — use the dispute flow instead');
  END IF;

  v_refundable := public._refundable_amount(p_contract_id);

  INSERT INTO public.refund_requests (
    contract_id, requested_by, requested_to, request_type, reason, description,
    refund_amount, status
  ) VALUES (
    p_contract_id, auth.uid(), v_contract.client_id, 'freelancer_decline',
    'Freelancer declined the project', 'The freelancer declined this project before starting work.',
    v_refundable, 'auto_approved'
  ) RETURNING id INTO v_request_id;

  UPDATE public.contracts SET cancellation_requested_by = auth.uid(), cancellation_status = 'approved'
  WHERE id = p_contract_id;

  PERFORM public._refund_history_event(v_request_id, 'requested', auth.uid(), 'freelancer',
    'Freelancer declined project', jsonb_build_object('request_type', 'freelancer_decline'));
  PERFORM public._refund_history_event(v_request_id, 'approved', NULL, 'system',
    'Automatic refund: freelancer declined before starting', jsonb_build_object('amount', v_refundable));

  PERFORM public._refund_notify(v_contract.client_id, 'refund',
    'Freelancer declined — refund initiated',
    'The freelancer declined your project. Your escrow will be refunded automatically.', '/client/contracts',
    jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'refund_amount', v_refundable, 'status', 'auto_approved');
END $$;

GRANT EXECUTE ON FUNCTION public.freelancer_decline_contract(UUID) TO authenticated;

-- ============================================================================
-- 13. RPC: RESPOND TO CANCELLATION (freelancer accepts or rejects — Case 3)
--     Accept  → refund remaining escrow + close contract
--     Reject  → automatically create a dispute
-- ============================================================================
CREATE OR REPLACE FUNCTION public.respond_cancellation_request(
  p_refund_request_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_req RECORD;
  v_contract RECORD;
  v_refundable NUMERIC;
  v_dispute_id UUID;
BEGIN
  SELECT * INTO v_req FROM public.refund_requests WHERE id = p_refund_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Refund request not found'); END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = v_req.contract_id FOR UPDATE;
  IF v_contract.freelancer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only the freelancer can respond');
  END IF;
  IF v_req.status <> 'pending_freelancer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request is no longer awaiting your response');
  END IF;

  v_refundable := public._refundable_amount(v_req.contract_id);

  IF p_accept THEN
    UPDATE public.refund_requests SET status = 'auto_approved', decided_amount = v_refundable,
      decision_by = auth.uid(), decision_at = now(), updated_at = now()
    WHERE id = p_refund_request_id;
    UPDATE public.contracts SET cancellation_status = 'approved', updated_at = now()
    WHERE id = v_req.contract_id;

    PERFORM public._refund_history_event(p_refund_request_id, 'approved', auth.uid(), 'freelancer',
      'Freelancer accepted the cancellation', jsonb_build_object('amount', v_refundable));
    PERFORM public._refund_notify(v_contract.client_id, 'refund',
      'Freelancer accepted cancellation — refund initiated',
      'The freelancer accepted your cancellation request. Remaining escrow will be refunded.', '/client/contracts',
      jsonb_build_object('contract_id', v_req.contract_id, 'request_id', p_refund_request_id));

    RETURN jsonb_build_object('success', true, 'action', 'refund', 'refund_amount', v_refundable, 'status', 'auto_approved');
  ELSE
    -- Freelancer rejects → automatic dispute
    UPDATE public.refund_requests SET status = 'rejected', decision_by = auth.uid(), decision_at = now(), updated_at = now()
    WHERE id = p_refund_request_id;
    UPDATE public.contracts SET cancellation_status = 'rejected', status = 'disputed', updated_at = now()
    WHERE id = v_req.contract_id;
    UPDATE public.escrow SET status = 'disputed' WHERE contract_id = v_req.contract_id;

    INSERT INTO public.disputes (contract_id, client_id, freelancer_id, reason, description, amount, status)
    VALUES (
      v_req.contract_id, v_contract.client_id, v_contract.freelancer_id,
      'Cancellation rejected', 'The freelancer rejected the client cancellation request. Escrow is now under dispute.',
      v_refundable, 'open'
    ) RETURNING id INTO v_dispute_id;

    PERFORM public._refund_history_event(p_refund_request_id, 'dispute_created', auth.uid(), 'freelancer',
      'Freelancer rejected cancellation — dispute auto-created', jsonb_build_object('dispute_id', v_dispute_id));
    PERFORM public._refund_audit(auth.uid(), 'dispute_created', 'contract', v_req.contract_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('dispute_id', v_dispute_id));

    PERFORM public._refund_notify(v_contract.client_id, 'dispute',
      'Dispute opened — cancellation rejected',
      'The freelancer rejected your cancellation request. The case has been escalated to our resolution team.', '/client/contracts',
      jsonb_build_object('contract_id', v_req.contract_id, 'dispute_id', v_dispute_id));

    RETURN jsonb_build_object('success', true, 'action', 'dispute', 'dispute_id', v_dispute_id, 'status', 'disputed');
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.respond_cancellation_request(UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- 14. RPC: RAISE DISPUTE (client or freelancer) — freeze escrow + notify admin
-- ============================================================================
DROP FUNCTION IF EXISTS public.raise_contract_dispute(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.raise_contract_dispute(
  p_contract_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
  v_dispute_id UUID;
  v_refundable NUMERIC;
  v_against UUID;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Contract not found'); END IF;

  IF auth.uid() NOT IN (v_contract.client_id, v_contract.freelancer_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: must be client or freelancer');
  END IF;
  IF v_contract.status NOT IN ('active', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Disputes can only be raised on active contracts');
  END IF;
  IF EXISTS (SELECT 1 FROM public.disputes WHERE contract_id = p_contract_id AND status IN ('open','investigating','escalated')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A dispute is already open on this contract');
  END IF;

  v_against := CASE WHEN auth.uid() = v_contract.client_id THEN v_contract.freelancer_id ELSE v_contract.client_id END;
  v_refundable := public._refundable_amount(p_contract_id);

  INSERT INTO public.disputes (contract_id, client_id, freelancer_id, reason, description, amount, status)
  VALUES (p_contract_id, v_contract.client_id, v_contract.freelancer_id, p_reason, p_description, v_refundable, 'open')
  RETURNING id INTO v_dispute_id;

  -- Freeze escrow + mark contract disputed
  UPDATE public.escrow SET status = 'disputed' WHERE contract_id = p_contract_id;
  UPDATE public.contracts SET status = 'disputed', updated_at = now() WHERE id = p_contract_id;

  PERFORM public._refund_audit(auth.uid(), 'dispute_created', 'contract', p_contract_id::TEXT,
    v_refundable, 'INR', jsonb_build_object('dispute_id', v_dispute_id, 'reason', p_reason));

  -- Notify the other party + all admins
  PERFORM public._refund_notify(v_against, 'dispute',
    'A dispute has been opened',
    'A dispute was raised on contract #' || p_contract_id::TEXT || '. Our team will review the case.', '/dashboard/contracts',
    jsonb_build_object('contract_id', p_contract_id, 'dispute_id', v_dispute_id));
  PERFORM public._refund_notify(
    (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1), 'admin',
    'New dispute requires review',
    'Dispute #' || v_dispute_id::TEXT || ' on contract #' || p_contract_id::TEXT || ' is awaiting admin review.',
    '/admin/disputes', jsonb_build_object('dispute_id', v_dispute_id, 'contract_id', p_contract_id));

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id, 'status', 'open');
END $$;

GRANT EXECUTE ON FUNCTION public.raise_contract_dispute(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 15. RPC: ADMIN DECISION on a dispute (refund / release / split / dismiss)
--     Executes the escrow + wallet outcome immediately.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_decide_dispute(
  p_dispute_id UUID,
  p_decision TEXT,                 -- 'client_refund' | 'freelancer_release' | 'split' | 'dismiss'
  p_client_amount NUMERIC DEFAULT NULL,   -- for split: amount to refund client
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_dispute RECORD;
  v_contract RECORD;
  v_escrow RECORD;
  v_refundable NUMERIC;
  v_freelancer_amount NUMERIC;
  v_refund_request_id UUID;
BEGIN
  -- Admin only
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  SELECT * INTO v_dispute FROM public.disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Dispute not found'); END IF;
  IF v_dispute.status NOT IN ('open', 'investigating', 'escalated') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispute already resolved');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = v_dispute.contract_id FOR UPDATE;
  SELECT * INTO v_escrow FROM public.escrow WHERE contract_id = v_dispute.contract_id FOR UPDATE;
  v_refundable := public._refundable_amount(v_dispute.contract_id);
  v_freelancer_amount := COALESCE(v_contract.freelancer_amount, v_contract.amount);

  IF p_decision = 'client_refund' THEN
    -- Refund remaining escrow to client; no freelancer payout
    UPDATE public.escrow SET status = 'refunded', updated_at = now() WHERE contract_id = v_dispute.contract_id;
    UPDATE public.contracts SET status = 'cancelled', escrow_funded = false, updated_at = now() WHERE id = v_dispute.contract_id;
    UPDATE public.wallets SET escrow_balance = GREATEST(escrow_balance - v_refundable, 0), updated_at = now()
    WHERE user_id = v_dispute.client_id;
    UPDATE public.disputes SET status = 'resolved_refunded', decision = 'client_refund',
      decision_amount = v_refundable, resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
    WHERE id = p_dispute_id;

    -- QUEUE THE REAL GATEWAY REFUND: create an approved refund request so the
    -- pg_cron executor -> razorpay edge function -> Razorpay /refunds runs and
    -- the money actually returns to the client's payment method.
    INSERT INTO public.refund_requests (
      contract_id, requested_by, requested_to, request_type, reason, description,
      refund_amount, status, decision_by, decision_at, decided_amount
    ) VALUES (
      v_dispute.contract_id, v_dispute.client_id, NULL, 'admin_decision',
      'Admin dispute decision: refund client', COALESCE(p_note, 'Dispute resolved in favour of the client.'),
      v_refundable, 'approved', auth.uid(), now(), v_refundable
    ) RETURNING id INTO v_refund_request_id;

    PERFORM public._refund_history_event(v_refund_request_id, 'approved', auth.uid(), 'admin',
      COALESCE(p_note, 'Dispute resolved in favour of the client'), jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_refundable));
    PERFORM public._refund_audit(auth.uid(), 'dispute_resolved_refund', 'dispute', p_dispute_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('decision', 'client_refund', 'refund_request_id', v_refund_request_id));

  ELSIF p_decision = 'freelancer_release' THEN
    -- Release remaining escrow to freelancer (work completed fairly)
    UPDATE public.escrow SET status = 'released', released_at = now(), updated_at = now() WHERE contract_id = v_dispute.contract_id;
    UPDATE public.contracts SET status = 'completed', escrow_funded = false, updated_at = now() WHERE id = v_dispute.contract_id;
    UPDATE public.wallets SET balance = balance + v_refundable, updated_at = now() WHERE user_id = v_dispute.freelancer_id;
    UPDATE public.disputes SET status = 'resolved_released', decision = 'freelancer_release',
      decision_amount = v_refundable, resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
    WHERE id = p_dispute_id;

    INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, status, source, description)
    VALUES (v_dispute.freelancer_id, v_dispute.contract_id, v_escrow.id, 'credit', v_refundable, 'completed', 'escrow',
            'Dispute resolution — funds released to freelancer');

    PERFORM public._refund_audit(auth.uid(), 'dispute_resolved_release', 'dispute', p_dispute_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('decision', 'freelancer_release'));

  ELSIF p_decision = 'split' THEN
    -- Split: client gets p_client_amount back; freelancer gets the rest
    DECLARE v_freelancer_share NUMERIC := GREATEST(v_refundable - COALESCE(p_client_amount, 0), 0);
    BEGIN
      UPDATE public.escrow SET status = 'released', released_at = now(), updated_at = now() WHERE contract_id = v_dispute.contract_id;
      UPDATE public.contracts SET status = 'completed', escrow_funded = false, updated_at = now() WHERE id = v_dispute.contract_id;
      UPDATE public.wallets SET escrow_balance = GREATEST(escrow_balance - COALESCE(p_client_amount, 0), 0), updated_at = now()
      WHERE user_id = v_dispute.client_id;
      IF v_freelancer_share > 0 THEN
        UPDATE public.wallets SET balance = balance + v_freelancer_share, updated_at = now() WHERE user_id = v_dispute.freelancer_id;
        INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, status, source, description)
        VALUES (v_dispute.freelancer_id, v_dispute.contract_id, v_escrow.id, 'credit', v_freelancer_share, 'completed', 'escrow',
                'Dispute resolution — split: freelancer share');
      END IF;
      UPDATE public.disputes SET status = 'resolved_refunded', decision = 'split',
        decision_amount = v_refundable, resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
      WHERE id = p_dispute_id;

      -- Queue the real gateway refund for the client portion (split only refunds
      -- the client share back to their payment method; freelancer share is credited).
      IF COALESCE(p_client_amount, 0) > 0 THEN
        INSERT INTO public.refund_requests (
          contract_id, requested_by, requested_to, request_type, reason, description,
          refund_amount, status, decision_by, decision_at, decided_amount
        ) VALUES (
          v_dispute.contract_id, v_dispute.client_id, NULL, 'admin_decision',
          'Admin dispute decision: split — client portion', COALESCE(p_note, 'Dispute resolved with a split decision.'),
          p_client_amount, 'approved', auth.uid(), now(), p_client_amount
        ) RETURNING id INTO v_refund_request_id;

        PERFORM public._refund_history_event(v_refund_request_id, 'approved', auth.uid(), 'admin',
          COALESCE(p_note, 'Dispute resolved with a split decision'),
          jsonb_build_object('dispute_id', p_dispute_id, 'client_amount', p_client_amount, 'freelancer_share', v_freelancer_share));
      END IF;
      PERFORM public._refund_audit(auth.uid(), 'dispute_resolved_split', 'dispute', p_dispute_id::TEXT,
        v_refundable, 'INR', jsonb_build_object('client_refund', COALESCE(p_client_amount, 0), 'freelancer_share', v_freelancer_share, 'refund_request_id', v_refund_request_id));
    END;

  ELSE -- dismiss
    UPDATE public.escrow SET status = 'funded', updated_at = now() WHERE contract_id = v_dispute.contract_id;
    UPDATE public.contracts SET status = 'active', updated_at = now() WHERE id = v_dispute.contract_id;
    UPDATE public.disputes SET status = 'cancelled', decision = 'dismiss',
      resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
    WHERE id = p_dispute_id;
    PERFORM public._refund_audit(auth.uid(), 'dispute_dismissed', 'dispute', p_dispute_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('decision', 'dismiss'));
  END IF;

  -- Notify both parties
  PERFORM public._refund_notify(v_dispute.client_id, 'dispute',
    'Dispute resolved',
    'The dispute on contract #' || v_dispute.contract_id::TEXT || ' has been resolved (' || p_decision || ').',
    '/client/contracts', jsonb_build_object('dispute_id', p_dispute_id, 'decision', p_decision));
  PERFORM public._refund_notify(v_dispute.freelancer_id, 'dispute',
    'Dispute resolved',
    'The dispute on contract #' || v_dispute.contract_id::TEXT || ' has been resolved (' || p_decision || ').',
    '/dashboard/contracts', jsonb_build_object('dispute_id', p_dispute_id, 'decision', p_decision));

  RETURN jsonb_build_object('success', true, 'dispute_id', p_dispute_id, 'decision', p_decision,
    'status', (SELECT status FROM public.disputes WHERE id = p_dispute_id));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_decide_dispute(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- 16. RPC: ADMIN ASSIGN + INTERNAL NOTE + APPEAL + MESSAGE + EVIDENCE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_assign_dispute(p_dispute_id UUID, p_admin_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN false;
  END IF;
  UPDATE public.disputes SET admin_assigned_to = p_admin_id, status = 'investigating', updated_at = now()
  WHERE id = p_dispute_id;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_assign_dispute(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_internal_note(p_dispute_id UUID, p_note TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN false;
  END IF;
  INSERT INTO public.dispute_internal_notes (dispute_id, admin_id, note) VALUES (p_dispute_id, auth.uid(), p_note);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_add_internal_note(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.appeal_dispute(p_dispute_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_dispute RECORD;
BEGIN
  SELECT * INTO v_dispute FROM public.disputes WHERE id = p_dispute_id;
  IF NOT FOUND OR auth.uid() NOT IN (v_dispute.client_id, v_dispute.freelancer_id) THEN
    RETURN false;
  END IF;
  IF v_dispute.status NOT IN ('resolved_refunded', 'resolved_released', 'cancelled') THEN
    RETURN false; -- only decided disputes can be appealed
  END IF;
  UPDATE public.disputes SET appeal_status = 'requested', appeal_reason = p_reason,
    status = 'escalated', updated_at = now()
  WHERE id = p_dispute_id;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.appeal_dispute(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_dispute_message(p_dispute_id UUID, p_message TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_dispute RECORD;
BEGIN
  SELECT * INTO v_dispute FROM public.disputes WHERE id = p_dispute_id;
  IF NOT FOUND OR auth.uid() NOT IN (v_dispute.client_id, v_dispute.freelancer_id)
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN false;
  END IF;
  INSERT INTO public.dispute_messages (dispute_id, sender_id, message) VALUES (p_dispute_id, auth.uid(), p_message);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.send_dispute_message(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_dispute_evidence(
  p_dispute_id UUID, p_file_name TEXT, p_file_url TEXT, p_mime_type TEXT DEFAULT NULL, p_file_size INT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_dispute RECORD;
BEGIN
  SELECT * INTO v_dispute FROM public.disputes WHERE id = p_dispute_id;
  IF NOT FOUND OR auth.uid() NOT IN (v_dispute.client_id, v_dispute.freelancer_id)
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN false;
  END IF;
  INSERT INTO public.dispute_evidence (dispute_id, uploader_id, file_name, file_url, mime_type, file_size)
  VALUES (p_dispute_id, auth.uid(), p_file_name, p_file_url, p_mime_type, p_file_size);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.attach_dispute_evidence(UUID, TEXT, TEXT, TEXT, INT) TO authenticated;

-- ============================================================================
-- 17. RPC: FRAUD FREEZE / UNFREEZE (freeze escrow + wallet, block withdrawals)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.freeze_contract(p_contract_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_contract RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN false;
  END IF;
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.contracts SET freeze_reason = p_reason, frozen_at = now(), updated_at = now() WHERE id = p_contract_id;
  UPDATE public.escrow SET status = 'frozen' WHERE contract_id = p_contract_id AND status IN ('funded','pending');
  UPDATE public.wallets SET is_frozen = true, freeze_reason = p_reason, frozen_at = now()
  WHERE user_id IN (v_contract.client_id, v_contract.freelancer_id);

  PERFORM public._refund_audit(auth.uid(), 'fraud_freeze', 'contract', p_contract_id::TEXT,
    NULL, NULL, jsonb_build_object('reason', p_reason));

  PERFORM public._refund_notify(v_contract.client_id, 'admin', 'Contract frozen pending review',
    'Your contract #' || p_contract_id::TEXT || ' has been frozen pending a security review.', '/client/contracts',
    jsonb_build_object('contract_id', p_contract_id));
  PERFORM public._refund_notify(v_contract.freelancer_id, 'admin', 'Contract frozen pending review',
    'Your contract #' || p_contract_id::TEXT || ' has been frozen pending a security review.', '/dashboard/contracts',
    jsonb_build_object('contract_id', p_contract_id));

  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.freeze_contract(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unfreeze_contract(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_contract RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN false;
  END IF;
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.contracts SET freeze_reason = NULL, frozen_at = NULL, updated_at = now() WHERE id = p_contract_id;
  UPDATE public.escrow SET status = 'funded' WHERE contract_id = p_contract_id AND status = 'frozen';
  UPDATE public.wallets SET is_frozen = false, freeze_reason = NULL, frozen_at = NULL
  WHERE user_id IN (v_contract.client_id, v_contract.freelancer_id);

  PERFORM public._refund_audit(auth.uid(), 'fraud_unfreeze', 'contract', p_contract_id::TEXT, NULL, NULL, '{}'::jsonb);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.unfreeze_contract(UUID) TO authenticated;

-- ============================================================================
-- 18. RPC: MARK FREELANCER WORK STARTED (called when freelancer starts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_freelancer_started(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_contract RECORD;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_contract.freelancer_id IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
  UPDATE public.contracts SET freelancer_started_at = COALESCE(freelancer_started_at, now()), updated_at = now()
  WHERE id = p_contract_id;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_freelancer_started(UUID) TO authenticated;

-- ============================================================================
-- 18a. PG_NET (used by pg_cron to call edge functions) — idempotent
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 18b. CRON SETTINGS (internal secret used by pg_cron -> pg_net -> edge fn)
--      Seeded with the same value as the CRON_SECRET edge-function secret.
--      NOTE: when applying this migration manually, update the seed below to
--      match the CRON_SECRET edge-function secret you set.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cron_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.cron_settings (key, value)
VALUES ('cron_secret', '2252aa8dabde40ee79c2ed0390165f0be7b38cbcb0828b5d33edc7886ca7c48b')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

ALTER TABLE public.cron_settings ENABLE ROW LEVEL SECURITY;
-- No direct user access: only SECURITY DEFINER functions read it.

-- ============================================================================
-- 19. AUTOMATION: NO-RESPONSE AUTO-DISPUTE (Case 5)
--     Freelancer submits work → 7/10/14-day reminders → auto-dispute at 14d.
--     Detects submitted-but-unapproved work via milestones in 'completed'
--     (not yet 'approved'/'released') or active contracts where the client has
--     not released anything recently.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_no_response_disputes()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_disputes_created INT := 0;
  v_last_submitted TIMESTAMPTZ;
  v_days INT;
BEGIN
  FOR v_contract IN
    SELECT c.* FROM public.contracts c
    WHERE c.status = 'active'
      AND c.frozen_at IS NULL
      AND c.cancellation_status = 'none'
      AND NOT EXISTS (SELECT 1 FROM public.disputes d WHERE d.contract_id = c.id AND d.status IN ('open','investigating','escalated'))
      -- has at least one completed-but-not-released milestone
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(c.milestones, '[]'::jsonb)) m
        WHERE (m->>'status') = 'completed'
      )
  LOOP
    -- Most recent completed milestone timestamp (best-effort from jsonb updated_at if present)
    SELECT MAX((m->>'updated_at')::TIMESTAMPTZ) INTO v_last_submitted
    FROM jsonb_array_elements(COALESCE(v_contract.milestones, '[]'::jsonb)) m
    WHERE (m->>'status') = 'completed' AND (m->>'updated_at') IS NOT NULL;

    IF v_last_submitted IS NULL THEN CONTINUE; END IF;
    v_days := EXTRACT(EPOCH FROM (now() - v_last_submitted)) / 86400;

    IF v_days >= 14 THEN
      -- Auto-dispute
      UPDATE public.contracts SET status = 'disputed', updated_at = now() WHERE id = v_contract.id;
      UPDATE public.escrow SET status = 'disputed' WHERE contract_id = v_contract.id;

      INSERT INTO public.disputes (contract_id, client_id, freelancer_id, reason, description, amount, status)
      VALUES (v_contract.id, v_contract.client_id, v_contract.freelancer_id,
              'Client did not respond to submitted work',
              'The client did not respond to the submitted work within 14 days. Escrow auto-escalated for review.',
              public._refundable_amount(v_contract.id), 'open');

      PERFORM public._refund_notify(v_contract.client_id, 'dispute',
        'Dispute auto-opened — no response',
        'You did not respond to the submitted work. The case was escalated automatically.', '/client/contracts',
        jsonb_build_object('contract_id', v_contract.id));
      PERFORM public._refund_notify(v_contract.freelancer_id, 'dispute',
        'Dispute auto-opened — no client response',
        'The client did not respond to your work. The case was escalated automatically.', '/dashboard/contracts',
        jsonb_build_object('contract_id', v_contract.id));
      PERFORM public._refund_audit(NULL, 'auto_dispute_no_response', 'contract', v_contract.id::TEXT,
        NULL, NULL, jsonb_build_object('days', v_days));
      v_disputes_created := v_disputes_created + 1;

    ELSIF v_days >= 10 THEN
      PERFORM public._refund_notify(v_contract.client_id, 'reminder',
        'Reminder: approve or release submitted work',
        'You have 4 days to respond to the submitted work before the contract is escalated.', '/client/contracts',
        jsonb_build_object('contract_id', v_contract.id));
    ELSIF v_days >= 7 THEN
      PERFORM public._refund_notify(v_contract.client_id, 'reminder',
        'Reminder: review submitted work',
        'Please review and approve the submitted work. Unaddressed work is escalated after 14 days.', '/client/contracts',
        jsonb_build_object('contract_id', v_contract.id));
    END IF;
  END LOOP;

  RETURN v_disputes_created;
END $$;

-- ============================================================================
-- 20. AUTOMATION: PENDING-REFUND EXECUTOR (calls razorpay edge function)
--     Finds auto-approved refund requests that have not been executed and
--     triggers the edge function (via pg_net) which creates the Razorpay
--     refund, reverses escrow, and closes the contract.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_pending_refunds()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
END $$;

-- ============================================================================
-- 21. SCHEDULE CRON JOBS
-- ============================================================================
DO $cron$
BEGIN
  -- Pending refunds every 2 minutes (fast automatic refunds)
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growlancer-process-pending-refunds') THEN
    PERFORM cron.schedule('growlancer-process-pending-refunds', '*/2 * * * *',
      $job$SELECT public.process_pending_refunds();$job$);
  END IF;
  -- No-response auto-dispute daily at 06:00
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growlancer-no-response-auto-dispute') THEN
    PERFORM cron.schedule('growlancer-no-response-auto-dispute', '0 6 * * *',
      $job$SELECT public.process_no_response_disputes();$job$);
  END IF;
END $cron$;

-- ============================================================================
-- 22. REALTIME for dispute tables (admin dashboards)
-- ============================================================================
DO $realtime$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['disputes','refund_requests','refunds','dispute_messages']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl) THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
  END LOOP;
END $realtime$;
