-- =============================================================
-- 🔥 AUTH SYSTEM FIX SCRIPT
-- =============================================================
-- 1. Delete duplicate profiles (keep only auth user matching ID)
-- 2. Set onboarding_completed = true for your profile
-- 3. Add UNIQUE constraint on profiles.email
-- =============================================================

BEGIN;

-- Step 1: Delete ALL duplicate profiles for mirankhan1542@gmail.com
-- Keep ONLY the one matching auth user ID 22b783ec-f852-4a94-88a3-b2115955bdc4
DELETE FROM public.profiles
WHERE email = 'mirankhan1542@gmail.com'
  AND id != '22b783ec-f852-4a94-88a3-b2115955bdc4';

-- Step 2: Set onboarding_completed = true for your profile
UPDATE public.profiles
SET onboarding_completed = true
WHERE id = '22b783ec-f852-4a94-88a3-b2115955bdc4';

-- Step 3: Fix test user profiles too
UPDATE public.profiles
SET onboarding_completed = true
WHERE onboarding_completed = false
  AND email LIKE '%@growlancer.test';

-- Step 4: Clean up any remaining duplicates across ALL emails
DELETE FROM public.profiles a
USING public.profiles b
WHERE a.id < b.id
  AND a.email = b.email
  AND a.email IS NOT NULL;

-- Step 5: Add UNIQUE constraint on profiles.email
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_email_unique UNIQUE (email);

COMMIT;
