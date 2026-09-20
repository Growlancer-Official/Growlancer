-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: "Countries with members" counted one country as two — and
--      update_user_country had no ownership check
--
-- The About/Homepage stat is COUNT(DISTINCT country) over public.profiles. Live
-- data held {'India', 'IN'} because the app writes that column from TWO paths in
-- TWO formats:
--   • AuthCallbackPage (OAuth country gate)  → p_country: 'IN'
--   • OnboardingPage (freelancer/client form) → p_country: <location name>
-- So every OAuth signup and every onboarding signup disagreed, and a single
-- real country displayed as two. This would have stayed wrong forever — every
-- future user would have landed in one of the two formats.
--
-- While auditing the write path, update_user_country turned out to accept an
-- arbitrary p_user_id from the request body with NO caller check (Security
-- Principle #6): any authenticated user could rewrite any other profile's
-- country. It now requires the caller to BE that user, and normalizes the value
-- through the public.countries reference table before storing it, so both
-- client paths converge on one canonical name ('IN' and 'India' both store
-- 'India').
--
-- get_public_platform_metrics counts the normalized value too, so the public
-- stat stays correct even if some future path writes a bare code.
--
-- IDEMPOTENT: CREATE OR REPLACE + idempotent backfill + fail-closed assertions.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. One shared definition of "a country, written properly" ─────────────
-- Matches the reference table by name first, then by ISO code, and falls back
-- to the trimmed input so an unmatched free-text value is never destroyed.
CREATE OR REPLACE FUNCTION public.normalize_country(p_raw text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT c.name FROM public.countries c WHERE lower(c.name) = lower(btrim(p_raw)) LIMIT 1),
    (SELECT c.name FROM public.countries c WHERE upper(c.code) = upper(btrim(p_raw)) LIMIT 1),
    btrim(p_raw)
  );
$$;
REVOKE ALL ON FUNCTION public.normalize_country(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_country(text) TO authenticated, service_role;

-- ─── 2. Existing rows: converge 'IN' → 'India' (idempotent) ────────────────
UPDATE public.profiles p
SET country = public.normalize_country(p.country)
WHERE p.country IS NOT NULL AND btrim(p.country) <> '';

-- ─── 3. The write path: owner-only, and normalized before storage ──────────
CREATE OR REPLACE FUNCTION public.update_user_country(
  p_user_id uuid,
  p_country text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_canonical TEXT;
BEGIN
  -- The caller may only set their OWN country. This RPC used to accept any
  -- user id from the request body, so any authenticated user could rewrite any
  -- other profile's country.
  IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  v_canonical := public.normalize_country(p_country);

  IF v_canonical IS NULL OR btrim(v_canonical) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Country is required');
  END IF;

  UPDATE public.profiles
     SET country = v_canonical,
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'country', v_canonical);
END;
$$;
REVOKE ALL ON FUNCTION public.update_user_country(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_user_country(uuid, text) TO authenticated, service_role;

-- ─── 4. The public stat: count countries, not spellings ────────────────────
CREATE OR REPLACE FUNCTION public.get_public_platform_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
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

  -- Distinct countries across live (non-deleted) profiles, normalized through
  -- the reference table so 'IN' and 'India' are one country, not two.
  SELECT COUNT(DISTINCT public.normalize_country(p.country))::BIGINT INTO v_countries
  FROM public.profiles p
  WHERE p.country IS NOT NULL
    AND btrim(p.country) <> ''
    AND p.deleted_at IS NULL;

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

-- ─── 5. Fail-closed assertions ─────────────────────────────────────────────
DO $assert$
DECLARE
  v_left text;
BEGIN
  -- (a) The stored write path must be owner-checked and normalizing.
  SELECT p.prosrc INTO v_left
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'update_user_country'
     AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_country text';

  IF v_left IS NULL THEN
    RAISE EXCEPTION 'update_user_country(uuid,text) not found after replace';
  END IF;
  IF position('auth.uid()' in v_left) = 0 OR position('normalize_country' in v_left) = 0 THEN
    RAISE EXCEPTION 'update_user_country lost its ownership check or country normalization';
  END IF;

  -- (b) No profile may still store a bare ISO code that exists in the reference
  --     table — otherwise the stat is lying again the moment this migration ends.
  IF EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.countries c ON upper(c.code) = upper(btrim(p.country))
     WHERE p.country IS NOT NULL AND btrim(p.country) <> ''
       AND lower(p.country) <> lower(c.name)
  ) THEN
    RAISE EXCEPTION 'profiles still store ISO country codes instead of canonical names';
  END IF;
END
$assert$;
