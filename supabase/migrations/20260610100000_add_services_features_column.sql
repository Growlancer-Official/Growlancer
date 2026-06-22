-- Migration: Add features column to services table
-- This eliminates the JSON-packing workaround in CreateServicePage.tsx
-- where features were stored as JSON string inside the requirements column.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;

-- Migrate existing data: extract features from the old JSON-packed requirements format
-- Old format: {"text": "...", "features": ["feature1", "feature2"]}
UPDATE services
SET features = COALESCE(
  (requirements::jsonb -> 'features'),
  '[]'::jsonb
),
requirements = CASE
  WHEN requirements IS NOT NULL AND requirements::jsonb ? 'text'
  THEN requirements::jsonb ->> 'text'
  ELSE requirements
END
WHERE requirements IS NOT NULL
  AND requirements LIKE '{"text":%'
  AND requirements::jsonb ? 'features';

-- Update RLS policies if any reference the columns (none need changing, features is additive)