-- ════════════════════════════════════════════════════════════════════════
-- GROWLANCER — live cron-function repairs found during final launch sweep
-- (2026-08-16). Three scheduled functions were failing in the live DB:
--   1. close_expired_contests        — unqualified "contests" not resolving
--   2. cleanup_expired_rate_limits   — unqualified "rate_limits" not resolving
--   3. cleanup_orphaned_data         — user_deletion_requests.admin_note
--      column missing from the live table (defined in the original migration
--      but absent in production).
-- All fixed in the live DB; this file persists the fixes for fresh builds.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Restore admin_note on user_deletion_requests ──────────────────────
ALTER TABLE public.user_deletion_requests ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- ── 2. Qualify close_expired_contests against public schema ───────────────
CREATE OR REPLACE FUNCTION public.close_expired_contests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, pg_catalog'
AS $function$
BEGIN
  UPDATE public.contests
  SET status = 'judging', updated_at = now()
  WHERE status = 'active' AND end_date < now();
END;
$function$;

-- ── 3. Qualify cleanup_expired_rate_limits against public schema ──────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, pg_catalog'
AS $function$
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';
END;
$function$;

-- ── 4. Guarantee the cleanup-rate-limits cron job exists (idempotent) ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rate-limits') THEN
    PERFORM cron.schedule('cleanup-rate-limits', '0 3 * * *', 'SELECT cleanup_expired_rate_limits();');
  END IF;
END $$;

-- ── 5. Verify — the three previously-broken functions must now run clean ──
DO $$
BEGIN
  PERFORM public.close_expired_contests();
  PERFORM public.cleanup_expired_rate_limits();
  PERFORM public.cleanup_orphaned_data();
END $$;
