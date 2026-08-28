-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP: Remove all test/seed data for production launch
-- This removes test data created during QA while preserving:
--   - Schema (all tables, columns, RLS policies)
--   - Migrations (idempotent re-runnable)
--   - Real user data (auth.users managed by Supabase)
--
-- NOTE: This only cleans data added by the seed migration (20270101000011).
-- Existing real user profiles are NOT touched.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  -- ═══ Remove test client (Arjun Mehta — synthetic UUID, no auth.users row) ═══
  DELETE FROM profiles WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  -- ═══ Remove ALL test services ═══
  DELETE FROM services WHERE freelancer_id IN (
    '3baa9544-29db-4c17-8b81-812a61921d5c',
    'e3048ee4-703d-48a0-831d-b74cb166c53e',
    '89ce29dc-1d66-44be-a822-efd7b4b8f50b'
  );

  -- ═══ Remove ALL test portfolio items ═══
  DELETE FROM portfolio_items WHERE user_id IN (
    '3baa9544-29db-4c17-8b81-812a61921d5c',
    'e3048ee4-703d-48a0-831d-b74cb166c53e',
    '89ce29dc-1d66-44be-a822-efd7b4b8f50b'
  );

  -- ═══ Remove ALL test projects ═══
  DELETE FROM projects WHERE client_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  -- ═══ Remove ALL test wallets ═══
  DELETE FROM wallets WHERE user_id IN (
    '3baa9544-29db-4c17-8b81-812a61921d5c',
    'e3048ee4-703d-48a0-831d-b74cb166c53e',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  );

  -- ═══ Reset freelancer profiles to minimal (remove test skills/bio/ratings) ═══
  UPDATE freelancer_profiles SET
    title = NULL,
    bio = NULL,
    hourly_rate = NULL,
    experience = NULL,
    skills = '{}',
    categories = '{}',
    languages = '{}',
    location = NULL,
    portfolio_url = NULL,
    seller_level = 'new',
    verification_status = 'unverified',
    rating = NULL,
    total_reviews = NULL,
    weighted_rating = NULL,
    on_time_delivery_rate = NULL,
    response_rate = NULL,
    hire_rate = NULL,
    completion_rate = NULL,
    updated_at = now()
  WHERE user_id IN (
    '3baa9544-29db-4c17-8b81-812a61921d5c',
    'e3048ee4-703d-48a0-831d-b74cb166c53e',
    '89ce29dc-1d66-44be-a822-efd7b4b8f50b'
  );

  -- ═══ Reset profiles.country back to NULL for test users ═══
  UPDATE profiles SET country = NULL WHERE country IS NOT NULL
    AND id IN (
      '3baa9544-29db-4c17-8b81-812a61921d5c',
      'e3048ee4-703d-48a0-831d-b74cb166c53e',
      '89ce29dc-1d66-44be-a822-efd7b4b8f50b'
    );

END $$;
