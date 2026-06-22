-- ============================================================
-- Fix: Category RPC functions had scoping issues
-- The outer SELECT referenced c.name but 'c' was only defined
-- inside the subquery — replaced with 'counts' alias.
-- ============================================================

-- Fix get_category_counts_v2: c.name → counts.name in outer jsonb_object_agg
CREATE OR REPLACE FUNCTION public.get_category_counts_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_object_agg(counts.name, counts.total),
    '{}'::JSONB
  ) INTO result
  FROM (
    SELECT c.name, COUNT(*)::INTEGER AS total
    FROM (
      SELECT LOWER(p.category) AS category_name FROM projects p WHERE p.status = 'open' AND p.category IS NOT NULL
      UNION ALL
      SELECT LOWER(s.category) AS category_name FROM services s WHERE s.active = true AND s.category IS NOT NULL
    ) combined
    JOIN categories c ON LOWER(c.name) = combined.category_name
    GROUP BY c.name
  ) counts;

  RETURN result;
END;
$$;

-- Fix get_active_freelancers_by_category: c.name → counts.name in outer jsonb_object_agg
CREATE OR REPLACE FUNCTION public.get_active_freelancers_by_category()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_object_agg(counts.name, counts.cnt),
    '{}'::JSONB
  ) INTO result
  FROM (
    SELECT c.name, COUNT(DISTINCT fp.user_id)::INTEGER AS cnt
    FROM categories c
    JOIN subcategories sc ON sc.category_id = c.id
    JOIN skills sk ON sk.subcategory_id = sc.id
    JOIN freelancer_skills fs ON fs.skill_id = sk.id
    JOIN freelancer_profiles fp ON fp.user_id = fs.freelancer_id AND fp.availability = true
    WHERE c.is_active = true
    GROUP BY c.name
  ) counts;

  RETURN result;
END;
$$;
