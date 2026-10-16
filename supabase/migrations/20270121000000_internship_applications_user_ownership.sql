-- ============================================================================
-- MR-14 — API-002 (§1 P1) — INTERNSHIP RE-APPLY OWNERSHIP
--
-- Problem:
--   supabase/functions/internship-applications matched an existing application
--   ONLY by the submitted `email` and then UPDATED that row (resetting
--   status='applied' and notes=NULL) with NO authentication and NO ownership
--   check. Any anonymous caller who knew a candidate's email could overwrite
--   their application and wipe admin notes — an unauthenticated tampering / data
--   loss vector. The table also had no column that could identify the owner, so
--   ownership could never be enforced from the schema as it stood.
--
-- Fix:
--   Add a nullable public.internship_applications.user_id referencing the
--   authenticated applicant. The edge function now REQUIRES an authenticated
--   session that OWNS the existing row before it will re-apply (matching
--   user_id, or — for legacy rows inserted before this column existed — the
--   verified session email). New rows record the authenticated user_id.
--
--   Nullable so existing/legacy rows (and genuinely anonymous first-time
--   submissions, which remain open by design) are unaffected. Non-destructive:
--   purely additive, idempotent, touches NO existing row/policy/function.
-- ============================================================================

ALTER TABLE public.internship_applications
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- Idempotent FK to auth.users (SET NULL on account deletion keeps the
-- application row for admin/historical purposes while releasing ownership).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'internship_applications_user_id_fkey'
       AND conrelid = 'public.internship_applications'::regclass
  ) THEN
    ALTER TABLE public.internship_applications
      ADD CONSTRAINT internship_applications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_internship_applications_user_id
  ON public.internship_applications (user_id);

COMMENT ON COLUMN public.internship_applications.user_id IS
  'MR-14/API-002: owning authenticated applicant. NULL for anonymous/legacy rows. Re-apply is only permitted when the caller''s session id matches this (or, for legacy NULL rows, the verified session email).';

-- ============================================================================
-- LIVE-DB VERIFICATION REQUIRED
--
-- 1) Column + FK + index exist:
--      SELECT column_name, data_type, is_nullable
--        FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='internship_applications'
--         AND column_name='user_id';
--      -- expect: user_id | uuid | YES
--      SELECT conname FROM pg_constraint
--       WHERE conrelid='public.internship_applications'::regclass
--         AND conname='internship_applications_user_id_fkey';      -- expect 1 row
--      SELECT indexname FROM pg_indexes
--       WHERE tablename='internship_applications'
--         AND indexname='idx_internship_applications_user_id';     -- expect 1 row
--
-- 2) Existing rows untouched (all legacy owners NULL):
--      SELECT count(*) FROM public.internship_applications WHERE user_id IS NULL;
--      -- expect = total row count immediately after migration
--
-- 3) RLS unchanged (public INSERT retained by design; verification only):
--      SELECT policyname, cmd, qual, with_check
--        FROM pg_policies WHERE tablename='internship_applications';
-- ============================================================================
