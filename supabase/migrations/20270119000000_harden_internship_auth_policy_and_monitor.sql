-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000000_harden_internship_auth_policy_and_monitor.sql
--
-- Closes the last HIGH finding from the 2026-09-07 hourly security scan:
--
--   open_storage_write | "Authenticated users can upload internship resumes"
--     on objects (check=(bucket_id = 'internship_resumes'::text))
--
-- Analysis (verified against live security_alerts + repo migrations):
--   • 8 of the 9 storage findings (avatars, profile-pictures, portfolio-images,
--     company-logos, verification-documents, videos, dispute-evidence,
--     contract-files) and the definer finding (hold_wallet_funds) were FALSE
--     POSITIVES from the old drift monitor's search_path rendering bug — all
--     resolved live on 2026-09-07 11:37/11:57 when 20270117010000 and
--     20270118000000 applied.
--   • The ONLY genuinely outstanding row is the authenticated internship
--     policy. It is a REAL, needed flow: the public careers page runs the same
--     client-side uploadResume() for anon visitors (→ "TO anon" policy) and
--     for logged-in users browsing the page (→ "TO authenticated" policy).
--     But the authenticated policy was missing the .pdf guard the anon policy
--     has, and because resumes are anonymous submissions under resumes/{token}
--     (not per-user folders), it carries no auth.uid() identity token — so the
--     render-aware monitor kept re-flagging it as an open write.
--
-- Fix:
--   1. Harden the authenticated internship policy to match the anon policy:
--      resumes/ folder + .pdf only. Bucket stays private (admin-only reads via
--      signed URLs); uploads remain open to anon AND authenticated applicants.
--   2. Whitelist it in check_security_drift's storage rule — an accepted,
--      documented exception alongside the anon one (legitimate anonymous-style
--      upload, private bucket, admin-only read; the monitor cannot distinguish
--      it from a true open write via identity tokens alone).
--   3. Resolve the stale alert in security_alerts.
--
-- Idempotent: DROP/CREATE POLICY + guarded DO-block + UPDATE ... WHERE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Harden the authenticated internship policy (resumes/ + .pdf) ────────
-- Mirrors the anon policy in 20270118000000 exactly. Defense-in-depth: the
-- client already validates PDF + 10MB in uploadResume(), and the bucket is
-- private with admin-only signed-URL reads, so this only hardens the write
-- surface (any logged-in user could previously upload ANY file type).
DROP POLICY IF EXISTS "Authenticated users can upload internship resumes" ON storage.objects;
CREATE POLICY "Authenticated users can upload internship resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internship_resumes'::text
  AND (storage.foldername(name))[1] = 'resumes'
  AND lower(right(name, 4)) = '.pdf'
);

-- ── 2. Monitor: whitelist the authenticated internship policy ───────────────
-- Reads the LIVE definition of check_security_drift (no drift from what is
-- deployed) and adds the second accepted-exception line right after the anon
-- one, only if not already present.
DO $fix$
DECLARE
  src  text;
  need text := $need$AND v_finding.policyname <> 'Anonymous applicants can upload internship resumes' THEN$need$;
  repl text := $repl$AND v_finding.policyname <> 'Anonymous applicants can upload internship resumes'
       AND v_finding.policyname <> 'Authenticated users can upload internship resumes' THEN$repl$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'check_security_drift';

  IF position('Authenticated users can upload internship resumes' in src) = 0 THEN
    IF position(need in src) = 0 THEN
      RAISE EXCEPTION 'check_security_drift: expected anon-exception line not found — aborting without edits';
    END IF;
    src := replace(src, need, repl);
    EXECUTE src;
  END IF;
END;
$fix$;

-- ── 3. Resolve the stale alert for the authenticated internship policy ──────
UPDATE public.security_alerts a
SET is_resolved = true, resolved_at = NOW()
WHERE a.category = 'open_storage_write'
  AND a.is_resolved = false
  AND a.detail LIKE '%Authenticated users can upload internship resumes%';

-- ── 4. Sanity guards ────────────────────────────────────────────────────────
DO $sanity$
DECLARE
  v_auth_pdf int;
  v_monitor  int;
  v_unresolved_open_storage int;
BEGIN
  -- The authenticated policy must exist, be an INSERT policy, and carry the
  -- .pdf guard (i.e. it is no longer the old bucket-wide form). Matching is
  -- robust to pg_policies rendering — pg_get_expr adds ::text casts + parens
  -- and quotes `right` as "right" — so we key on the rendered '.pdf' literal,
  -- which only the .pdf guard introduces.
  SELECT count(*) INTO v_auth_pdf
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND policyname = 'Authenticated users can upload internship resumes'
    AND cmd = 'INSERT'
    AND lower(coalesce(with_check, '')) LIKE '%''.pdf''%';
  IF v_auth_pdf <> 1 THEN
    RAISE EXCEPTION 'authenticated internship policy missing or missing .pdf guard';
  END IF;

  -- The monitor source must now contain BOTH accepted-exception lines.
  SELECT count(*) INTO v_monitor
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'check_security_drift'
    AND prosrc LIKE '%Anonymous applicants can upload internship resumes%'
    AND prosrc LIKE '%Authenticated users can upload internship resumes%';
  IF v_monitor <> 1 THEN
    RAISE EXCEPTION 'check_security_drift missing internship whitelist lines';
  END IF;

  -- No unresolved open_storage_write alerts should remain.
  SELECT count(*) INTO v_unresolved_open_storage
  FROM public.security_alerts
  WHERE category = 'open_storage_write' AND is_resolved = false;
  IF v_unresolved_open_storage > 0 THEN
    RAISE EXCEPTION '% unresolved open_storage_write alert(s) remain', v_unresolved_open_storage;
  END IF;
END;
$sanity$;