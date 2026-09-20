-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: functions still reading columns that migration 20261221000000 moved
--      off public.profiles → profiles_private
--      (email, phone, is_admin, suspended_at, suspend_reason, suspended_by,
--       banned_at, onboarding_completed, referral_code, bio)
--
-- These call-sites were missed. Each one fails at RUNTIME with 42703
-- ("column ... does not exist"), and because most of them wrap every step in
-- `EXCEPTION WHEN OTHERS`, the failure was silent — the admin console looked
-- empty and these flows just never happened:
--
--   • process_referral             → every referral code rejected
--   • request_account_deletion     → users cannot request deletion at all
--   • process_account_deletion     → queued deletion never completes
--   • delete_user_all_data         → role + email BOTH null (the read is inside
--                                    its own EXCEPTION handler), so the
--                                    role-specific profile row and ALL
--                                    email-scoped PII (waitlist / newsletter /
--                                    contact_inquiries / internship_applications
--                                    / verification_rate_limits) survived
--                                    account deletion
--   • purge_orphan_user_data       → orphan cron always failed
--   • is_admin_user / is_user_suspended → dead but broken admin checks
--   • admin_signup                 → anon-callable SECURITY DEFINER RPC with a
--                                    hardcoded secret code; repo dropped it in
--                                    20260904000000 but live had drifted back
--   • handle_new_user / handle_new_profile_private → orphaned (no trigger) and
--                                    unattachable: they write NEW.email, which
--                                    profiles no longer has
--
-- Also closes two grant holes found while auditing the above:
--   • process_account_deletion was granted to PUBLIC/anon with NO caller check
--     → anyone could hard-delete an account given a request id
--   • is_admin_user / is_user_suspended were anon-executable
--
-- IDEMPOTENT: safe to re-run. The two long bodies (delete_user_all_data,
-- process_account_deletion) are patched from their existing definition rather
-- than retyped, and both patches RAISE if the anchor does not match, so a
-- mismatch fails the migration instead of silently doing nothing.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Admin / suspension checks ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
      LEFT JOIN public.profiles_private pp ON pp.id = p.id
     WHERE p.id = p_user_id
       AND (p.role = 'admin' OR COALESCE(pp.is_admin, false) = true)
  );
$$;
-- Not needed by any RLS policy or client path; keep it off the anon surface so
-- anonymous visitors cannot enumerate which ids are admins.
REVOKE ALL ON FUNCTION public.is_admin_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_user_suspended(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles_private
     WHERE id = p_user_id
       AND (suspended_at IS NOT NULL OR banned_at IS NOT NULL)
  );
$$;
REVOKE ALL ON FUNCTION public.is_user_suspended(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_suspended(uuid) TO authenticated, service_role;

-- ─── 2. Drop privileged / orphaned functions ───────────────────────────────
-- admin_signup: hardcoded default secret + takes an arbitrary user id. The repo
-- deliberately dropped it in 20260904000000; it was live again.
DROP FUNCTION IF EXISTS public.admin_signup(uuid, text);
-- handle_new_user: never in a migration, never attached to auth.users. Its body
-- writes profiles(email, referral_code) — columns that no longer exist. If it
-- were ever re-attached, every signup would lose its profile row.
DROP FUNCTION IF EXISTS public.handle_new_user();
-- handle_new_profile_private: 20261221000000 created it as a compatibility shim
-- but skipped its trigger (profiles.email was already gone), so it can never
-- run and cannot be re-pointed at the new schema.
DROP FUNCTION IF EXISTS public.handle_new_profile_private();

-- ─── 3. Referrals: referral_code lives on profiles_private ─────────────────
-- NOTE: the DEFAULTs on p_new_user_email / p_reason are load-bearing — CREATE OR
-- REPLACE cannot remove an existing default (SQLSTATE 42P13), and dropping them
-- would break the callers that pass only the leading arguments.
CREATE OR REPLACE FUNCTION public.process_referral(
  p_referral_code text,
  p_new_user_id uuid,
  p_new_user_email text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  IF p_new_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_referral_code IS NULL OR p_referral_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No referral code provided');
  END IF;

  IF p_new_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user ID provided');
  END IF;

  SELECT pp.id INTO v_referrer_id
  FROM public.profiles_private pp
  WHERE pp.referral_code = p_referral_code
    AND pp.id != p_new_user_id
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referrer_id = v_referrer_id AND referred_user_id = p_new_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already referred');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, referred_email, referral_code, status, bonus_claimed)
  VALUES (v_referrer_id, p_new_user_id, p_new_user_email, p_referral_code, 'pending', false);

  INSERT INTO public.referral_stats (user_id, total_referrals, valid_referrals, points, level, updated_at)
  VALUES (v_referrer_id, 1, 0, 0, 1, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_referrals = COALESCE(referral_stats.total_referrals, 0) + 1,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id
  );
END;
$$;

-- ─── 4. Account deletion: request → process → cascade ──────────────────────
CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_existing_id UUID;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  -- Only the account owner may request deletion
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- name is public, email is private (20261221000000 split)
  SELECT p.name, pp.email INTO v_user_name, v_user_email
    FROM public.profiles p
    LEFT JOIN public.profiles_private pp ON pp.id = p.id
   WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT id INTO v_existing_id FROM public.user_deletion_requests
    WHERE user_id = p_user_id AND status IN ('pending', 'confirmed');
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'A deletion request already exists', 'request_id', v_existing_id);
  END IF;

  INSERT INTO public.user_deletion_requests (user_id, reason, status, scheduled_deletion_at)
  VALUES (p_user_id, p_reason, 'pending', NOW() + INTERVAL '7 days')
  RETURNING id INTO v_existing_id;

  -- The request itself is what matters; a notification failure must not undo it.
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'account_deletion',
      'Account Deletion Requested',
      'Your account deletion request has been received. It will be processed after 7 days. You can cancel this request anytime from your settings.',
      '/dashboard/settings'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'request_account_deletion: notification failed for %: %', p_user_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_existing_id,
    'message', 'Deletion request created. Your account will be deleted after 7 days.',
    'scheduled_deletion_at', (SELECT scheduled_deletion_at FROM public.user_deletion_requests WHERE id = v_existing_id)
  );
END;
$$;

-- process_account_deletion is a destructive, unauthenticated-callable RPC that
-- nothing in the app or edge functions calls as a user. Service context only.
REVOKE ALL ON FUNCTION public.process_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_account_deletion(uuid) TO service_role;

DO $patch$
DECLARE
  v_src text;
  v_new text;
BEGIN
  -- ── 4a. process_account_deletion: caller guard + email from profiles_private
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'process_account_deletion'
     AND pg_get_function_identity_arguments(p.oid) = 'p_request_id uuid';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'process_account_deletion(uuid) not found — cannot patch';
  END IF;

  v_new := replace(
    v_src,
    '  v_user_email TEXT;' || chr(10) || 'BEGIN' || chr(10) ||
    '  -- Get the user_id and status from the deletion request',
    '  v_user_email TEXT;' || chr(10) ||
    '  v_caller UUID := auth.uid();' || chr(10) || 'BEGIN' || chr(10) ||
    '  -- Only service context (edge function / cron) or an admin may process a' || chr(10) ||
    '  -- queued deletion. This RPC used to take an arbitrary request id with no' || chr(10) ||
    '  -- caller check at all.' || chr(10) ||
    '  IF v_caller IS NOT NULL AND NOT EXISTS (' || chr(10) ||
    '    SELECT 1 FROM public.profiles_private' || chr(10) ||
    '     WHERE id = v_caller AND COALESCE(is_admin, false) = true' || chr(10) ||
    '  ) THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''success'', false, ''error'', ''Unauthorized: admins only'');' || chr(10) ||
    '  END IF;' || chr(10) || chr(10) ||
    '  -- Get the user_id and status from the deletion request'
  );
  IF v_new = v_src THEN
    RAISE EXCEPTION 'process_account_deletion caller-guard patch did not match';
  END IF;

  v_src := v_new;
  v_new := replace(
    v_src,
    'SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;',
    'SELECT pp.email INTO v_user_email FROM public.profiles_private pp WHERE pp.id = v_user_id;'
  );
  IF v_new = v_src THEN
    RAISE EXCEPTION 'process_account_deletion email-read patch did not match';
  END IF;

  EXECUTE v_new;

  -- ── 4b. delete_user_all_data: role from profiles, email from profiles_private
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'delete_user_all_data'
     AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'delete_user_all_data(uuid) not found — cannot patch';
  END IF;

  v_new := replace(
    v_src,
    'SELECT role, email INTO v_role, v_email FROM public.profiles WHERE id = p_user_id;',
    'SELECT p.role, pp.email INTO v_role, v_email' || chr(10) ||
    '       FROM public.profiles p' || chr(10) ||
    '       LEFT JOIN public.profiles_private pp ON pp.id = p.id' || chr(10) ||
    '      WHERE p.id = p_user_id;'
  );
  IF v_new = v_src THEN
    RAISE EXCEPTION 'delete_user_all_data role/email patch did not match';
  END IF;

  EXECUTE v_new;
END
$patch$;

-- purge_orphan_user_data listed orphans with profiles.email (gone) → the whole
-- cron job failed. Read the email from profiles_private instead.
CREATE OR REPLACE FUNCTION public.purge_orphan_user_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $$
DECLARE
  v_orphan RECORD;
  v_res    JSONB;
  v_report JSONB := '[]'::jsonb;
  v_locked BOOLEAN;
BEGIN
  SELECT pg_try_advisory_lock(hashtext('grw_purge_orphans')) INTO v_locked;
  IF NOT v_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'purge already running');
  END IF;

  BEGIN
    FOR v_orphan IN
      SELECT p.id, pp.email
        FROM public.profiles p
        LEFT JOIN public.profiles_private pp ON pp.id = p.id
       WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
       ORDER BY p.created_at ASC
    LOOP
      SELECT public.delete_user_all_data(v_orphan.id) INTO v_res;
      v_report := v_report || jsonb_build_object('orphan_id', v_orphan.id, 'email', v_orphan.email, 'result', v_res);
    END LOOP;

    PERFORM pg_advisory_unlock(hashtext('grw_purge_orphans'));
    RETURN jsonb_build_object(
      'success', true,
      'orphans_found', jsonb_array_length(v_report),
      'report', v_report
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext('grw_purge_orphans'));
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_orphan_user_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_orphan_user_data() TO service_role;

-- ─── 5. Fail-closed assertions ────────────────────────────────────────────
-- (a) The dropped privileged/orphaned functions must be gone.
DO $assert_dropped$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(sig, ', ') INTO v_left
    FROM (VALUES
      ('public.admin_signup(uuid,text)'),
      ('public.handle_new_user()'),
      ('public.handle_new_profile_private()')
    ) AS t(sig)
   WHERE to_regprocedure(t.sig) IS NOT NULL;

  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'Privileged/orphaned function(s) still present: %', v_left;
  END IF;
END
$assert_dropped$;

-- (b) Every fixed function must read the moved data from profiles_private, so a
--     future edit cannot silently reintroduce a profiles-only read.
DO $assert_rewired$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(t.sig, ', ') INTO v_bad
    FROM (VALUES
      ('public.is_admin_user(uuid)'),
      ('public.is_user_suspended(uuid)'),
      ('public.process_referral(text,uuid,text)'),
      ('public.request_account_deletion(uuid,text)'),
      ('public.process_account_deletion(uuid)'),
      ('public.delete_user_all_data(uuid)'),
      ('public.purge_orphan_user_data()')
    ) AS t(sig)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure(t.sig)
        AND p.prosrc ~* 'profiles_private'
   );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Function(s) not reading from profiles_private: %', v_bad;
  END IF;
END
$assert_rewired$;

-- (c) No function may use qualified access to a column that now lives on
--     profiles_private (profiles.email, profiles.is_admin, …). Bare-column reads
--     are covered by (b) for the functions fixed here; this catch-all covers
--     newly written code.
DO $assert_qualified$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.prosrc ~* '\m(public\.)?profiles\M\s*\.\s*(email|phone|is_admin|suspended_at|suspend_reason|suspended_by|banned_at|onboarding_completed|referral_code|bio)\M';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Function(s) using qualified access to moved profiles columns: %', v_bad;
  END IF;
END
$assert_qualified$;
