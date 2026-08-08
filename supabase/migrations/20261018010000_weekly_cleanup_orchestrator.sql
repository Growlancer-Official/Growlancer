-- ═══════════════════════════════════════════════════════════════════════
-- 20261018010000_weekly_cleanup_orchestrator.sql
--
-- Upgrades the weekly maintenance cron into a full safety net:
--   1. cleanup_orphaned_data()     — existing: orphan ai_matches + notifications,
--                                    fails stuck deletion requests
--   2. purge_orphan_user_data()    — NEW (20261018000000): finds any profile whose
--                                    auth.users row is gone (deleted while the old
--                                    broken delete function was live) and wipes ALL
--                                    of its data via the complete delete_user_all_data
--
-- This guarantees that even if a deletion ever fails silently in the future, the
-- weekly run catches and completes it automatically.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_weekly_cleanup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_legacy INTEGER;
  v_purge  JSONB;
BEGIN
  -- 1. Legacy orphan cleanup (ai_matches / notifications / stuck requests)
  BEGIN
    SELECT public.cleanup_orphaned_data() INTO v_legacy;
  EXCEPTION WHEN OTHERS THEN
    v_legacy := -1;
  END;

  -- 2. Full orphan-profile purge (complete delete_user_all_data for each orphan)
  BEGIN
    SELECT public.purge_orphan_user_data() INTO v_purge;
  EXCEPTION WHEN OTHERS THEN
    v_purge := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'legacy_orphan_cleanup',  v_legacy,
    'orphan_purge',           v_purge,
    'run_at',                 NOW()
  );
END;
$$;

-- Keep the orchestrator locked down (service-role only; pg_cron runs as postgres)
REVOKE ALL ON FUNCTION public.run_weekly_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_weekly_cleanup() FROM anon;
REVOKE ALL ON FUNCTION public.run_weekly_cleanup() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_weekly_cleanup() TO service_role;

-- Point the weekly job at the orchestrator (idempotent: delete + reschedule)
DO $$
BEGIN
  DELETE FROM cron.job WHERE jobname = 'cleanup-orphaned-data';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not delete existing cron job (managed Supabase): %', SQLERRM;
END;
$$;

SELECT cron.schedule(
  'cleanup-orphaned-data',
  '0 3 * * 0',  -- every Sunday 03:00 UTC
  $$SELECT public.run_weekly_cleanup()$$
);
