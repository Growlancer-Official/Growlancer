-- ═══════════════════════════════════════════════════════════════════════════
-- Fix broken contest_submissions INSERT policy + check_security_drift RPC
--
-- Bug 1 (contest submissions 404 on insert):
--   PostgreSQL RLS policies resolve referenced-table OIDs at CREATE time.
--   The `contests` table was dropped/recreated by a later migration, leaving
--   the existing INSERT policy pointing at the OLD OID → evaluation fails at
--   runtime with 42P01 `relation "contests" does not exist` even though the
--   table exists. Freelancers could not submit to ANY contest (HTTP 404 on
--   POST contest_submissions). Live-verified during E2E testing.
--   Fix: DROP + re-CREATE the INSERT policy so it binds to the current OID.
--   (Same expression as 20270101000013 — only the OID binding is refreshed.)
--
-- Bug 2 (check_security_drift 42703, hourly audit crashing):
--   The drift monitor guarded the `phone` column check with an
--   information_schema EXISTS guard but not the `email` check. `email` moved
--   from profiles → profiles_private, so has_column_privilege('anon',
--   'profiles','email',…) now throws 42703 and the whole audit aborts.
--   Fix: same information_schema guard for `email`. Full check body is
--   preserved verbatim from 20261214000000 otherwise.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Re-bind contest_submissions INSERT policy to current OIDs ──────────
DROP POLICY IF EXISTS "Freelancers can submit (not to own contest)" ON public.contest_submissions;

CREATE POLICY "Freelancers can submit (not to own contest)"
  ON public.contest_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = freelancer_id
    AND NOT EXISTS (
      SELECT 1 FROM public.contests c
      WHERE c.id = contest_submissions.contest_id
        AND c.client_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.contests c
      WHERE c.id = contest_submissions.contest_id
        AND c.status = 'active'
        AND c.prize_funded = true
    )
  );

-- Sanity guard: policy must exist
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'contest_submissions'
    AND policyname = 'Freelancers can submit (not to own contest)'
    AND cmd = 'INSERT';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'contest_submissions INSERT policy re-creation failed';
  END IF;
END $$;

-- Also refresh the other policies on this table that reference `contests`
-- (SELECT policy has no cross-table refs; UPDATE policies do — recreate them
-- defensively so a dangling OID can never resurface here).
DROP POLICY IF EXISTS "Contest owners can update submission status" ON public.contest_submissions;
CREATE POLICY "Contest owners can update submission status"
  ON public.contest_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contests c
      WHERE c.id = contest_submissions.contest_id
        AND c.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contests c
      WHERE c.id = contest_submissions.contest_id
        AND c.client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Freelancers can update their own submissions" ON public.contest_submissions;
CREATE POLICY "Freelancers can update their own submissions"
  ON public.contest_submissions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = freelancer_id)
  WITH CHECK (auth.uid() = freelancer_id);

-- ── 2. Fix the submission-count trigger function (TRUE root cause) ────────
-- The live function had search_path TO 'public, pg_catalog' written as ONE
-- quoted string — Postgres parses that as a single (invalid) schema name and
-- silently sets search_path to empty. Combined with the unqualified
-- `UPDATE contests`, every INSERT/DELETE on contest_submissions failed with
-- 42P01 `relation "contests" does not exist`. Same defect class as the
-- close_expired_contests cron bug fixed in 20261227000000 — this sibling
-- trigger was missed in that sweep.
-- Fix: qualified table refs + correctly quoted search_path list.
CREATE OR REPLACE FUNCTION public.update_contest_submission_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contests SET submission_count = submission_count + 1 WHERE id = NEW.contest_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.contests SET submission_count = submission_count - 1 WHERE id = OLD.contest_id;
  END IF;
  RETURN NULL;
END;
$function$;

-- Sanity: the function must now resolve public.contests (qualified source +
-- valid multi-schema search_path).
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  WHERE p.proname = 'update_contest_submission_count' AND p.pronamespace = 'public'::regnamespace;
  IF v_def NOT LIKE '%public.contests%' THEN
    RAISE EXCEPTION 'update_contest_submission_count still uses unqualified contests ref';
  END IF;
END $$;

-- ── 2b. notify_contest_submission: search_path='' is correct (fully-qualified
-- body), leave as is — trigger functions cannot be smoke-called directly.

-- ── 3. Repair check_security_drift (email column guard) ───────────────────
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

  -- 🔴 CRITICAL: open PUBLIC write policies on ANY table (admin_users-style
  --    hole: roles={public} + WITH CHECK true = anyone can write)
  FOR v_finding IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text LIKE '%{public}%'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      -- sirf truly-open policies flag karo (WITH CHECK literally true, ya
      -- qual literally true). Admin-checked policies (complex qual + NULL
      -- with_check) false-positive nahi honge.
      AND (
        lower(coalesce(with_check, '')) = 'true'
        OR (with_check IS NULL AND lower(coalesce(qual, '')) = 'true')
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'open_public_write'
        AND detail LIKE '%' || v_finding.policyname || '%'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        'critical',
        'open_public_write',
        format('PUBLIC write policy %s on %s (cmd=%s) — koi bhi user write kar sakta hai', v_finding.policyname, v_finding.tablename, v_finding.cmd)
      );
      v_new := v_new + 1;
    END IF;
  END LOOP;

  -- 🔴 CRITICAL: anon PII access on profiles (email/phone leak)
  -- ✅ FIXED: both column checks are now guarded by information_schema EXISTS
  -- (email moved to profiles_private — the unguarded has_column_privilege
  -- call threw 42703 and crashed this audit every hour).
  IF (EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='profiles' AND column_name='email')
      AND has_column_privilege('anon', 'public.profiles', 'email', 'SELECT'))
     OR (EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='phone')
         AND has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT')) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'anon_pii_select'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        'critical',
        'anon_pii_select',
        'anon role can SELECT PII (email/phone) from profiles — REVOKE required'
      );
      v_new := v_new + 1;
    END IF;
  END IF;

  -- 📨 Real-time admin email via the CRON_SECRET-protected notify function
  IF v_new > 0 THEN
    SELECT value INTO v_cron_secret FROM public.cron_settings WHERE key = 'cron_secret';
    IF v_cron_secret IS NOT NULL AND v_cron_secret <> '' THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://zttwsjehcgaicziqyxpq.supabase.co/functions/v1/security-alert-notify',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_cron_secret
          ),
          body := jsonb_build_object('count', v_new)
        );
      EXCEPTION WHEN OTHERS THEN
        -- Email is best-effort; never fail the audit itself
        NULL;
      END;
    END IF;
  END IF;

  RETURN v_new;
END;
$$;
