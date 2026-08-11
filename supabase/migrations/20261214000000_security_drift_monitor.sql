-- ────────────────────────────────────────────────────────────────────────────
-- SECURITY DRIFT MONITOR — automated hourly audit with real-time admin alert
--
-- Every hour (via pg_cron):
--   1. check_security_drift() scans the LIVE database for dangerous patterns
--      (RLS-disabled tables, open policies, unprotected SECURITY DEFINER
--      functions, open storage writes) and inserts findings into
--      security_alerts (realtime-published → admin dashboard shows them live).
--   2. If new findings exist, pg_net fires the security-alert-notify edge
--      function (CRON_SECRET-authenticated) which emails the admin via Brevo.
--
-- Manual trigger:  SELECT public.check_security_drift();
-- ────────────────────────────────────────────────────────────────────────────

-- 1. security_alerts table
CREATE TABLE IF NOT EXISTS public.security_alerts (
  id BIGSERIAL PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category TEXT NOT NULL,
  detail TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'drift-monitor',
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view security alerts" ON public.security_alerts;
CREATE POLICY "Admins can view security alerts" ON public.security_alerts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Service role manages security alerts" ON public.security_alerts;
CREATE POLICY "Service role manages security alerts" ON public.security_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_security_alerts_created ON public.security_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved ON public.security_alerts(is_resolved);

-- 2. Drift check function (SECURITY DEFINER — reads pg_catalog + storage
--    policies that normal roles cannot see)
CREATE OR REPLACE FUNCTION public.check_security_drift()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, storage
AS $$
DECLARE
  v_new integer := 0;
  v_finding record;
  v_cron_secret text;
BEGIN
  -- 🔴 CRITICAL: tables with RLS DISABLED that hold data
  FOR v_finding IN
    SELECT c.relname AS table_name,
           (SELECT count(*) FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND c.relname NOT IN ('_prisma_migrations', 'schema_migrations')
    ORDER BY c.relname
  LOOP
    -- Dedupe: skip if the same finding is already open OR was resolved
    -- within the last 7 days (so acknowledged/intended findings don't
    -- re-alert and spam the admin email every hour).
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'rls_disabled'
        AND detail LIKE '%' || v_finding.table_name || '%'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        'critical',
        'rls_disabled',
        format('Table %s has RLS DISABLED (%s policies) — check grants immediately', v_finding.table_name, v_finding.policy_count)
      );
      v_new := v_new + 1;
    END IF;
  END LOOP;

  -- 🔴 CRITICAL: open RLS policies on financial / sensitive tables
  FOR v_finding IN
    SELECT tablename, policyname, cmd, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'wallets', 'transactions', 'escrow', 'razorpay_orders', 'paypal_orders',
        'withdrawals', 'payout_methods', 'saved_payment_cards',
        'identity_verifications', 'subscriptions', 'refund_requests'
      )
      AND (
        lower(coalesce(with_check, '')) LIKE '%with check (true)%'
        OR lower(coalesce(qual, '')) LIKE '%using (true)%'
        OR lower(coalesce(qual, '')) = 'true'
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'open_rls_policy'
        AND detail LIKE '%' || v_finding.policyname || '%'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        'critical',
        'open_rls_policy',
        format('Open policy %s on %s (cmd=%s)', v_finding.policyname, v_finding.tablename, v_finding.cmd)
      );
      v_new := v_new + 1;
    END IF;
  END LOOP;

  -- 🟠 HIGH: SECURITY DEFINER functions without SET search_path (new ones only)
  -- Checks BOTH the source text and the proconfig array (ALTER FUNCTION ...
  -- SET search_path lands in proconfig, not in prosrc).
  FOR v_finding IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prosrc NOT ILIKE '%search_path%'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
      ))
      AND pg_function_is_visible(p.oid)
    ORDER BY p.proname
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'definer_no_search_path'
        AND detail LIKE '%' || v_finding.proname || '%'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        'high',
        'definer_no_search_path',
        format('SECURITY DEFINER function %s lacks SET search_path', v_finding.proname)
      );
      v_new := v_new + 1;
    END IF;
  END LOOP;

  -- 🟠 HIGH: storage write policies without any auth.uid() ownership check
  --    (open uploads). Storage policies live in pg_policies (schema storage).
  FOR v_finding IN
    SELECT p.tablename AS bucket_hint, p.policyname, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.cmd IN ('INSERT', 'ALL')
      AND lower(coalesce(p.with_check, '')) NOT LIKE '%auth.uid()%'
      AND lower(coalesce(p.with_check, '')) NOT LIKE '%auth.role()%'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'open_storage_write'
        AND detail LIKE '%' || v_finding.policyname || '%'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        'high',
        'open_storage_write',
        format('Open storage write policy %s on %s (check=%s)', v_finding.policyname, v_finding.bucket_hint, left(coalesce(v_finding.with_check, ''), 60))
      );
      v_new := v_new + 1;
    END IF;
  END LOOP;

  -- 📨 Real-time admin email via the CRON_SECRET-protected notify function
  IF v_new > 0 THEN
    SELECT value INTO v_cron_secret FROM public.cron_settings WHERE key = 'cron_secret';
    IF v_cron_secret IS NOT NULL AND v_cron_secret <> '' THEN
      PERFORM net.http_post(
        url := 'https://zttwsjehcgaicziqyxpq.supabase.co/functions/v1/security-alert-notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_cron_secret
        ),
        body := jsonb_build_object('count', v_new)
      );
    END IF;
  END IF;

  RETURN v_new;
END;
$$;

-- 3. Hourly pg_cron schedule (minute 15, staggered)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growlancer-security-drift') THEN
    PERFORM cron.schedule('growlancer-security-drift', '15 * * * *',
      $job$SELECT public.check_security_drift();$job$);
  END IF;
END $$;
