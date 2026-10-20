-- ============================================================================
-- GROW COIN — referral rewards (ledger-based, no raw balance column)
--
-- Model (agreed with the founder):
--   • 1 Grow Coin = 1 INR, integer coins only.
--   • A referral pays 10 coins to the referrer only after the referred user
--     reaches REAL engagement: their first completed contract (as freelancer)
--     OR a verified KYC — whichever happens first. Signup alone never pays,
--     which is what makes fake-account farming financially pointless.
--   • Milestone bonuses (agreed with the founder, 2026-10-20): every user
--     earns 10 coins on VERIFIED KYC (real provider only — dev-mode and
--     sandbox verdicts pay nothing) and 20 coins on their first completed
--     project, as freelancer or as client. Each milestone pays exactly once
--     per user (partial unique indexes below), and none of them is capped.
--   • The balance is NEVER a column. It is always SUM(amount) over the ledger,
--     the same rule the wallet learned after the balance-column bug.
--   • Freelancer: redeem >= 100 coins (cash via the hardened wallet pipeline,
--     or a month of Premium at the plan price). Client: >= 100 coins as a
--     discount on a contract/service payment.
--   • Ranking, matching and visibility never read coins. This feature is
--     money/reward only and cannot influence merit-based discovery.
--
-- Anti-fraud:
--   • Idempotent award (partial unique index + bonus_claimed flag).
--   • Hard monthly cap of 20 paid bonuses per referrer; capped referrals are
--     still marked completed for the leaderboard, but pay 0 coins and raise a
--     review flag.
--   • Soft duplicate signals (shared phone, shared KYC document hash) raise a
--     review flag for a human — they never auto-block, because genuine
--     households exist.
--   • Client discounts are reserved at order creation and only converted into
--     a ledger debit when the payment is captured, so the same coins cannot
--     pay two orders and a failed payment never debits anything.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grow_coin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL,
  reference_id uuid,
  -- Optional caller-supplied key so a double-tapped redemption is a no-op
  -- instead of a second debit (Security Principle 9c: idempotency guard).
  idempotency_key uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grow_coin_ledger_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT grow_coin_ledger_reason_check CHECK (
    reason = ANY (ARRAY[
      'referral_bonus',
      'kyc_bonus',
      'first_project_bonus',
      'redemption_premium',
      'redemption_project_discount',
      'withdrawal',
      'admin_adjustment'
    ]::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_grow_coin_ledger_user_created
  ON public.grow_coin_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grow_coin_ledger_reason
  ON public.grow_coin_ledger (reason);

-- One bonus per referral row, no matter how many times the trigger fires.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grow_coin_bonus_per_referral
  ON public.grow_coin_ledger (user_id, reference_id)
  WHERE reason = 'referral_bonus' AND reference_id IS NOT NULL;

-- One ledger row per idempotency key per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grow_coin_idempotency
  ON public.grow_coin_ledger (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Milestone bonuses pay exactly once per user, no matter how many times a
-- trigger or retry fires. ON CONFLICT DO NOTHING in the award RPCs relies on
-- these to be race-safe without a lock.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grow_coin_kyc_bonus_per_user
  ON public.grow_coin_ledger (user_id)
  WHERE reason = 'kyc_bonus';

CREATE UNIQUE INDEX IF NOT EXISTS uq_grow_coin_first_project_per_user
  ON public.grow_coin_ledger (user_id)
  WHERE reason = 'first_project_bonus';

-- Coins held for an unpaid order. A hold is not a ledger debit: it only
-- reduces AVAILABLE balance until the payment is captured (redeemed) or the
-- hold expires (released on read).
CREATE TABLE IF NOT EXISTS public.grow_coin_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.razorpay_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coins integer NOT NULL CHECK (coins > 0),
  status text NOT NULL DEFAULT 'held',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grow_coin_reservations_status_check
    CHECK (status = ANY (ARRAY['held', 'redeemed', 'released']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_grow_coin_reservations_user_status
  ON public.grow_coin_reservations (user_id, status);

-- Manual-review queue (cap overflow, shared-signal referrals). Never exposed
-- to end users; the admin console reads it through the service role.
CREATE TABLE IF NOT EXISTS public.grow_coin_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grow_coin_review_flags_kind_check CHECK (
    kind = ANY (ARRAY['monthly_cap', 'shared_phone', 'shared_identity', 'redemption_shortfall']::text[])
  ),
  CONSTRAINT grow_coin_review_flags_status_check
    CHECK (status = ANY (ARRAY['open', 'reviewed', 'dismissed']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_grow_coin_review_flags_status
  ON public.grow_coin_review_flags (status, created_at DESC);

-- Manual ledger entries (goodwill, correction) are a real reason value; the
-- financial ledger already allows a few sources, so widen it by one.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_source_check
  CHECK (source = ANY (ARRAY[
    'escrow'::text, 'withdrawal'::text, 'deposit'::text, 'refund'::text,
    'platform_fee'::text, 'subscription'::text, 'grow_coin'::text
  ]));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RLS + grants — readers only, and only their own rows
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.grow_coin_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grow_coin_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grow_coin_review_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own grow coin ledger" ON public.grow_coin_ledger;
CREATE POLICY "Users can read their own grow coin ledger"
  ON public.grow_coin_ledger FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies exist on purpose: every row is written by
-- a SECURITY DEFINER RPC, never by a browser. Reservations and review flags
-- have no client policy at all (server-only).
REVOKE ALL ON TABLE public.grow_coin_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.grow_coin_ledger TO authenticated;

REVOKE ALL ON TABLE public.grow_coin_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.grow_coin_review_flags FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.grow_coin_ledger TO service_role;
GRANT ALL ON TABLE public.grow_coin_reservations TO service_role;
GRANT ALL ON TABLE public.grow_coin_review_flags TO service_role;

-- Realtime: a bonus should update the user's own balance pill without a
-- refresh. RLS still applies to the streamed rows (own rows only).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'grow_coin_ledger'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.grow_coin_ledger;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Internal helpers
-- ────────────────────────────────────────────────────────────────────────────

-- Live holds only. An expired hold stops reducing the balance immediately, so
-- a user is never locked out of their own coins by an abandoned checkout.
CREATE OR REPLACE FUNCTION public.grow_coin_reserved_amount(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(SUM(r.coins), 0)::integer
    FROM public.grow_coin_reservations r
   WHERE r.user_id = p_user_id
     AND r.status = 'held'
     AND r.expires_at > now();
$$;

REVOKE ALL ON FUNCTION public.grow_coin_reserved_amount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grow_coin_reserved_amount(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Balance (own coins only)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_grow_coin_balance(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
  v_balance integer;
  v_reserved integer;
  v_earned integer;
  v_redeemed integer;
  v_withdrawn integer;
  v_this_month integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  v_target := COALESCE(p_user_id, v_caller);
  IF v_target <> v_caller THEN
    -- Coins are private: nobody reads somebody else's balance.
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Release holds that already expired (lazy cleanup, no cron needed).
  UPDATE public.grow_coin_reservations
     SET status = 'released', updated_at = now()
   WHERE user_id = v_target AND status = 'held' AND expires_at <= now();

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_balance
    FROM public.grow_coin_ledger WHERE user_id = v_target;

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_earned
    FROM public.grow_coin_ledger WHERE user_id = v_target AND amount > 0;

  SELECT COALESCE(SUM(ABS(amount)), 0)::integer INTO v_redeemed
    FROM public.grow_coin_ledger
   WHERE user_id = v_target
     AND amount < 0
     AND reason IN ('redemption_premium', 'redemption_project_discount');

  SELECT COALESCE(SUM(ABS(amount)), 0)::integer INTO v_withdrawn
    FROM public.grow_coin_ledger
   WHERE user_id = v_target AND amount < 0 AND reason = 'withdrawal';

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_this_month
    FROM public.grow_coin_ledger
   WHERE user_id = v_target
     AND reason = 'referral_bonus'
     AND created_at >= date_trunc('month', now());

  v_reserved := public.grow_coin_reserved_amount(v_target);

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance,
    'reserved', v_reserved,
    'available', GREATEST(v_balance - v_reserved, 0),
    'lifetime_earned', v_earned,
    'redeemed', v_redeemed,
    'withdrawn', v_withdrawn,
    'earned_this_month', v_this_month,
    'monthly_cap', 20
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_grow_coin_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_grow_coin_balance(uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Earning — one bonus per referral, only after real engagement
-- ────────────────────────────────────────────────────────────────────────────
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
    VALUES (
      v_referral.referrer_id,
      'shared_phone',
      jsonb_build_object('referral_id', v_referral.id, 'referred_user_id', p_referred_user_id)
    );
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
    VALUES (
      v_referral.referrer_id,
      'shared_identity',
      jsonb_build_object('referral_id', v_referral.id, 'referred_user_id', p_referred_user_id)
    );
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
    VALUES (
      v_referral.referrer_id,
      'monthly_cap',
      jsonb_build_object('referral_id', v_referral.id, 'paid_this_month', v_paid_this_month, 'cap', v_cap)
    );

    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      v_referral.referrer_id,
      'system',
      'Referral counted (monthly bonus cap reached)',
      'A new referral completed its first project. It counts toward your leaderboard rank, but this month''s 10-coin bonus cap (20 bonuses) is already reached.',
      '/referrals',
      jsonb_build_object('referral_id', v_referral.id, 'capped', true)
    );

    RETURN jsonb_build_object(
      'success', true, 'capped', true, 'coins', 0, 'referral_id', v_referral.id
    );
  END IF;

  INSERT INTO public.grow_coin_ledger (user_id, amount, reason, reference_id, metadata)
  VALUES (
    v_referral.referrer_id,
    v_bonus,
    'referral_bonus',
    v_referral.id,
    jsonb_build_object('referred_user_id', p_referred_user_id)
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES (
    v_referral.referrer_id,
    'system',
    'You earned 10 Grow Coins',
    'Your referral completed their first project. 10 Grow Coins (worth Rs 10) were added to your balance.',
    '/referrals',
    jsonb_build_object('referral_id', v_referral.id, 'coins', v_bonus)
  );

  RETURN jsonb_build_object('success', true, 'capped', false, 'coins', v_bonus, 'referral_id', v_referral.id);
END;
$$;

-- Internal only: it takes an arbitrary user id, so it is never client-callable.
REVOKE ALL ON FUNCTION public.award_referral_bonus_if_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_referral_bonus_if_eligible(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5b. Milestone bonuses — KYC = 10 coins, first completed project = 20 coins
--     (agreed with the founder, 2026-10-20). Each pays once per user; neither
--     is monthly-capped. Both are server-only (they take an arbitrary user id).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.award_kyc_bonus_if_eligible(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_bonus constant integer := 10;
  v_already boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'missing_user');
  END IF;

  -- Fast idempotency check (the partial unique index is the real guard).
  SELECT EXISTS (
    SELECT 1 FROM public.grow_coin_ledger
     WHERE user_id = p_user_id AND reason = 'kyc_bonus'
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'already_awarded', true, 'coins', 0);
  END IF;

  -- Real-provider verification only. Dev-mode and sandbox verdicts verify
  -- instantly and would make this a free-coin tap for throwaway accounts.
  IF NOT EXISTS (
    SELECT 1 FROM public.identity_verifications iv
     WHERE iv.user_id = p_user_id
       AND iv.status = 'verified'
       AND COALESCE(iv.verification_provider, 'manual') NOT IN ('dev_mode', 'dev-sandbox')
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  INSERT INTO public.grow_coin_ledger (user_id, amount, reason, metadata)
  VALUES (p_user_id, v_bonus, 'kyc_bonus', jsonb_build_object('milestone', 'kyc'))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES (
    p_user_id, 'system', 'You earned 10 Grow Coins',
    'Your identity verification is complete. 10 Grow Coins (worth Rs 10) were added to your balance.',
    '/referrals',
    jsonb_build_object('coins', v_bonus, 'milestone', 'kyc')
  );

  RETURN jsonb_build_object('success', true, 'coins', v_bonus);
END;
$$;

REVOKE ALL ON FUNCTION public.award_kyc_bonus_if_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_kyc_bonus_if_eligible(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.award_first_project_bonus_if_eligible(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_bonus constant integer := 20;
  v_already boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'missing_user');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.grow_coin_ledger
     WHERE user_id = p_user_id AND reason = 'first_project_bonus'
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'already_awarded', true, 'coins', 0);
  END IF;

  -- First project counts on either side of the contract: the founder's rule is
  -- "freelancer ka pehla project … same for clients".
  IF NOT EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.status = 'completed'
       AND (c.freelancer_id = p_user_id OR c.client_id = p_user_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_eligible');
  END IF;

  INSERT INTO public.grow_coin_ledger (user_id, amount, reason, metadata)
  VALUES (
    p_user_id, v_bonus, 'first_project_bonus',
    jsonb_build_object('milestone', 'first_project')
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES (
    p_user_id, 'system', 'You earned 20 Grow Coins',
    'Your first project on Growlancer is complete. 20 Grow Coins (worth Rs 20) were added to your balance.',
    '/referrals',
    jsonb_build_object('coins', v_bonus, 'milestone', 'first_project')
  );

  RETURN jsonb_build_object('success', true, 'coins', v_bonus);
END;
$$;

REVOKE ALL ON FUNCTION public.award_first_project_bonus_if_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_first_project_bonus_if_eligible(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Trigger points — contract completion and KYC verification
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grow_coin_award_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid;
  v_second_user_id uuid := NULL;
BEGIN
  IF TG_TABLE_NAME = 'contracts' THEN
    -- Referral bonus keys off the freelancer; the 20-coin first-project
    -- milestone belongs to BOTH sides of the contract.
    v_user_id := NEW.freelancer_id;
    v_second_user_id := NEW.client_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  -- Each award runs in its own guard block: one failure must never block the
  -- others, and none may roll back the contract completion or the verification.
  -- Loud, not silent: every failure is recorded in the Postgres log.
  BEGIN
    PERFORM public.award_referral_bonus_if_eligible(v_user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'grow_coin: referral award failed for % (%): %', v_user_id, SQLSTATE, SQLERRM;
  END;

  BEGIN
    PERFORM public.award_kyc_bonus_if_eligible(v_user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'grow_coin: KYC bonus failed for % (%): %', v_user_id, SQLSTATE, SQLERRM;
  END;

  BEGIN
    PERFORM public.award_first_project_bonus_if_eligible(v_user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'grow_coin: first-project bonus failed for % (%): %', v_user_id, SQLSTATE, SQLERRM;
  END;

  IF v_second_user_id IS NOT NULL AND v_second_user_id <> v_user_id THEN
    BEGIN
      PERFORM public.award_first_project_bonus_if_eligible(v_second_user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'grow_coin: first-project bonus failed for % (%): %', v_second_user_id, SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grow_coin_award_trigger_fn() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grow_coin_award_trigger_fn() TO service_role;

DROP TRIGGER IF EXISTS trg_grow_coin_award_on_contract_complete ON public.contracts;
CREATE TRIGGER trg_grow_coin_award_on_contract_complete
  AFTER UPDATE OF status ON public.contracts
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.grow_coin_award_trigger_fn();

DROP TRIGGER IF EXISTS trg_grow_coin_award_on_kyc_verified ON public.identity_verifications;
-- WHEN may only reference NEW/OLD, never TG_OP (that variable exists inside
-- the trigger function, not in the trigger's WHEN expression). Firing on any
-- update of a verified row is safe because the award RPC is idempotent.
CREATE TRIGGER trg_grow_coin_award_on_kyc_verified
  AFTER INSERT OR UPDATE ON public.identity_verifications
  FOR EACH ROW
  WHEN (NEW.status = 'verified')
  EXECUTE FUNCTION public.grow_coin_award_trigger_fn();

-- The legacy complete_referral marked bonuses claimed WITHOUT paying coins —
-- that would permanently block the real award. It now delegates to the award
-- RPC and is server-only (it takes an arbitrary user id).
CREATE OR REPLACE FUNCTION public.complete_referral(p_referee_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN public.award_referral_bonus_if_eligible(p_referee_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_referral(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_referral(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Freelancer redemption — cash (through the existing wallet pipeline)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_grow_coins_for_cash(
  p_amount_coins integer,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_min constant integer := 100;
  v_balance integer;
  v_reserved integer;
  v_existing public.grow_coin_ledger%ROWTYPE;
  v_wallet jsonb;
  v_wallet_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- The agreed model gives cash/Premium redemption to freelancers; a client's
  -- coins are a checkout discount only (Section 3 vs Section 4 of the spec).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_user_id AND role IN ('freelancer', 'admin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cash redemption is for freelancers. Use your Grow Coins as a discount at checkout instead.'
    );
  END IF;

  IF p_amount_coins IS NULL OR p_amount_coins < v_min THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum redemption is 100 Grow Coins', 'minimum', v_min);
  END IF;

  -- Serialize per user: ledger sum + reservation check must not race.
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.grow_coin_ledger
     WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true, 'already_processed', true,
        'coins', ABS(v_existing.amount), 'credited_inr', ABS(v_existing.amount)
      );
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_balance
    FROM public.grow_coin_ledger WHERE user_id = v_user_id;
  v_reserved := public.grow_coin_reserved_amount(v_user_id);

  IF v_balance - v_reserved < p_amount_coins THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient Grow Coins',
      'balance', v_balance,
      'reserved', v_reserved,
      'available', GREATEST(v_balance - v_reserved, 0)
    );
  END IF;

  INSERT INTO public.grow_coin_ledger (
    user_id, amount, reason, reference_id, idempotency_key, metadata
  ) VALUES (
    v_user_id, -p_amount_coins, 'withdrawal', NULL, p_idempotency_key,
    jsonb_build_object('rate_inr_per_coin', 1)
  );

  -- Credit the wallet through the existing, hardened money RPC. Coins are
  -- debited in the same transaction, so the credit can never happen without
  -- the debit (and a failure rolls both back).
  v_wallet := public.update_wallet_balance(v_user_id, p_amount_coins);

  IF NOT COALESCE((v_wallet->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Grow Coin wallet credit failed: %', COALESCE(v_wallet->>'error', 'unknown');
  END IF;

  v_wallet_balance := (v_wallet->>'balance')::numeric;

  INSERT INTO public.transactions (user_id, amount, type, source, status, description, currency, metadata)
  VALUES (
    v_user_id, p_amount_coins, 'credit', 'grow_coin', 'completed',
    'Grow Coin redemption (' || p_amount_coins || ' coins)',
    'INR',
    jsonb_build_object('coins', p_amount_coins, 'rate_inr_per_coin', 1)
  );

  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES (
    v_user_id, 'payout', 'Grow Coins redeemed',
    p_amount_coins || ' Grow Coins were converted to Rs ' || p_amount_coins ||
      ' in your wallet. You can withdraw it using your normal payout method.',
    '/dashboard/wallet',
    jsonb_build_object('coins', p_amount_coins)
  );

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_balance
    FROM public.grow_coin_ledger WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'coins', p_amount_coins,
    'credited_inr', p_amount_coins,
    'balance', v_balance,
    'wallet_balance', v_wallet_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_grow_coins_for_cash(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_grow_coins_for_cash(integer, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Freelancer redemption — Premium (same state the paid path produces)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_grow_coins_for_premium(p_idempotency_key uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plans%ROWTYPE;
  v_cost integer;
  v_balance integer;
  v_reserved integer;
  v_existing public.grow_coin_ledger%ROWTYPE;
  v_sub_id uuid;
  v_end timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_user_id AND role IN ('freelancer', 'admin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Premium redemption is for freelancers. Use your Grow Coins as a discount at checkout instead.'
    );
  END IF;

  SELECT * INTO v_plan
    FROM public.subscription_plans
   WHERE id = 'premium_monthly' AND is_active = true;

  IF NOT FOUND OR COALESCE(v_plan.price, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Premium plan is not available');
  END IF;

  -- 1 coin = Rs 1, so a month costs the plan price in coins.
  v_cost := CEIL(v_plan.price)::integer;

  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.grow_coin_ledger
     WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true, 'already_processed', true, 'coins', ABS(v_existing.amount)
      );
    END IF;
  END IF;

  -- Already paying for Premium? Refuse rather than stack months silently.
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.user_id = v_user_id
       AND s.status IN ('active', 'trial')
       AND COALESCE(s.subscription_end_date, s.expiry_date) > now()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have an active Premium subscription');
  END IF;

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_balance
    FROM public.grow_coin_ledger WHERE user_id = v_user_id;
  v_reserved := public.grow_coin_reserved_amount(v_user_id);

  IF v_balance - v_reserved < v_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient Grow Coins',
      'required', v_cost,
      'available', GREATEST(v_balance - v_reserved, 0)
    );
  END IF;

  INSERT INTO public.grow_coin_ledger (
    user_id, amount, reason, reference_id, idempotency_key, metadata
  ) VALUES (
    v_user_id, -v_cost, 'redemption_premium', NULL, p_idempotency_key,
    jsonb_build_object('plan_id', v_plan.id, 'coins_per_inr', 1)
  );

  -- Same internal markers the paying paths set, so the subscription and
  -- profile guards treat a coin-paid Premium exactly like a paid one.
  PERFORM set_config('app.subscription_internal_write', 'internal', true);
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.subscriptions
     SET status = 'cancelled', cancel_at_period_end = true, updated_at = now()
   WHERE user_id = v_user_id AND status IN ('active', 'trial');

  v_end := now() + interval '1 month';

  -- `subscriptions` carries UNIQUE (user_id, plan_id) and every freelancer who
  -- ever trialled or paid already has a premium_monthly row, so a plain INSERT
  -- raises 23505 for exactly the users most likely to redeem. Upsert on that
  -- key, the same way create_user_subscription() does.
  INSERT INTO public.subscriptions (
    user_id, plan_id, plan, status, payment_provider,
    subscription_start_date, subscription_end_date, expiry_date,
    cancel_at_period_end, updated_at
  ) VALUES (
    v_user_id, v_plan.id, 'pro', 'active', 'grow_coins',
    now(), v_end, v_end, false, now()
  )
  ON CONFLICT (user_id, plan_id) DO UPDATE SET
    status = 'active',
    plan = 'pro',
    payment_provider = 'grow_coins',
    subscription_start_date = now(),
    subscription_end_date = v_end,
    expiry_date = v_end,
    cancel_at_period_end = false,
    updated_at = now()
  RETURNING id INTO v_sub_id;

  UPDATE public.profiles SET is_pro = true WHERE id = v_user_id;

  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES (
    v_user_id, 'system', 'Premium unlocked with Grow Coins',
    'Your Grow Coins paid for one month of Premium. It is active until ' ||
      to_char(v_end, 'DD Mon YYYY') || '.',
    '/pro',
    jsonb_build_object('coins', v_cost, 'subscription_id', v_sub_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'coins', v_cost,
    'subscription_id', v_sub_id,
    'expires_at', v_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_grow_coins_for_premium(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_grow_coins_for_premium(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Client redemption — reserve on order creation, debit on capture only
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reserve_grow_coins_for_order(
  p_order_id uuid,
  p_user_id uuid,
  p_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_min constant integer := 100;
  v_balance integer;
  v_reserved integer;
  v_order_user uuid;
  v_existing public.grow_coin_reservations%ROWTYPE;
BEGIN
  IF NOT public.is_service_role_context() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_order_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing order or user');
  END IF;
  IF p_coins IS NULL OR p_coins < v_min THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum is 100 Grow Coins', 'minimum', v_min);
  END IF;

  SELECT user_id INTO v_order_user FROM public.razorpay_orders WHERE id = p_order_id;
  IF v_order_user IS NULL OR v_order_user <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  SELECT * INTO v_existing
    FROM public.grow_coin_reservations
   WHERE order_id = p_order_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true, 'already_reserved', true, 'coins', v_existing.coins,
      'discount_inr', v_existing.coins
    );
  END IF;

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_balance
    FROM public.grow_coin_ledger WHERE user_id = p_user_id;
  v_reserved := public.grow_coin_reserved_amount(p_user_id);

  IF v_balance - v_reserved < p_coins THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient Grow Coins',
      'available', GREATEST(v_balance - v_reserved, 0)
    );
  END IF;

  INSERT INTO public.grow_coin_reservations (order_id, user_id, coins)
  VALUES (p_order_id, p_user_id, p_coins);

  RETURN jsonb_build_object(
    'success', true, 'coins', p_coins, 'discount_inr', p_coins, 'expires_in_minutes', 30
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_grow_coins_for_order(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_grow_coins_for_order(uuid, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_reserved_grow_coins(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_res public.grow_coin_reservations%ROWTYPE;
  v_balance integer;
BEGIN
  IF NOT public.is_service_role_context() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_res
    FROM public.grow_coin_reservations
   WHERE order_id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'redeemed', false, 'reason', 'no_reservation');
  END IF;

  IF v_res.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', true, 'redeemed', true, 'already_redeemed', true, 'coins', v_res.coins);
  END IF;
  IF v_res.status = 'released' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation was released');
  END IF;

  -- A hold that expired while the user was still on the checkout page stops
  -- reducing the AVAILABLE balance, so those coins could already be held by a
  -- second order. The payment really happened, so redeem it — but never past
  -- the ledger sum: that would create a negative balance and discount money the
  -- user never had. The caller records a review flag on this refusal.
  PERFORM 1 FROM public.profiles WHERE id = v_res.user_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0)::integer INTO v_balance
    FROM public.grow_coin_ledger WHERE user_id = v_res.user_id;

  IF v_balance < v_res.coins THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Grow Coin balance no longer covers this order',
      'balance', v_balance,
      'coins', v_res.coins
    );
  END IF;

  INSERT INTO public.grow_coin_ledger (user_id, amount, reason, reference_id, metadata)
  VALUES (
    v_res.user_id, -v_res.coins, 'redemption_project_discount', p_order_id,
    jsonb_build_object('rate_inr_per_coin', 1)
  );

  UPDATE public.grow_coin_reservations
     SET status = 'redeemed', updated_at = now()
   WHERE id = v_res.id;

  RETURN jsonb_build_object('success', true, 'redeemed', true, 'coins', v_res.coins);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reserved_grow_coins(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_reserved_grow_coins(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_grow_coin_reservation(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_service_role_context() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.grow_coin_reservations
     SET status = 'released', updated_at = now()
   WHERE order_id = p_order_id AND status = 'held';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'released', v_count > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.release_grow_coin_reservation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_grow_coin_reservation(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Public leaderboard — name + avatar + count, never email/phone/balance
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_grow_coin_leaderboard(p_limit integer DEFAULT 20)
RETURNS TABLE (
  rank integer,
  display_name text,
  avatar text,
  referrals integer,
  is_self boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  -- Counts COMPLETED referrals, not paid ledger rows: when the 20/month bonus
  -- cap is reached the referral still sets bonus_claimed (it is real, verified
  -- engagement) but pays 0 coins — it must still rank on the leaderboard.
  WITH counts AS (
    SELECT r.referrer_id AS user_id, COUNT(*)::integer AS referrals
      FROM public.referrals r
     WHERE COALESCE(r.bonus_claimed, false) = true
     GROUP BY r.referrer_id
  ), ranked AS (
    SELECT
      c.user_id,
      c.referrals,
      ROW_NUMBER() OVER (ORDER BY c.referrals DESC, c.user_id)::integer AS rnk
    FROM counts c
    JOIN public.profiles p ON p.id = c.user_id
    WHERE p.deleted_at IS NULL
      AND COALESCE(trim(p.name), '') <> ''
  )
  SELECT
    r.rnk AS rank,
    COALESCE(NULLIF(trim(p.name), ''), 'Growlancer member') AS display_name,
    p.avatar AS avatar,
    r.referrals,
    (auth.uid() IS NOT NULL AND auth.uid() = r.user_id) AS is_self
  FROM ranked r
  JOIN public.profiles p ON p.id = r.user_id
  ORDER BY r.rnk
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_grow_coin_leaderboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_grow_coin_leaderboard(integer) TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. Admin adjustment + review-flag queue (server-verified admin only)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_adjust_grow_coins(
  p_user_id uuid,
  p_amount integer,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_balance integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT (pp.is_admin = true OR p.role = 'admin') INTO v_is_admin
    FROM public.profiles p
    LEFT JOIN public.profiles_private pp ON pp.id = p.id
   WHERE p.id = v_caller;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be non-zero');
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT COALESCE(SUM(amount), 0)::integer INTO v_balance
    FROM public.grow_coin_ledger WHERE user_id = p_user_id;

  IF p_amount < 0 AND v_balance + p_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment would make the balance negative');
  END IF;

  INSERT INTO public.grow_coin_ledger (user_id, amount, reason, metadata)
  VALUES (
    p_user_id, p_amount, 'admin_adjustment',
    jsonb_build_object('admin_id', v_caller, 'note', COALESCE(p_note, ''))
  );

  RETURN jsonb_build_object('success', true, 'amount', p_amount, 'balance', v_balance + p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_grow_coins(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_grow_coins(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_grow_coin_flags(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  kind text,
  details jsonb,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT (pp.is_admin = true OR p.role = 'admin') INTO v_is_admin
    FROM public.profiles p
    LEFT JOIN public.profiles_private pp ON pp.id = p.id
   WHERE p.id = v_caller;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Unauthorized: admins only';
  END IF;

  RETURN QUERY
    SELECT f.id, f.user_id, f.kind, f.details, f.status, f.created_at
      FROM public.grow_coin_review_flags f
     ORDER BY f.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_grow_coin_flags(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_grow_coin_flags(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────────
-- 12. Fail-closed assertions — the deploy stops if a guard above is missing
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad text[] := ARRAY[]::text[];
  v_fn  oid;
  v_def text;
BEGIN
  -- Ledger is the only source of truth: no balance column anywhere.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'grow_coin_ledger'
       AND column_name IN ('balance', 'current_balance', 'coins')
  ) THEN
    v_bad := v_bad || 'grow_coin_ledger must not carry a balance column'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'grow_coin_ledger' AND relnamespace = 'public'::regnamespace AND relrowsecurity
  ) THEN
    v_bad := v_bad || 'RLS is not enabled on grow_coin_ledger'::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'grow_coin_ledger'
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    v_bad := v_bad || 'grow_coin_ledger must have no client write policy'::text;
  END IF;

  IF has_table_privilege('anon', 'public.grow_coin_ledger', 'SELECT')
     OR has_table_privilege('anon', 'public.grow_coin_ledger', 'INSERT')
     OR has_table_privilege('authenticated', 'public.grow_coin_ledger', 'INSERT')
     OR has_table_privilege('authenticated', 'public.grow_coin_ledger', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.grow_coin_ledger', 'DELETE') THEN
    v_bad := v_bad || 'ledger table grants are too wide'::text;
  END IF;

  IF has_table_privilege('authenticated', 'public.grow_coin_reservations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.grow_coin_review_flags', 'SELECT') THEN
    v_bad := v_bad || 'server-only coin tables are readable by clients'::text;
  END IF;

  -- Award RPC must never be client-callable; it takes an arbitrary user id.
  SELECT p.oid INTO v_fn FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'award_referral_bonus_if_eligible';
  IF v_fn IS NULL THEN
    v_bad := v_bad || 'award_referral_bonus_if_eligible is missing'::text;
  ELSIF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    v_bad := v_bad || 'award_referral_bonus_if_eligible is client-callable'::text;
  END IF;

  -- Milestone award RPCs take an arbitrary user id: server-only, and they must
  -- exclude dev-mode/sandbox verdicts (otherwise KYC = free coins for bots).
  FOREACH v_def IN ARRAY ARRAY['award_kyc_bonus_if_eligible', 'award_first_project_bonus_if_eligible']
  LOOP
    SELECT p.oid INTO v_fn FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_def;
    IF v_fn IS NULL THEN
      v_bad := v_bad || (v_def || ' is missing')::text;
      CONTINUE;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || (v_def || ' is client-callable')::text;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'award_kyc_bonus_if_eligible';
  IF v_def IS NULL OR v_def NOT LIKE '%dev_mode%' OR v_def NOT LIKE '%dev-sandbox%' THEN
    v_bad := v_bad || 'KYC bonus does not exclude dev-mode/sandbox verdicts'::text;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'award_referral_bonus_if_eligible';
  IF v_def IS NULL OR v_def NOT LIKE '%dev_mode%' OR v_def NOT LIKE '%dev-sandbox%' THEN
    v_bad := v_bad || 'referral eligibility does not exclude dev-mode/sandbox verdicts'::text;
  END IF;

  -- Milestone idempotency: one ledger row per user per milestone, ever.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_grow_coin_kyc_bonus_per_user'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_grow_coin_first_project_per_user'
  ) THEN
    v_bad := v_bad || 'milestone bonus idempotency indexes are missing'::text;
  END IF;

  SELECT p.oid INTO v_fn FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'redeem_reserved_grow_coins';
  IF v_fn IS NULL THEN
    v_bad := v_bad || 'redeem_reserved_grow_coins is missing'::text;
  ELSIF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    v_bad := v_bad || 'redeem_reserved_grow_coins is client-callable'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = 'get_grow_coin_leaderboard'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    v_bad := v_bad || 'public leaderboard must stay readable by anon'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_grow_coin_award_on_contract_complete' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_grow_coin_award_on_kyc_verified' AND NOT tgisinternal
  ) THEN
    v_bad := v_bad || 'award triggers are missing'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_grow_coin_bonus_per_referral'
  ) THEN
    v_bad := v_bad || 'referral bonus idempotency index is missing'::text;
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'grow coin migration failed its own assertions: %', array_to_string(v_bad, ' | ');
  END IF;
END $$;
