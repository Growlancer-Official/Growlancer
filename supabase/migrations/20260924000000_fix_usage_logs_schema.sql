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

-- NOTE: no backfill from `feature`/`count` — the live DB was patched directly to
-- feature_type/usage_count (those old columns may not exist). Fresh environments
-- get the columns via this migration; legacy rows are out of scope.
