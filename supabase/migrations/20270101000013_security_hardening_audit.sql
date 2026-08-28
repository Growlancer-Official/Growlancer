-- ============================================================
-- SECURITY HARDENING — Post-Audit Fix (2027-01-01)
-- Fixes critical vulnerabilities found in comprehensive red-team audit.
-- ALL statements are idempotent (can re-run safely).
-- ============================================================

-- ── 1. REFERRALS RLS: Fix open UPDATE policies ────────────────────
-- CRITICAL: referrals + referral_stats had USING(true) WITH CHECK(true)
-- allowing ANY authenticated user to modify ANY other user's referral records.
-- Fix: restrict to own-row updates only.

DROP POLICY IF EXISTS "Users can update referrals" ON public.referrals;
DROP POLICY IF EXISTS "Users can update own referrals" ON public.referrals;
CREATE POLICY "Users can update own referrals"
  ON public.referrals
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id)
  WITH CHECK (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

DROP POLICY IF EXISTS "Users can update referral_stats" ON public.referral_stats;
DROP POLICY IF EXISTS "Users can update own referral_stats" ON public.referral_stats;
CREATE POLICY "Users can update own referral_stats"
  ON public.referral_stats
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. CONTEST VOTES: Prevent self-voting ─────────────────────────
-- Votes link via submission_id (no direct contest_id column).
-- Self-voting: a user votes on a submission they themselves made.

DROP POLICY IF EXISTS "Authenticated users can vote" ON contest_votes;
DROP POLICY IF EXISTS "Users can vote on active funded contests (not own)" ON contest_votes;
CREATE POLICY "Users can vote (not on own submission)"
  ON contest_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM contest_submissions cs
      WHERE cs.id = contest_votes.submission_id
        AND cs.freelancer_id = auth.uid()
    )
  );

-- ── 3. CONTEST SUBMISSIONS: Prevent self-submission to own contest ──
-- A client could submit to their own contest to farm entries.

DROP POLICY IF EXISTS "Freelancers can submit to funded active contests" ON contest_submissions;
DROP POLICY IF EXISTS "Freelancers can submit to funded active contests (not own)" ON contest_submissions;
CREATE POLICY "Freelancers can submit (not to own contest)"
  ON contest_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = freelancer_id
    AND NOT EXISTS (
      SELECT 1 FROM contests c
      WHERE c.id = contest_submissions.contest_id
        AND c.client_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM contests c
      WHERE c.id = contest_submissions.contest_id
        AND c.status = 'active'
        AND c.prize_funded = true
    )
  );

-- ── 4. PROFILES_PRIVATE: Ensure SELECT is owner-only only ────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles_private'
      AND cmd = 'SELECT'
      AND qual = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles_private', pol.policyname);
    RAISE NOTICE 'Dropped overly broad SELECT policy on profiles_private: %', pol.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Users can view own private profile" ON profiles_private;
CREATE POLICY "Users can view own private profile"
  ON profiles_private
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ── 5. WALLETS: Remove direct UPDATE policy for end users ────────
-- Wallet balance changes MUST go through SECURITY DEFINER RPCs only.
DROP POLICY IF EXISTS "Users can update own wallet" ON wallets;

-- ── 6. DISPUTES: Participants + admin only ──────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'disputes'
      AND cmd = 'SELECT'
      AND qual = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON disputes', pol.policyname);
    RAISE NOTICE 'Dropped overly broad SELECT policy on disputes: %', pol.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Dispute participants can view disputes" ON disputes;
CREATE POLICY "Dispute participants can view disputes"
  ON disputes
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = client_id
    OR auth.uid() = freelancer_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 7. INVITES: Participants only ───────────────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invites'
      AND cmd = 'SELECT'
      AND qual = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON invites', pol.policyname);
    RAISE NOTICE 'Dropped overly broad SELECT policy on invites: %', pol.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Invites participants can view" ON invites;
CREATE POLICY "Invites participants can view"
  ON invites
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = client_id
    OR auth.uid() = freelancer_id
  );

-- ── 8. REFERRALS: Participants + admin only ─────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referrals'
      AND cmd = 'SELECT'
      AND qual = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON referrals', pol.policyname);
    RAISE NOTICE 'Dropped overly broad SELECT policy on referrals: %', pol.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Referral participants can view" ON referrals;
CREATE POLICY "Referral participants can view"
  ON referrals
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = referrer_id
    OR auth.uid() = referred_user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 9. PROJECT_MATCHES: Participants only ───────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_matches'
      AND cmd = 'SELECT'
      AND qual = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON project_matches', pol.policyname);
    RAISE NOTICE 'Dropped overly broad SELECT policy on project_matches: %', pol.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Match participants can view" ON project_matches;
CREATE POLICY "Match participants can view"
  ON project_matches
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = freelancer_id
    OR EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_matches.project_id AND p.client_id = auth.uid()
    )
  );
