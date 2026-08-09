-- Fix reviews: add the sub-rating columns the reviews edge function inserts
-- (missing columns caused every review POST to fail with HTTP 500) and add the
-- missing RLS policies (no INSERT policy existed → RLS rejected every insert).

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  ADD COLUMN IF NOT EXISTS quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  ADD COLUMN IF NOT EXISTS timeliness_rating INTEGER CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
  ADD COLUMN IF NOT EXISTS professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
  ADD COLUMN IF NOT EXISTS would_hire_again BOOLEAN DEFAULT NULL;

-- Reviews are public reputation data (shown on public freelancer profiles).
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "Anyone can view reviews"
  ON public.reviews FOR SELECT
  USING (true);

-- Users can post their own reviews (the edge function validates contract
-- participation server-side before inserting).
DROP POLICY IF EXISTS "Users can insert own reviews" ON public.reviews;
CREATE POLICY "Users can insert own reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- Users can edit their own reviews.
DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;
CREATE POLICY "Users can update own reviews"
  ON public.reviews FOR UPDATE
  USING (auth.uid() = reviewer_id);

-- Public can read review replies too (they render under reviews on profiles).
DROP POLICY IF EXISTS "Anyone can view review replies" ON public.review_replies;
CREATE POLICY "Anyone can view review replies"
  ON public.review_replies FOR SELECT
  USING (true);

GRANT SELECT, INSERT, UPDATE ON public.reviews TO authenticated, anon;
