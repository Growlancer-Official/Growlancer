-- ====================================================================
-- GROWLANCER — ADD MISSING DATABASE TABLES & COLUMNS
-- Date: 2026-09-09
--
-- Fixes 5 frontend-backend integration gaps:
--
--   1. review_replies table    →  ClientReviewsPage.tsx uses it
--   2. saved_searches table    →  ClientFreelancerSearchPage.tsx uses it
--   3. time_entries table      →  TimeTrackingPage.tsx uses it
--   4. verification_rate_limits →  credentialVerification.ts uses it
--   5. company_logo column     →  ClientSettingsPage_NEW.tsx & avatarPack.ts use it
--
-- Each table includes:
--   - Proper column types matching frontend usage
--   - Foreign key constraints
--   - RLS enabled with proper policies
--   - Added to supabase_realtime publication
--   - REPLICA IDENTITY FULL
-- ====================================================================

-- ═══════════════════════════════════════════════════════════════════
-- 1. review_replies — Replies to client reviews from freelancers
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.review_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_replies_review_id ON public.review_replies(review_id);
CREATE INDEX IF NOT EXISTS idx_review_replies_user_id ON public.review_replies(user_id);

ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read review replies" ON public.review_replies;
CREATE POLICY "Anyone can read review replies" ON public.review_replies
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Review participants can insert replies" ON public.review_replies;
CREATE POLICY "Review participants can insert replies" ON public.review_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.id = review_id
      AND (r.reviewee_id = auth.uid() OR r.reviewer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update own replies" ON public.review_replies;
CREATE POLICY "Users can update own replies" ON public.review_replies
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own replies" ON public.review_replies;
CREATE POLICY "Users can delete own replies" ON public.review_replies
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.review_replies REPLICA IDENTITY FULL;

RAISE NOTICE '1/5: review_replies table created ✓';

-- ═══════════════════════════════════════════════════════════════════
-- 2. saved_searches — Saved freelancer search filters
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  notify_new_results BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON public.saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_notify ON public.saved_searches(notify_new_results)
  WHERE notify_new_results = true;

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved searches" ON public.saved_searches;
CREATE POLICY "Users manage own saved searches" ON public.saved_searches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.saved_searches REPLICA IDENTITY FULL;

RAISE NOTICE '2/5: saved_searches table created ✓';

-- ═══════════════════════════════════════════════════════════════════
-- 3. time_entries — Freelancer time tracking for hourly contracts
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('running', 'submitted', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_contract_id ON public.time_entries(contract_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_freelancer_id ON public.time_entries(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON public.time_entries(status);
CREATE INDEX IF NOT EXISTS idx_time_entries_freelancer_contract
  ON public.time_entries(freelancer_id, contract_id, created_at DESC);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Freelancers see their own entries
DROP POLICY IF EXISTS "Freelancers view own time entries" ON public.time_entries;
CREATE POLICY "Freelancers view own time entries" ON public.time_entries
  FOR SELECT TO authenticated
  USING (auth.uid() = freelancer_id);

-- Freelancers insert their own entries
DROP POLICY IF EXISTS "Freelancers insert own time entries" ON public.time_entries;
CREATE POLICY "Freelancers insert own time entries" ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = freelancer_id);

-- Freelancers update own entries (only if not yet approved)
DROP POLICY IF EXISTS "Freelancers update own time entries" ON public.time_entries;
CREATE POLICY "Freelancers update own time entries" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (auth.uid() = freelancer_id AND status IN ('running', 'submitted'))
  WITH CHECK (auth.uid() = freelancer_id);

-- Clients view time entries for their contracts
DROP POLICY IF EXISTS "Clients view time entries on own contracts" ON public.time_entries;
CREATE POLICY "Clients view time entries on own contracts" ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND c.client_id = auth.uid()
    )
  );

-- Clients approve/reject time entries on their contracts
DROP POLICY IF EXISTS "Clients approve time entries" ON public.time_entries;
CREATE POLICY "Clients approve time entries" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND c.client_id = auth.uid()
    )
  );

ALTER TABLE public.time_entries REPLICA IDENTITY FULL;

RAISE NOTICE '3/5: time_entries table created ✓';

-- ═══════════════════════════════════════════════════════════════════
-- 4. verification_rate_limits — Rate limiting for public verification
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.verification_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  route TEXT NOT NULL DEFAULT 'verify-certificate-public',
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vrl_lookup
  ON public.verification_rate_limits(identifier, route, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_vrl_cleanup
  ON public.verification_rate_limits(window_start)
  WHERE window_start < NOW() - INTERVAL '24 hours';

ALTER TABLE public.verification_rate_limits ENABLE ROW LEVEL SECURITY;

-- No public read access (only edge functions with service_role key)
-- Default deny-all is sufficient for RLS

-- RPC to clean up expired rate limit entries
CREATE OR REPLACE FUNCTION public.cleanup_verification_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.verification_rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_verification_rate_limits() TO authenticated;

RAISE NOTICE '4/5: verification_rate_limits table created ✓';

-- ═══════════════════════════════════════════════════════════════════
-- 5. Add company_logo column to client_profiles
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS company_logo TEXT;

RAISE NOTICE '5/5: company_logo column added to client_profiles ✓';

-- ═══════════════════════════════════════════════════════════════════
-- ADD TO SUPABASE_REALTIME PUBLICATION
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  tbl text;
  tbl_list text[] := ARRAY[
    'review_replies',
    'saved_searches',
    'time_entries'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbl_list
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'realtime: public.% does not exist, skipped', tbl;
      WHEN duplicate_object THEN
        RAISE NOTICE 'realtime: public.% already in publication', tbl;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%already member%' OR SQLERRM LIKE '%already in publication%' THEN
          RAISE NOTICE 'realtime: public.% already member, skipped', tbl;
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;
END $$;

-- Refresh schema cache for PostgREST
NOTIFY pgrst, 'reload schema';

RAISE NOTICE 'All 5 missing tables/columns added successfully ✓';
