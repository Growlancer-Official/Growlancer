-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEWS — close the direct-write bypass and enforce one review per party
-- Migration 20270203100000
--
-- DEFECT (security review §1.5):
--   `Users can insert own reviews` only checked `auth.uid() = reviewer_id`.
--   Any authenticated user could therefore POST straight to
--   /rest/v1/reviews and create a review for ANY contract/reviewee — no
--   contract completion, no participation check, no "other party" check, and
--   duplicate reviews were allowed because no uniqueness existed.
--   The edge function (supabase/functions/reviews) did validate all of that,
--   but a policy is not an edge function: the direct PostgREST path skipped
--   every rule.
--
-- FIX:
--   1. Drop the authenticated INSERT/UPDATE policies; writes happen ONLY via
--      the edge function's service-role client, which re-checks the JWT,
--      contract completion, participation, other-party reviewee, rating range
--      and comment bounds.
--   2. Enforce `UNIQUE (reviewer_id, contract_id)` so two concurrent requests
--      cannot both insert the same review.
--   3. Keep reads public (reputation data is shown on public profiles) and keep
--      historical rows untouched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Writes are server-only from now on ───────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;

-- Column-level grants too: RLS is not the only gate. The edge function uses the
-- service role, so removing these cannot break the supported write path.
REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM authenticated, anon;
GRANT SELECT ON public.reviews TO authenticated, anon;

COMMENT ON TABLE public.reviews IS
  'Public reputation data. Rows are written only by the reviews edge function (service role) which validates contract completion, participation and the reviewee relationship.';

-- ── 2. Duplicate pre-check, non-destructive ─────────────────────────────────
-- Real duplicate rows would make the unique index fail. Instead of deleting the
-- evidence we COPY the full duplicate rows into an archive table, remove only
-- the redundant newer copies (keeping the oldest, which is the published one),
-- and record how many moved. Nothing is silently discarded.
CREATE TABLE IF NOT EXISTS public.reviews_duplicate_archive (
  LIKE public.reviews INCLUDING DEFAULTS,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive_reason TEXT NOT NULL DEFAULT 'duplicate (reviewer_id, contract_id)'
);

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY reviewer_id, contract_id
           ORDER BY created_at ASC NULLS LAST, id ASC
         ) AS rn
    FROM public.reviews
   WHERE contract_id IS NOT NULL
)
INSERT INTO public.reviews_duplicate_archive
SELECT r.*, now(), 'duplicate (reviewer_id, contract_id)'
  FROM public.reviews r
  JOIN ranked k ON k.id = r.id
 WHERE k.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY reviewer_id, contract_id
           ORDER BY created_at ASC NULLS LAST, id ASC
         ) AS rn
    FROM public.reviews
   WHERE contract_id IS NOT NULL
)
DELETE FROM public.reviews r
 USING ranked k
 WHERE k.id = r.id
   AND k.rn > 1;

-- ── 3. One review per reviewer per contract ─────────────────────────────────
-- Partial index: contest reviews (contract_id IS NULL) keep their own rules and
-- are gated by the contests feature flag instead.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_reviewer_per_contract
  ON public.reviews (reviewer_id, contract_id)
  WHERE contract_id IS NOT NULL;

-- ── 4. Rating bounds at the database, not just in the edge function ─────────
-- (Sub-ratings already have CHECKs from 20261105000000; the main rating did not.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_range_chk'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_rating_range_chk CHECK (rating BETWEEN 1 AND 5);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only, after applying):
--   -- no policy may allow direct writes:
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'reviews' AND cmd IN ('INSERT','UPDATE');   -- expect 0 rows
--   -- uniqueness is enforced:
--   SELECT indexdef FROM pg_indexes
--    WHERE indexname = 'reviews_one_per_reviewer_per_contract';    -- expect UNIQUE
--   -- anything that had to be archived:
--   SELECT count(*) FROM public.reviews_duplicate_archive;
-- ═══════════════════════════════════════════════════════════════════════════
