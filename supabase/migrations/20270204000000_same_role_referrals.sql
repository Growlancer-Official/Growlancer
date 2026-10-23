-- ═══════════════════════════════════════════════════════════════════════════
-- 2027-02-04 — SAME-SIDE REFERRALS ONLY
--
-- A freelancer's code is for other freelancers; a client's code is for other
-- clients. Cross-side referrals were never a designed feature — a client who
-- "refers" freelancers is a growth-channel bug, not a growth channel, and the
-- reward tables were about to be filled with pairs that can never complete
-- each other's engagement condition (a client referee never completes a
-- freelancer contract, so their referral sits "pending" forever).
--
-- Enforced TWICE, because one gate is none:
--   1. process_referral           — record time. The code is rejected with a
--      plain-language error the UI already surfaces.
--   2. award_referral_bonus_...   — payout time. A referral recorded before
--      this migration, or by an account whose role later changed, expires
--      instead of paying.
--
-- Admin referrers are exempt (internal accounts testing both surfaces must be
-- able to seed either side); admin REFEREES are not special — they simply
-- match by role like everyone else.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Record time — process_referral ─────────────────────────────────────
-- Identical to 20270201000000's version plus the role gate. Signature and
-- grants are unchanged (CREATE OR REPLACE preserves existing privileges).
CREATE OR REPLACE FUNCTION public.process_referral(
  p_referral_code text,
  p_new_user_id uuid,
  p_new_user_email text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_code TEXT;
  v_referrer_role TEXT;
  v_referred_role TEXT;
  v_normalized TEXT := public.normalize_referral_code(p_referral_code);
BEGIN
  IF p_new_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_normalized = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No referral code provided');
  END IF;

  IF p_new_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user ID provided');
  END IF;

  SELECT pp.id, pp.referral_code, pr.role
    INTO v_referrer_id, v_referrer_code, v_referrer_role
  FROM public.profiles_private pp
  LEFT JOIN public.profiles pr ON pr.id = pp.id
  WHERE public.normalize_referral_code(pp.referral_code) = v_normalized
    AND pp.id != p_new_user_id
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  -- Same-side gate. Fail closed: an unresolvable role on either end rejects
  -- rather than recording a referral the payout gate would later expire.
  IF v_referrer_role IS DISTINCT FROM 'admin' THEN
    SELECT role INTO v_referred_role
      FROM public.profiles WHERE id = p_new_user_id;

    IF v_referrer_role IS NULL
       OR v_referred_role IS NULL
       OR v_referred_role != v_referrer_role THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',
        CASE
          WHEN v_referrer_role = 'freelancer'
            THEN 'This code belongs to a freelancer — freelancers can only refer other freelancers. Create a freelancer account to use it.'
          WHEN v_referrer_role = 'client'
            THEN 'This code belongs to a client — clients can only refer other clients. Create a client account to use it.'
          ELSE 'This referral code cannot be used with this account type.'
        END,
        'error_code', 'role_mismatch'
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referrer_id = v_referrer_id AND referred_user_id = p_new_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already referred');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, referred_email, referral_code, status, bonus_claimed)
  VALUES (v_referrer_id, p_new_user_id, p_new_user_email, v_referrer_code, 'pending', false);

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

-- ─── 2. Payout time — award_referral_bonus_if_eligible ─────────────────────
-- Same body as 20270129000000's version plus the re-check after the
-- already-awarded latch: pre-migration rows and role changes expire instead
-- of paying. The engagement condition, cap, fraud flags, notifications and
-- idempotency are byte-for-byte the same.
CREATE OR REPLACE FUNCTION public.award_referral_bonus_if_eligible(p_referred_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_referral public.referrals%ROWTYPE;
  v_eligible boolean := false;
  v_bonus constant integer := 10;
  v_cap constant integer := 20;
  v_paid_this_month integer;
  v_referrer_phone text;
  v_referee_phone text;
  v_shared_identity boolean := false;
  v_referrer_role text;
  v_referred_role text;
BEGIN
  IF p_referred_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'missing_user');
  END IF;

  SELECT * INTO v_referral
    FROM public.referrals
   WHERE referred_user_id = p_referred_user_id
   ORDER BY created_at DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_referral');
  END IF;

  IF COALESCE(v_referral.bonus_claimed, false) THEN
    RETURN jsonb_build_object('success', true, 'already_awarded', true, 'referral_id', v_referral.id);
  END IF;

  -- Same-side gate, re-checked at payout: a row recorded before this migration
  -- (or an account whose role changed since) must not pay. Admin referrers are
  -- exempt, matching process_referral. Expired is a terminal state in the
  -- CHECK constraint, so the row stops looking pending everywhere.
  SELECT referrer.role, referee.role
    INTO v_referrer_role, v_referred_role
    FROM public.profiles referrer
    LEFT JOIN public.profiles referee ON referee.id = p_referred_user_id
   WHERE referrer.id = v_referral.referrer_id;

  IF v_referrer_role IS DISTINCT FROM 'admin'
     AND (v_referrer_role IS NULL
          OR v_referred_role IS NULL
          OR v_referrer_role != v_referred_role) THEN
    UPDATE public.referrals
       SET status = 'expired'
     WHERE id = v_referral.id;

    RETURN jsonb_build_object(
      'success', false,
      'reason', 'role_mismatch',
      'referral_id', v_referral.id
    );
  END IF;

  -- Real engagement, whichever comes first: a completed contract as the
  -- freelancer, or a VERIFIED identity from a real provider. Development-mode
  -- and sandbox verdicts verify every submission instantly, so they are not
  -- engagement — without this guard one account could farm the monthly cap
  -- with throwaway signups. (profiles.kyc_verified_at is deliberately not a
  -- fallback: the sync trigger sets it for dev-mode verdicts too.)
  SELECT (
    EXISTS (
      SELECT 1 FROM public.contracts c
       WHERE c.freelancer_id = p_referred_user_id
         AND c.status = 'completed'
    ) OR EXISTS (
      SELECT 1 FROM public.identity_verifications iv
       WHERE iv.user_id = p_referred_user_id
         AND iv.status = 'verified'
         AND COALESCE(iv.verification_provider, 'manual') NOT IN ('dev_mode', 'dev-sandbox')
    )
  ) INTO v_eligible;

  IF NOT v_eligible THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  -- Mark completed once. bonus_claimed is the idempotency latch read above.
  UPDATE public.referrals
     SET status = 'completed',
         bonus_claimed = true,
         activated_at = COALESCE(activated_at, now())
   WHERE id = v_referral.id;

  UPDATE public.referral_stats
     SET valid_referrals = COALESCE(valid_referrals, 0) + 1,
         points = COALESCE(points, 0) + v_bonus,
         updated_at = now()
   WHERE user_id = v_referral.referrer_id;

  -- Soft duplicate signals — flag for a human, never auto-block. Two people
  -- in one household are legitimate; the same phone/document is not.
  SELECT pp.phone INTO v_referrer_phone
    FROM public.profiles_private pp WHERE pp.id = v_referral.referrer_id;
  SELECT pp.phone INTO v_referee_phone
    FROM public.profiles_private pp WHERE pp.id = p_referred_user_id;

  IF v_referrer_phone IS NOT NULL
     AND length(trim(v_referrer_phone)) > 0
     AND v_referrer_phone = v_referee_phone THEN
    INSERT INTO public.grow_coin_review_flags (user_id, kind, details)
    VALUES (v_referral.referrer_id, 'shared_phone',
            jsonb_build_object('referral_id', v_referral.id, 'referred_user_id', p_referred_user_id));
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.identity_verifications a
      JOIN public.identity_verifications b ON b.document_hash = a.document_hash
     WHERE a.user_id = v_referral.referrer_id
       AND b.user_id = p_referred_user_id
       AND a.document_hash IS NOT NULL
  ) INTO v_shared_identity;

  IF v_shared_identity THEN
    INSERT INTO public.grow_coin_review_flags (user_id, kind, details)
    VALUES (v_referral.referrer_id, 'shared_identity',
            jsonb_build_object('referral_id', v_referral.id, 'referred_user_id', p_referred_user_id));
  END IF;

  -- Monthly cap: the referral still counts on the leaderboard (it is marked
  -- completed above) but pays nothing and raises a review flag.
  SELECT count(*)::integer INTO v_paid_this_month
    FROM public.grow_coin_ledger
   WHERE user_id = v_referral.referrer_id
     AND reason = 'referral_bonus'
     AND created_at >= date_trunc('month', now());

  IF v_paid_this_month >= v_cap THEN
    INSERT INTO public.grow_coin_review_flags (user_id, kind, details)
    VALUES (v_referral.referrer_id, 'monthly_cap',
            jsonb_build_object('referral_id', v_referral.id, 'paid_this_month', v_paid_this_month, 'cap', v_cap));

    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (v_referral.referrer_id, 'system',
            'Referral counted (monthly bonus cap reached)',
            'A new referral completed its first project. It counts toward your leaderboard rank, but this month''s 10-coin bonus cap (20 bonuses) is already reached.',
            '/referrals',
            jsonb_build_object('referral_id', v_referral.id, 'capped', true));

    RETURN jsonb_build_object('success', true, 'capped', true, 'coins', 0, 'referral_id', v_referral.id);
  END IF;

  INSERT INTO public.grow_coin_ledger (user_id, amount, reason, reference_id, metadata)
  VALUES (v_referral.referrer_id, v_bonus, 'referral_bonus', v_referral.id,
          jsonb_build_object('referred_user_id', p_referred_user_id))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES (v_referral.referrer_id, 'system',
          'You earned 10 Grow Coins',
          'Your referral completed their first project. 10 Grow Coins (worth Rs 10) were added to your balance.',
          '/referrals',
          jsonb_build_object('referral_id', v_referral.id, 'coins', v_bonus));

  RETURN jsonb_build_object('success', true, 'capped', false, 'coins', v_bonus, 'referral_id', v_referral.id);
END;
$$;

-- Internal only: it takes an arbitrary user id, so it is never client-callable.
REVOKE ALL ON FUNCTION public.award_referral_bonus_if_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_referral_bonus_if_eligible(uuid) TO service_role;

-- ─── 3. Fail-closed assertions ─────────────────────────────────────────────
-- Verified against the LIVE catalog (not this file's text): the deploy refuses
-- to apply if either function lost its role gate after a later migration
-- rewrote it.
DO $same_side_guards$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'process_referral';

  IF v_def IS NULL OR v_def NOT LIKE '%v_referrer_role%' THEN
    RAISE EXCEPTION 'same-side referral migration failed its own assertions: process_referral lost its role gate';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'award_referral_bonus_if_eligible';

  IF v_def IS NULL OR v_def NOT LIKE '%role_mismatch%' THEN
    RAISE EXCEPTION 'same-side referral migration failed its own assertions: award_referral_bonus_if_eligible lost its payout-time role gate';
  END IF;
END;
$same_side_guards$;
