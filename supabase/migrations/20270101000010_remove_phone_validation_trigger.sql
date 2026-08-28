-- ═══════════════════════════════════════════════════════════════════════════
-- Remove phone validation triggers — not needed at launch
--
-- The validate_india_phone trigger existed on TWO tables:
--   1. profiles      (BEFORE INSERT OR UPDATE OF phone)
--   2. profiles_private (BEFORE INSERT OR UPDATE — ALL columns!)
--
-- The profiles_private one was especially dangerous: it fired on EVERY
-- UPDATE to profiles_private (not just phone changes), blocking
-- onboarding_completed and other field updates if the phone value
-- didn't match the strict +91 format.
--
-- Both triggers + the function are removed. Phone validation can be
-- re-added later when phone verification is actually implemented.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop triggers from both tables
DROP TRIGGER IF EXISTS trg_validate_india_phone ON public.profiles;
DROP TRIGGER IF EXISTS trg_validate_india_phone ON public.profiles_private;

-- Drop the validation function
DROP FUNCTION IF EXISTS public.validate_india_phone();
