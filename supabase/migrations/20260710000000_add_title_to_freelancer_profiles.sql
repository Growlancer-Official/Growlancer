-- Add title column to freelancer_profiles for profile completion gating
-- ProfessionalProfilePage.tsx and ProtectedRoute.tsx both reference this column

ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS title TEXT;

-- Backfill title for existing rows from profiles.name
UPDATE public.freelancer_profiles fp
  SET title = p.name
FROM public.profiles p
WHERE fp.user_id = p.id
  AND fp.title IS NULL
  AND p.name IS NOT NULL;
