-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000012 — Authorization hardening: systematic IDOR + EXECUTE-grant audit
--
-- Findings this migration closes. Every missing guard and every over-broad
-- grant below was confirmed against the LIVE catalog (pg_proc.proacl) before
-- writing, and every call-site was read so that a legitimate flow is never
-- broken by the revocation:
--
--  A. IDOR guards (caller must own the targeted row / own the project / be an
--     admin) — 21 functions:
--     13 notification/push/wallet-read/match functions took an arbitrary
--        p_user_id with no check → any user could read another user's
--        notifications, push-token list, or wallet balance, and write
--        another user's preferences or tokens.
--     create_user_profile: no caller check → any anon caller could overwrite
--        another profile's name and profiles_private.email/referral_code.
--     get_team_role_contract: p_client_id was client-supplied and unchecked.
--     generate_project_matches / upsert_project_matches: anon-callable AI
--        compute on any project id.
--     generate_credential_token: rotates any credential's QR token; only
--        AdminQRManager uses it → admin-only now.
--     insert_credential_audit_log / insert_credential_version: any
--        authenticated user could append forged audit/version rows for any
--        credential → admin-only now (grants kept — the admin console calls
--        them from the browser, so revoking would have silently killed the
--        audit trail instead of protecting it).
--     join_waitlist: stays anon-callable (pre-signup UX) but its optional
--        p_user_id must now be the caller's own id when supplied.
--
--  B. Server-only EXECUTE revocations (service_role keeps access — verified:
--     every function below already carried an explicit service_role grant, and
--     the migration re-grants it defensively and asserts it):
--     update_wallet_balance (owner branch allowed SELF-CREDITING — money hole),
--     hold/release_wallet_funds + process_withdrawal_complete (the withdrawal
--        edge is switched to its service-role client in the same commit),
--     payment/webhook internals (create_service_purchase_contract,
--        increment_service_orders, insert_payment_audit_log), cron/maintenance
--        fns (auto_verify_kyc, milestone auto-release, refunds, deletions,
--        cleanups, security-drift reporter, verification-rate-limit cleanup),
--        get_user_email (PII), kyc_verify_row, cleanup_user_data.
--     The SHARED cleanup_expired_rate_limits() is deliberately NOT revoked:
--     it only deletes rows older than 24h (every rate-limit window is shorter),
--     and ~16 edge functions call it best-effort on hot request paths — revoking
--     would add a 403 round-trip to each of them for no security gain. The daily
--     `cleanup-rate-limits` pg_cron job remains the backstop.
--  C. Kept deliberately public (intended UX, documented here so future audits
--     don't re-litigate): join_waitlist (pre-signup, p_user_id now guarded
--     when non-null), get/record_profile_view + service-view fns (public
--     vanity counters — view-count inflation accepted, cosmetic only),
--     email-enumeration trio (signup UX), verify_credential_by_token (public
--     certificate QR verification), public browse/metrics RPCs, trigger
--     functions (not RPC-callable via PostgREST).
--  D. create_user_profile has to stay executable by `anon`: with email
--     confirmation enabled there is NO session right after signUp(), and the
--     browser creates the profile row from that call. The guard therefore
--     allows creation for a just-signed-up auth row and refuses everything
--     else — an anon caller can no longer overwrite an existing profile.
--
-- Guard injection rewrites each function from its own pg_get_functiondef text,
-- inserting the guard immediately after the opening BEGIN (the first
-- word-boundary BEGIN inside the verbatim body, matched case-insensitively so
-- `begin` and `BEGIN` both work). A missing anchor, an ambiguous name, or a
-- re-run (marker already present) FAILS the migration loudly — silent no-ops
-- are how the stale-column class of bug survived nine functions.
--
-- Section 0 also repairs create_user_profile: it read `referral_code` off
-- public.profiles (42703 since 20261221000000 moved it to profiles_private), so
-- every real signup — the ones that pass a referral code — fell through to the
-- browser's direct-insert fallback instead of using the RPC.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 0 — repair create_user_profile BEFORE the guard is injected into it
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_user_profile(
  p_id uuid,
  p_email text,
  p_name text,
  p_role text,
  p_referral_code text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  result jsonb;
  v_role text;
  v_safe_ref_code text;
begin
  -- Validate role
  if p_role not in ('freelancer', 'client') then
    v_role := 'freelancer';
  else
    v_role := p_role;
  end if;

  -- Orphaned-email cleanup: remove stale profile rows from deleted accounts
  delete from public.profiles
   where name = p_name
     and id <> p_id
     and not exists (select 1 from auth.users where id = public.profiles.id);

  -- Ensure a unique referral code. referral_code lives in profiles_private
  -- since 20261221000000; reading it off public.profiles raised 42703 on every
  -- signup that passed a code (i.e. every real one).
  if p_referral_code is not null and p_referral_code <> '' then
    if exists (select 1 from public.profiles_private where referral_code = p_referral_code) then
      v_safe_ref_code := p_referral_code || '-' || substring(md5(p_id::text) from 1 for 4);
    else
      v_safe_ref_code := p_referral_code;
    end if;
  else
    v_safe_ref_code := upper(v_role || '-' || substring(md5(p_id::text) from 1 for 6));
  end if;

  -- Upsert public profile (only valid columns after the PII migration)
  insert into public.profiles (
    id, name, role, created_at
  )
  values (
    p_id, p_name, v_role, now()
  )
  on conflict (id) do update set
    name = excluded.name,
    role = excluded.role;

  -- Upsert private profile (email, referral_code, onboarding_completed)
  insert into public.profiles_private (
    id, email, referral_code, onboarding_completed
  )
  values (
    p_id, p_email, v_safe_ref_code, false
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, profiles_private.email),
    referral_code = coalesce(excluded.referral_code, profiles_private.referral_code);

  -- Return the combined profile
  select jsonb_build_object(
    'id', p.id,
    'email', pp.email,
    'name', p.name,
    'role', p.role,
    'referral_code', pp.referral_code,
    'onboarding_completed', pp.onboarding_completed,
    'created_at', p.created_at
  ) into result
  from public.profiles p
  left join public.profiles_private pp on pp.id = p.id
  where p.id = p_id;

  return coalesce(result, jsonb_build_object('id', p_id, 'role', v_role));
end;
$fn$;

do $authz$
declare
  r record;
  v_def text;
  v_src text;
  v_hits integer;
  v_body_start integer;
  v_line_pos integer;
  v_pos integer;
  v_marker constant text := 'authz-guard:';
begin
  -- ─────────────────────────────────────────────────────────────────────
  -- Section A: inject caller-ownership / ownership-role guards
  -- ─────────────────────────────────────────────────────────────────────
  for r in
    select * from (values

      -- owner-only: param is p_user_id --------------------------------------
      ('get_notification_preferences',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('set_notification_preferences',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('get_notifications_by_category',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('archive_notification',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('restore_notification',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('archive_all_read_notifications',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('register_push_token',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('unregister_push_token',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('get_user_push_tokens',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('get_wallet_balance',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('get_wallet_balance_v2',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('refresh_freelancer_project_matches',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),
      ('refresh_open_role_suggestions_for_freelancer',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),

      -- signup-create-or-owner: param is p_id. Signup with email confirmation
      -- has NO session yet (the browser calls this right after signUp()), so a
      -- session-less caller may CREATE a missing profile for a just-signed-up
      -- auth row — never overwrite an existing one. ------------------------
      ('create_user_profile',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) = 'service_role' THEN
    NULL; -- internal / CI caller
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id) THEN
    RAISE EXCEPTION 'Unauthorized'; -- never rewrite somebody else's profile
  ELSIF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p_id AND u.created_at > now() - interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'Unauthorized'; -- only the row signUp() just created
  END IF;
ELSIF p_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: signup-create-or-owner$g$),

      -- owner-only: param is p_client_id ------------------------------------
      ('get_team_role_contract',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF p_client_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: owner-only$g$),

      -- join_waitlist: p_user_id is OPTIONAL (pre-signup waitlist joins pass
      -- NULL); when supplied it must be the caller's own id -----------------
      ('join_waitlist',
      $g$IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: caller-owns-p_user_id$g$),

      -- project-owner-only: AI-match compute on a project --------------------
      ('generate_project_matches',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF auth.uid() IS DISTINCT FROM (SELECT client_id FROM public.projects WHERE id = p_project_id) THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: project-owner-only$g$),
      ('upsert_project_matches',
      $g$IF auth.uid() IS NULL THEN
  IF current_setting('role', true) <> 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
ELSIF auth.uid() IS DISTINCT FROM (SELECT client_id FROM public.projects WHERE id = p_project_id) THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: project-owner-only$g$),

      -- admin-only: credential QR token rotation + credential audit writers.
      -- These three are called from the admin console in the browser, so they
      -- keep their authenticated grant and the guard is the boundary. -------
      ('generate_credential_token',
      $g$IF NOT EXISTS (
  SELECT 1 FROM public.profiles p
  LEFT JOIN public.profiles_private pp ON pp.id = p.id
  WHERE p.id = auth.uid() AND (p.role = 'admin' OR coalesce(pp.is_admin, false))
) AND current_setting('role', true) <> 'service_role' THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: admin-only$g$),
      ('insert_credential_audit_log',
      $g$IF NOT EXISTS (
  SELECT 1 FROM public.profiles p
  LEFT JOIN public.profiles_private pp ON pp.id = p.id
  WHERE p.id = auth.uid() AND (p.role = 'admin' OR coalesce(pp.is_admin, false))
) AND current_setting('role', true) <> 'service_role' THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: admin-only$g$),
      ('insert_credential_version',
      $g$IF NOT EXISTS (
  SELECT 1 FROM public.profiles p
  LEFT JOIN public.profiles_private pp ON pp.id = p.id
  WHERE p.id = auth.uid() AND (p.role = 'admin' OR coalesce(pp.is_admin, false))
) AND current_setting('role', true) <> 'service_role' THEN
  RAISE EXCEPTION 'Unauthorized';
END IF; -- authz-guard: admin-only$g$)

    ) as t(fname, guard)
  loop
    select count(*), max(pg_get_functiondef(p.oid)), max(p.prosrc)
      into v_hits, v_def, v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = r.fname;

    if v_hits = 0 or v_def is null then
      raise exception 'authz-hardening: function % not found in public', r.fname;
    end if;
    if v_hits > 1 then
      raise exception 'authz-hardening: % has % definitions — refusing to guess', r.fname, v_hits;
    end if;
    if position(v_marker in v_def) > 0 then
      raise exception 'authz-hardening: % already carries a guard — refusing to double-patch', r.fname;
    end if;

    -- Anchor: the body's opening BEGIN. prosrc is embedded verbatim in the
    -- definition, so locate the body first and take the first word-boundary
    -- BEGIN inside it (case-insensitively — the case is whatever the author
    -- wrote). A whole-line match is NOT sufficient: get_wallet_balance_v2 keeps
    -- its entire body on one line, which failed this migration's dry run.
    v_body_start := position(v_src in v_def);
    if v_body_start = 0 then
      raise exception 'authz-hardening: body of % not embedded in its definition', r.fname;
    end if;
    v_pos := v_body_start + regexp_instr(v_src, '\mBEGIN\M', 1, 1, 0, 'i') - 1;
    if substring(upper(v_def) from v_pos for 5) <> 'BEGIN' then
      raise exception 'authz-hardening: no BEGIN anchor found in %', r.fname;
    end if;
    -- Cross-check: when a whole-line BEGIN exists it must be this one — that
    -- stops the inline search from landing on the word inside a comment.
    v_line_pos := regexp_instr(v_def, '^[[:blank:]]*BEGIN[[:blank:]]*$', 1, 1, 0, 'im');
    if v_line_pos > 0
       and v_line_pos + position('BEGIN' in upper(substring(v_def from v_line_pos for 64))) - 1 <> v_pos
    then
      raise exception 'authz-hardening: ambiguous BEGIN anchor in %', r.fname;
    end if;

    -- The trailing E'\n' is load-bearing: each guard ends in a `-- ...` line
    -- comment, and get_wallet_balance_v2's whole body sits on ONE line, so
    -- without it the comment would swallow the rest of that body.
    v_def := overlay(v_def placing ('BEGIN' || E'\n' || r.guard || E'\n') from v_pos for 5);
    execute v_def;

    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.fname
        and position(v_marker in p.prosrc) > 0
    ) then
      raise exception 'authz-hardening: guard did not land on %', r.fname;
    end if;
  end loop;

  -- ─────────────────────────────────────────────────────────────────────
  -- Section B: EXECUTE grants (dynamic — signatures resolved from the
  -- catalog, so parameter-default drift can never 42P13 this file)
  -- ─────────────────────────────────────────────────────────────────────

  -- S1: server-only — anon AND authenticated must not execute at all.
  -- service_role is re-granted explicitly so the revoke of PUBLIC cannot take
  -- the server with it, then asserted below.
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'update_wallet_balance', 'hold_wallet_funds', 'release_wallet_funds',
        'process_withdrawal_complete',
        'create_service_purchase_contract', 'increment_service_orders',
        'insert_payment_audit_log',
        'cleanup_user_data', 'get_user_email', 'kyc_verify_row',
        'process_due_deletions', 'process_milestone_auto_release', 'process_no_response_disputes',
        'process_pending_refunds', 'close_expired_contests',
        'cleanup_orphaned_data', 'cleanup_verification_rate_limits',
        'auto_verify_kyc', 'handle_user_deleted', 'check_security_drift'
      )
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', r.oid::regprocedure);
    execute format('grant execute on function public.%s to service_role', r.oid::regprocedure);
  end loop;

  -- S2: guarded functions that only ever make sense for an authenticated
  -- caller — drop the anon grant, keep authenticated (the in-function guard
  -- is the real boundary; this shrinks the surface behind it). NOTE:
  --  * create_user_profile is deliberately NOT here — signup calls it before
  --    a session exists (see Section 0 / the guard above).
  --  * generate_project_matches had no authenticated grant to begin with
  --    (anon-only), so revoking anon leaves it service_role-only. No app code
  --    path calls it (the live AI path is the ai-matching edge function), so
  --    no capability is taken away here.
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'finalize_admin_withdrawal',
        'generate_credential_token',
        'generate_project_matches', 'upsert_project_matches',
        'refresh_freelancer_project_matches', 'refresh_open_role_suggestions_for_freelancer',
        'get_notification_preferences', 'set_notification_preferences',
        'get_notifications_by_category', 'archive_notification', 'restore_notification',
        'archive_all_read_notifications',
        'register_push_token', 'unregister_push_token', 'get_user_push_tokens',
        'get_wallet_balance', 'get_wallet_balance_v2',
        'insert_credential_audit_log', 'insert_credential_version'
      )
  loop
    execute format('revoke execute on function public.%s from public, anon', r.oid::regprocedure);
  end loop;

  -- Leftover test scaffolding.
  drop function if exists public.test_simple_rpc();

  -- ─────────────────────────────────────────────────────────────────────
  -- Section C: cleanup_verification_rate_limits is now server-only (above),
  -- but the public certificate-verification page used to be its only trigger —
  -- and that page's 15-minute window is exactly what the DELETE removed, so an
  -- anonymous caller could wipe live rate-limit rows (a bypass of the public
  -- verify limit). Schedule the cleanup instead, or the table grows forever.
  -- Shared cleanup_expired_rate_limits() stays callable by user roles on
  -- purpose (see the header): it only deletes rows older than every window.
  -- ─────────────────────────────────────────────────────────────────────
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'cleanup-verification-rate-limits') then
    perform cron.schedule('cleanup-verification-rate-limits', '20 3 * * *',
      $job$SELECT public.cleanup_verification_rate_limits();$job$);
  end if;
end $authz$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fail-closed assertions — the migration must not "succeed" partially.
-- ═══════════════════════════════════════════════════════════════════════════
do $assert$
declare
  v_bad integer;
  v_count integer;
begin
  -- 1. All 21 guards landed.
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'get_notification_preferences','set_notification_preferences','get_notifications_by_category',
      'archive_notification','restore_notification','archive_all_read_notifications',
      'register_push_token','unregister_push_token','get_user_push_tokens',
      'get_wallet_balance','get_wallet_balance_v2',
      'refresh_freelancer_project_matches','refresh_open_role_suggestions_for_freelancer',
      'create_user_profile','get_team_role_contract','join_waitlist',
      'generate_project_matches','upsert_project_matches',
      'generate_credential_token','insert_credential_audit_log','insert_credential_version'
    )
    and position('authz-guard:' in p.prosrc) = 0;
  if v_count > 0 then
    raise exception 'authz-hardening assertion failed: % functions missing guards', v_count;
  end if;

  -- 1a. …and that the guarded list really covers 21 functions (a misspelled
  --     name would make the check above vacuously true).
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'get_notification_preferences','set_notification_preferences','get_notifications_by_category',
    'archive_notification','restore_notification','archive_all_read_notifications',
    'register_push_token','unregister_push_token','get_user_push_tokens',
    'get_wallet_balance','get_wallet_balance_v2',
    'refresh_freelancer_project_matches','refresh_open_role_suggestions_for_freelancer',
    'create_user_profile','get_team_role_contract','join_waitlist',
    'generate_project_matches','upsert_project_matches',
    'generate_credential_token','insert_credential_audit_log','insert_credential_version'
  );
  if v_count <> 21 then
    raise exception 'authz-hardening assertion failed: guard list resolved to % of 21 functions', v_count;
  end if;

  -- 1b. The server-only list must also resolve to the 20 functions it names —
  --     a typo would leave a hole un-revoked while this block stayed green.
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'update_wallet_balance', 'hold_wallet_funds', 'release_wallet_funds',
    'process_withdrawal_complete',
    'create_service_purchase_contract', 'increment_service_orders',
    'insert_payment_audit_log',
    'cleanup_user_data', 'get_user_email', 'kyc_verify_row',
    'process_due_deletions', 'process_milestone_auto_release', 'process_no_response_disputes',
    'process_pending_refunds', 'close_expired_contests',
    'cleanup_orphaned_data', 'cleanup_verification_rate_limits',
    'auto_verify_kyc', 'handle_user_deleted', 'check_security_drift'
  );
  if v_count <> 20 then
    raise exception 'authz-hardening assertion failed: server-only list resolved to % of 20 functions', v_count;
  end if;

  -- 2. S1 functions: no anon, no authenticated, no PUBLIC execute — and still
  --    executable by service_role (revoking PUBLIC must not take the server).
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'update_wallet_balance','hold_wallet_funds','release_wallet_funds','process_withdrawal_complete',
      'create_service_purchase_contract','increment_service_orders','insert_payment_audit_log',
      'cleanup_user_data','get_user_email','kyc_verify_row','process_due_deletions',
    'process_milestone_auto_release','process_no_response_disputes','process_pending_refunds',
    'close_expired_contests','cleanup_orphaned_data',
    'cleanup_verification_rate_limits','auto_verify_kyc','handle_user_deleted','check_security_drift'
  ) and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
      or not has_function_privilege('service_role', p.oid, 'execute'));
  if v_bad > 0 then
    raise exception 'authz-hardening assertion failed: % server-only functions still reachable by user roles or lost by service_role', v_bad;
  end if;

  -- 3. The self-credit hole specifically: update_wallet_balance must be
  --    unreachable by every non-service principal.
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_wallet_balance'
    and (has_function_privilege('authenticated', p.oid, 'execute')
      or has_function_privilege('anon', p.oid, 'execute'));
  if v_bad > 0 then
    raise exception 'authz-hardening assertion failed: update_wallet_balance still executable by a user role';
  end if;

  -- 4a. The anon-revoke list covers 19 functions (typo guard) and none of them
  --     may still be reachable anonymously.
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'finalize_admin_withdrawal','generate_credential_token',
    'generate_project_matches','upsert_project_matches',
    'refresh_freelancer_project_matches','refresh_open_role_suggestions_for_freelancer',
    'get_notification_preferences','set_notification_preferences',
    'get_notifications_by_category','archive_notification','restore_notification',
    'archive_all_read_notifications','register_push_token','unregister_push_token',
    'get_user_push_tokens','get_wallet_balance','get_wallet_balance_v2',
    'insert_credential_audit_log','insert_credential_version'
  );
  if v_count <> 19 then
    raise exception 'authz-hardening assertion failed: anon-revoke list resolved to % of 19 functions', v_count;
  end if;

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'finalize_admin_withdrawal','generate_credential_token',
      'generate_project_matches','upsert_project_matches',
      'refresh_freelancer_project_matches','refresh_open_role_suggestions_for_freelancer',
      'get_notification_preferences','set_notification_preferences',
      'get_notifications_by_category','archive_notification','restore_notification',
      'archive_all_read_notifications','register_push_token','unregister_push_token',
      'get_user_push_tokens','get_wallet_balance','get_wallet_balance_v2',
      'insert_credential_audit_log','insert_credential_version'
    )
    and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'authz-hardening assertion failed: % functions still callable anonymously', v_bad;
  end if;

  -- 4b. …and the functions a real browser caller uses keep authenticated
  --     (admin console writes credential audit rows; wallet/notification/
  --     team-contract reads are owner-guarded, not revoked).
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'get_notification_preferences','set_notification_preferences','archive_notification',
      'restore_notification','archive_all_read_notifications','get_notifications_by_category',
      'register_push_token','unregister_push_token','get_user_push_tokens',
      'get_wallet_balance','get_wallet_balance_v2','get_team_role_contract',
      'upsert_project_matches',
      'generate_credential_token','insert_credential_audit_log','insert_credential_version'
    )
    and not has_function_privilege('authenticated', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'authz-hardening assertion failed: % guarded functions lost their authenticated grant', v_bad;
  end if;

  if not has_function_privilege('anon', 'public.create_user_profile(uuid,text,text,text,text)', 'execute') then
    raise exception 'authz-hardening assertion failed: anon grant lost on create_user_profile (signup creates the profile before a session exists)';
  end if;
  if not has_function_privilege('anon', 'public.join_waitlist(text,text,text,uuid,text)', 'execute') then
    raise exception 'authz-hardening assertion failed: anon grant lost on join_waitlist';
  end if;

  -- 5. Section 0 stuck: create_user_profile no longer reads referral_code off
  --    public.profiles (the 42703 that broke real signups). The pattern is
  --    matched against whitespace-collapsed lower-case source, with the space
  --    after `profiles` — `public.profiles_private where referral_code` must
  --    NOT satisfy it (the loose version of this check failed its own dry run
  --    on the repaired body).
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_user_profile'
      and regexp_replace(lower(p.prosrc), '\s+', ' ', 'g')
          like '%from public.profiles where referral_code%'
  ) then
    raise exception 'authz-hardening assertion failed: create_user_profile still reads referral_code from public.profiles';
  end if;

  -- 6. Test scaffolding gone.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'test_simple_rpc') then
    raise exception 'authz-hardening assertion failed: test_simple_rpc still exists';
  end if;

  -- 7. The verification-rate-limit cleanup has a replacement trigger.
  if not exists (select 1 from cron.job where jobname = 'cleanup-verification-rate-limits') then
    raise exception 'authz-hardening assertion failed: cleanup-verification-rate-limits cron job missing';
  end if;
end $assert$;

commit;
