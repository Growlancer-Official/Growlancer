-- 20261202000000_fix_review_trigger_rls.sql
-- ============================================================================
-- FIX: "Internal server error" when submitting a review
-- ============================================================================
-- ROOT CAUSE
-- ----------
-- The AFTER INSERT/UPDATE trigger `on_review_change` on `reviews` runs
-- `trigger_update_reputation()` -> `update_reputation_score(NEW.reviewee_id)`.
--
-- These functions were SECURITY INVOKER, so inside the trigger they executed
-- as the role that inserted the review (the `authenticated` user). The
-- reviewee is the OTHER party of the contract, and the only UPDATE policy on
-- `freelancer_profiles` is "Freelancers can manage own profile" — so the
-- UPDATE of the reviewee's row was rejected by RLS. That aborted the whole
-- INSERT transaction -> the reviews edge function returned HTTP 500
-- ("Internal server error").
--
-- FIX
-- ----
-- 1. Make the reputation functions SECURITY DEFINER (owner = postgres,
--    bypasses RLS) with a fixed search_path = public.
-- 2. Refresh the plain `rating` column (average review rating) inside
--    `update_reputation_score` so the trigger keeps freelancer rating in sync
--    in real time (the edge function's own RLS-blocked direct UPDATE is now
--    redundant and has been removed from the function code).

ALTER FUNCTION public.calculate_weighted_rating(p_freelancer_id uuid)
  SECURITY DEFINER
  SET search_path = public;

ALTER FUNCTION public.update_reputation_score(p_freelancer_id uuid)
  SECURITY DEFINER
  SET search_path = public;

ALTER FUNCTION public.trigger_update_reputation()
  SECURITY DEFINER
  SET search_path = public;

-- Recreate calculate_weighted_rating — the original was fatally broken:
--   1. `review_record.weight := ...` assigned a field that does not exist on
--      the RECORD -> 42703 "record has no field weight"
--   2. `UPDATE reviews SET weight = ...` referenced a column reviews does
--      NOT have -> would fail with column-not-found on any row update.
-- Fixed with a local row_weight variable; the weight is computed but never
-- persisted (no such column exists).
CREATE OR REPLACE FUNCTION public.calculate_weighted_rating(p_freelancer_id uuid)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  weighted_sum NUMERIC := 0;
  total_weight NUMERIC := 0;
  recency_weight NUMERIC;
  reviewer_weight NUMERIC;
  row_weight NUMERIC;
  review_record RECORD;
  days_ago INTEGER;
BEGIN
  -- Get all reviews for the freelancer
  FOR review_record IN
    SELECT r.rating,
           EXTRACT(DAY FROM NOW() - r.created_at) as days_old,
           (SELECT COUNT(*) FROM contracts WHERE client_id = r.reviewer_id) as reviewer_hires
    FROM reviews r
    WHERE r.reviewee_id = p_freelancer_id
  LOOP
    -- Calculate recency weight (more recent = higher weight)
    days_ago := review_record.days_old::INTEGER;
    IF days_ago < 30 THEN
      recency_weight := 1.5;
    ELSIF days_ago < 90 THEN
      recency_weight := 1.2;
    ELSIF days_ago < 180 THEN
      recency_weight := 1.0;
    ELSE
      recency_weight := 0.8;
    END IF;

    -- Calculate reviewer weight based on their hiring history
    IF review_record.reviewer_hires >= 10 THEN
      reviewer_weight := 1.3;
    ELSIF review_record.reviewer_hires >= 5 THEN
      reviewer_weight := 1.1;
    ELSE
      reviewer_weight := 1.0;
    END IF;

    -- Combined weight (local variable — reviews has no weight column)
    row_weight := recency_weight * reviewer_weight;

    -- Add to weighted sum
    weighted_sum := weighted_sum + (review_record.rating * row_weight);
    total_weight := total_weight + row_weight;
  END LOOP;

  -- Return weighted average
  IF total_weight > 0 THEN
    RETURN ROUND(weighted_sum / total_weight, 2);
  ELSE
    RETURN 0;
  END IF;
END;
$function$;

-- Recreate update_reputation_score to also refresh the rating column so
-- ratings / total_reviews / reputation_score all update in real time.
CREATE OR REPLACE FUNCTION public.update_reputation_score(p_freelancer_id uuid)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_weighted_rating NUMERIC;
  v_on_time_rate NUMERIC;
  v_response_rate_val NUMERIC;
  v_hire_rate_val NUMERIC;
  v_repeat_hire_rate_val NUMERIC;
  v_reputation_score NUMERIC;
  v_avg_rating NUMERIC;
BEGIN
  -- Get weighted rating
  v_weighted_rating := COALESCE(calculate_weighted_rating(p_freelancer_id), 0);

  -- Get performance metrics
  SELECT
    COALESCE(on_time_delivery_rate, 0),
    COALESCE(response_rate, 0),
    COALESCE(hire_rate, 0),
    COALESCE(repeat_hire_rate, 0)
  INTO v_on_time_rate, v_response_rate_val, v_hire_rate_val, v_repeat_hire_rate_val
  FROM freelancer_profiles
  WHERE user_id = p_freelancer_id;

  -- Calculate reputation score (weighted combination)
  v_reputation_score :=
    (v_weighted_rating * 8) +
    (v_on_time_rate * 0.25) +
    (v_response_rate_val * 0.15) +
    (v_hire_rate_val * 0.10) +
    (v_repeat_hire_rate_val * 0.10);

  -- Ensure score is between 0-100
  v_reputation_score := LEAST(GREATEST(v_reputation_score, 0), 100);

  -- Average review rating (1-5) refreshed in the same pass
  SELECT COALESCE(AVG(rating), 0)
  INTO v_avg_rating
  FROM reviews
  WHERE reviewee_id = p_freelancer_id;

  -- Update freelancer profile
  UPDATE freelancer_profiles
  SET
    reputation_score = ROUND(v_reputation_score, 2),
    weighted_rating = v_weighted_rating,
    rating = ROUND(v_avg_rating, 1),
    total_reviews = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = p_freelancer_id)
  WHERE user_id = p_freelancer_id;

  RETURN v_reputation_score;
END;
$function$;

-- Defense in depth: these functions exist ONLY for the trigger chain. Block
-- direct invocation by anon/authenticated (otherwise they would be callable
-- as SECURITY DEFINER via PostgREST RPC, letting any user force reputation
-- recomputation). Trigger functions are invoked by the trigger mechanism —
-- EXECUTE privilege is checked at CREATE TRIGGER time, so revoking it here
-- does NOT break review submission.
REVOKE EXECUTE ON FUNCTION public.calculate_weighted_rating(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reputation_score(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_update_reputation() FROM anon, authenticated;
