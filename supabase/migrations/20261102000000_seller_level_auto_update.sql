-- ============================================================
-- SELLER LEVEL AUTO-UPDATE
--
-- The freelancer's position/level (New Freelancer → Level 1 →
-- Rising Talent → Top Rated → Top Rated Plus) must change by
-- itself as they complete work. freelancer_profiles.seller_level
-- was a static column that nothing ever wrote to.
--
-- 1. recompute_seller_level(p_freelancer_id) — computes the level
--    from completed contracts + rating + completion rate (same
--    thresholds as src/lib/sellerLevels.ts) and persists it.
-- 2. Trigger on contracts — whenever a contract flips to
--    'completed', the freelancer's level is recomputed instantly.
-- 3. Backfill every existing freelancer profile.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recompute_seller_level(p_freelancer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_completed INT;
  v_total INT;
  v_completion NUMERIC;
  v_rating NUMERIC;
  v_level TEXT;
BEGIN
  SELECT COUNT(*) INTO v_completed
  FROM public.contracts
  WHERE freelancer_id = p_freelancer_id AND status = 'completed';

  SELECT COUNT(*) INTO v_total
  FROM public.contracts
  WHERE freelancer_id = p_freelancer_id
    AND status IN ('completed', 'cancelled', 'rejected', 'refunded');

  v_completion := CASE WHEN v_total = 0 THEN 100
                       ELSE ROUND((v_completed::NUMERIC / v_total) * 100, 1) END;

  SELECT COALESCE(rating, 0) INTO v_rating
  FROM public.freelancer_profiles
  WHERE user_id = p_freelancer_id;

  v_level := CASE
    WHEN v_rating >= 4.8 AND v_completed >= 50 AND v_completion >= 95 THEN 'top_rated_plus'
    WHEN v_rating >= 4.5 AND v_completed >= 25 AND v_completion >= 90 THEN 'top_rated'
    WHEN v_rating >= 4.0 AND v_completed >= 5 AND v_completion >= 80 THEN 'rising_talent'
    WHEN v_completed >= 1 THEN 'level_1'
    ELSE 'new'
  END;

  UPDATE public.freelancer_profiles
  SET seller_level = v_level, updated_at = NOW()
  WHERE user_id = p_freelancer_id;

  RETURN v_level;
END;
$function$;

-- Trigger: recompute whenever a contract reaches 'completed'
CREATE OR REPLACE FUNCTION public.recompute_seller_level_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.recompute_seller_level(NEW.freelancer_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recompute_seller_level ON public.contracts;
CREATE TRIGGER trg_recompute_seller_level
AFTER INSERT OR UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.recompute_seller_level_trigger();

-- Backfill every existing freelancer profile
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id AS uid FROM public.freelancer_profiles
  LOOP
    PERFORM public.recompute_seller_level(r.uid);
  END LOOP;
END $$;
