-- Migration: Create get_category_counts RPC
-- Returns a JSONB object mapping category → total count (open projects + active services)
-- Replaces client-side counting for better performance at scale

CREATE OR REPLACE FUNCTION public.get_category_counts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_object_agg(category, total),
    '{}'::JSONB
  )
  INTO result
  FROM (
    SELECT category, COUNT(*)::INTEGER AS total
    FROM (
      SELECT category FROM projects WHERE status = 'open' AND category IS NOT NULL
      UNION ALL
      SELECT category FROM services WHERE active = true AND category IS NOT NULL
    ) combined
    GROUP BY category
  ) counts;

  RETURN result;
END;
$$;
