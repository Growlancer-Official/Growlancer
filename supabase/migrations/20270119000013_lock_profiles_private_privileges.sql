-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: self-writable privilege + reputation columns (live, exploitable)
--
-- Found by the deep audit that followed 20270119000012. Two classes, both
-- confirmed EXPLOITABLE against production with a real authenticated session,
-- each probe run inside a rolled-back transaction (no row was ever left dirty):
--
--   A) profiles_private — the table that holds the admin flag itself.
--      20261221000000 moved is_admin / suspension state off public.profiles and
--      protected profiles with a column-locked RLS policy (20270101000002) plus
--      a BEFORE UPDATE trigger (20270101000006). The new table got neither:
--        • UPDATE policy "Owner updates own private profile" is
--          USING (auth.uid() = id) WITH CHECK (auth.uid() = id) — row ownership
--          only, no column restriction.
--        • the table-wide ACL grants UPDATE + INSERT on EVERY column to anon
--          and authenticated (relacl: anon=arwdDxtm, authenticated=arwdDxtm).
--        • no protect_* trigger is attached (profiles and freelancer_profiles
--          both have one).
--      Probes (rolled back): `update is_admin = true` → ALLOWED rows=1;
--      `set suspended_at/suspend_reason/banned_at = NULL` → ALLOWED rows=1.
--
--      Impact is worse than a flag flip: admin-data's verifyAdminSession reads
--      ONLY profiles_private.is_admin, so a single PATCH hands the caller the
--      whole admin proxy (every user's email/PII, payments, escrow, contracts,
--      plus suspension writes). Clearing your own suspension also silently
--      defeats the ban. Both are the exact bug ibnu76 reported against
--      public.profiles — it moved tables, it did not get fixed.
--
--   B) profiles.rating / total_reviews and freelancer_profiles.rating /
--      total_reviews / reputation_score / weighted_rating — the merit signals
--      every client-facing surface renders (ClientFreelancerSearchPage,
--      ClientMatchesPage, ClientProposalsPage, InvitesPage, OverviewPage's
--      "top rated" gate). Neither existing guard covers them:
--      protect_profiles_privilege_columns only checks is_pro /
--      verification_status / role, protect_freelancer_profiles_... only checks
--      verification_status / seller_level.
--      Probes (rolled back): self-write of rating=5.0, total_reviews=999,
--      reputation_score=100 → ALLOWED rows=1 on both tables.
--      That is a direct break of the platform's non-negotiable merit-based
--      ranking promise (CLAUDE.md): a freelancer could award themselves a
--      perfect record with one PATCH, with no completed contract and no review.
--
-- Fixes, following the patterns this codebase already established:
--   1. profiles_private: table-wide UPDATE/INSERT revoked from anon +
--      authenticated and re-granted ONLY for the columns the browser
--      legitimately writes (id, email, phone, referral_code,
--      onboarding_completed, created_at, updated_at). is_admin and the
--      suspension columns become unwritable at the privilege layer — which also
--      closes the INSERT path a trigger alone cannot (a brand-new row carrying
--      is_admin = true).
--   2. profiles_private: protect_privilege_columns BEFORE INSERT OR UPDATE
--      trigger, mirroring profiles/freelancer_profiles, so ACL/RLS and the
--      trigger are independent layers (defense in depth).
--   3. The two existing protect_* triggers are extended to the reputation
--      columns, and update_reputation_score — the ONLY writer of those columns,
--      driven by the on_review_change trigger on reviews — is given the
--      app.bypass_privilege_check flag that every other server recompute sets.
--
-- SAFE FOR LEGITIMATE WRITERS (each verified against the live catalog):
--   • create_user_profile / complete_onboarding / grant_admin_role are
--     SECURITY DEFINER → they run as the owner, so the column ACL does not
--     apply to them, and grant_admin_role + complete_onboarding already set the
--     bypass flag. create_user_profile never touches a guarded column.
--   • the admin console's suspend / reactivate goes through admin-data as
--     service_role → allowed explicitly by the trigger (same idiom as the
--     country gate in 20260809000000) and keeps the table-wide ACL.
--   • update_reputation_score keeps working through the review trigger.
--   • the browser's only profiles_private writes are authService's
--     `update({email, referral_code, updated_at})` (duplicate-email path) and
--     `upsert({id, email, referral_code, onboarding_completed})` (signup
--     fallback) — every one of those columns stays granted.
--
-- IDEMPOTENT and FAIL-CLOSED: the update_reputation_score patch is applied from
-- its live definition and RAISEs when its anchor does not match, and the
-- assertion block at the end RAISEs if any lock is missing. Nothing here is a
-- silent no-op.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. profiles_private: drop the table-wide app-role write grants and re-grant
--    only the columns the browser legitimately writes.
--    service_role is untouched: the admin-data proxy and every edge function
--    keep full write access (asserted below).
--
--    The two lists below are read by src/test/profilesPrivatePrivilegeGuard.test.ts,
--    which fails if they ever disagree with the GRANTs or with app code.
--    GUARDED-COLUMNS: is_admin, suspended_at, suspend_reason, suspended_by, banned_at
--    CLIENT-WRITE-COLUMNS: id, email, phone, referral_code, onboarding_completed, created_at, updated_at
-- ───────────────────────────────────────────────────────────────────────────
REVOKE UPDATE, INSERT ON public.profiles_private FROM anon, authenticated;

GRANT SELECT ON public.profiles_private TO anon, authenticated;

-- Benign, owner-editable columns only.
GRANT INSERT (id, email, phone, referral_code, onboarding_completed, created_at, updated_at)
  ON public.profiles_private TO anon, authenticated;
GRANT UPDATE (id, email, phone, referral_code, onboarding_completed, created_at, updated_at)
  ON public.profiles_private TO anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. profiles_private: second, independent layer.
--    Mirrors protect_profiles_privilege_columns, with two additions:
--      • tgtype covers INSERT as well as UPDATE (a user with no private row
--        yet could otherwise publish is_admin = true on the first insert);
--      • the service_role exemption the admin console's suspend path needs.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_profiles_private_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Server-side writers set the flag explicitly (grant_admin_role,
  -- complete_onboarding) — the established escape hatch in this codebase.
  IF public.should_bypass_privilege_check() THEN
    RETURN NEW;
  END IF;

  -- service_role is the admin console's path (admin-data suspends/reactivates
  -- through it) and the path every edge function uses. Two independent checks
  -- because request.jwt.claims survives SECURITY DEFINER while the `role` GUC
  -- only tracks SET ROLE.
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
     OR COALESCE(current_setting('role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_admin, false) THEN
      RAISE EXCEPTION 'Cannot self-grant admin';
    END IF;
    IF NEW.suspended_at IS NOT NULL
       OR NEW.suspend_reason IS NOT NULL
       OR NEW.suspended_by IS NOT NULL
       OR NEW.banned_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot self-modify suspension state';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Cannot self-modify is_admin column';
  END IF;

  IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspend_reason IS DISTINCT FROM OLD.suspend_reason
     OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
     OR NEW.banned_at IS DISTINCT FROM OLD.banned_at THEN
    RAISE EXCEPTION 'Cannot self-modify suspension state';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_profiles_private_privilege_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profiles_private_privilege_columns() TO service_role;

DROP TRIGGER IF EXISTS protect_privilege_columns ON public.profiles_private;
CREATE TRIGGER protect_privilege_columns
  BEFORE INSERT OR UPDATE ON public.profiles_private
  FOR EACH ROW EXECUTE FUNCTION public.protect_profiles_private_privilege_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Reputation columns: extend both existing guards.
--    Only update_reputation_score writes these (verified by scanning every
--    function body in the live catalog); recompute_seller_level and the KYC
--    flips already carry the bypass flag.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_profiles_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.should_bypass_privilege_check() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_pro IS DISTINCT FROM OLD.is_pro THEN
    RAISE EXCEPTION 'Cannot self-modify is_pro column';
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    RAISE EXCEPTION 'Cannot self-modify verification_status column';
  END IF;

  -- Reputation is a merit signal every client surface renders: it may only be
  -- recomputed server-side from the reviews table (update_reputation_score).
  IF NEW.rating IS DISTINCT FROM OLD.rating THEN
    RAISE EXCEPTION 'Cannot self-modify rating column';
  END IF;

  IF NEW.total_reviews IS DISTINCT FROM OLD.total_reviews THEN
    RAISE EXCEPTION 'Cannot self-modify total_reviews column';
  END IF;

  IF NEW.role = 'admin' AND OLD.role != 'admin' THEN
    RAISE EXCEPTION 'Cannot self-promote to admin';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_freelancer_profiles_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.should_bypass_privilege_check() THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    RAISE EXCEPTION 'Cannot self-modify verification_status column';
  END IF;

  IF NEW.seller_level IS DISTINCT FROM OLD.seller_level THEN
    RAISE EXCEPTION 'Cannot self-modify seller_level column';
  END IF;

  IF NEW.rating IS DISTINCT FROM OLD.rating THEN
    RAISE EXCEPTION 'Cannot self-modify rating column';
  END IF;

  IF NEW.total_reviews IS DISTINCT FROM OLD.total_reviews THEN
    RAISE EXCEPTION 'Cannot self-modify total_reviews column';
  END IF;

  IF NEW.reputation_score IS DISTINCT FROM OLD.reputation_score THEN
    RAISE EXCEPTION 'Cannot self-modify reputation_score column';
  END IF;

  IF NEW.weighted_rating IS DISTINCT FROM OLD.weighted_rating THEN
    RAISE EXCEPTION 'Cannot self-modify weighted_rating column';
  END IF;

  RETURN NEW;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. update_reputation_score — the one legitimate writer of those columns.
--    Patched from its live definition (not retyped) and fail-closed: if the
--    anchor ever stops matching, the migration aborts instead of silently
--    leaving a function that the new guards would make unusable.
-- ───────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'update_reputation_score'
     AND pg_get_function_identity_arguments(p.oid) = 'p_freelancer_id uuid';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'update_reputation_score(uuid) not found — cannot patch';
  END IF;

  IF v_src LIKE '%bypass_privilege_check%' THEN
    RETURN; -- already patched (idempotent re-run)
  END IF;

  v_new := replace(
    v_src,
    'BEGIN' || chr(10) || '  -- Weighted rating (review-quality weighted average)',
    'BEGIN' || chr(10) ||
    '  -- Server recompute from the authoritative reviews table (fired by the' || chr(10) ||
    '  -- on_review_change trigger). Bypasses the reputation guards, which exist' || chr(10) ||
    '  -- to stop a user PATCHing their own score — not this recompute.' || chr(10) ||
    '  PERFORM set_config(''app.bypass_privilege_check'', ''true'', true);' || chr(10) || chr(10) ||
    '  -- Weighted rating (review-quality weighted average)'
  );

  IF v_new = v_src THEN
    RAISE EXCEPTION 'update_reputation_score bypass patch did not match';
  END IF;

  EXECUTE v_new;
END
$patch$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Assertions — the migration fails closed if any lock is not in place.
-- ───────────────────────────────────────────────────────────────────────────
DO $assert$
DECLARE
  v_bad text;
BEGIN
  -- 5a. No app role may write the privileged columns any more.
  SELECT string_agg(r.r || '.' || c.c, ', ' ORDER BY r.r, c.c) INTO v_bad
    FROM (VALUES ('anon'), ('authenticated')) AS r(r)
    CROSS JOIN (VALUES ('is_admin'), ('suspended_at'), ('suspend_reason'),
                       ('suspended_by'), ('banned_at')) AS c(c)
   WHERE has_column_privilege(r.r, 'public.profiles_private', c.c, 'UPDATE')
      OR has_column_privilege(r.r, 'public.profiles_private', c.c, 'INSERT');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Privilege column(s) still writable by app roles: %', v_bad;
  END IF;

  -- 5b. …while every column the browser legitimately writes stays writable.
  SELECT string_agg(c.c, ', ' ORDER BY c.c) INTO v_bad
    FROM (VALUES ('id'), ('email'), ('phone'), ('referral_code'),
                 ('onboarding_completed'), ('created_at'), ('updated_at')) AS c(c)
   WHERE NOT has_column_privilege('authenticated', 'public.profiles_private', c.c, 'UPDATE')
      OR NOT has_column_privilege('authenticated', 'public.profiles_private', c.c, 'INSERT');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Legitimate profiles_private column(s) lost write access: %', v_bad;
  END IF;

  -- 5c. service_role keeps full write access (admin-data suspend / reactivate).
  IF NOT has_table_privilege('service_role', 'public.profiles_private', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.profiles_private', 'INSERT') THEN
    RAISE EXCEPTION 'service_role lost write access on profiles_private — the admin suspend path would break';
  END IF;

  -- 5d. The second layer is attached and enabled (O = origin, A = always).
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.profiles_private'::regclass
       AND t.tgname = 'protect_privilege_columns'
       AND NOT t.tgisinternal
       AND t.tgenabled IN ('O', 'A')
  ) THEN
    RAISE EXCEPTION 'protect_privilege_columns trigger missing/disabled on profiles_private';
  END IF;

  -- 5e. Both reputation guards are in place.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'protect_profiles_privilege_columns'
       AND p.prosrc ILIKE '%NEW.rating IS DISTINCT FROM OLD.rating%'
       AND p.prosrc ILIKE '%NEW.total_reviews IS DISTINCT FROM OLD.total_reviews%'
  ) THEN
    RAISE EXCEPTION 'protect_profiles_privilege_columns is missing the reputation guards';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'protect_freelancer_profiles_privilege_columns'
       AND p.prosrc ILIKE '%NEW.rating IS DISTINCT FROM OLD.rating%'
       AND p.prosrc ILIKE '%NEW.total_reviews IS DISTINCT FROM OLD.total_reviews%'
       AND p.prosrc ILIKE '%NEW.reputation_score IS DISTINCT FROM OLD.reputation_score%'
       AND p.prosrc ILIKE '%NEW.weighted_rating IS DISTINCT FROM OLD.weighted_rating%'
  ) THEN
    RAISE EXCEPTION 'protect_freelancer_profiles_privilege_columns is missing the reputation guards';
  END IF;

  -- 5f. The one legitimate writer kept its escape hatch — without it every
  --     review insert would fail and no rating could ever be recorded.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'update_reputation_score'
       AND p.prosrc ILIKE '%bypass_privilege_check%'
  ) THEN
    RAISE EXCEPTION 'update_reputation_score lost the bypass flag — reviews would stop updating ratings';
  END IF;
END
$assert$;
