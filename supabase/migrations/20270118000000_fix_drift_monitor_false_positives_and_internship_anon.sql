-- ═══════════════════════════════════════════════════════════════════════════
-- 20270118000000_fix_drift_monitor_false_positives_and_internship_anon.sql
--
-- Fixes the three real issues behind the 2026-09-07 hourly-scan findings:
--
-- 1. RESTORE anonymous internship resume uploads (REGRESSION from
--    20270117010000). The internship application form is a PUBLIC careers
--    flow — applicants do not have accounts (live proof: all 17 existing
--    resumes in storage.objects have owner IS NULL; anon upload now 403s).
--    The 20270117010000 change to `TO authenticated` broke it.
--    Resolution: dedicated policy `TO anon` for the public application flow,
--    scoped to the resumes/ folder and PDF-only, so the bucket is NOT open:
--      • anon: INSERT only, only under resumes/, only .pdf
--      • authenticated: INSERT/UPDATE under resumes/ (admin/manual flows)
--    Bucket itself stays private (no public reads — fixed in 6f75649).
--    Supabase's advisor will still flag the anon policy by design (it flags
--    any anon INSERT); that residual is accepted and documented here —
--    resumes/ is append-only untrusted upload with admin-only reads.
--
-- 2. FIX check_security_drift false positives (the actual bug this scan
--    exposed — 8 of 9 open_storage_write findings were wrong):
--    The monitor runs with `SET search_path = public, pg_catalog, storage`
--    (no auth). pg_get_expr() renders expressions using the CURRENT
--    search_path, so `auth.uid()` inside a policy renders as bare `uid()`
--    and the rule `with_check NOT LIKE '%auth.uid()%'` never matches →
--    every correctly-scoped policy got flagged. Same rendering quirk hit
--    definer_no_search_path: functions whose SOURCE contains "search_path"
--    in a comment matched `prosrc ILIKE '%search_path%'` (e.g. fund escrow
--    helpers) — that check is fine, but the proconfig fallback was checking
--    for ANY search_path= entry, including the BROKEN empty form
--    (`search_path=""`), so genuinely broken functions passed the rule.
--    Fixes:
--      a) storage rule: qualify the check text before matching — replace
--         bare uid()/role() tokens too, i.e. test against a NORMALIZED
--         string where `uid()` → `auth.uid()`. Simplest robust form: flag
--         only if the check text contains NEITHER 'uid()' NOR 'role()'
--         (bare or qualified) AND neither 'auth.' — ownership-checked
--         policies (contract participants EXISTS subquery) still contain
--         at least one of these tokens, while truly-open policies (bucket
--         equality only) contain none.
--      b) definer rule: UNCHANGED semantics — any search_path config counts
--         as set. Note `SET search_path = ''` (the empty form) is
--         Supabase's OWN recommended hardening for SECURITY DEFINER
--         functions with fully-qualified bodies (all 60 such functions
--         here were verified fully-qualified and exercise fine in the
--         live money path), so the empty form must NOT be flagged. The
--         truly broken form (single quoted token containing commas) was
--         already repaired by 20270117000000 and none remain live.
--
-- 3. RESOLVE stale alerts: mark the false-positive open_storage_write rows
--    (all except the internship one, which is now intentionally scoped)
--    and the definer_no_search_path rows for the five functions already
--    pinned live (verified 2026-09-07 via pg_proc: hold_wallet_funds,
--    handle_new_profile_private, release_wallet_funds, update_wallet_balance
--    all carry `search_path=public, pg_catalog`; is_disposable_email_domain
--    carries `search_path=public`).
--
-- Idempotent: policy DROP/CREATE + CREATE OR REPLACE + UPDATE ... WHERE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Internship resumes: restore the public application flow ─────────────
-- (20270117010000 replaced "Anyone can upload internship resumes" with an
--  authenticated-only policy; the flow is anonymous, so it broke.)

-- Drop the broken authenticated-only policy, re-create it scoped (admin and
-- staff uploads still allowed, resumes/ folder only).
DROP POLICY IF EXISTS "Authenticated users can upload internship resumes" ON storage.objects;
CREATE POLICY "Authenticated users can upload internship resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internship_resumes'::text
  AND (storage.foldername(name))[1] = 'resumes'
);

-- NEW: the public application flow — anon applicants CAN upload their resume.
-- Scoped hard: only under resumes/, only .pdf, append-only (no UPDATE/DELETE
-- for anon, no public read — bucket is private, admin reads via signed URLs).
DROP POLICY IF EXISTS "Anonymous applicants can upload internship resumes" ON storage.objects;
CREATE POLICY "Anonymous applicants can upload internship resumes"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'internship_resumes'::text
  AND (storage.foldername(name))[1] = 'resumes'
  AND lower(right(name, 4)) = '.pdf'
);

-- ── 2. Repair check_security_drift (both false-positive rules) ─────────────
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
  v_check text;
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

  -- 🟠 HIGH: SECURITY DEFINER functions without SET search_path (new ones
  --    only). Any search_path= entry in proconfig counts — INCLUDING the
  --    empty form (`search_path=""`), which is Supabase's recommended
  --    hardening for fully-qualified bodies. (The genuinely broken form —
  --    a single quoted token containing commas — was repaired by
  --    20270117000000; none remain live.)
  FOR v_finding IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
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

  -- 🟠 HIGH: storage write policies without any ownership/auth check.
  --    RENDER-AWARE: pg_get_expr renders policy expressions using THIS
  --    function's search_path (no auth schema), so `auth.uid()` appears as
  --    bare `uid()` here. Matching on the qualified spelling only produced
  --    8 false positives per scan. Instead, flag a policy only when its
  --    check text contains NO identity token in either spelling:
  --    uid( / role( / auth. — ownership-scoped policies always carry at
  --    least one; truly-open bucket-equality policies carry none.
  FOR v_finding IN
    SELECT p.tablename AS bucket_hint, p.policyname, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.cmd IN ('INSERT', 'ALL')
  LOOP
    v_check := lower(coalesce(v_finding.with_check, ''));
    IF v_check NOT LIKE '%uid(%'
       AND v_check NOT LIKE '%role(%'
       AND v_check NOT LIKE '%auth.%'
       -- Accepted exception (documented in this migration): the public
       -- internship application flow needs anonymous uploads; the policy is
       -- hard-scoped to the resumes/ folder + .pdf, bucket is read-private.
       AND v_finding.policyname <> 'Anonymous applicants can upload internship resumes' THEN
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

-- ── 3. Resolve stale/false-positive alerts ─────────────────────────────────
-- 3a. open_storage_write alerts whose policy NOW carries an identity token
--     (uid, role, or auth in either spelling — dynamic, rendering-proof),
--     plus the accepted internship exception.
UPDATE public.security_alerts a
SET is_resolved = true, resolved_at = NOW()
WHERE a.category = 'open_storage_write'
  AND a.is_resolved = false
  AND (
    a.detail LIKE '%Anonymous applicants can upload internship resumes%'
    OR EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'storage'
        AND a.detail LIKE '%' || p.policyname || '%'
        AND (
          lower(coalesce(p.with_check, '')) LIKE '%uid(%'
          OR lower(coalesce(p.with_check, '')) LIKE '%role(%'
          OR lower(coalesce(p.with_check, '')) LIKE '%auth.%'
        )
      )
    OR NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'storage'
        AND a.detail LIKE '%' || p.policyname || '%'
    )
  );

-- 3b. definer_no_search_path alerts whose function NOW carries any
--     search_path config (dynamic — covers the five pinned live plus any
--     future stale rows).
UPDATE public.security_alerts a
SET is_resolved = true, resolved_at = NOW()
WHERE a.category = 'definer_no_search_path'
  AND a.is_resolved = false
  AND EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND a.detail LIKE '%' || p.proname || '%'
      AND p.proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
  );

-- ── 4. Sanity guards ────────────────────────────────────────────────────────
DO $sanity$
DECLARE
  v_anon_policy int;
  v_monitor_sp text;
BEGIN
  SELECT count(*) INTO v_anon_policy
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND policyname = 'Anonymous applicants can upload internship resumes'
    AND cmd = 'INSERT';
  IF v_anon_policy <> 1 THEN
    RAISE EXCEPTION 'anon internship upload policy missing';
  END IF;

  SELECT coalesce(string_agg(c, ','), '') INTO v_monitor_sp
  FROM pg_proc p,
       unnest(p.proconfig) c
  WHERE p.proname = 'check_security_drift'
    AND p.pronamespace = 'public'::regnamespace
    AND c LIKE 'search_path=%';
  IF v_monitor_sp IS NULL OR v_monitor_sp = '' THEN
    RAISE EXCEPTION 'check_security_drift lost its search_path';
  END IF;
END;
$sanity$;
