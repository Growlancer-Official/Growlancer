-- ============================================================
-- Category Ecosystem: categories, subcategories, skills
-- ============================================================

-- 1. CATEGORIES (main category table — replaces hardcoded CATEGORIES array)
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Briefcase',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. SUBCATEGORIES
CREATE TABLE IF NOT EXISTS subcategories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, slug)
);

-- 3. SKILLS (each skill belongs to a subcategory)
CREATE TABLE IF NOT EXISTS skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subcategory_id UUID NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(subcategory_id, slug)
);

-- 4. FREELANCER_SKILLS (links freelancers to skills with experience/rate)
CREATE TABLE IF NOT EXISTS freelancer_skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  freelancer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  hourly_rate NUMERIC(10,2),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(freelancer_id, skill_id)
);

-- 5. PROJECT_CATEGORIES (links projects to categories)
CREATE TABLE IF NOT EXISTS project_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, category_id)
);

-- 6. PROJECT_SKILLS (links projects to required skills)
CREATE TABLE IF NOT EXISTS project_skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, skill_id)
);

-- 7. SERVICE_CATEGORIES (links services to categories)
CREATE TABLE IF NOT EXISTS service_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_id, category_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order, name);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_slug ON subcategories(category_id, slug);
CREATE INDEX IF NOT EXISTS idx_subcategories_active ON subcategories(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_skills_subcategory_id ON skills(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(subcategory_id, slug);
CREATE INDEX IF NOT EXISTS idx_freelancer_skills_freelancer_id ON freelancer_skills(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_skills_skill_id ON freelancer_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_project_categories_project_id ON project_categories(project_id);
CREATE INDEX IF NOT EXISTS idx_project_categories_category_id ON project_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_project_skills_project_id ON project_skills(project_id);
CREATE INDEX IF NOT EXISTS idx_project_skills_skill_id ON project_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_service_id ON service_categories(service_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_category_id ON service_categories(category_id);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE freelancer_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Categories/subcategories/skills are public read-only
CREATE POLICY "Anyone can read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Anyone can read subcategories" ON subcategories FOR SELECT USING (true);
CREATE POLICY "Anyone can read skills" ON skills FOR SELECT USING (true);

-- Only admins can manage categories
CREATE POLICY "Admins can manage categories" ON categories FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Admins can manage subcategories" ON subcategories FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Admins can manage skills" ON skills FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Freelancer skills: freelancers manage their own
CREATE POLICY "Freelancers manage own skills" ON freelancer_skills FOR ALL USING (
  auth.uid() = freelancer_id
);
CREATE POLICY "Anyone can read freelancer skills" ON freelancer_skills FOR SELECT USING (true);

-- Project categories/skills: project participants can manage
CREATE POLICY "Clients manage project categories" ON project_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM projects WHERE id = project_id AND client_id = auth.uid())
);
CREATE POLICY "Anyone can read project categories" ON project_categories FOR SELECT USING (true);

CREATE POLICY "Clients manage project skills" ON project_skills FOR ALL USING (
  EXISTS (SELECT 1 FROM projects WHERE id = project_id AND client_id = auth.uid())
);
CREATE POLICY "Anyone can read project skills" ON project_skills FOR SELECT USING (true);

-- Service categories: freelancers manage own
CREATE POLICY "Freelancers manage service categories" ON service_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM services WHERE id = service_id AND freelancer_id = auth.uid())
);
CREATE POLICY "Anyone can read service categories" ON service_categories FOR SELECT USING (true);

-- ============================================================
-- SEED DATA — Master Category List
-- ============================================================

-- Development & IT
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Development & IT', 'development-it', 'Code', 'Web, mobile, backend, frontend, and full-stack development', 1)
ON CONFLICT (slug) DO NOTHING;

-- Design & Creative
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Design & Creative', 'design-creative', 'Palette', 'UI/UX, graphic design, branding, illustration, and motion', 2)
ON CONFLICT (slug) DO NOTHING;

-- Writing & Translation
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Writing & Translation', 'writing-translation', 'PenTool', 'Content writing, copywriting, translation, and editing', 3)
ON CONFLICT (slug) DO NOTHING;

-- Digital Marketing
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Digital Marketing', 'digital-marketing', 'Megaphone', 'SEO, social media, email marketing, PPC, and content marketing', 4)
ON CONFLICT (slug) DO NOTHING;

-- Sales & Customer Support
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Sales & Customer Support', 'sales-support', 'Headphones', 'Lead generation, telecalling, support, and CRM management', 5)
ON CONFLICT (slug) DO NOTHING;

-- Finance & Accounting
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Finance & Accounting', 'finance-accounting', 'Calculator', 'Bookkeeping, financial analysis, tax consulting, and payroll', 6)
ON CONFLICT (slug) DO NOTHING;

-- Engineering & Architecture
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Engineering & Architecture', 'engineering-architecture', 'Layout', 'AutoCAD, civil engineering, mechanical design, and interior design', 7)
ON CONFLICT (slug) DO NOTHING;

-- Legal Services
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Legal Services', 'legal-services', 'ShieldCheck', 'Contract drafting, legal research, compliance, and trademark', 8)
ON CONFLICT (slug) DO NOTHING;

-- HR & Recruitment
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('HR & Recruitment', 'hr-recruitment', 'Users', 'Talent acquisition, resume screening, and HR consulting', 9)
ON CONFLICT (slug) DO NOTHING;

-- Admin & Operations
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Admin & Operations', 'admin-operations', 'FolderKanban', 'Data entry, project management, operations, and research', 10)
ON CONFLICT (slug) DO NOTHING;

-- Education & Training
INSERT INTO categories (name, slug, icon, description, display_order) VALUES
('Education & Training', 'education-training', 'BrainCircuit', 'Online tutoring, course creation, career coaching, and language training', 11)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SEED SUBCATEGORIES & SKILLS
-- ============================================================

-- Helper function: get category id by slug
-- (Used inline rather than PL/pgSQL to keep it readable)

-- ============ Development & IT ============
DO $$
DECLARE
  cat_id UUID;
  subcat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'development-it';

  -- Frontend Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Frontend Development', 'frontend-development', 'React, Vue, Angular, and modern web UI')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'React', 'react'), (subcat_id, 'Next.js', 'nextjs'), (subcat_id, 'Angular', 'angular'),
    (subcat_id, 'Vue.js', 'vuejs'), (subcat_id, 'TypeScript', 'typescript'), (subcat_id, 'Tailwind CSS', 'tailwind-css'),
    (subcat_id, 'HTML/CSS', 'html-css'), (subcat_id, 'Svelte', 'svelte');

  -- Backend Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Backend Development', 'backend-development', 'APIs, microservices, and server-side logic')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Node.js', 'nodejs'), (subcat_id, 'Express.js', 'expressjs'), (subcat_id, 'Python', 'python'),
    (subcat_id, 'Django', 'django'), (subcat_id, 'FastAPI', 'fastapi'), (subcat_id, 'Java', 'java'),
    (subcat_id, 'Spring Boot', 'spring-boot'), (subcat_id, 'Go', 'go'), (subcat_id, 'Rust', 'rust'),
    (subcat_id, 'Ruby on Rails', 'ruby-on-rails'), (subcat_id, 'PHP', 'php'), (subcat_id, 'Laravel', 'laravel');

  -- Full Stack Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Full Stack Development', 'full-stack-development', 'Combined frontend and backend expertise')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'MERN Stack', 'mern-stack'), (subcat_id, 'JAMstack', 'jamstack'),
    (subcat_id, 'T3 Stack', 't3-stack'), (subcat_id, 'LAMP Stack', 'lamp-stack');

  -- Mobile App Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Mobile App Development', 'mobile-development', 'Native iOS and Android apps')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Swift', 'swift'), (subcat_id, 'Kotlin', 'kotlin'),
    (subcat_id, 'iOS', 'ios'), (subcat_id, 'Android', 'android');

  -- Cross Platform Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Cross Platform Development', 'cross-platform', 'Write once, run anywhere frameworks')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Flutter', 'flutter'), (subcat_id, 'React Native', 'react-native'),
    (subcat_id, '.NET MAUI', 'dotnet-maui');

  -- Web Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Web Development', 'web-development', 'General web development and CMS')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'WordPress', 'wordpress'), (subcat_id, 'Shopify', 'shopify'),
    (subcat_id, 'Webflow', 'webflow'), (subcat_id, 'Wix', 'wix'),
    (subcat_id, 'Squarespace', 'squarespace');

  -- API Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'API Development', 'api-development', 'REST, GraphQL, and gRPC APIs')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'REST API', 'rest-api'), (subcat_id, 'GraphQL', 'graphql'),
    (subcat_id, 'gRPC', 'grpc'), (subcat_id, 'Postman', 'postman');

  -- AI / Machine Learning
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'AI / Machine Learning', 'ai-machine-learning', 'Artificial intelligence and ML solutions')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'TensorFlow', 'tensorflow'), (subcat_id, 'PyTorch', 'pytorch'),
    (subcat_id, 'OpenAI', 'openai'), (subcat_id, 'LangChain', 'langchain'),
    (subcat_id, 'Hugging Face', 'hugging-face'), (subcat_id, 'Scikit-learn', 'scikit-learn');

  -- Data Science
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Data Science', 'data-science', 'Data analysis, visualization, and modeling')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Power BI', 'power-bi'), (subcat_id, 'Tableau', 'tableau'),
    (subcat_id, 'Pandas', 'pandas'), (subcat_id, 'NumPy', 'numpy'),
    (subcat_id, 'R', 'r-language'), (subcat_id, 'Jupyter', 'jupyter');

  -- Data Analytics
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Data Analytics', 'data-analytics', 'Business intelligence and analytics')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'SQL', 'sql'), (subcat_id, 'Excel', 'excel'), (subcat_id, 'Looker', 'looker');

  -- Database Administration
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Database Administration', 'database-administration', 'Database design, optimization, and management')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'PostgreSQL', 'postgresql'), (subcat_id, 'MongoDB', 'mongodb'),
    (subcat_id, 'MySQL', 'mysql'), (subcat_id, 'Redis', 'redis'),
    (subcat_id, 'Supabase', 'supabase'), (subcat_id, 'Firebase', 'firebase');

  -- DevOps
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'DevOps', 'devops', 'CI/CD, infrastructure, and monitoring')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Docker', 'docker'), (subcat_id, 'Kubernetes', 'kubernetes'),
    (subcat_id, 'Terraform', 'terraform'), (subcat_id, 'Ansible', 'ansible'),
    (subcat_id, 'GitHub Actions', 'github-actions'), (subcat_id, 'CircleCI', 'circleci');

  -- Cloud Computing
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Cloud Computing', 'cloud-computing', 'Cloud infrastructure and services')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'AWS', 'aws'), (subcat_id, 'Azure', 'azure'), (subcat_id, 'GCP', 'gcp'),
    (subcat_id, 'Vercel', 'vercel'), (subcat_id, 'Netlify', 'netlify');

  -- Cybersecurity
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Cybersecurity', 'cybersecurity', 'Security assessment and protection')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Penetration Testing', 'penetration-testing'), (subcat_id, 'Ethical Hacking', 'ethical-hacking'),
    (subcat_id, 'Compliance', 'cybersecurity-compliance');

  -- Blockchain Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Blockchain Development', 'blockchain-development', 'Smart contracts, dApps, and web3')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Solidity', 'solidity'), (subcat_id, 'Ethereum', 'ethereum'),
    (subcat_id, 'Web3', 'web3'), (subcat_id, 'Rust (Solana)', 'rust-solana');

  -- Game Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Game Development', 'game-development', 'Game design and development')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Unity', 'unity'), (subcat_id, 'Unreal Engine', 'unreal-engine'),
    (subcat_id, 'Godot', 'godot');

  -- AR / VR Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'AR / VR Development', 'ar-vr-development', 'Augmented and virtual reality')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'ARKit', 'arkit'), (subcat_id, 'ARCore', 'arcore'), (subcat_id, 'WebXR', 'webxr');

  -- QA Testing
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'QA Testing', 'qa-testing', 'Manual and automated testing')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Selenium', 'selenium'), (subcat_id, 'Cypress', 'cypress'),
    (subcat_id, 'Jest', 'jest'), (subcat_id, 'Playwright', 'playwright');

  -- Software Architecture
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Software Architecture', 'software-architecture', 'System design and architecture')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Microservices', 'microservices'), (subcat_id, 'Event-Driven', 'event-driven'),
    (subcat_id, 'Serverless', 'serverless'), (subcat_id, 'Domain-Driven Design', 'domain-driven-design');

  -- ERP / CRM Development
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'ERP / CRM Development', 'erp-crm-development', 'Enterprise resource planning and CRM')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Salesforce', 'salesforce'), (subcat_id, 'SAP', 'sap'),
    (subcat_id, 'Odoo', 'odoo'), (subcat_id, 'HubSpot', 'hubspot');
END $$;

-- ============ Design & Creative ============
DO $$
DECLARE
  cat_id UUID;
  subcat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'design-creative';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'UI/UX Design', 'ui-ux-design', 'User interface and user experience design')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Figma', 'figma'), (subcat_id, 'Adobe XD', 'adobe-xd'),
    (subcat_id, 'Sketch', 'sketch'), (subcat_id, 'Framer', 'framer');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Graphic Design', 'graphic-design', 'Visual communication and design')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Photoshop', 'photoshop'), (subcat_id, 'Illustrator', 'illustrator'),
    (subcat_id, 'InDesign', 'indesign'), (subcat_id, 'Canva', 'canva');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Logo Design', 'logo-design', 'Brand marks and logo creation');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Brand Identity', 'brand-identity', 'Complete brand identity systems');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Product Design', 'product-design', 'Digital product design and prototyping')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Prototyping', 'prototyping'), (subcat_id, 'Design Systems', 'design-systems');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Web Design', 'web-design', 'Website design and landing pages')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Responsive Design', 'responsive-design'), (subcat_id, 'Landing Page', 'landing-page');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Mobile App Design', 'mobile-app-design', 'Mobile-first app design');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Illustration', 'illustration', 'Custom illustrations and icons');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Motion Graphics', 'motion-graphics', 'Animated graphics and transitions')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'After Effects', 'after-effects');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Animation', 'animation', '2D and 3D animation')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Blender', 'blender'), (subcat_id, 'Maya', 'maya');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Video Editing', 'video-editing', 'Post-production and video editing')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Premiere Pro', 'premiere-pro'), (subcat_id, 'DaVinci Resolve', 'davinci-resolve'),
    (subcat_id, 'Final Cut Pro', 'final-cut-pro');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Thumbnail Design', 'thumbnail-design', 'YouTube and social media thumbnails');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Presentation Design', 'presentation-design', 'Pitch decks and slide design');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, '3D Design', '3d-design', '3D modeling and rendering')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Blender 3D', 'blender-3d'), (subcat_id, 'Cinema 4D', 'cinema-4d');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Packaging Design', 'packaging-design', 'Product packaging and label design');
END $$;

-- ============ Writing & Translation ============
DO $$
DECLARE
  cat_id UUID;
  subcat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'writing-translation';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Content Writing', 'content-writing', 'Blog posts, articles, and web content');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Copywriting', 'copywriting', 'Sales copy, ads, and marketing text');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Technical Writing', 'technical-writing', 'Documentation, guides, and manuals');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Ghostwriting', 'ghostwriting', 'Books, articles, and content under client name');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Script Writing', 'script-writing', 'Video scripts, podcasts, and screenplays');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Resume Writing', 'resume-writing', 'CV and resume optimization');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Translation', 'translation', 'Document and content translation');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Proofreading', 'proofreading', 'Grammar checking and editing');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Editing', 'editing', 'Comprehensive content editing');
END $$;

-- ============ Digital Marketing ============
DO $$
DECLARE
  cat_id UUID;
  subcat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'digital-marketing';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'SEO', 'seo', 'Search engine optimization')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Ahrefs', 'ahrefs'), (subcat_id, 'SEMrush', 'semrush'),
    (subcat_id, 'Moz', 'moz'), (subcat_id, 'Google Search Console', 'google-search-console');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'SEM', 'sem', 'Search engine marketing')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Google Ads', 'google-ads'), (subcat_id, 'Bing Ads', 'bing-ads');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Social Media Marketing', 'social-media-marketing', 'Social media strategy and management')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Meta Ads', 'meta-ads'), (subcat_id, 'TikTok Ads', 'tiktok-ads'),
    (subcat_id, 'LinkedIn Ads', 'linkedin-ads');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Influencer Marketing', 'influencer-marketing', 'Influencer campaigns and partnerships');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Email Marketing', 'email-marketing', 'Email campaigns and automation');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Content Marketing', 'content-marketing', 'Content strategy and distribution');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Affiliate Marketing', 'affiliate-marketing', 'Affiliate program management');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'PPC Advertising', 'ppc-advertising', 'Pay-per-click campaign management')
  RETURNING id INTO subcat_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES
    (subcat_id, 'Google Analytics', 'google-analytics');

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Marketing Automation', 'marketing-automation', 'Automated marketing workflows');
END $$;

-- ============ Sales & Customer Support ============
DO $$
DECLARE
  cat_id UUID;
  subcat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'sales-support';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Lead Generation', 'lead-generation', 'B2B and B2C lead generation');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Telecalling', 'telecalling', 'Phone-based sales and outreach');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Customer Support', 'customer-support', 'Customer service and helpdesk');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Virtual Assistance', 'virtual-assistance', 'Administrative and personal support');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'CRM Management', 'crm-management', 'CRM system administration');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Appointment Setting', 'appointment-setting', 'Calendar and meeting scheduling');
END $$;

-- ============ Finance & Accounting ============
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'finance-accounting';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Bookkeeping', 'bookkeeping', 'Financial record keeping');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Financial Analysis', 'financial-analysis', 'Financial modeling and analysis');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Tax Consulting', 'tax-consulting', 'Tax preparation and advisory');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Payroll Management', 'payroll-management', 'Payroll processing and compliance');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Investment Analysis', 'investment-analysis', 'Investment research and analysis');
END $$;

-- ============ Engineering & Architecture ============
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'engineering-architecture';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'AutoCAD', 'autocad', 'CAD design and drafting');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Civil Engineering', 'civil-engineering', 'Infrastructure and structural engineering');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Mechanical Design', 'mechanical-design', 'Mechanical systems and product design');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Interior Design', 'interior-design', 'Interior space planning and design');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Architecture', 'architecture', 'Architectural design and planning');
END $$;

-- ============ Legal Services ============
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'legal-services';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Contract Drafting', 'contract-drafting', 'Legal contract preparation');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Legal Research', 'legal-research', 'Legal case and statute research');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Compliance', 'compliance', 'Regulatory compliance advisory');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Trademark Registration', 'trademark-registration', 'Trademark filing and management');
END $$;

-- ============ HR & Recruitment ============
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'hr-recruitment';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Talent Acquisition', 'talent-acquisition', 'Recruitment and sourcing');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Resume Screening', 'resume-screening', 'CV screening and shortlisting');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Interview Coordination', 'interview-coordination', 'Interview scheduling and logistics');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'HR Consulting', 'hr-consulting', 'HR strategy and advisory');
END $$;

-- ============ Admin & Operations ============
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'admin-operations';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Data Entry', 'data-entry', 'Data input and management');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Project Management', 'project-management', 'Project planning and execution');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Operations Management', 'operations-management', 'Business operations and process');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Research Assistance', 'research-assistance', 'Market and academic research');
END $$;

-- ============ Education & Training ============
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'education-training';

  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Online Tutoring', 'online-tutoring', 'One-on-one and group tutoring');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Course Creation', 'course-creation', 'Online course development');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Career Coaching', 'career-coaching', 'Career guidance and mentorship');
  INSERT INTO subcategories (category_id, name, slug, description) VALUES (cat_id, 'Language Training', 'language-training', 'Language instruction and tutoring');
END $$;

-- ============================================================
-- RPC: get_category_hierarchy — returns categories with subcategories and skills
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_category_hierarchy()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'slug', c.slug,
        'icon', c.icon,
        'description', c.description,
        'display_order', c.display_order,
        'subcategories', COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id', sc.id,
              'name', sc.name,
              'slug', sc.slug,
              'description', sc.description,
              'skills', COALESCE(
                (SELECT jsonb_agg(
                  jsonb_build_object('id', sk.id, 'name', sk.name, 'slug', sk.slug)
                  ORDER BY sk.name
                ) FROM skills sk WHERE sk.subcategory_id = sc.id),
                '[]'::JSONB
              )
            )
            ORDER BY sc.name
          ) FROM subcategories sc WHERE sc.category_id = c.id AND sc.is_active = true),
          '[]'::JSONB
        )
      )
      ORDER BY c.display_order, c.name
    ),
    '[]'::JSONB
  ) INTO result
  FROM categories c
  WHERE c.is_active = true;

  RETURN result;
END;
$$;

-- ============================================================
-- RPC: get_category_counts_v2 — uses new categories table
-- ============================================================
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
    jsonb_object_agg(c.name, total),
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

-- ============================================================
-- RPC: get_active_freelancers_by_category
-- ============================================================
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
    jsonb_object_agg(c.name, cnt),
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

-- ============================================================
-- RPC: search_freelancers_by_category
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_freelancers_by_category(
  p_category_slug TEXT,
  p_search_query TEXT DEFAULT '',
  p_min_rate NUMERIC DEFAULT NULL,
  p_max_rate NUMERIC DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'rating',
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSONB;
  total_count INTEGER;
BEGIN
  -- Get total count
  SELECT COUNT(*)::INTEGER INTO total_count
  FROM profiles p
  JOIN freelancer_profiles fp ON fp.user_id = p.id
  JOIN freelancer_skills fs ON fs.freelancer_id = p.id
  JOIN skills sk ON sk.id = fs.skill_id
  JOIN subcategories sc ON sc.id = sk.subcategory_id
  JOIN categories c ON c.id = sc.category_id
  WHERE c.slug = p_category_slug
    AND (p_search_query = '' OR p.name ILIKE '%' || p_search_query || '%' OR fp.bio ILIKE '%' || p_search_query || '%')
    AND (p_min_rate IS NULL OR fp.hourly_rate >= p_min_rate)
    AND (p_max_rate IS NULL OR fp.hourly_rate <= p_max_rate);

  -- Get paginated results
  SELECT jsonb_build_object(
    'total', total_count,
    'freelancers', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'user_id', p.id,
          'name', p.name,
          'avatar', p.avatar,
          'title', fp.bio,
          'hourly_rate', fp.hourly_rate,
          'rating', fp.rating,
          'total_reviews', fp.total_reviews,
          'availability', fp.availability,
          'location', fp.location,
          'skills', (SELECT ARRAY_AGG(DISTINCT sk2.name) FROM freelancer_skills fs2 JOIN skills sk2 ON sk2.id = fs2.skill_id WHERE fs2.freelancer_id = p.id)
        )
        ORDER BY
          CASE WHEN p_sort_by = 'rating' THEN fp.rating END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'rate_low' THEN fp.hourly_rate END ASC NULLS LAST,
          CASE WHEN p_sort_by = 'rate_high' THEN fp.hourly_rate END DESC NULLS LAST
      ) FROM profiles p
      JOIN freelancer_profiles fp ON fp.user_id = p.id
      JOIN freelancer_skills fs ON fs.freelancer_id = p.id
      JOIN skills sk ON sk.id = fs.skill_id
      JOIN subcategories sc ON sc.id = sk.subcategory_id
      JOIN categories c ON c.id = sc.category_id
      WHERE c.slug = p_category_slug
        AND (p_search_query = '' OR p.name ILIKE '%' || p_search_query || '%' OR fp.bio ILIKE '%' || p_search_query || '%')
        AND (p_min_rate IS NULL OR fp.hourly_rate >= p_min_rate)
        AND (p_max_rate IS NULL OR fp.hourly_rate <= p_max_rate)
      GROUP BY p.id, p.name, p.avatar, fp.bio, fp.hourly_rate, fp.rating, fp.total_reviews, fp.availability, fp.location
      ORDER BY
        CASE WHEN p_sort_by = 'rating' THEN fp.rating END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'rate_low' THEN fp.hourly_rate END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'rate_high' THEN fp.hourly_rate END DESC NULLS LAST
      LIMIT p_limit OFFSET p_offset
    ), '[]'::JSONB)
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- RPC: get_projects_by_category
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_projects_by_category(
  p_category_slug TEXT,
  p_search_query TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*)::INTEGER FROM projects p
      WHERE p.category IS NOT NULL
        AND LOWER(p.category) = (SELECT LOWER(name) FROM categories WHERE slug = p_category_slug)
        AND p.status = 'open'
        AND (p_search_query = '' OR p.title ILIKE '%' || p_search_query || '%' OR p.description ILIKE '%' || p_search_query || '%')),
    'projects', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'description', p.description,
          'budget_min', p.budget_min,
          'budget_max', p.budget_max,
          'experience_level', p.experience_level,
          'status', p.status,
          'created_at', p.created_at,
          'client', jsonb_build_object('name', pr.name, 'avatar', pr.avatar)
        )
        ORDER BY p.created_at DESC
      ) FROM projects p
      JOIN profiles pr ON pr.id = p.client_id
      WHERE p.category IS NOT NULL
        AND LOWER(p.category) = (SELECT LOWER(name) FROM categories WHERE slug = p_category_slug)
        AND p.status = 'open'
        AND (p_search_query = '' OR p.title ILIKE '%' || p_search_query || '%' OR p.description ILIKE '%' || p_search_query || '%')
      LIMIT p_limit OFFSET p_offset
    ), '[]'::JSONB)
  ) INTO result;

  RETURN result;
END;
$$;
