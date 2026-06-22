-- Schedule cleanup_orphaned_data() to run weekly via pg_cron
-- This ensures orphaned AI matches, notifications, and stuck deletion requests
-- are automatically cleaned up without manual intervention

-- ============================================================
-- PART 1: Enable pg_cron extension
-- ============================================================
-- pg_cron is available in Supabase's managed Postgres infrastructure.
-- It creates its own cron schema with schedule/unschedule functions.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- PART 2: Schedule cleanup_orphaned_data() to run weekly
-- ============================================================

-- Remove any existing schedule with this name (idempotent — no error if missing)
DELETE FROM cron.job WHERE jobname = 'cleanup-orphaned-data';

-- Schedule: Every Sunday at 3:00 AM UTC
-- Cron expression: '0 3 * * 0' = minute 0, hour 3, any day, any month, Sunday
-- Runs public.cleanup_orphaned_data() which:
--   1. Deletes AI matches referencing non-existent/soft-deleted profiles
--   2. Deletes dangling notifications for deleted users
--   3. Marks stuck processing deletion requests as failed (after >24h)
SELECT cron.schedule(
  'cleanup-orphaned-data',
  '0 3 * * 0',
  $$SELECT public.cleanup_orphaned_data()$$
);
