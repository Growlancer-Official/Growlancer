-- ═══════════════════════════════════════════════════════════════════════════
-- 20270117010000_security_advisor_fixes.sql
--
-- Fixes the HIGH findings from the Supabase security advisor (2026-09-06):
--
-- 1. definer_no_search_path — five SECURITY DEFINER functions created without
--    a SET search_path clause. Their bodies are fully qualified today, but an
--    empty search_path also hides pg_catalog from name resolution, and any
--    future edit adding an unqualified ref would break at runtime. Pinning
--    the search_path is the advisor-recommended hardening; the function
--    definitions themselves are unchanged.
--      is_disposable_email_domain, handle_new_profile_private,
--      hold_wallet_funds, release_wallet_funds, update_wallet_balance
--
-- 2. open_storage_write — two INSERT policies allowed anonymous uploads:
--      • "Anyone can upload internship resumes"        (no auth check at all)
--      • "Authenticated users can upload contest subs…" (name-folder already
--        checks ownership, but the policy name lied — it granted to anyone;
--        a missing explicit `TO authenticated` let anon through)
--    Both now require an authenticated role. Ownership checks inside the
--    policies are unchanged (contest submissions still bind the object path
--    to auth.uid(); internship resumes stay anonymous-allowed only for
--    authenticated applicants).
--
-- Idempotent: CREATE OR REPLACE + DROP IF EXISTS before CREATE POLICY.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Pin search_path on the five un-pinned SECURITY DEFINER functions ────
-- Their current live definitions already qualify every table ref with
-- `public.` (verified 2026-09-06), so re-stating the definition with a SET
-- clause changes no behavior.

CREATE OR REPLACE FUNCTION public.is_disposable_email_domain(p_domain text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.disposable_email_domains
    WHERE domain = lower(btrim(p_domain))
  );
END;
$fn$;

-- The remaining four are money-path functions: re-apply their EXACT live
-- definitions (captured below) plus the SET clause — no logic drift.
DO $fix$
DECLARE
  fn RECORD;
  src TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('handle_new_profile_private','hold_wallet_funds','release_wallet_funds','update_wallet_balance')
  LOOP
    src := pg_get_functiondef(fn.oid);
    -- Insert the SET clause right after the SECURITY DEFINER line if absent.
    IF position('SET search_path' in src) = 0 THEN
      src := regexp_replace(
        src,
        'SECURITY DEFINER',
        'SECURITY DEFINER' || chr(10) || ' SET search_path = public, pg_catalog'
      );
    END IF;
    EXECUTE src;
  END LOOP;
END;
$fix$;

-- ── 2. Storage: intern resumes bucket — require authentication ─────────────
DROP POLICY IF EXISTS "Anyone can upload internship resumes" ON storage.objects;
CREATE POLICY "Authenticated users can upload internship resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'internship_resumes'::text);

-- ── 3. Storage: contest submissions — scope to authenticated explicitly ────
DROP POLICY IF EXISTS "Authenticated users can upload contest submissions" ON storage.objects;
CREATE POLICY "Authenticated users can upload contest submissions"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contest-submissions'::text
  AND (storage.foldername(name))[2] = (auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'freelancer'::text
  )
);
