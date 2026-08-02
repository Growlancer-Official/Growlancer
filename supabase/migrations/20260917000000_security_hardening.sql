-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING — 5-part security audit fixes
-- 1. RPC authorization: every RPC that takes p_user_id must verify
--    auth.uid() = p_user_id (kills IDOR on MFA, deletion, and wallet RPCs).
-- 2. update_wallet_balance: REVOKE from authenticated — it could be called
--    directly to credit unlimited funds (free money). It remains callable
--    only from SECURITY DEFINER contexts (release_escrow etc.).
-- 3. fund_escrow: require a captured payment order to exist for the contract
--    (client could previously mark escrow funded without paying).
-- 4. create_contract_with_escrow: validate amount > 0 and proposal ownership.
-- 5. process_referral / complete_referral: auth.uid() checks + tighten
--    overly-permissive referral RLS (any user could UPDATE any referral row).
-- 6. Enable RLS on credential verification tables (they had NONE — anyone
--    with the anon key could read QR verification tokens via PostgREST).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. MFA RPCs — require auth.uid() = p_user_id
-- ═══════════════════════════════════════════════════════════════════════════

-- get_mfa_status: an attacker could read any user's MFA status / backup email
CREATE OR REPLACE FUNCTION get_mfa_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_codes_remaining INTEGER;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_settings FROM user_mfa_settings WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_codes_remaining FROM recovery_codes
    WHERE user_id = p_user_id AND used = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'mfa_enabled', false,
      'recovery_codes_remaining', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'mfa_enabled', v_settings.mfa_enabled,
    'mfa_method', v_settings.mfa_method,
    'backup_email', v_settings.backup_email,
    'trusted_devices', v_settings.trusted_devices,
    'last_verified_at', v_settings.last_verified_at,
    'recovery_codes_remaining', v_codes_remaining,
    'created_at', v_settings.created_at
  );
END;
$$;

-- generate_recovery_codes: previously returned ANOTHER user's plaintext
-- recovery codes (direct account takeover via IDOR).
CREATE OR REPLACE FUNCTION generate_recovery_codes(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes TEXT[] := '{}';
  v_code TEXT;
  v_i INTEGER;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM recovery_codes WHERE user_id = p_user_id AND used = false;

  FOR v_i IN 1..8 LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
    v_code := substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5);

    INSERT INTO recovery_codes (user_id, code_hash)
    VALUES (p_user_id, crypt(v_code, gen_salt('bf')));

    v_codes := array_append(v_codes, v_code);
  END LOOP;

  RETURN v_codes;
END;
$$;

-- verify_recovery_code: only the owning user may verify their own codes
CREATE OR REPLACE FUNCTION verify_recovery_code(p_user_id UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id UUID;
  v_valid BOOLEAN := false;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_code_id FROM recovery_codes
    WHERE user_id = p_user_id
    AND used = false
    AND code_hash = crypt(p_code, code_hash)
    LIMIT 1;

  IF FOUND THEN
    UPDATE recovery_codes SET used = true, used_at = NOW()
    WHERE id = v_code_id;

    RETURN jsonb_build_object('valid', true);
  ELSE
    RETURN jsonb_build_object('valid', false);
  END IF;
END;
$$;

-- get_recovery_codes_count: ownership check
CREATE OR REPLACE FUNCTION get_recovery_codes_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COUNT(*) INTO v_count FROM recovery_codes
    WHERE user_id = p_user_id AND used = false;
  RETURN v_count;
END;
$$;

-- enable_user_mfa: previously let ANY user force-enable MFA on a victim's
-- account (account lockout / takeover primitive).
CREATE OR REPLACE FUNCTION enable_user_mfa(p_user_id UUID, p_totp_secret TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mfa_id UUID;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO user_mfa_settings (user_id, mfa_enabled, totp_secret, last_verified_at)
  VALUES (p_user_id, true, p_totp_secret, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET mfa_enabled = true, totp_secret = p_totp_secret, last_verified_at = NOW(), updated_at = NOW()
  RETURNING id INTO v_mfa_id;

  RETURN jsonb_build_object('success', true, 'mfa_id', v_mfa_id);
END;
$$;

-- disable_user_mfa: previously let ANY user disable a victim's 2FA
CREATE OR REPLACE FUNCTION disable_user_mfa(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE user_mfa_settings
  SET mfa_enabled = false, totp_secret = null, updated_at = NOW()
  WHERE user_id = p_user_id;

  DELETE FROM recovery_codes WHERE user_id = p_user_id AND used = false;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ACCOUNT DELETION RPCs — require auth.uid() = p_user_id
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION request_account_deletion(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  -- Only the account owner may request deletion
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT email, name INTO v_user_email, v_user_name FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT id INTO v_existing_id FROM user_deletion_requests
    WHERE user_id = p_user_id AND status IN ('pending', 'confirmed');
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'A deletion request already exists', 'request_id', v_existing_id);
  END IF;

  INSERT INTO user_deletion_requests (user_id, reason, status, scheduled_deletion_at)
  VALUES (p_user_id, p_reason, 'pending', NOW() + INTERVAL '7 days')
  RETURNING id INTO v_existing_id;

  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    p_user_id,
    'account_deletion',
    'Account Deletion Requested',
    'Your account deletion request has been received. It will be processed after 7 days. You can cancel this request anytime from your settings.',
    '/dashboard/settings'
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_existing_id,
    'message', 'Deletion request created. Your account will be deleted after 7 days.',
    'scheduled_deletion_at', (SELECT scheduled_deletion_at FROM user_deletion_requests WHERE id = v_existing_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION cancel_account_deletion(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_request_id FROM user_deletion_requests
    WHERE user_id = p_user_id AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active deletion request found');
  END IF;

  UPDATE user_deletion_requests
  SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
  WHERE id = v_request_id;

  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    p_user_id,
    'account_deletion',
    'Account Deletion Cancelled',
    'Your account deletion request has been cancelled. Your account is safe.',
    '/dashboard/settings'
  );

  RETURN jsonb_build_object('success', true, 'message', 'Deletion request cancelled successfully');
END;
$$;

CREATE OR REPLACE FUNCTION check_deletion_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_request FROM user_deletion_requests
    WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_request', false);
  END IF;

  RETURN jsonb_build_object(
    'has_request', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'reason', v_request.reason,
    'created_at', v_request.created_at,
    'scheduled_deletion_at', v_request.scheduled_deletion_at,
    'confirmed_at', v_request.confirmed_at,
    'cancelled_at', v_request.cancelled_at
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. WALLET RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- get_wallet_balance: add missing ownership check (IDOR — could read any
-- user's wallet balance).
CREATE OR REPLACE FUNCTION get_wallet_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet RECORD;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  INSERT INTO wallets (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, pending_balance, currency INTO v_wallet
  FROM wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance,
    'currency', v_wallet.currency
  );
END;
$$;

-- CRITICAL: update_wallet_balance lets any authenticated user credit their
-- own wallet with arbitrary funds (free money → withdraw to PayPal).
-- It is only used internally by SECURITY DEFINER functions; revoke direct
-- execution from authenticated/anon entirely.
-- NOTE: must also REVOKE FROM PUBLIC — Postgres grants EXECUTE to PUBLIC on
-- function creation, so revoking only from anon/authenticated leaves the
-- function callable by everyone via the PUBLIC default grant (verified live).
REVOKE ALL ON FUNCTION update_wallet_balance(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_wallet_balance(UUID, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION update_wallet_balance(UUID, NUMERIC) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ESCROW RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- fund_escrow: previously ANY authenticated client could call this directly
-- via PostgREST to mark their contract's escrow as funded WITHOUT paying,
-- then release it to the freelancer — platform loses the money.
-- Now require a captured payment order (razorpay_orders / paypal_orders)
-- linked to the contract, or an admin caller.
CREATE OR REPLACE FUNCTION fund_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract RECORD;
  v_is_admin BOOLEAN;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch contract with row lock
  SELECT * INTO v_contract
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Verify client owns this contract
  IF v_contract.client_id <> p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Require proof of payment: a captured Razorpay or PayPal order must exist
  -- for this contract. This prevents funding escrow without a real payment.
  IF NOT EXISTS (
    SELECT 1 FROM razorpay_orders
    WHERE contract_id = p_contract_id AND status = 'captured'
  ) AND NOT EXISTS (
    SELECT 1 FROM paypal_orders
    WHERE contract_id = p_contract_id AND status = 'captured'
  ) THEN
    RAISE EXCEPTION 'Escrow can only be funded after a captured payment';
  END IF;

  -- Update escrow record
  UPDATE escrow
  SET status = 'funded',
      funded_at = NOW()
  WHERE contract_id = p_contract_id;

  -- Update contract status
  UPDATE contracts
  SET status = 'active',
      escrow_funded = true,
      updated_at = NOW()
  WHERE id = p_contract_id;

  -- Update project status
  UPDATE projects
  SET status = 'in_progress'
  WHERE id = v_contract.project_id;

  RETURN TRUE;
END;
$$;

-- create_contract_with_escrow: validate amount > 0 and that the proposal
-- belongs to this client / freelancer pair (prevents tampered amounts and
-- creating contracts against other people's proposals).
CREATE OR REPLACE FUNCTION create_contract_with_escrow(
  p_project_id UUID,
  p_freelancer_id UUID,
  p_proposal_id UUID,
  p_amount NUMERIC,
  p_client_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id UUID;
  v_platform_fee NUMERIC;
  v_freelancer_amount NUMERIC;
  v_proposal RECORD;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Amount must be positive and bounded (no zero / negative / absurd amounts)
  -- Cap aligned with the payment gateways (razorpay/paypal validateAmount caps
  -- orders at 100,000) so a contract can always be funded.
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Invalid contract amount';
  END IF;

  -- Proposal must exist, belong to this project, and match the freelancer
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found for this project';
  END IF;

  IF v_proposal.freelancer_id <> p_freelancer_id THEN
    RAISE EXCEPTION 'Proposal does not belong to this freelancer';
  END IF;

  -- Project must belong to this client
  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Project does not belong to this client';
  END IF;

  -- Calculate fees
  v_platform_fee := ROUND(p_amount * 0.05, 2); -- 5% platform fee (matches frontend config)
  v_freelancer_amount := p_amount - v_platform_fee;

  -- Create contract
  INSERT INTO contracts (
    project_id,
    proposal_id,
    freelancer_id,
    client_id,
    amount,
    platform_fee,
    freelancer_amount,
    status,
    escrow_funded
  ) VALUES (
    p_project_id,
    p_proposal_id,
    p_freelancer_id,
    p_client_id,
    p_amount,
    v_platform_fee,
    v_freelancer_amount,
    'pending',
    false
  )
  RETURNING id INTO v_contract_id;

  -- Create escrow record
  INSERT INTO escrow (
    contract_id,
    amount,
    status
  ) VALUES (
    v_contract_id,
    p_amount,
    'pending'
  );

  RETURN v_contract_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. REFERRAL SYSTEM — auth checks + tighten RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- process_referral: only the NEW user themselves may register a referral
-- (prevents linking arbitrary accounts to farm rewards).
CREATE OR REPLACE FUNCTION public.process_referral(
  p_referral_code TEXT,
  p_new_user_id UUID,
  p_new_user_email TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  IF p_new_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_referral_code IS NULL OR p_referral_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No referral code provided');
  END IF;

  IF p_new_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user ID provided');
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE referral_code = p_referral_code
    AND id != p_new_user_id
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referrer_id = v_referrer_id AND referred_user_id = p_new_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already referred');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, referred_email, referral_code, status, bonus_claimed)
  VALUES (v_referrer_id, p_new_user_id, p_new_user_email, p_referral_code, 'pending', false);

  INSERT INTO public.referral_stats (user_id, total_referrals, valid_referrals, points, level, updated_at)
  VALUES (v_referrer_id, 1, 0, 0, 1, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_referrals = COALESCE(referral_stats.total_referrals, 0) + 1,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id
  );
END;
$$;

-- complete_referral: only the referred user may complete their own referral
CREATE OR REPLACE FUNCTION public.complete_referral(p_referee_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  IF p_referee_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT referrer_id INTO v_referrer_id
  FROM public.referrals
  WHERE referred_user_id = p_referee_user_id AND status = 'pending'
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending referral found');
  END IF;

  UPDATE public.referrals
  SET status = 'completed', bonus_claimed = true
  WHERE referred_user_id = p_referee_user_id AND status = 'pending';

  UPDATE public.referral_stats
  SET
    valid_referrals = COALESCE(valid_referrals, 0) + 1,
    points = COALESCE(points, 0) + 10,
    updated_at = NOW()
  WHERE user_id = v_referrer_id;

  RETURN jsonb_build_object('success', true, 'referrer_id', v_referrer_id);
END;
$$;

-- Tighten referral RLS: previously ANY authenticated user could UPDATE any
-- referral (mark own referral completed → claim rewards) or read all rows.
-- Only the involved users (referrer or referred user) may read/update.
DROP POLICY IF EXISTS "Authenticated users can read referrals" ON public.referrals;
CREATE POLICY "Referral participants can read referrals" ON public.referrals
  FOR SELECT
  TO authenticated
  USING (referrer_id = auth.uid() OR referred_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert referrals" ON public.referrals;
CREATE POLICY "Referral participants can insert referrals" ON public.referrals
  FOR INSERT
  TO authenticated
  WITH CHECK (referrer_id = auth.uid() OR referred_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update referrals" ON public.referrals;
CREATE POLICY "Referral participants can update referrals" ON public.referrals
  FOR UPDATE
  TO authenticated
  USING (referrer_id = auth.uid() OR referred_user_id = auth.uid())
  WITH CHECK (referrer_id = auth.uid() OR referred_user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can read referral_stats" ON public.referral_stats;
-- Keep SELECT permissive for authenticated: the ReferralsPage leaderboard reads
-- aggregate stats across ALL users (top-10 by total_referrals). Aggregate stats
-- (total_referrals, valid_referrals, points, level) are not sensitive PII, and
-- the real vulnerability was UPDATE/INSERT tampering, which is tightened below.
CREATE POLICY "Users can read referral_stats for leaderboard" ON public.referral_stats
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert referral_stats" ON public.referral_stats;
CREATE POLICY "Users can insert own referral_stats" ON public.referral_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update referral_stats" ON public.referral_stats;
CREATE POLICY "Users can update own referral_stats" ON public.referral_stats
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. CREDENTIAL VERIFICATION TABLES — enable RLS (had NONE)
-- The credential_verification_tokens table holds raw QR tokens; the audit
-- log holds admin emails/IPs. With no RLS, anyone with the anon key could
-- read them via PostgREST. All app access goes through SECURITY DEFINER RPCs
-- or the service-role admin-data function, which bypass RLS — so deny all
-- direct access is safe.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.credential_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_version_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_audit_logs ENABLE ROW LEVEL SECURITY;

-- No policies = deny everything for anon/authenticated (service_role and
-- SECURITY DEFINER functions are unaffected).

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY the auth checks didn't break internal callers
-- The current release_escrow (20260617 fix) updates wallets directly via
-- SECURITY DEFINER UPDATE, and no Edge Function / client code calls
-- update_wallet_balance anymore — so the REVOKE is safe. If a future internal
-- caller ever needs it, grant it ONLY to service_role.
-- ═══════════════════════════════════════════════════════════════════════════
