-- ============================================================================
-- FIX (2026-08-03): align usage_logs schema with the AI usage-tracking code.
--
-- The AI chat quota code (supabase/functions/ai-assistant + src/components/
-- AIChatSupport.tsx) reads/writes `feature_type` and `usage_count`, but the base
-- migrations (20240511, 20240515) created usage_logs with `feature` / `count`.
-- The live DB was patched manually, which is why AI worked — but any fresh
-- environment (or a db reset) would fail every usage-log insert/read.
--
-- This migration adds the columns the code actually uses (additive, safe).
-- ============================================================================

ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS feature_type TEXT,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_feature_type
  ON public.usage_logs(user_id, feature_type);

-- Backfill: copy any legacy rows into the new columns so existing quota
-- history is not lost.
UPDATE public.usage_logs
SET feature_type = COALESCE(feature_type, feature),
    usage_count  = COALESCE(usage_count, count)
WHERE feature_type IS NULL OR usage_count IS NULL;
