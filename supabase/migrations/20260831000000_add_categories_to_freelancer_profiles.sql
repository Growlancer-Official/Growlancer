-- ═══════════════════════════════════════════════════════════════════
-- Category-first matching: add categories column to freelancer_profiles
--
-- Growlancer runs on 145 top-level categories. Freelancers select the
-- categories they work in, and AI matching scores on category overlap
-- (skills remain free-text, self-added by freelancers/clients).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';

-- Existing freelancers get their categories backfilled from their skills
-- (match skill names against category names so no profile is left empty).
UPDATE public.freelancer_profiles fp
SET categories = (
  SELECT COALESCE(ARRAY_AGG(DISTINCT c.name), '{}')
  FROM public.skills s
  JOIN public.subcategories sc ON sc.id = s.subcategory_id
  JOIN public.categories c ON c.id = sc.category_id
  WHERE s.name = ANY(fp.skills)
)
WHERE (fp.categories IS NULL OR array_length(fp.categories, 1) IS NULL)
  AND fp.skills IS NOT NULL
  AND array_length(fp.skills, 1) > 0;
