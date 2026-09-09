-- ═════════════════════════════════════════════════════════════════════════════
-- Fix grant_admin_role + backfill profiles_private.is_admin
--
-- Found in live E2E admin playtest (2026-09-09): the entire admin panel was
-- dead — every admin-data edge-function call returned 401 because
-- profiles_private.is_admin was FALSE for the one admin account.
--
-- Root causes (two independent bugs compounding):
--   1. Migration 20261221000000 created profiles_private with PK `id`
--      (REFERENCES profiles(id)). But grant_admin_role (20270101000006) was
--      written against a `user_id` column that has never existed on that
--      table — its authorization guard AND its upsert both crash with
--      'column "user_id" does not exist' at call time.
--   2. The 20261221000000 data migration copied is_admin from profiles only
--      if profiles still HAD that column; and nothing since has kept
--      profiles.role='admin' in sync with profiles_private.is_admin. Net
--      result: role='admin' on profiles, is_admin=false on profiles_private,
--      and verifyAdminSession (which reads ONLY profiles_private) denies
--      every admin request. No RPC could repair it because (1) crashed.
--
-- Fix:
--   a) Recreate grant_admin_role using the real column (`id`).
--   b) Backfill is_admin=true for every profiles row with role='admin'
--      (the invariant the whole auth stack assumes: role='admin' ⟺ is_admin).
--      Also inserts any missing profiles_private rows for admin profiles.
--   c) Keep profiles.role in sync in the same statement's spirit — if a
--      profiles_private row is missing we insert it from profiles.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. grant_admin_role — fixed to use profiles_private.id (the real PK column).
--    Same contract as before: only an existing admin may grant, grants set BOTH
--    profiles.role='admin' AND profiles_private.is_admin=true.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_admin_role(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles_private
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.profiles
  SET role = 'admin', updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.profiles_private (id, is_admin)
  VALUES (p_user_id, true)
  ON CONFLICT (id) DO UPDATE SET is_admin = true, updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Admin role granted');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_admin_role(UUID) FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Data repair — make profiles_private.is_admin honest for every admin.
--    Idempotent: DISTINCT guard means re-runs are no-ops.
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Rows exist but flag false → flip them on.
UPDATE public.profiles_private pp
SET is_admin = true, updated_at = now()
FROM public.profiles p
WHERE pp.id = p.id
  AND p.role = 'admin'
  AND (pp.is_admin IS DISTINCT FROM true);

-- 2b. Rows missing entirely → insert from profiles (email/phone unavailable on
--     profiles post-20261221000000; those nullable columns stay NULL — the
--     edge functions read them as `privData?.email || user.email`).
INSERT INTO public.profiles_private (id, is_admin)
SELECT p.id, true
FROM public.profiles p
WHERE p.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.profiles_private pp WHERE pp.id = p.id)
ON CONFLICT (id) DO NOTHING;
