-- ═══════════════════════════════════════════════════════════════════
-- FIX PROFILE UPSERT (42P10) + REAL EMAIL VERIFICATION
-- ═══════════════════════════════════════════════════════════════════
-- Part 1: Add UNIQUE(user_id) constraints to freelancer_profiles and
--         client_profiles so `upsert(..., { onConflict: 'user_id' })`
--         works (fixes HTTP 400 42P10 "no unique or exclusion
--         constraint" during onboarding / profile save).
--         Existing duplicates are deduped (latest updated_at wins)
--         BEFORE the constraint is added.
--
-- Part 2: Drop the auto_confirm_email trigger so Supabase Auth actually
--         sends verification emails on signup (the trigger auto-confirms
--         every new user instantly, which is why users never receive the
--         verification email even though the Brevo welcome email arrives).
--         Existing unverified users are confirmed first so nobody is
--         locked out. NOTE: SMTP must be configured in the Supabase
--         Dashboard (Auth → SMTP) using Brevo SMTP credentials for
--         verification emails to be delivered.
-- ═══════════════════════════════════════════════════════════════════

SET search_path = '';

-- ────────────────────────────────────────────────────────────────────
-- PART 1a: DEDUPE freelancer_profiles (keep latest updated_at per user_id)
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  -- Count duplicates before dedup (for logging only)
  SELECT COUNT(*) - COUNT(DISTINCT user_id)
  INTO v_dup_count
  FROM public.freelancer_profiles;

  IF v_dup_count > 0 THEN
    RAISE NOTICE 'Deduplicating freelancer_profiles: % duplicate rows found', v_dup_count;

    DELETE FROM public.freelancer_profiles fp
    WHERE fp.id IN (
      SELECT id FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
          ) AS rn
        FROM public.freelancer_profiles
      ) ranked
      WHERE rn > 1
    );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- PART 1b: ADD UNIQUE(user_id) on freelancer_profiles (if missing)
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.freelancer_profiles'::regclass
      AND contype = 'u'
      AND array_to_string(conkey, ',') = (
        SELECT array_to_string(array_agg(a.attnum ORDER BY a.attnum), ',')
        FROM pg_attribute a
        WHERE a.attrelid = 'public.freelancer_profiles'::regclass
          AND a.attname = 'user_id'
      )
  ) THEN
    ALTER TABLE public.freelancer_profiles
      ADD CONSTRAINT freelancer_profiles_user_id_key UNIQUE (user_id);
    RAISE NOTICE 'Added UNIQUE(user_id) on freelancer_profiles';
  ELSE
    RAISE NOTICE 'UNIQUE(user_id) already exists on freelancer_profiles';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- PART 2a: DEDUPE client_profiles (keep latest updated_at per user_id)
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT COUNT(*) - COUNT(DISTINCT user_id)
  INTO v_dup_count
  FROM public.client_profiles;

  IF v_dup_count > 0 THEN
    RAISE NOTICE 'Deduplicating client_profiles: % duplicate rows found', v_dup_count;

    DELETE FROM public.client_profiles cp
    WHERE cp.id IN (
      SELECT id FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
          ) AS rn
        FROM public.client_profiles
      ) ranked
      WHERE rn > 1
    );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- PART 2b: ADD UNIQUE(user_id) on client_profiles (if missing)
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_profiles'::regclass
      AND contype = 'u'
      AND array_to_string(conkey, ',') = (
        SELECT array_to_string(array_agg(a.attnum ORDER BY a.attnum), ',')
        FROM pg_attribute a
        WHERE a.attrelid = 'public.client_profiles'::regclass
          AND a.attname = 'user_id'
      )
  ) THEN
    ALTER TABLE public.client_profiles
      ADD CONSTRAINT client_profiles_user_id_key UNIQUE (user_id);
    RAISE NOTICE 'Added UNIQUE(user_id) on client_profiles';
  ELSE
    RAISE NOTICE 'UNIQUE(user_id) already exists on client_profiles';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- PART 3: DROP AUTO-CONFIRM TRIGGER → enable real verification emails
-- ────────────────────────────────────────────────────────────────────
-- 1. Confirm all existing unverified users (grace period — no lockout)
UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Drop the auto-confirm trigger + function so Supabase Auth sends
--    verification emails to new signups.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_email();

-- 3. Refresh schema cache
NOTIFY pgrst, 'reload schema';
