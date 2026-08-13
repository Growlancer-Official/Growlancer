-- ────────────────────────────────────────────────────────────────────────────
-- Contest winner certificates — auto-issue on award
--
-- Extends award_contest_prizes() so that every winning freelancer gets a
-- verifiable 'achievement' certificate in skill_certifications the moment
-- prizes are released. The certificate card is shown on the contest page
-- (skill_certifications is publicly readable) and each certificate links to
-- the public /verify-certificate/:code page.
-- ────────────────────────────────────────────────────────────────────────────

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
  v_uid          uuid := auth.uid();
  v_contest      RECORD;
  v_pool         NUMERIC;
  v_paid         NUMERIC := 0;
  v_sub          RECORD;
  v_place        INT := 0;
  v_amount       NUMERIC := 0;
  v_winner_id    uuid := NULL;
  v_codes        jsonb := '[]'::jsonb;
  v_code         text;
  v_recipient    text;
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

    -- 🏆 Auto-issue achievement certificate
    v_code := 'GRW-CONTEST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    SELECT COALESCE(p.name, 'Contest Winner') INTO v_recipient FROM public.profiles p WHERE p.id = v_sub.freelancer_id;
    BEGIN
      INSERT INTO public.skill_certifications
        (user_id, skill, level, score, max_score, verification_code, issued_by, issued_at,
         certificate_type, status, metadata, recipient_name, recipient_email, certificate_url)
      VALUES
        (v_sub.freelancer_id, v_contest.title, 'expert', 100, 100, v_code, NULL, NOW(),
         'achievement', 'active',
         jsonb_build_object('contest_id', p_contest_id, 'submission_id', v_sub.id, 'place', 1, 'prize', v_amount, 'contest_title', v_contest.title),
         v_recipient, '', 'https://growlancer.vercel.app/verify-certificate/' || v_code);
      v_codes := v_codes || jsonb_build_object('submission_id', v_sub.id, 'place', 1, 'code', v_code);
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

      -- 🥈 Auto-issue achievement certificate
      v_code := 'GRW-CONTEST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      SELECT COALESCE(p.name, 'Contest Winner') INTO v_recipient FROM public.profiles p WHERE p.id = v_sub.freelancer_id;
      BEGIN
        INSERT INTO public.skill_certifications
          (user_id, skill, level, score, max_score, verification_code, issued_by, issued_at,
           certificate_type, status, metadata, recipient_name, recipient_email, certificate_url)
        VALUES
          (v_sub.freelancer_id, v_contest.title, 'advanced', 100, 100, v_code, NULL, NOW(),
           'achievement', 'active',
           jsonb_build_object('contest_id', p_contest_id, 'submission_id', v_sub.id, 'place', 2, 'prize', v_amount, 'contest_title', v_contest.title),
           v_recipient, '', 'https://growlancer.vercel.app/verify-certificate/' || v_code);
        v_codes := v_codes || jsonb_build_object('submission_id', v_sub.id, 'place', 2, 'code', v_code);
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

      -- 🥉 Auto-issue achievement certificate
      v_code := 'GRW-CONTEST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      SELECT COALESCE(p.name, 'Contest Winner') INTO v_recipient FROM public.profiles p WHERE p.id = v_sub.freelancer_id;
      BEGIN
        INSERT INTO public.skill_certifications
          (user_id, skill, level, score, max_score, verification_code, issued_by, issued_at,
           certificate_type, status, metadata, recipient_name, recipient_email, certificate_url)
        VALUES
          (v_sub.freelancer_id, v_contest.title, 'intermediate', 100, 100, v_code, NULL, NOW(),
           'achievement', 'active',
           jsonb_build_object('contest_id', p_contest_id, 'submission_id', v_sub.id, 'place', 3, 'prize', v_amount, 'contest_title', v_contest.title),
           v_recipient, '', 'https://growlancer.vercel.app/verify-certificate/' || v_code);
        v_codes := v_codes || jsonb_build_object('submission_id', v_sub.id, 'place', 3, 'code', v_code);
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
            'Prizes for "' || v_contest.title || '" have been released (' || v_paid || ' paid out). Winners received their achievement certificates automatically.',
            '/client/contests', jsonb_build_object('contest_id', p_contest_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'paid', v_paid, 'pool', v_pool,
                            'winner_id', v_winner_id, 'certificates', v_codes);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.award_contest_prizes(UUID, UUID, UUID, UUID) TO authenticated;
