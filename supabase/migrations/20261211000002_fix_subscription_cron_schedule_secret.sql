-- ============================================================================
-- FIX: subscription-billing-cron now requires CRON_SECRET (2026-12-11)
--
-- The old pg_cron job called the edge function with the raw service_role key.
-- The function now enforces CRON_SECRET (same pattern as razorpay execute_refund
-- and the milestone-auto-release cron). This migration rebuilds the cron job to
-- read the shared secret from cron_settings.cron_secret.
-- ============================================================================

DO $$
DECLARE
  v_cron_secret TEXT;
  v_job TEXT;
BEGIN
  SELECT value INTO v_cron_secret FROM public.cron_settings WHERE key = 'cron_secret';
  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE NOTICE 'cron_settings.cron_secret missing — skipping schedule rebuild (set it first)';
    RETURN;
  END IF;

  -- Remove any existing schedule with this name (idempotent)
  BEGIN
    DELETE FROM cron.job WHERE jobname = 'subscription-billing-daily';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Could not delete existing cron job (managed Supabase): %', SQLERRM;
  END;

  v_job := format(
    $sql$SELECT net.http_post(
      url:='https://zttwsjehcgaicziqyxpq.supabase.co/functions/v1/subscription-billing-cron',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body:='{}'::jsonb
    ) AS request_id;$sql$,
    v_cron_secret
  );

  PERFORM cron.schedule('subscription-billing-daily', '0 0 * * *', v_job);
END $$;
