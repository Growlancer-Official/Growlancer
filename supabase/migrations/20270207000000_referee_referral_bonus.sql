-- ═══════════════════════════════════════════════════════════════════════════
-- 2027-02-07 — REFERRAL PAYS BOTH SIDES, IN REAL TIME
--
-- Until now a completed referral paid 10 coins to the REFERRER only; the
-- referred user (the referee) received nothing at that moment — their own
-- KYC / first-project milestone bonuses are separate, unrelated awards that
-- would have fired even with no referral involved.
--
-- This migration makes the referral criteria completion pay BOTH parties:
--   • referrer  — 10 coins, reason 'referral_bonus'      (unchanged)
--   • referee   — 10 coins, reason 'referee_referral_bonus' (new)
--
-- Real time is already guaranteed end to end and needs no new plumbing:
--   • the ledger row is written inside the same transaction as the award;
--   • `grow_coin_ledger` is in the supabase_realtime publication;
--   • `useGrowCoinBalance` subscribes to the user's own ledger rows and
--     re-reads the RPC balance on every event, so both users' balance pills
--     move the moment the criteria completes — no refresh.
--
-- Anti-abuse properties kept:
--   • server-only (REVOKE from PUBLIC/anon/authenticated) — a browser can
--     never invoke it for an arbitrary user;
--   • `bonus_claimed` latch + `FOR UPDATE` row lock — exactly one payout per
--     referral, no matter how often the trigger fires;
--   • one ledger row per referee per referral (new partial unique index) so a
--     retry can never double-pay;
--   • the referee's award does NOT touch the referrer's 20/month cap and is
--     never counted by it (different user_id, different reason).
--
-- The whole function body below is the definition from
-- 20270204000000_same_role_referrals.sql (the latest one) with only the
-- referee award added, so every earlier guard survives: same-side role gate,
-- real-engagement gate (verified provider, never dev_mode/dev-sandbox),
-- soft fraud flags, monthly cap, notifications and idempotency.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Allow the new ledger reason ─────────────────────────────────────────
-- The CHECK constraint is widened by exactly one value; no existing reason is
-- removed, so no historical row can ever violate it.
ALTER TABLE public.grow_coin_ledger DROP CONSTRAINT IF EXISTS grow_coin_ledger_reason_check;
ALTER TABLE public.grow_coin_ledger
  ADD CONSTRAINT grow_coin_ledger_reason_check
  CHECK (reason = ANY (ARRAY[
    'referral_bonus',
    'referee_referral_bonus',
    'kyc_bonus',
    'first_project_bonus',
    'redemption_premium',
    'redemption_project_discount',
    'withdrawal',
    'admin_adjustment'
  ]::text[]));

-- One referee payout per referral row, no matter how many times the trigger
-- fires or how the RPC is retried.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grow_coin_referee_bonus_per_referral
  ON public.grow_coin_ledger (user_id, reference_id)
  WHERE reason = 'referee_referral_bonus' AND reference_id IS NOT NULL;

-- ─── 2. Award both sides ────────────────────────────────────────────────────
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
  v_referee_bonus constant integer := 10;
  v_cap constant integer := 20;
  v_paid_this_month integer;
  v_referrer_phone text;
  v_referee_phone text;
  v_shared_identity boolean := false;
  v_referrer_role text;
  v_referred_role text;
  v_referee_paid integer := 0;
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

  -- ── The referee is paid here, in the same transaction ────────────────────
  -- The referred user did the work that completed the criteria, so they earn
  -- the same 10 coins at the same instant. ON CONFLICT DO NOTHING against the
  -- partial unique index makes a trigger retry a no-op.
  INSERT INTO public.grow_coin_ledger (user_id, amount, reason, reference_id, metadata)
  VALUES (
    p_referred_user_id,
    v_referee_bonus,
    'referee_referral_bonus',
    v_referral.id,
    jsonb_build_object(
      'referrer_id', v_referral.referrer_id,
      'referral_id', v_referral.id
    )
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_referee_paid = ROW_COUNT;

  IF v_referee_paid > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      p_referred_user_id,
      'system',
      'You earned 10 Grow Coins',
      'Your referral milestone is complete. 10 Grow Coins (worth Rs 10) were added to your balance.',
      CASE WHEN v_referred_role = 'client' THEN '/client/referrals' ELSE '/referrals' END,
      jsonb_build_object('referral_id', v_referral.id, 'coins', v_referee_bonus, 'side', 'referee')
    );
  END IF;

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
    SELECT 1
      FROM public.identity_verifications a
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
  -- completed above) but the REFERRER pays nothing and a review flag is raised.
  -- It never touches the referee's award above — that is theirs, already paid.
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
            'A new referral completed their first project. It counts toward your leaderboard rank, but this month''s 10-coin bonus cap (20 bonuses) is already reached.',
            '/referrals',
            jsonb_build_object('referral_id', v_referral.id, 'capped', true));

    RETURN jsonb_build_object(
      'success', true, 'capped', true, 'coins', 0,
      'referee_coins', v_referee_bonus,
      'referral_id', v_referral.id
    );
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

  RETURN jsonb_build_object(
    'success', true, 'capped', false, 'coins', v_bonus,
    'referee_coins', v_referee_bonus,
    'referral_id', v_referral.id
  );
END;
$$;

-- Internal only: it takes an arbitrary user id, so it is never client-callable.
REVOKE ALL ON FUNCTION public.award_referral_bonus_if_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_referral_bonus_if_eligible(uuid) TO service_role;

-- ─── 3. Fail-closed assertions (verified against the LIVE catalog) ──────────
-- The deploy refuses to apply if a later rewrite loses the role gate, the
-- real-provider engagement gate or the referee award this migration exists for.
DO $referee_award_guards$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'award_referral_bonus_if_eligible';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'referee referral migration failed its own assertions: award_referral_bonus_if_eligible is missing';
  END IF;

  IF v_def NOT LIKE '%role_mismatch%' THEN
    RAISE EXCEPTION 'referee referral migration failed its own assertions: award_referral_bonus_if_eligible lost its payout-time role gate';
  END IF;

  IF v_def NOT LIKE '%dev-sandbox%' THEN
    RAISE EXCEPTION 'referee referral migration failed its own assertions: award_referral_bonus_if_eligible lost its real-provider engagement gate';
  END IF;

  IF v_def NOT LIKE '%referee_referral_bonus%' THEN
    RAISE EXCEPTION 'referee referral migration failed its own assertions: the referee is no longer paid';
  END IF;
END;
$referee_award_guards$;
