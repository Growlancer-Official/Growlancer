-- ============================================================================
-- SCHEDULE milestone-auto-release HOURLY (2026-12-11)
--
-- Runs the milestone-auto-release edge function every hour via pg_cron →
-- pg_net, authenticated with the shared CRON_SECRET (read from cron_settings,
-- same pattern as process_pending_refunds).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_milestone_auto_release()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cron_secret TEXT;
  v_url TEXT := 'https://zttwsjehcgaicziqyxpq.supabase.co/functions/v1/milestone-auto-release';
BEGIN
  SELECT value INTO v_cron_secret FROM public.cron_settings WHERE key = 'cron_secret';
  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RETURN 0;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cron_secret
    ),
    body := '{}'::jsonb
  );
  RETURN 1;
END $$;

DO $cron$
BEGIN
  -- Hourly: minute 5 (staggered from the :00 cron jobs)
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growlancer-milestone-auto-release') THEN
    PERFORM cron.schedule('growlancer-milestone-auto-release', '5 * * * *',
      $job$SELECT public.process_milestone_auto_release();$job$);
  END IF;
END $cron$;
