-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000026_signup_profile_trigger.sql
--
-- WHY (live incident, 2026-10-10 16:26 UTC — "LinkedIn/GitHub se signup nahi hota")
--
--   A real LinkedIn (linkedin_oidc) sign-up produced auth.users row
--   e89e3845-f3a5-49a2-8a5b-1f0d9bf2d435 and NOTHING else: no profiles row, no
--   profiles_private row, no wallet. Live evidence:
--     • auth_logs 16:26:17Z — /callback 302, auth_event user_signedup + Login
--       (provider leg fine), then a SECOND /callback with
--       "400: OAuth state not found or expired" → 303 back to the site.
--     • postgrest_logs 16:27:13Z — "Warp server error: Thread killed by timeout
--       manager", i.e. the profile-creation request was killed mid-flight.
--     • src/lib/supabase.ts aborts every request after REQUEST_TIMEOUT_MS=15s,
--       so the browser gave up on the same window.
--     • 13 h later the account still had no profile (auth.users ⋈ profiles
--       mismatch) — nothing server-side ever repairs it.
--
--   Root cause: the profile leg was ENTIRELY browser-driven. Since
--   20270119000009 dropped the last (already orphaned) auth.users trigger,
--   nothing server-side creates a profile — the browser calls the
--   create_user_profile RPC once, right after the OAuth redirect. Any hiccup in
--   that few-second window (slow backend, closed tab, mobile network, refresh)
--   leaves a permanent "ghost" account that can never finish onboarding, so the
--   user sees signup/login as broken. Today the provider is not the problem:
--   GitHub + LinkedIn OIDC are enabled live and both authorize correctly.
--
-- FIX — server-side, idempotent, layered:
--   1. AFTER INSERT ON auth.users → ensure_signup_profile() writes
--      profiles + profiles_private; the existing profiles triggers then create
--      the wallet + notification_preferences. Provider-independent, no browser.
--   2. Backfill every existing ghost account (this repairs the live LinkedIn
--      account and two older ones).
--   3. signup_profile_failures records any trigger failure, so the fail-soft
--      path is observable instead of silent.
--   4. signup_ghost_accounts() + an hourly check_security_drift() sweep make the
--      whole class self-detecting: a regression alerts instead of quietly
--      eating sign-ups.
--   The browser path is unchanged (create_user_profile is still an idempotent
--   upsert and stays the role/referral writer) — this only removes the single
--   point of failure. Signing in twice must still not duplicate anything.
--
-- Design notes:
--   • profiles.id has NO FK to auth.users in this schema; profiles_private /
--     wallets / notification_preferences all reference profiles(id) ON DELETE
--     CASCADE. So profiles must be inserted FIRST, and deleting a profiles row
--     takes the rest with it.
--   • AFTER INSERT (not BEFORE): a BEFORE trigger would hold the auth row
--     uncommitted while the browser's FK-less insert races it, and the wallet
--     trigger chain must run on a committed-enough row. AFTER INSERT runs inside
--     the same transaction, so PostgREST readers never see a profile-less user.
--   • The trigger is SECURITY DEFINER and owned by postgres; the helper is
--     server-only (revoked from PUBLIC/anon/authenticated) because it inserts a
--     profile row for a caller-supplied id.
--   • IDEMPOTENT: re-running is safe — plain CREATE OR REPLACE + ON CONFLICT DO
--     NOTHING, and the drift patch returns early when already present.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Observability for a fail-soft trigger ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.signup_profile_failures (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  email text,
  error text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signup_profile_failures IS
  'A signup whose profile could not be created by the auth.users trigger. Signup is never blocked by a profile failure (that would reject the user outright), so this table is the record that keeps the fail-soft path honest. Signup itself stays functional: AuthContext/OnboardingPage self-heal, and signup_ghost_accounts() re-reports any account that still lacks a profile.';

ALTER TABLE public.signup_profile_failures ENABLE ROW LEVEL SECURITY;
-- No policies: service_role (bypasses RLS) + postgres only. App roles get
-- nothing — the rows contain user ids and emails.
REVOKE ALL ON public.signup_profile_failures FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.signup_profile_failures TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.signup_profile_failures_id_seq TO service_role;

-- ─── 2. The one writer both the trigger and the backfill go through ────────
CREATE OR REPLACE FUNCTION public.ensure_signup_profile(
  p_id uuid,
  p_email text,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_created_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_meta jsonb := COALESCE(p_meta, '{}'::jsonb);
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_name text;
  v_role text;
  v_ref text;
BEGIN
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user id is required');
  END IF;

  v_name := COALESCE(
    NULLIF(btrim(v_meta ->> 'name'), ''),
    NULLIF(btrim(v_meta ->> 'full_name'), ''),
    NULLIF(btrim(v_meta ->> 'user_name'), ''),
    NULLIF(btrim(v_meta ->> 'preferred_username'), ''),
    NULLIF(split_part(COALESCE(v_email, ''), '@', 1), ''),
    'User'
  );

  -- The signup modal stores the chosen role in localStorage (GoTrue cannot
  -- carry it), so OAuth sign-ups normally land here as 'freelancer' and the
  -- client corrects it — exactly as it already does today.
  v_role := CASE
    WHEN v_meta ->> 'role' IN ('freelancer', 'client') THEN v_meta ->> 'role'
    ELSE 'freelancer'
  END;

  v_ref := 'GRW-' || upper(left(v_role, 2)) || '-' || substring(md5(p_id::text) from 1 for 6);

  -- Server-side writer → the documented escape hatch for the privilege-column
  -- guards (same flag grant_admin_role / complete_onboarding set).
  PERFORM set_config('app.bypass_privilege_check', '1', true);

  -- profiles first: profiles_private / wallets / notification_preferences all
  -- reference profiles(id) ON DELETE CASCADE. The profiles AFTER INSERT
  -- triggers create the wallet + notification preferences.
  INSERT INTO public.profiles (id, name, role, created_at)
  VALUES (p_id, v_name, v_role, COALESCE(p_created_at, now()))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles_private (id, email, referral_code, onboarding_completed)
  VALUES (p_id, v_email, v_ref, false)
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('app.bypass_privilege_check', '0', true);

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_id,
    'role', v_role,
    'referral_code', v_ref
  );
END;
$function$;

COMMENT ON FUNCTION public.ensure_signup_profile(uuid, text, jsonb, timestamptz) IS
  'Idempotently creates the profiles + profiles_private rows a signup needs. Server-only: it writes for a caller-supplied id. Called by the auth.users insert trigger and by the backfill in 20270119000026.';

-- ─── 3. Trigger function on auth.users ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  BEGIN
    PERFORM public.ensure_signup_profile(
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data,
      COALESCE(NEW.created_at, now())
    );
  EXCEPTION WHEN OTHERS THEN
    -- NEVER block the signup itself: a hard failure here would reject every
    -- new GitHub/LinkedIn/email user at the auth layer (worse than a ghost
    -- account, because the account would not exist at all). Record it loudly
    -- instead — signup_ghost_accounts() re-reports the account until it is
    -- repaired, and the client self-heals on the next load.
    BEGIN
      INSERT INTO public.signup_profile_failures (user_id, email, error)
      VALUES (NEW.id, NEW.email, SQLERRM);
    EXCEPTION WHEN OTHERS THEN
      -- Recording must not become the thing that breaks signup, but it must
      -- never be silent either — the server log is the last line of defence.
      RAISE WARNING 'signup_profile_failures insert failed for % (%): %', NEW.id, NEW.email, SQLERRM;
    END;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_new_auth_user_profile() IS
  'AFTER INSERT ON auth.users: guarantees every new auth account has profiles + profiles_private (and therefore a wallet). Fail-soft + recorded in signup_profile_failures; the hourly drift sweep flags any account that still lacks a profile.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user_profile();

-- ─── 4. Repair the accounts created while nothing created profiles ─────────
-- (Live: the 2026-10-10 linkedin_oidc account + two older email accounts.)
DO $backfill$
DECLARE
  v_row record;
  v_repaired integer := 0;
BEGIN
  FOR v_row IN
    SELECT u.id, u.email, u.raw_user_meta_data, u.created_at
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
     WHERE p.id IS NULL
       AND u.deleted_at IS NULL
     ORDER BY u.created_at
  LOOP
    PERFORM public.ensure_signup_profile(v_row.id, v_row.email, v_row.raw_user_meta_data, v_row.created_at);
    v_repaired := v_repaired + 1;
  END LOOP;

  RAISE NOTICE 'signup profile backfill repaired % account(s)', v_repaired;
END
$backfill$;

-- ─── 5. Self-detecting: auth account with no profile ──────────────────────
CREATE OR REPLACE FUNCTION public.signup_ghost_accounts()
RETURNS TABLE (user_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'auth'
AS $function$
  SELECT u.id, u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE p.id IS NULL
     AND u.deleted_at IS NULL
   ORDER BY u.created_at DESC;
$function$;

COMMENT ON FUNCTION public.signup_ghost_accounts() IS
  'Authenticated accounts with no profiles row — the state that makes login look broken. Server-only; swept hourly by check_security_drift(). Returns ids only (no PII).';

-- Wire it into the hourly sweep. Patch-by-anchor (never retype the 17 KB body);
-- an anchor miss aborts the migration instead of silently doing nothing.
DO $patch_drift$
DECLARE
  v_oid oid;
  v_body text;
  v_anchor text := '  -- 📨 Real-time admin email via the CRON_SECRET-protected notify function';
  v_block text;
BEGIN
  SELECT p.oid, pg_get_functiondef(p.oid)
    INTO v_oid, v_body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'check_security_drift'
     AND p.pronargs = 0
   LIMIT 1;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'check_security_drift() not found — refusing to skip the ghost-account sweep';
  END IF;

  IF position('signup_ghost_account' in v_body) > 0 THEN
    RETURN; -- already wired (idempotent re-run)
  END IF;

  IF position(v_anchor in v_body) = 0 THEN
    RAISE EXCEPTION 'anchor not found in check_security_drift() — refusing to guess where to wire the ghost-account sweep';
  END IF;

  v_block := $block$  -- 🔴 HIGH: an authenticated account with no profiles row. This is the state
  --    that made every GitHub/LinkedIn sign-up look broken: the provider leg
  --    succeeded, the browser-side profile write was killed/timed out, and
  --    nothing server-side ever repaired it (20270119000026).
  FOR v_finding IN
    SELECT user_id, created_at FROM public.signup_ghost_accounts()
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'signup_ghost_account'
        AND detail LIKE '%' || v_finding.user_id::text || '%'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        'high',
        'signup_ghost_account',
        format('Account %s authenticated but has no profiles row (created %s) — signup cannot complete until ensure_signup_profile() runs', v_finding.user_id, v_finding.created_at)
      );
      v_new := v_new + 1;
    END IF;
  END LOOP;

$block$;

  v_body := replace(v_body, v_anchor, v_block || v_anchor);
  EXECUTE v_body;
END
$patch_drift$;

-- ─── 6. Grants ────────────────────────────────────────────────────────────
-- Server-only writer + detector. The trigger function itself needs no grant:
-- PostgreSQL does not check EXECUTE on a trigger function when the trigger
-- fires (asserted by the positive control below — if that assumption were
-- wrong, the probe insert would fail and this migration would abort).
REVOKE ALL ON FUNCTION public.ensure_signup_profile(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signup_ghost_accounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_auth_user_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_signup_profile(uuid, text, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.signup_ghost_accounts() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user_profile() TO service_role;

-- ─── 7. Fail-closed assertions + positive control ─────────────────────────
DO $assertions$
DECLARE
  v_trg record;
  v_oid oid;
  v_ghosts integer;
  v_probe uuid := gen_random_uuid();
  v_rows integer;
  v_flagged integer;
  v_policy_count integer;
BEGIN
  -- (a) the trigger exists, is enabled, is AFTER INSERT FOR EACH ROW
  SELECT t.tgenabled, pg_get_triggerdef(t.oid) AS def, p.proname AS fn
    INTO v_trg
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE n.nspname = 'auth'
     AND c.relname = 'users'
     AND t.tgname = 'on_auth_user_created'
     AND NOT t.tgisinternal;

  IF v_trg.def IS NULL THEN
    RAISE EXCEPTION 'assertion failed: on_auth_user_created is not attached to auth.users';
  END IF;
  IF v_trg.def NOT LIKE '%AFTER INSERT%' OR v_trg.def NOT LIKE '%FOR EACH ROW%' THEN
    RAISE EXCEPTION 'assertion failed: on_auth_user_created is not AFTER INSERT FOR EACH ROW (%)', v_trg.def;
  END IF;
  IF v_trg.fn <> 'handle_new_auth_user_profile' THEN
    RAISE EXCEPTION 'assertion failed: on_auth_user_created points at %', v_trg.fn;
  END IF;
  IF v_trg.tgenabled <> 'O' THEN
    RAISE EXCEPTION 'assertion failed: on_auth_user_created is not enabled (tgenabled=%)', v_trg.tgenabled;
  END IF;

  -- (b) functions resolve by OID (never by guessed name+arglist spelling)
  FOREACH v_oid IN ARRAY ARRAY[
    to_regprocedure('public.ensure_signup_profile(uuid,text,jsonb,timestamptz)'),
    to_regprocedure('public.handle_new_auth_user_profile()'),
    to_regprocedure('public.signup_ghost_accounts()')
  ]
  LOOP
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'assertion failed: a 20270119000026 function is missing';
    END IF;
  END LOOP;

  -- (c) no app role can call the server-only writers
  FOR v_oid IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('ensure_signup_profile', 'handle_new_auth_user_profile', 'signup_ghost_accounts')
  LOOP
    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion failed: app role can EXECUTE server-only function %', v_oid::regprocedure;
    END IF;
  END LOOP;

  -- (d) signup_profile_failures is closed to app roles
  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'signup_profile_failures';
  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'assertion failed: signup_profile_failures has % RLS policy/policies (must be server-only)', v_policy_count;
  END IF;
  IF has_table_privilege('anon', 'public.signup_profile_failures', 'SELECT')
     OR has_table_privilege('authenticated', 'public.signup_profile_failures', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: an app role can read signup_profile_failures';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'signup_profile_failures' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'assertion failed: signup_profile_failures has RLS disabled';
  END IF;

  -- (e) the sweep is wired
  IF position('signup_ghost_account' in (
       SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'check_security_drift'
  )) = 0 THEN
    RAISE EXCEPTION 'assertion failed: check_security_drift() does not sweep signup_ghost_accounts()';
  END IF;

  -- (f) the backfill above left no ghost behind (direct call — this function
  --     returns a set, so `count(*) FROM it` is meaningful, unlike the scalar
  --     check_security_drift() trap that made an earlier assertion vacuous)
  SELECT count(*) INTO v_ghosts FROM public.signup_ghost_accounts();
  IF v_ghosts <> 0 THEN
    RAISE EXCEPTION 'assertion failed: % account(s) still have no profiles row after the backfill', v_ghosts;
  END IF;

  -- ═══ POSITIVE CONTROL ══════════════════════════════════════════════════
  -- Insert a real auth.users row in this transaction and require the trigger
  -- to produce the rows. This is what proves the fix (and proves the revoked
  -- EXECUTE on the trigger function does not stop it from firing). Then plant a
  -- ghost and require the detector to flag it.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_probe,
    'authenticated',
    'authenticated',
    'signup-trigger-probe@growlancer-test.com',
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('name', 'Signup Trigger Probe'),
    now(),
    now()
  );

  SELECT count(*) INTO v_rows FROM public.profiles WHERE id = v_probe;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'positive control failed: the auth.users trigger created % profiles row(s), expected 1', v_rows;
  END IF;

  SELECT count(*) INTO v_rows FROM public.profiles_private WHERE id = v_probe;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'positive control failed: no profiles_private row created (rows=%)', v_rows;
  END IF;

  SELECT count(*) INTO v_rows FROM public.wallets WHERE user_id = v_probe;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'positive control failed: no wallet created by the profiles trigger (rows=%)', v_rows;
  END IF;

  SELECT count(*) INTO v_rows FROM public.profiles WHERE id = v_probe AND name = 'Signup Trigger Probe';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'positive control failed: the profile name did not come from raw_user_meta_data';
  END IF;

  -- plant a ghost (profiles delete cascades to profiles_private/wallets) and
  -- require the detector to report it
  DELETE FROM public.profiles WHERE id = v_probe;
  SELECT count(*) INTO v_flagged FROM public.signup_ghost_accounts() g WHERE g.user_id = v_probe;
  IF v_flagged <> 1 THEN
    RAISE EXCEPTION 'positive control failed: signup_ghost_accounts() reported % row(s) for the planted ghost', v_flagged;
  END IF;

  -- cleanup: the probe must leave nothing behind (auth row removed with the
  -- deletion cascade trigger bypassed, the documented escape hatch)
  PERFORM set_config('app.user_delete_in_progress', '1', true);
  DELETE FROM public.profiles_private WHERE id = v_probe;
  DELETE FROM public.wallets WHERE user_id = v_probe;
  DELETE FROM public.notification_preferences WHERE user_id = v_probe;
  DELETE FROM auth.users WHERE id = v_probe;
  PERFORM set_config('app.user_delete_in_progress', '0', true);

  SELECT count(*) INTO v_rows FROM auth.users WHERE id = v_probe;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'positive control cleanup failed: probe auth row still present';
  END IF;
  SELECT count(*) INTO v_ghosts FROM public.signup_ghost_accounts();
  IF v_ghosts <> 0 THEN
    RAISE EXCEPTION 'positive control cleanup failed: % ghost account(s) left after cleanup', v_ghosts;
  END IF;

  RAISE NOTICE '20270119000026: signup profile trigger + backfill + ghost sweep verified (positive control passed)';
END
$assertions$;
