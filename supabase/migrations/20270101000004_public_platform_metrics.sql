-- ═══════════════════════════════════════════════════════════════════════════
-- Public platform metrics RPC — live escrow total + satisfaction rating
--
-- The escrow and reviews tables have RLS that blocks unauthenticated queries.
-- This SECURITY DEFINER function computes safe aggregate metrics and returns
-- them to anyone (including anon) without exposing individual rows.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_public_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_escrow NUMERIC;
  v_total_reviews BIGINT;
  v_avg_rating NUMERIC;
BEGIN
  -- Total INR released through escrow (sum of released + refunded amounts)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_escrow
  FROM public.escrow
  WHERE status IN ('released', 'refunded');

  -- Average satisfaction from reviews
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0)
  INTO v_total_reviews, v_avg_rating
  FROM public.reviews;

  RETURN jsonb_build_object(
    'totalEscrowInr', v_total_escrow,
    'totalReviews', v_total_reviews,
    'avgSatisfactionPercent', CASE
      WHEN v_total_reviews >= 5 THEN ROUND((v_avg_rating / 5.0) * 100, 0)
      ELSE NULL
    END
  );
END;
$$;

-- Allow anyone (including anon) to call this function
GRANT EXECUTE ON FUNCTION public.get_public_platform_metrics() TO anon, authenticated;
