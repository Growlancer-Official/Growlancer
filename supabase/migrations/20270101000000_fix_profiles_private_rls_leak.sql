-- ═══════════════════════════════════════════════════════════════════════════
-- CRITICAL SECURITY FIX: profiles_private RLS policy leak
--
-- The "Service role full access on profiles_private" policy was created
-- WITHOUT a TO service_role clause, which means it applies to ALL roles
-- (authenticated, anon, etc.). This allows any authenticated user to:
--   - READ all users' emails, phone numbers, admin status, suspension info
--   - UPDATE any user's profile_private row (escalate to admin, unsuspend)
--
-- Root cause: In PostgreSQL RLS, a policy without a TO clause defaults to
-- all roles. The original intent was service-role-only access, but the
-- TO service_role clause was accidentally omitted.
--
-- Fix: Drop the overly-broad policy and recreate it restricted to service_role.
-- Note: service_role already bypasses RLS entirely, so this policy is
-- technically redundant — but it documents intent and prevents future drift.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Drop the dangerous policy that applies to ALL roles
DROP POLICY IF EXISTS "Service role full access on profiles_private"
  ON public.profiles_private;

-- 2. Recreate it restricted to service_role ONLY
--    (service_role bypasses RLS anyway, but this documents intent and
--     prevents the policy from accidentally applying to authenticated users)
CREATE POLICY "Service role full access on profiles_private"
  ON public.profiles_private
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Verify: the owner policies still work correctly
--    "Owner reads own private profile"  — USING (auth.uid() = id)
--    "Owner updates own private profile" — USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
--    These are unaffected by this migration.
