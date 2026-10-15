-- ============================================================================
-- MR-02 (finding RLS-001) — P0 SECURITY
--
-- Problem:
--   20260801000000_admin_credentials.sql created the policy
--     "Service role can manage admin_credentials"
--       ON public.admin_credentials USING (true) WITH CHECK (true);
--   with NO `TO` clause, so it applied to PUBLIC (including `anon`). The table
--   stores bcrypt password hashes (password_hash) — an unauthenticated caller
--   using the public anon key could read every admin credential row.
--   The same migration also executed
--     ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_credentials;
--   which streamed admin credential rows (including password_hash) over the
--   public Realtime channel.
--
-- Fix (tightening only — no security control is weakened):
--   1. DROP the PUBLIC-scoped policy by name.
--   2. Recreate access scoped `TO authenticated` and gated by the canonical
--      admin predicate public.is_admin_user(auth.uid()) (defined in
--      20261222000000_admin_withdrawals.sql). `service_role` retains access via
--      BYPASSRLS (the admin-data edge function is unaffected).
--   3. Remove the table from the supabase_realtime publication (guarded so the
--      migration is idempotent when the table is not published).
-- ============================================================================

-- 1. Remove the over-permissive PUBLIC policy (idempotent).
DROP POLICY IF EXISTS "Service role can manage admin_credentials"
  ON public.admin_credentials;

-- 2. Recreate access scoped to authenticated admins only.
DROP POLICY IF EXISTS "Admins can view admin_credentials" ON public.admin_credentials;
CREATE POLICY "Admins can view admin_credentials"
  ON public.admin_credentials
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage admin_credentials" ON public.admin_credentials;
CREATE POLICY "Admins can manage admin_credentials"
  ON public.admin_credentials
  FOR ALL
  TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

-- 3. Stop broadcasting admin credential rows (incl. password_hash) over Realtime.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_credentials'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_credentials;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- Publication does not exist in this environment — nothing to do.
  NULL;
END $$;

-- ============================================================================
-- LIVE-DB VERIFICATION REQUIRED (run after applying):
--
--   -- (a) no policy on admin_credentials is PUBLIC/anon-scoped:
--   SELECT policyname, roles, cmd, qual, with_check
--     FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'admin_credentials';
--   -- Expect: roles = {authenticated}; no policy with roles = {public}.
--
--   -- (b) table is no longer published to Realtime:
--   SELECT * FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_credentials';
--   -- Expect: 0 rows.
--
--   -- (c) anon cannot read hashes (run with the anon key / anon role):
--   SET ROLE anon;
--   SELECT count(*) FROM public.admin_credentials;  -- Expect: 0
--   RESET ROLE;
-- ============================================================================
