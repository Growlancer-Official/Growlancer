-- ═══════════════════════════════════════════════════════════════════════════════
-- industries ecosystem — real-time industry list for client onboarding, client
-- settings, post-project and anywhere a client picks their industry.
-- Mirrors the categories pattern: public read-only + admin manage + seed data.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.industries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  icon text DEFAULT 'Building2',
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.industries IS
  'Industry sectors shown to clients (onboarding, settings, post-project). Category-first platform: industries describe the client business, categories describe the work.';

-- ─── Enable RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can read active industries — drives the real-time
-- dropdown everywhere. Matches the categories policy exactly.
DROP POLICY IF EXISTS "Anyone can read industries" ON public.industries;
CREATE POLICY "Anyone can read industries"
  ON public.industries FOR SELECT USING (true);

-- Only admins can manage the industry list.
DROP POLICY IF EXISTS "Admins can manage industries" ON public.industries;
CREATE POLICY "Admins can manage industries"
  ON public.industries FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- ─── Seed: all industries ───────────────────────────────────────────────────────
INSERT INTO public.industries (name, slug, icon, display_order) VALUES
  ('Accounting', 'accounting', 'Calculator', 1),
  ('Advertising & Marketing', 'advertising-marketing', 'Megaphone', 2),
  ('Aerospace & Defense', 'aerospace-defense', 'Rocket', 3),
  ('Agriculture & Farming', 'agriculture-farming', 'Sprout', 4),
  ('Architecture & Interior Design', 'architecture-interior-design', 'Building', 5),
  ('Arts & Entertainment', 'arts-entertainment', 'Palette', 6),
  ('Automotive', 'automotive', 'Car', 7),
  ('Banking & Financial Services', 'banking-financial-services', 'Landmark', 8),
  ('Biotechnology', 'biotechnology', 'Dna', 9),
  ('Chemicals & Materials', 'chemicals-materials', 'FlaskConical', 10),
  ('Construction', 'construction', 'HardHat', 11),
  ('Consulting', 'consulting', 'Briefcase', 12),
  ('Consumer Electronics', 'consumer-electronics', 'Smartphone', 13),
  ('Cosmetics & Beauty', 'cosmetics-beauty', 'Sparkles', 14),
  ('Cybersecurity', 'cybersecurity', 'ShieldCheck', 15),
  ('E-commerce & Retail', 'ecommerce-retail', 'ShoppingCart', 16),
  ('Education & EdTech', 'education-edtech', 'GraduationCap', 17),
  ('Energy & Utilities', 'energy-utilities', 'Zap', 18),
  ('Engineering', 'engineering', 'Cog', 19),
  ('Environmental Services', 'environmental-services', 'Leaf', 20),
  ('Event Management', 'event-management', 'CalendarDays', 21),
  ('Fashion & Apparel', 'fashion-apparel', 'Shirt', 22),
  ('Food & Beverage', 'food-beverage', 'UtensilsCrossed', 23),
  ('Government & Public Sector', 'government-public-sector', 'Landmark', 24),
  ('Healthcare & Medical', 'healthcare-medical', 'HeartPulse', 25),
  ('Hospitality & Tourism', 'hospitality-tourism', 'Hotel', 26),
  ('Human Resources', 'human-resources', 'Users', 27),
  ('Information Technology', 'information-technology', 'Cpu', 28),
  ('Insurance', 'insurance', 'Umbrella', 29),
  ('Legal Services', 'legal-services', 'Scale', 30),
  ('Logistics & Supply Chain', 'logistics-supply-chain', 'Truck', 31),
  ('Manufacturing', 'manufacturing', 'Factory', 32),
  ('Media & Publishing', 'media-publishing', 'Newspaper', 33),
  ('Mining & Metals', 'mining-metals', 'Mountain', 34),
  ('Music & Audio', 'music-audio', 'Music', 35),
  ('Nonprofit & NGO', 'nonprofit-ngo', 'HeartHandshake', 36),
  ('Oil & Gas', 'oil-gas', 'Fuel', 37),
  ('Pharmaceuticals', 'pharmaceuticals', 'Pill', 38),
  ('Photography & Videography', 'photography-videography', 'Camera', 39),
  ('Real Estate', 'real-estate', 'Home', 40),
  ('Recruitment & Staffing', 'recruitment-staffing', 'UserSearch', 41),
  ('Robotics & Automation', 'robotics-automation', 'Bot', 42),
  ('SaaS & Software', 'saas-software', 'Cloud', 43),
  ('Sports & Fitness', 'sports-fitness', 'Dumbbell', 44),
  ('Telecommunications', 'telecommunications', 'RadioTower', 45),
  ('Transportation', 'transportation', 'Plane', 46),
  ('Travel & Tourism', 'travel-tourism', 'MapPin', 47),
  ('Video & Animation', 'video-animation', 'Clapperboard', 48),
  ('Web Development', 'web-development', 'Globe', 49),
  ('Other', 'other', 'Building2', 50)
ON CONFLICT (name) DO NOTHING;

-- Backfill missing slugs for any existing rows (defensive).
UPDATE public.industries SET
  slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- ─── projects.industry column ───────────────────────────────────────────────────
-- Lets clients tag a project with their industry; used for matching/insights.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'industry'
  ) THEN
    ALTER TABLE public.projects ADD COLUMN industry text;
  END IF;
END $$;

-- Fast index for future industry-based project filtering.
CREATE INDEX IF NOT EXISTS idx_projects_industry ON public.projects(industry);
