-- 20261203000000: update_reputation_score now also refreshes the common
-- profiles table (rating + total_reviews) so ratings sync for BOTH roles.
--
-- Before: the on_review_change trigger -> update_reputation_score() only
-- wrote to freelancer_profiles. When a FREELANCER reviewed a CLIENT, the
-- reviewee (client) had no freelancer_profiles row, so profiles.rating and
-- profiles.total_reviews stayed 0 forever. Client ratings never showed up
-- anywhere (feed, proposals, client header, search).
--
-- After: the same function additionally refreshes profiles.rating /
-- profiles.total_reviews for the reviewee — which covers freelancers AND
-- clients (profiles is the common identity table). Security definer + fixed
-- search_path are preserved, so RLS never blocks the trigger.

CREATE OR REPLACE FUNCTION public.update_reputation_score(p_freelancer_id UUID)
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
  v_review_count BIGINT;
BEGIN
  -- Weighted rating (review-quality weighted average)
  v_weighted_rating := COALESCE(calculate_weighted_rating(p_freelancer_id), 0);

  -- Performance metrics (only exist for freelancers; NULL -> 0)
  SELECT
    COALESCE(on_time_delivery_rate, 0),
    COALESCE(response_rate, 0),
    COALESCE(hire_rate, 0),
    COALESCE(repeat_hire_rate, 0)
  INTO v_on_time_rate, v_response_rate_val, v_hire_rate_val, v_repeat_hire_rate_val
  FROM freelancer_profiles
  WHERE user_id = p_freelancer_id;

  -- Reputation score (weighted combination, 0-100)
  v_reputation_score :=
    (v_weighted_rating * 8) +
    (v_on_time_rate * 0.25) +
    (v_response_rate_val * 0.15) +
    (v_hire_rate_val * 0.10) +
    (v_repeat_hire_rate_val * 0.10);
  v_reputation_score := LEAST(GREATEST(v_reputation_score, 0), 100);

  -- Average review rating (1-5) + review count for the reviewee
  SELECT COALESCE(AVG(rating), 0), COUNT(*)
  INTO v_avg_rating, v_review_count
  FROM reviews
  WHERE reviewee_id = p_freelancer_id;

  -- Freelancer profile (only when the reviewee actually is a freelancer)
  UPDATE freelancer_profiles
  SET
    reputation_score = ROUND(v_reputation_score, 2),
    weighted_rating = v_weighted_rating,
    rating = ROUND(v_avg_rating, 1),
    total_reviews = v_review_count
  WHERE user_id = p_freelancer_id;

  -- Common profiles row — refreshes ratings for BOTH freelancers and clients
  UPDATE profiles
  SET
    rating = ROUND(v_avg_rating, 1),
    total_reviews = v_review_count
  WHERE id = p_freelancer_id;

  RETURN v_reputation_score;
END;
$function$;
