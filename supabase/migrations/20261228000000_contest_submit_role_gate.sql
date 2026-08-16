-- ════════════════════════════════════════════════════════════════════════
-- GROWLANCER — contest submissions: freelancer-role gate
-- Previously any authenticated user (including clients) could submit to a
-- contest as long as auth.uid() = freelancer_id. Contests are a freelancer
-- participation feature, so submissions are now scoped to role = 'freelancer'
-- at the RLS level (server-enforced) and at the storage-upload level.
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Freelancers can submit to funded active contests" ON public.contest_submissions;

CREATE POLICY "Freelancers can submit to funded active contests" ON public.contest_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = freelancer_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'freelancer'
    )
    AND (SELECT status FROM public.contests WHERE id = contest_id) = 'active'
    AND (SELECT prize_funded FROM public.contests WHERE id = contest_id) = true
    AND (SELECT end_date FROM public.contests WHERE id = contest_id) > now()
  );

-- Storage uploads — same role gate: only freelancers can write to the
-- contest-submissions bucket (path convention {contestId}/{userId}/{filename}).
DROP POLICY IF EXISTS "Authenticated users can upload contest submissions" ON storage.objects;

CREATE POLICY "Authenticated users can upload contest submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contest-submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'freelancer'
    )
  );

-- ── Verify the policies exist with the role gate ─────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'contest_submissions'
    AND policyname = 'Freelancers can submit to funded active contests'
    AND qual IS NULL
    AND with_check ILIKE '%role = ''freelancer''%';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'Contest submission role-gate policy missing';
  END IF;
END $$;
