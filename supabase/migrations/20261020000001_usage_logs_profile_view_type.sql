-- ============================================================
-- Extend usage_logs.feature_type CHECK to allow 'profile_view'
-- (added by the profile views counter RPC)
-- ============================================================

alter table public.usage_logs
  drop constraint if exists usage_logs_feature_type_check;

alter table public.usage_logs
  add constraint usage_logs_feature_type_check
  check (feature_type = any (array['ai_chat'::text, 'ai_matching'::text, 'ai_assistant'::text, 'profile_view'::text]));
