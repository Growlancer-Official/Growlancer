-- ============================================================
-- Backfill: Map old category names to new normalized categories
-- ============================================================
-- This migration takes existing projects and services that still
-- use the old TEXT category column (e.g. 'Web Development', 'Mobile Dev')
-- and creates proper linking rows in project_categories / service_categories
-- using the new normalized categories table.
-- ============================================================

DO $$
DECLARE
  old_name TEXT;
  new_id UUID;
  mapping RECORD;
  inserted_projects INTEGER := 0;
  inserted_services INTEGER := 0;
BEGIN
  -- Mapping: old category names → new category slugs
  -- Create a temp mapping table for readability
  CREATE TEMP TABLE IF NOT EXISTS old_category_map (old_name TEXT, new_slug TEXT);

  INSERT INTO old_category_map VALUES
    ('Web Development',        'development-it'),
    ('Mobile Development',     'development-it'),
    ('Backend Development',    'development-it'),
    ('Database',               'development-it'),
    ('DevOps',                 'development-it'),
    ('Consulting',             'development-it'),
    ('Data Science',           'development-it'),
    ('Machine Learning',       'development-it'),
    ('UI/UX Design',           'design-creative'),
    ('Video Editing',          'design-creative'),
    ('Graphic Design',         'design-creative'),
    ('Content Writing',        'writing-translation'),
    ('Digital Marketing',      'digital-marketing'),
    ('SEO',                    'digital-marketing');

  -- Link projects to categories
  FOR mapping IN
    SELECT m.old_name, c.id AS category_id
    FROM old_category_map m
    JOIN categories c ON c.slug = m.new_slug
  LOOP
    INSERT INTO project_categories (project_id, category_id)
    SELECT p.id, mapping.category_id
    FROM projects p
    WHERE p.category = mapping.old_name
      AND p.status = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM project_categories pc
        WHERE pc.project_id = p.id AND pc.category_id = mapping.category_id
      )
    ON CONFLICT (project_id, category_id) DO NOTHING;

    INSERTED_PROJECTS := INSERTED_PROJECTS + 1;
  END LOOP;

  -- Link services to categories
  FOR mapping IN
    SELECT m.old_name, c.id AS category_id
    FROM old_category_map m
    JOIN categories c ON c.slug = m.new_slug
  LOOP
    INSERT INTO service_categories (service_id, category_id)
    SELECT s.id, mapping.category_id
    FROM services s
    WHERE s.category = mapping.old_name
      AND s.active = true
      AND NOT EXISTS (
        SELECT 1 FROM service_categories sc
        WHERE sc.service_id = s.id AND sc.category_id = mapping.category_id
      )
    ON CONFLICT (service_id, category_id) DO NOTHING;

    INSERTED_SERVICES := INSERTED_SERVICES + 1;
  END LOOP;

  DROP TABLE IF EXISTS old_category_map;
END $$;
