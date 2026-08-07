-- ═══════════════════════════════════════════════════════════════════════════
-- AI MATCHING FIX + OMNIROUTE ENHANCEMENT
-- Migration 20261004000000
-- 1. FIX: ai_matches was missing `category_score` — both the edge function
--    and the client-side fallback insert it, so EVERY insert failed silently
--    ("failed to search"). Adds the column + backfills, then enables realtime.
-- 2. ENHANCE: adds `ai_score` + `match_reason` columns so the OmniRoute-backed
--    matching can store an AI semantic score and a human-readable reason.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. FIX: add category_score (the missing column that broke inserts) ────
ALTER TABLE public.ai_matches
  ADD COLUMN IF NOT EXISTS category_score integer;

-- ─── 2. ENHANCE: AI semantic score + reason ─────────────────────────────────
ALTER TABLE public.ai_matches
  ADD COLUMN IF NOT EXISTS ai_score integer;

ALTER TABLE public.ai_matches
  ADD COLUMN IF NOT EXISTS match_reason text;

-- Backfill category_score for existing rows (derived from match_score strength)
UPDATE public.ai_matches SET category_score = CASE
  WHEN match_score >= 80 THEN 100
  WHEN match_score >= 60 THEN 80
  WHEN match_score >= 45 THEN 60
  ELSE 40
END WHERE category_score IS NULL;

-- ─── Realtime: ensure ai_matches is published for live match updates ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ai_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_matches;
  END IF;
END $$;
