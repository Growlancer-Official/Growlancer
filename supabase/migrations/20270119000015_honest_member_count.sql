-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: honest member count + clear the two pre-existing ghost profiles
--
-- Two things, one deploy:
--   1. get_public_platform_metrics() now returns a 'memberCount' that counts
--      only living profiles that still have an auth.user row (i.e. can still
--      sign in). This excludes the two pre-existing ghost profiles
--      (pemin@growlancer.com, piveme@growlancer.com) whose auth.users row is
--      gone but whose profiles/profiles_private rows still exist, and it
--      excludes any future orphan too — so the homepage/About member card is
--      never inflated by an orphan again.
--   2. purge_orphan_user_data() is called inside the migration (rolled back on
--      any failure) so the ghosts are removed from the live DB here and now,
--      not just excluded from the count going forward.
--
-- Why purge here: the public member count (6) currently includes 2 accounts that
-- cannot possibly sign in. The friendly answer is to remove them now — a one-shot
-- irreversible deletion — so the on-about-page number is honest from the moment
-- this lands. purge_orphan_user_data() is the same path the weekly cron uses
-- (it's idempotent, with a row-level lock and a named advisory lock so only one
-- run proceeds at a time), and it cascades through every email-scoped table,
-- so nothing is left behind.
--
-- VERIFIED (rolled-back txn, before this migration was written):
--   • purge_orphan_user_data() deleted both ghosts, 32 steps, errors: []
--   • count(*) FROM profiles JOIN auth.users WHERE deleted_at IS NULL = 4
--   • count(*) FROM profiles WHERE deleted_at IS NULL = 6 (includes ghosts)
--
-- This migration is idempotent and fails closed: the RPC shape change is a
-- CREATE OR REPLACE (safe to re-run), and the orphan purge is wrapped so if it
-- ever fails the whole migration rolls back instead of partial-deleting half a
-- profile.
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add a honest member count to the RPC.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_platform_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_total_escrow NUMERIC;
  v_total_reviews BIGINT;
  v_avg_rating NUMERIC;
  v_countries BIGINT;
  v_member_count BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_escrow
    FROM public.escrow
   WHERE status IN ('released', 'refunded');

  SELECT COUNT(*), COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0)
    INTO v_total_reviews, v_avg_rating
    FROM public.reviews;

  SELECT COUNT(DISTINCT public.normalize_country(p.country))::BIGINT
    INTO v_countries
    FROM public.profiles p
   WHERE p.country IS NOT NULL
     AND btrim(p.country) <> ''
     AND p.deleted_at IS NULL;

  -- Honest member count: living profiles that still have an auth user row.
  -- Excludes orphaned profiles (the two pre-existing ghosts, plus any future
  -- orphan) so the homepage/About member cards are never inflated by an
  -- account that can no longer sign in.
  SELECT COUNT(*)::BIGINT INTO v_member_count
    FROM public.profiles p
   JOIN auth.users u ON u.id = p.id
   WHERE p.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'totalEscrowInr', v_total_escrow,
    'totalReviews', v_total_reviews,
    'avgSatisfactionPercent',
      CASE WHEN v_total_reviews >= 5 THEN ROUND((v_avg_rating / 5.0) * 100, 0) ELSE NULL END,
    'countries', v_countries,
    'memberCount', v_member_count
  );
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Purge the two pre-existing ghost profiles (idempotent; rolls back on fail).
-- ────────────────────────────────────────────────────────────────────────────
DO $purge$
DECLARE
  v_res JSONB;
BEGIN
  -- Idempotent: if there are no orphans, this is a no-op and still succeeds.
  SELECT public.purge_orphan_user_data() INTO v_res;

  IF v_res IS NULL OR NOT (v_res->>'success')::boolean THEN
    RAISE EXCEPTION 'orphan purge failed during migration: %', v_res;
  END IF;

  -- Guard: after a successful purge, there must be no orphaned profiles
  -- (live profiles whose auth.user row is gone). If there are, fail closed
  -- rather than silently pretending the purge succeeded.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ) THEN
    RAISE EXCEPTION 'Orphan profiles still present after purge — the migration must not proceed';
  END IF;
END
$purge$;
