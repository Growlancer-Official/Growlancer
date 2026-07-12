-- Drop UNIQUE(user_id, skill) constraint from skill_certifications
-- This constraint prevents issuing both a Certificate AND an LOR
-- to the same intern for the same skill (e.g., both with skill='Internship').
-- The verification_code UNIQUE constraint remains for duplicate code prevention.
ALTER TABLE public.skill_certifications
  DROP CONSTRAINT IF EXISTS skill_certifications_user_id_skill_key;

-- Notify realtime
SELECT pg_notify('pgrst', 'reload schema');
