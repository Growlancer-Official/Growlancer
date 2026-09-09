-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000001_about_countries_metric.sql
--
-- Completes the About-page "N countries" live metric. The About page terminal
-- already renders `${countries} countries`, but useAboutPageMetrics hardcoded
-- raw.countries = null (TODO in the hook), so it always showed "—". This
-- computes a live count of distinct countries from the profiles table and
-- exposes it through the existing get_public_platform_metrics() RPC.
--
-- SECURITY DEFINER is required because profiles is RLS-protected; the function
-- returns only an aggregate count (no rows), same as the escrow/review metrics
-- already in this RPC. Anonymous callers get the count too (already granted).
--
-- Idempotent: CREATE OR REPLACE FUNCTION.
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
  v_countries BIGINT;
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

  -- Distinct countries across live (non-deleted) profiles
  SELECT COUNT(DISTINCT country)::BIGINT INTO v_countries
  FROM public.profiles
  WHERE country IS NOT NULL
    AND btrim(country) <> ''
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'totalEscrowInr', v_total_escrow,
    'totalReviews', v_total_reviews,
    'avgSatisfactionPercent', CASE
      WHEN v_total_reviews >= 5 THEN ROUND((v_avg_rating / 5.0) * 100, 0)
      ELSE NULL
    END,
    'countries', v_countries
  );
END;
$$;

-- Allow anyone (including anon) to call this function (unchanged)
GRANT EXECUTE ON FUNCTION public.get_public_platform_metrics() TO anon, authenticated;