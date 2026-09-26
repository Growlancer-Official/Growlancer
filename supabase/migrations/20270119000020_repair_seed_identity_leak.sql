-- ═══════════════════════════════════════════════════════════════════════════
-- REPAIR: undo the E2E seed's identity leak on a real account
--
-- What happened (found by probing the live project after CI run 36120024335):
--   scripts/e2e/create-test-accounts.mjs looked accounts up with
--   `GET /auth/v1/admin/users?email=…`. GoTrue SILENTLY IGNORES that parameter
--   and returns the first page of users, so the script's `users[0]` was a real
--   person. The seed therefore took its "account already exists" branch and ran
--   `PUT /auth/v1/admin/users/<real user id>` (password reset) and
--   `create_user_profile(<real user id>, 'e2e.admin@growlancer-test.com',
--   'E2E Admin', 'admin')` against that account instead of creating the test
--   account. No E2E account was ever created, which is why the authenticated
--   audit's login step got 400 for all three roles and the teardown reported
--   `already_absent=3`.
--
-- Evidence of exactly one affected account (a GitHub OAuth signup, whose login
-- path is GitHub — not a password):
--   profiles.name              'E2E Admin'
--   profiles.name_changed_at   2026-09-25T09:57:52.862802Z (= one second into the
--                              seed step of that CI run)
--   profiles_private.email     'e2e.admin@growlancer-test.com'
--   auth.users.updated_at      2026-09-25 (the seed's password write)
--   auth.users.raw_user_meta_data carries no `name`, so the app's own signup
--                              rule (user_metadata.name → email local part)
--                              restores it exactly.
-- Verified read-only before this file was written: email_leaks = 1,
-- name_leaks = 1, restored_name = the account's real local part.
--
-- What this migration does NOT fix: the account's password. It was overwritten
-- with a value that also lives in a repository secret, so it cannot be
-- reconstructed from a hash — it was replaced with a fresh random value through
-- the admin API instead (never printed, and irrelevant to a GitHub sign-in).
--
-- Fail-closed: the predicates are narrow (only accounts that carry one of the
-- seed's own addresses/names while their auth identity is NOT an E2E one), the
-- whole thing is idempotent, and the trailing assertions re-check the invariant
-- so a future leak of this class fails the deploy instead of shipping silently.
-- ═══════════════════════════════════════════════════════════════════════════

DO $repair$
DECLARE
  v_ids UUID[];
  v_fixed_email INT := 0;
  v_fixed_name INT := 0;
BEGIN
  -- The seed's footprint: our address on an account that does not own it.
  -- Identifying by the private email first (before restoring it) is what keeps
  -- the name restore below provably scoped to the leaked accounts.
  SELECT array_agg(pp.id) INTO v_ids
    FROM public.profiles_private pp
    JOIN auth.users u ON u.id = pp.id
   WHERE lower(pp.email) LIKE 'e2e.%@growlancer-test.com'
     AND lower(u.email) <> lower(pp.email);

  IF v_ids IS NULL THEN
    RAISE NOTICE 'seed identity leak: no affected accounts — nothing to repair';
  ELSE
    UPDATE public.profiles_private pp
       SET email = u.email,
           updated_at = now()
      FROM auth.users u
     WHERE u.id = pp.id
       AND pp.id = ANY (v_ids);
    GET DIAGNOSTICS v_fixed_email = ROW_COUNT;

    -- Restore the name with the same rule the app uses at signup, and only for
    -- accounts still carrying one of the seed's three names — a real user who
    -- happens to have chosen that name is not touched.
    UPDATE public.profiles p
       SET name = COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1)),
           -- The seed's write was not a name change by the user; clearing it
           -- gives back the one change the name-change rate limit was holding.
           name_changed_at = NULL,
           updated_at = now()
      FROM auth.users u
     WHERE u.id = p.id
       AND p.id = ANY (v_ids)
       AND p.name IN ('E2E Freelancer', 'E2E Client', 'E2E Admin');
    GET DIAGNOSTICS v_fixed_name = ROW_COUNT;

    RAISE NOTICE 'seed identity leak: restored % private email(s) and % name(s)',
      v_fixed_email, v_fixed_name;
  END IF;
END
$repair$;

-- ────────────────────────────────────────────────────────────────────────────
-- Assertions — fail the deploy if the leak class is still present.
-- ────────────────────────────────────────────────────────────────────────────
DO $assert$
DECLARE
  v_leaks INT;
BEGIN
  SELECT count(*) INTO v_leaks
    FROM public.profiles_private pp
    JOIN auth.users u ON u.id = pp.id
   WHERE lower(pp.email) LIKE 'e2e.%@growlancer-test.com'
     AND lower(u.email) <> lower(pp.email);
  IF v_leaks <> 0 THEN
    RAISE EXCEPTION 'seed identity leak: % profile(s) still carry a seeded address on a different auth identity', v_leaks;
  END IF;

  SELECT count(*) INTO v_leaks
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE p.name IN ('E2E Freelancer', 'E2E Client', 'E2E Admin')
     AND lower(u.email) NOT LIKE 'e2e.%@growlancer-test.com';
  IF v_leaks <> 0 THEN
    RAISE EXCEPTION 'seed identity leak: % real profile(s) still carry a seeded name', v_leaks;
  END IF;

  RAISE NOTICE 'seed identity leak: assertions passed (0 leaks)';
END
$assert$;
