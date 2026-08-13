-- ============================================================
-- CONTEST COMPLETE FLOW — prize escrow + winners + visibility
--
-- 1) contests.prize_funded / escrow_amount — the prize pool is funded
--    upfront (wallet debit OR Razorpay/PayPal capture) before the
--    contest accepts submissions. Freelancers get a guarantee that the
--    prize exists.
-- 2) award_contest_prizes() — client picks 1st/2nd/3rd → prizes are
--    released to the winners' wallets in one atomic transaction.
-- 3) contest_submissions SELECT now PUBLIC (contest model = public
--    entries + community voting). Votes were already public.
-- 4) close_expired_contests() is scheduled hourly via pg_cron.
-- 5) Notification type 'contest' added + submission-arrival trigger.
-- ============================================================

-- ---------- 1. Contests escrow columns ----------
ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS prize_funded BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS escrow_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_funded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prize_released BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS prize_released_at TIMESTAMPTZ;

-- ---------- 2. Wallet funding (client) ----------
CREATE OR REPLACE FUNCTION public.fund_contest_prize_from_wallet(p_contest_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_contest  RECORD;
  v_pool     NUMERIC := 0;
  v_fee      NUMERIC := 0;
  v_total    NUMERIC := 0;
  v_balance  NUMERIC := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_contest
  FROM public.contests WHERE id = p_contest_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest not found');
  END IF;
  IF v_contest.client_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contest';
  END IF;
  IF v_contest.prize_funded THEN
    RETURN jsonb_build_object('success', false, 'error', 'Prize is already funded');
  END IF;

  -- Prize pool = 1st + 2nd + 3rd (server-side, never trust the client)
  v_pool := ROUND((COALESCE(v_contest.prize_amount,0) + COALESCE(v_contest.second_prize,0) + COALESCE(v_contest.third_prize,0)) * 100) / 100;
  IF v_pool <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid prize pool');
  END IF;
  v_fee := ROUND(v_pool * 0.05 * 100) / 100;  -- 5% platform fee (client-side)
  v_total := ROUND((v_pool + v_fee) * 100) / 100;

  -- Atomic wallet debit
  INSERT INTO public.wallets (user_id, currency)
  VALUES (v_uid, 'INR')
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
  SET balance = balance - v_total, updated_at = NOW()
  WHERE user_id = v_uid AND balance >= v_total
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_uid;
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance', 'balance', v_balance, 'required', v_total);
  END IF;

  -- Mark prize funded + escrowed
  UPDATE public.contests
  SET prize_funded = true, escrow_amount = v_pool, prize_funded_at = NOW(), updated_at = NOW()
  WHERE id = p_contest_id;

  -- Ledger: escrowed prize pool
  INSERT INTO public.transactions (user_id, type, amount, currency, status, description, source, metadata)
  VALUES (v_uid, 'debit', v_pool, 'INR', 'completed', 'Contest prize escrowed', 'escrow',
          jsonb_build_object('contest_id', p_contest_id, 'method', 'wallet', 'platform_fee', v_fee));
  -- Ledger: platform fee
  IF v_fee > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, currency, status, description, source, metadata)
    VALUES (v_uid, 'debit', v_fee, 'INR', 'completed', 'Platform fee for contest prize', 'platform_fee',
            jsonb_build_object('contest_id', p_contest_id, 'method', 'wallet'));
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (v_uid, 'contest', 'Contest prize funded',
            'Your contest prize of ₹' || v_pool || ' is now escrowed. The contest is live for submissions.',
            '/client/contests', jsonb_build_object('contest_id', p_contest_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'balance', v_balance, 'amount', v_pool, 'platform_fee', v_fee);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fund_contest_prize_from_wallet(UUID) TO authenticated;

-- ---------- 3. Service-role funding (Razorpay / PayPal webhooks) ----------
CREATE OR REPLACE FUNCTION public.admin_fund_contest_prize(p_contest_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contest RECORD;
  v_pool    NUMERIC;
BEGIN
  SELECT * INTO v_contest FROM public.contests WHERE id = p_contest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contest not found'; END IF;
  IF v_contest.prize_funded THEN RETURN TRUE; END IF;  -- idempotent

  v_pool := ROUND((COALESCE(v_contest.prize_amount,0) + COALESCE(v_contest.second_prize,0) + COALESCE(v_contest.third_prize,0)) * 100) / 100;
  IF v_pool <= 0 THEN RAISE EXCEPTION 'Invalid prize pool'; END IF;

  UPDATE public.contests
  SET prize_funded = true, escrow_amount = v_pool, prize_funded_at = NOW(), updated_at = NOW()
  WHERE id = p_contest_id;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (v_contest.client_id, 'contest', 'Contest prize funded',
            'Your contest prize of ₹' || v_pool || ' is now escrowed. The contest is live for submissions.',
            '/client/contests', jsonb_build_object('contest_id', p_contest_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN TRUE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_fund_contest_prize(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fund_contest_prize(UUID) TO service_role;

-- ---------- 4. Award winners (client) ----------
CREATE OR REPLACE FUNCTION public.award_contest_prizes(
  p_contest_id UUID,
  p_first_submission_id UUID,
  p_second_submission_id UUID DEFAULT NULL,
  p_third_submission_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_contest   RECORD;
  v_pool      NUMERIC;
  v_paid      NUMERIC := 0;
  v_sub       RECORD;
  v_place     INT := 0;
  v_amount    NUMERIC := 0;
  v_winner_id uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_contest FROM public.contests WHERE id = p_contest_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest not found');
  END IF;
  IF v_contest.client_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contest';
  END IF;
  IF NOT v_contest.prize_funded THEN
    RETURN jsonb_build_object('success', false, 'error', 'Prize is not funded yet');
  END IF;
  IF v_contest.prize_released THEN
    RETURN jsonb_build_object('success', false, 'error', 'Prizes already released');
  END IF;
  IF v_contest.status NOT IN ('judging', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contest must be in judging or active state');
  END IF;

  v_pool := COALESCE(v_contest.escrow_amount, 0);

  -- 1st place
  IF p_first_submission_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.contest_submissions WHERE id = p_first_submission_id AND contest_id = p_contest_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', '1st place submission not found for this contest');
    END IF;
    v_place := 1; v_amount := ROUND((COALESCE(v_contest.prize_amount,0)) * 100) / 100;
    UPDATE public.contest_submissions SET status = 'winner', rank = 1, prize_amount = v_amount, updated_at = NOW()
      WHERE id = v_sub.id;
    v_paid := v_paid + v_amount;
    v_winner_id := v_sub.freelancer_id;

    UPDATE public.wallets SET balance = balance + v_amount, updated_at = NOW() WHERE user_id = v_sub.freelancer_id;
    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance, currency) VALUES (v_sub.freelancer_id, v_amount, 'INR');
    END IF;
    INSERT INTO public.transactions (user_id, type, amount, currency, status, description, source, metadata)
    VALUES (v_sub.freelancer_id, 'credit', v_amount, 'INR', 'completed', 'Contest 1st prize', 'escrow',
            jsonb_build_object('contest_id', p_contest_id, 'place', 1));
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (v_sub.freelancer_id, 'contest', 'You won the contest! 🏆',
              'Congratulations! You won 1st place in "' || v_contest.title || '" and ₹' || v_amount || ' has been added to your wallet.',
              '/dashboard/wallet', jsonb_build_object('contest_id', p_contest_id, 'place', 1));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- 2nd place
  IF p_second_submission_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.contest_submissions WHERE id = p_second_submission_id AND contest_id = p_contest_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', '2nd place submission not found for this contest');
    END IF;
    v_amount := ROUND((COALESCE(v_contest.second_prize,0)) * 100) / 100;
    IF v_amount > 0 THEN
      UPDATE public.contest_submissions SET status = 'winner', rank = 2, prize_amount = v_amount, updated_at = NOW()
        WHERE id = v_sub.id;
      v_paid := v_paid + v_amount;
      UPDATE public.wallets SET balance = balance + v_amount, updated_at = NOW() WHERE user_id = v_sub.freelancer_id;
      IF NOT FOUND THEN
        INSERT INTO public.wallets (user_id, balance, currency) VALUES (v_sub.freelancer_id, v_amount, 'INR');
      END IF;
      INSERT INTO public.transactions (user_id, type, amount, currency, status, description, source, metadata)
      VALUES (v_sub.freelancer_id, 'credit', v_amount, 'INR', 'completed', 'Contest 2nd prize', 'escrow',
              jsonb_build_object('contest_id', p_contest_id, 'place', 2));
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
        VALUES (v_sub.freelancer_id, 'contest', 'You placed 2nd! 🥈',
                'You won 2nd place in "' || v_contest.title || '" and ₹' || v_amount || ' has been added to your wallet.',
                '/dashboard/wallet', jsonb_build_object('contest_id', p_contest_id, 'place', 2));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  -- 3rd place
  IF p_third_submission_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.contest_submissions WHERE id = p_third_submission_id AND contest_id = p_contest_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', '3rd place submission not found for this contest');
    END IF;
    v_amount := ROUND((COALESCE(v_contest.third_prize,0)) * 100) / 100;
    IF v_amount > 0 THEN
      UPDATE public.contest_submissions SET status = 'winner', rank = 3, prize_amount = v_amount, updated_at = NOW()
        WHERE id = v_sub.id;
      v_paid := v_paid + v_amount;
      UPDATE public.wallets SET balance = balance + v_amount, updated_at = NOW() WHERE user_id = v_sub.freelancer_id;
      IF NOT FOUND THEN
        INSERT INTO public.wallets (user_id, balance, currency) VALUES (v_sub.freelancer_id, v_amount, 'INR');
      END IF;
      INSERT INTO public.transactions (user_id, type, amount, currency, status, description, source, metadata)
      VALUES (v_sub.freelancer_id, 'credit', v_amount, 'INR', 'completed', 'Contest 3rd prize', 'escrow',
              jsonb_build_object('contest_id', p_contest_id, 'place', 3));
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
        VALUES (v_sub.freelancer_id, 'contest', 'You placed 3rd! 🥉',
                'You won 3rd place in "' || v_contest.title || '" and ₹' || v_amount || ' has been added to your wallet.',
                '/dashboard/wallet', jsonb_build_object('contest_id', p_contest_id, 'place', 3));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  -- Mark contest completed (winner_id = 1st place freelancer)
  UPDATE public.contests
  SET winner_id = v_winner_id, status = 'completed', prize_released = true,
      prize_released_at = NOW(), updated_at = NOW()
  WHERE id = p_contest_id;

  -- Non-winners → rejected (only if they were submitted entries)
  UPDATE public.contest_submissions
  SET status = 'rejected', updated_at = NOW()
  WHERE contest_id = p_contest_id
    AND status = 'submitted';

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (v_contest.client_id, 'contest', 'Winners announced 🏆',
            'Prizes for "' || v_contest.title || '" have been released (' || v_paid || ' paid out).',
            '/client/contests', jsonb_build_object('contest_id', p_contest_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'paid', v_paid, 'pool', v_pool, 'winner_id', v_winner_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.award_contest_prizes(UUID, UUID, UUID, UUID) TO authenticated;

-- ---------- 5. Notification type 'contest' ----------
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('proposal','invite','contract','message','payment','escrow','review','system',
                  'refund','dispute','reminder','admin','verification','milestone','ticket','payout','contest'));

-- ---------- 6. Submissions PUBLIC (contest = public entries + community voting) ----------
DROP POLICY IF EXISTS "Submissions are viewable by contest owner and submitter" ON contest_submissions;
CREATE POLICY "Contest submissions are public" ON contest_submissions
  FOR SELECT USING (true);

-- Submissions only allowed for FUNDED + active contests (fair: prize must exist)
DROP POLICY IF EXISTS "Freelancers can submit to active contests" ON contest_submissions;
CREATE POLICY "Freelancers can submit to funded active contests" ON contest_submissions
  FOR INSERT WITH CHECK (
    auth.uid() = freelancer_id AND
    (SELECT status FROM contests WHERE id = contest_id) = 'active' AND
    (SELECT prize_funded FROM contests WHERE id = contest_id) = true AND
    (SELECT end_date FROM contests WHERE id = contest_id) > now()
  );

-- ---------- 7. Notify client on new submission ----------
CREATE OR REPLACE FUNCTION notify_contest_submission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_client_id uuid;
  v_title     text;
BEGIN
  SELECT client_id, title INTO v_client_id, v_title FROM public.contests WHERE id = NEW.contest_id;
  IF v_client_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (v_client_id, 'contest', 'New contest submission',
              'A new entry arrived for your contest "' || v_title || '".',
              '/client/contests', jsonb_build_object('contest_id', NEW.contest_id, 'submission_id', NEW.id));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS on_contest_submission_insert ON contest_submissions;
CREATE TRIGGER on_contest_submission_insert
  AFTER INSERT ON contest_submissions
  FOR EACH ROW EXECUTE FUNCTION notify_contest_submission();

-- ---------- 8. Auto-close expired contests (hourly) ----------
SELECT cron.schedule('growlancer-close-contests', '0 * * * *',
                     $$SELECT public.close_expired_contests()$$);
