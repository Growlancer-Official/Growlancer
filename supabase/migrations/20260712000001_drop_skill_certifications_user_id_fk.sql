-- Drop FK constraint on skill_certifications.user_id
-- The auth.users table no longer has matching records for intern profiles,
-- and the real connection is stored in metadata->>application_id anyway.
ALTER TABLE skill_certifications
  DROP CONSTRAINT IF EXISTS skill_certifications_user_id_fkey;
