-- ============================================================
-- SECURITY HARDENING v2 — Rate limits + orphan cleanup
-- ============================================================

-- Performance index for rate limit cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_cleanup
  ON rate_limits (window_start);

-- Verify no orphaned data in profiles_private that could cause issues
-- (defense in depth — make sure every profile has a matching private row)
DO $$
DECLARE
  v_orphans INTEGER;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles_private pp WHERE pp.id = p.id
  )
  AND p.deleted_at IS NULL;

  IF v_orphans > 0 THEN
    RAISE WARNING '% profiles without profiles_private rows — creating them', v_orphans;
    INSERT INTO profiles_private (id)
    SELECT p.id FROM profiles p
    WHERE NOT EXISTS (SELECT 1 FROM profiles_private pp WHERE pp.id = p.id)
    AND p.deleted_at IS NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
