-- ============================================================
-- CONTEST REVIEWS — winners & clients rate each other
--
-- The reviews table was contract-only (contract_id NOT NULL + FK +
-- UNIQUE(contract_id, reviewer_id)). Contest winners deserve the same
-- reputation boost as contract freelancers — after a contest is
-- completed, the client rates the winner(s) and the winner rates the
-- client, both through the same reviews pipeline.
--
-- Changes:
--   1. reviews.contest_id UUID NULL → contests(id) ON DELETE CASCADE
--   2. reviews.contract_id → nullable (a review is for a contract OR
--      a contest, never both)
--   3. Partial unique constraints replace the old global one
--   4. CHECK: exactly one of contract_id / contest_id is set
--
-- The on_review_change trigger / update_reputation_score are keyed on
-- reviewee_id only, so contest reviews automatically refresh the
-- reviewee's rating, weighted rating and reputation — no change needed.
-- ============================================================

-- 1) Contest FK column
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS contest_id UUID REFERENCES contests(id) ON DELETE CASCADE;

-- 2) contract_id becomes optional
ALTER TABLE reviews ALTER COLUMN contract_id DROP NOT NULL;

-- 3) Replace UNIQUE(contract_id, reviewer_id) with partial unique indexes
--    (Postgres treats NULLs as distinct, so a plain unique constraint would
--    let one reviewer create unlimited contest reviews).
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_contract_id_reviewer_id_key;
DROP INDEX IF EXISTS reviews_contract_id_reviewer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_contract_reviewer_key
  ON reviews (contract_id, reviewer_id)
  WHERE contract_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_contest_reviewer_key
  ON reviews (contest_id, reviewer_id)
  WHERE contest_id IS NOT NULL;

-- 4) Exactly one of contract_id / contest_id
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_source_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_source_check
  CHECK (
    (contract_id IS NOT NULL AND contest_id IS NULL) OR
    (contract_id IS NULL AND contest_id IS NOT NULL)
  );
