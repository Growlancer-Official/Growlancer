-- ============================================================
-- MASTER CATEGORY ECOSYSTEM
-- Seeds all 117 categories with subcategories and skills
-- ============================================================

-- First, clear existing data (order matters due to FK constraints)
TRUNCATE TABLE skills CASCADE;
TRUNCATE TABLE subcategories CASCADE;
TRUNCATE TABLE categories CASCADE;

-- Ensure updated_at column exists on skills
ALTER TABLE skills ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ============================================================
-- CATEGORY INSERT
-- All 117 categories from the master list
-- ============================================================

WITH inserted_categories AS (
  INSERT INTO categories (name, slug, icon, description, display_order, is_active)
  VALUES
    ('Development & IT', 'development-it', 'Code', 'Web, mobile, backend, and full-stack development services', 1, true),
    ('AI & Machine Learning', 'ai-machine-learning', 'Brain', 'Artificial intelligence, ML models, and predictive analytics', 2, true),
    ('Artificial Intelligence Chatbots', 'ai-chatbots', 'MessageSquare', 'Conversational AI, chatbot development, and LLM integration', 3, true),
    ('Generative AI', 'generative-ai', 'Wand2', 'Generative AI solutions including image, text, and code generation', 4, true),
    ('Deep Learning', 'deep-learning', 'Network', 'Neural networks, deep learning models, and advanced AI research', 5, true),
    ('Machine Learning Engineering', 'ml-engineering', 'Cpu', 'ML pipeline development, model deployment, and MLOps', 6, true),
    ('Data Science', 'data-science', 'BarChart3', 'Data analysis, statistical modeling, and insights generation', 7, true),
    ('Data Analytics', 'data-analytics', 'TrendingUp', 'Business intelligence, data visualization, and reporting', 8, true),
    ('Data Engineering', 'data-engineering', 'Database', 'Data pipelines, ETL processes, and data warehouse architecture', 9, true),
    ('Data Annotation', 'data-annotation', 'Tags', 'Data labeling, image annotation, and dataset preparation for ML', 10, true),
    ('Data Entry', 'data-entry', 'FileInput', 'Data entry, data processing, and database management', 11, true),
    ('Frontend Development', 'frontend-development', 'Layout', 'React, Vue, Angular, and modern frontend frameworks', 12, true),
    ('Backend Development', 'backend-development', 'Server', 'Server-side logic, APIs, and backend infrastructure', 13, true),
    ('Full Stack Development', 'full-stack-development', 'Layers', 'End-to-end web development across frontend and backend', 14, true),
    ('Mobile App Development', 'mobile-app-development', 'Smartphone', 'Native and cross-platform mobile application development', 15, true),
    ('iOS Development', 'ios-development', 'Apple', 'Swift, Objective-C, and iOS app development for iPhone/iPad', 16, true),
    ('Android Development', 'android-development', 'Smartphone', 'Kotlin, Java, and Android app development', 17, true),
    ('Flutter Development', 'flutter-development', 'Smartphone', 'Cross-platform mobile apps using Flutter and Dart', 18, true),
    ('React Native Development', 'react-native-development', 'Smartphone', 'Cross-platform mobile apps using React Native', 19, true),
    ('Cross Platform Development', 'cross-platform-dev', 'Smartphone', 'Multi-platform development using Xamarin, .NET MAUI, and others', 20, true),
    ('Web Development', 'web-development', 'Globe', 'Website development, landing pages, and web applications', 21, true),
    ('Web Design', 'web-design', 'Palette', 'Website design, wireframing, and visual layout creation', 22, true),
    ('React Development', 'react-development', 'Code', 'React.js component development and single-page applications', 23, true),
    ('Vue.js Development', 'vuejs-development', 'Code', 'Vue.js application development and component architecture', 24, true),
    ('Java Development', 'java-development', 'Code', 'Java application development, Spring Boot, and enterprise solutions', 25, true),
    ('Python Development', 'python-development', 'Code', 'Python scripting, web development with Django/Flask, and automation', 26, true),
    ('SQL Development', 'sql-development', 'Database', 'SQL query optimization, database design, and data modeling', 27, true),
    ('API Development', 'api-development', 'Link2', 'RESTful API, GraphQL, and microservice API development', 28, true),
    ('Software Development', 'software-development', 'Code', 'Custom software development, desktop apps, and enterprise solutions', 29, true),
    ('Software Architecture', 'software-architecture', 'Building2', 'System design, architecture planning, and technical leadership', 30, true),
    ('DevOps Engineering', 'devops-engineering', 'Settings2', 'CI/CD, containerization, cloud infrastructure, and automation', 31, true),
    ('Cloud Computing', 'cloud-computing', 'Cloud', 'AWS, Azure, GCP cloud services, migration, and management', 32, true),
    ('Cybersecurity', 'cybersecurity', 'Shield', 'Security assessment, penetration testing, and vulnerability analysis', 33, true),
    ('Network Administration', 'network-administration', 'Wifi', 'Network setup, configuration, monitoring, and troubleshooting', 34, true),
    ('Database Administration', 'database-administration', 'Database', 'Database management, optimization, backup, and recovery', 35, true),
    ('IT Consulting', 'it-consulting', 'Headphones', 'IT strategy, technology advisory, and digital transformation consulting', 36, true),
    ('Technical Support', 'technical-support', 'Headphones', 'Help desk, IT support, troubleshooting, and system maintenance', 37, true),
    ('Blockchain Development', 'blockchain-development', 'Link2', 'Smart contracts, DApps, and blockchain protocol development', 38, true),
    ('ERP Development', 'erp-development', 'FolderKanban', 'SAP, Oracle, Odoo, and enterprise resource planning solutions', 39, true),
    ('No-Code Development', 'no-code-development', 'Zap', 'Bubble, Webflow, Airtable, and no-code application building', 40, true),
    ('Webflow Development', 'webflow-development', 'Globe', 'Webflow site building, CMS design, and custom interactions', 41, true),
    ('Shopify Development', 'shopify-development', 'ShoppingCart', 'Shopify store development, theme customization, and app integration', 42, true),
    ('WordPress Development', 'wordpress-development', 'Globe', 'WordPress theme development, plugins, and site optimization', 43, true),
    ('Website Maintenance', 'website-maintenance', 'Wrench', 'Website updates, security patches, performance monitoring, and backups', 44, true),
    ('Game Development', 'game-development', 'Gamepad2', 'Unity, Unreal Engine, 2D/3D game development and game design', 45, true),
    ('AR / VR Development', 'ar-vr-development', 'Eye', 'Augmented reality, virtual reality, and mixed reality experiences', 46, true),
    ('Automation Testing', 'automation-testing', 'TestTube', 'Automated test scripts, test frameworks, and QA automation', 47, true),
    ('QA Testing', 'qa-testing', 'TestTube', 'Manual testing, bug tracking, test planning, and quality assurance', 48, true),
    ('Robotic Process Automation', 'rpa-automation', 'Bot', 'UiPath, Automation Anywhere, Blue Prism, and RPA solutions', 49, true),
    ('Design & Creative', 'design-creative', 'Palette', 'UI/UX, graphic design, branding, and creative services', 50, true),
    ('UI Design', 'ui-design', 'Layout', 'User interface design, screen layouts, and visual design systems', 51, true),
    ('UI/UX Design', 'ui-ux-design', 'Layout', 'End-to-end UI/UX design, prototyping, and user-centered design', 52, true),
    ('Mobile App Design', 'mobile-app-design', 'Smartphone', 'Mobile app UI design, app prototypes, and mobile-first design', 53, true),
    ('Product Design', 'product-design', 'Package', 'Product design, industrial design, and physical product development', 54, true),
    ('Graphic Design', 'graphic-design', 'Palette', 'Print design, digital graphics, banners, and visual content', 55, true),
    ('Brand Identity Design', 'brand-identity-design', 'Palette', 'Brand guidelines, logo systems, and complete brand identity creation', 56, true),
    ('Logo Design', 'logo-design', 'Palette', 'Company logos, brand marks, and visual identity design', 57, true),
    ('Illustration', 'illustration', 'Image', 'Custom illustrations, vector art, and digital drawing', 58, true),
    ('Presentation Design', 'presentation-design', 'Monitor', 'PowerPoint, Keynote, and presentation deck design services', 59, true),
    ('Motion Graphics', 'motion-graphics', 'Video', 'Animated graphics, kinetic typography, and visual effects', 60, true),
    ('Video Editing', 'video-editing', 'Video', 'Video post-production, editing, color grading, and compositing', 61, true),
    ('Video & Animation', 'video-animation', 'Video', '2D/3D animation, explainer videos, and animated content creation', 62, true),
    ('Audio Editing', 'audio-editing', 'Music2', 'Audio cleanup, mixing, mastering, and post-production', 63, true),
    ('Music & Audio', 'music-audio', 'Music2', 'Music production, sound design, composition, and audio branding', 64, true),
    ('Voice Over Services', 'voice-over-services', 'Mic', 'Professional voice over, narration, and audio recording services', 65, true),
    ('Photography', 'photography', 'Camera', 'Product photography, portrait, event, and commercial photography', 66, true),
    ('Writing & Translation', 'writing-translation', 'PenTool', 'Content writing, copywriting, translation, and editing services', 67, true),
    ('Content Writing', 'content-writing', 'FileText', 'Blog posts, articles, website content, and SEO writing', 68, true),
    ('Copywriting', 'copywriting', 'PenTool', 'Sales copy, ad copy, email copy, and conversion-focused writing', 69, true),
    ('Technical Writing', 'technical-writing', 'FileText', 'Documentation, user manuals, API docs, and technical guides', 70, true),
    ('Ghostwriting', 'ghostwriting', 'PenTool', 'Books, articles, and content written under another name', 71, true),
    ('Script Writing', 'script-writing', 'FileText', 'Video scripts, screenplays, podcast scripts, and dialogue writing', 72, true),
    ('UX Writing', 'ux-writing', 'FileText', 'Microcopy, user interface text, and content design for digital products', 73, true),
    ('Proofreading', 'proofreading', 'CheckCircle2', 'Grammar correction, spelling checks, and content polish', 74, true),
    ('Translation Services', 'translation-services', 'Languages', 'Document translation, localization, and interpretation services', 75, true),
    ('Resume Writing', 'resume-writing', 'FileText', 'Professional resume, CV writing, and career document services', 76, true),
    ('Writing & Editing', 'writing-editing', 'PenTool', 'General writing, editing, and content refinement services', 77, true),
    ('Digital Marketing', 'digital-marketing', 'Megaphone', 'SEO, social media, email, PPC, and content marketing services', 78, true),
    ('Search Engine Optimization', 'seo', 'Search', 'On-page SEO, off-page SEO, technical SEO, and SEO audits', 79, true),
    ('SEM Management', 'sem-management', 'Search', 'Search engine marketing, paid campaigns, and bid management', 80, true),
    ('Google Ads Management', 'google-ads-management', 'Search', 'Google Ads campaign setup, optimization, and ROI tracking', 81, true),
    ('Meta Ads Management', 'meta-ads-management', 'Search', 'Facebook and Instagram ad campaigns, creative testing, and scaling', 82, true),
    ('PPC Advertising', 'ppc-advertising', 'Search', 'Pay-per-click advertising across platforms and networks', 83, true),
    ('Performance Marketing', 'performance-marketing', 'TrendingUp', 'Data-driven marketing campaigns focused on measurable results', 84, true),
    ('Social Media Marketing', 'social-media-marketing', 'Share2', 'Social media strategy, content creation, and paid social', 85, true),
    ('Social Media Management', 'social-media-management', 'Share2', 'Social media account management, scheduling, and community engagement', 86, true),
    ('Community Management', 'community-management', 'Users', 'Online community building, moderation, and engagement strategies', 87, true),
    ('Influencer Marketing', 'influencer-marketing', 'Share2', 'Influencer partnerships, campaign management, and outreach', 88, true),
    ('Email Marketing', 'email-marketing', 'Mail', 'Email campaigns, newsletter management, and email automation', 89, true),
    ('Content Marketing', 'content-marketing', 'FileText', 'Content strategy, content distribution, and content lifecycle management', 90, true),
    ('Marketing Automation', 'marketing-automation', 'Zap', 'Marketing automation platforms, workflows, and lead nurturing', 91, true),
    ('Lead Generation', 'lead-generation', 'Users', 'B2B/B2C lead generation, prospecting, and list building', 92, true),
    ('Sales & Customer Support', 'sales-customer-support', 'Headphones', 'Sales, customer service, CRM, and support services', 93, true),
    ('Customer Support', 'customer-support', 'Headphones', 'Email support, live chat, phone support, and help desk management', 94, true),
    ('Telecalling', 'telecalling', 'Phone', 'Cold calling, telemarketing, appointment setting, and outbound sales', 95, true),
    ('CRM Management', 'crm-management', 'Users', 'CRM setup, Salesforce, HubSpot, and customer relationship management', 96, true),
    ('Sales Consulting', 'sales-consulting', 'TrendingUp', 'Sales strategy, pipeline management, and sales process optimization', 97, true),
    ('Virtual Assistance', 'virtual-assistance', 'Headphones', 'Administrative support, calendar management, and executive assistance', 98, true),
    ('Finance & Accounting', 'finance-accounting', 'Calculator', 'Bookkeeping, accounting, financial analysis, and tax services', 99, true),
    ('Bookkeeping', 'bookkeeping', 'Calculator', 'Financial record keeping, reconciliations, and ledger management', 100, true),
    ('Financial Analysis', 'financial-analysis', 'LineChart', 'Financial modeling, valuation, risk analysis, and investment research', 101, true),
    ('Financial Planning', 'financial-planning', 'LineChart', 'Financial planning, budgeting, forecasting, and wealth management', 102, true),
    ('Investment Analysis', 'investment-analysis', 'TrendingUp', 'Investment research, portfolio analysis, and market analysis', 103, true),
    ('Payroll Management', 'payroll-management', 'Calculator', 'Payroll processing, tax filing, and employee compensation management', 104, true),
    ('Excel Automation', 'excel-automation', 'Table', 'Excel VBA, macros, spreadsheet automation, and complex formulas', 105, true),
    ('Engineering & Architecture', 'engineering-architecture', 'Building2', 'CAD, mechanical, civil, electrical engineering, and architectural services', 106, true),
    ('CAD Design', 'cad-design', 'Building2', 'AutoCAD, SolidWorks, and 3D CAD modeling and drafting', 107, true),
    ('Engineering Design', 'engineering-design', 'Building2', 'Mechanical, electrical, and civil engineering design and analysis', 108, true),
    ('Mechanical Design', 'mechanical-design', 'Settings2', 'Machine design, product engineering, and mechanical systems', 109, true),
    ('Architecture Design', 'architecture-design', 'Building2', 'Architectural plans, building design, and structural engineering', 110, true),
    ('Interior Design', 'interior-design', 'Palette', 'Interior space planning, decoration, and furniture design', 111, true),
    ('Legal Services', 'legal-services', 'ShieldCheck', 'Contract law, legal research, compliance, and trademark services', 112, true),
    ('Legal Consulting', 'legal-consulting', 'ShieldCheck', 'Legal advice, contract review, and business law consultation', 113, true),
    ('Compliance Consulting', 'compliance-consulting', 'ShieldCheck', 'Regulatory compliance, GDPR, HIPAA, and industry standards', 114, true),
    ('Trademark Registration', 'trademark-registration', 'ShieldCheck', 'Trademark search, filing, and intellectual property protection', 115, true),
    ('HR & Recruitment', 'hr-recruitment', 'Users', 'Talent acquisition, HR consulting, and recruitment services', 116, true),
    ('HR Consulting', 'hr-consulting', 'Users', 'HR strategy, policy development, and organizational design', 117, true),
    ('Recruitment Services', 'recruitment-services', 'Users', 'Executive search, talent sourcing, and candidate screening', 118, true),
    ('Career Coaching', 'career-coaching', 'TrendingUp', 'Career development, interview prep, and professional mentoring', 119, true),
    ('Admin & Operations', 'admin-operations', 'FolderKanban', 'Business administration, operations management, and support', 120, true),
    ('Operations Management', 'operations-management', 'FolderKanban', 'Business operations, process improvement, and workflow optimization', 121, true),
    ('Project Management', 'project-management', 'FolderKanban', 'Project planning, agile/scrum, and project delivery management', 122, true),
    ('Product Management', 'product-management', 'Package', 'Product strategy, roadmapping, and product lifecycle management', 123, true),
    ('Business Analysis', 'business-analysis', 'LineChart', 'Requirements gathering, process mapping, and business needs analysis', 124, true),
    ('Research Assistance', 'research-assistance', 'Search', 'Market research, academic research, and data collection support', 125, true),
    ('Education & Training', 'education-training', 'GraduationCap', 'Online tutoring, course creation, and educational content', 126, true),
    ('Online Tutoring', 'online-tutoring', 'GraduationCap', 'One-on-one tutoring, academic support, and test prep services', 127, true),
    ('Business Consulting', 'business-consulting', 'LineChart', 'Business strategy, management consulting, and growth advisory', 128, true),
    ('Consulting & Strategy', 'consulting-strategy', 'LineChart', 'Strategic planning, market analysis, and business transformation', 129, true),
    ('E-commerce Management', 'ecommerce-management', 'ShoppingCart', 'Online store management, marketplace operations, and product listings', 130, true),
    ('YouTube Management', 'youtube-management', 'Video', 'YouTube channel management, content strategy, and growth optimization', 131, true),
    ('Science & Research', 'science-research', 'FlaskConical', 'Scientific research, lab services, and academic writing', 132, true),
    ('Health & Wellness', 'health-wellness', 'Heart', 'Healthcare, fitness, nutrition, and wellness services', 133, true),
    ('Real Estate', 'real-estate', 'Building2', 'Property management, real estate marketing, and valuation', 134, true),
    ('Supply Chain & Logistics', 'supply-chain-logistics', 'Truck', 'Inventory, procurement, shipping, and warehouse operations', 135, true),
    ('Gaming & eSports', 'gaming-esports', 'Gamepad2', 'Game development, esports management, and gaming content', 136, true),
    ('Sustainability & Green Tech', 'sustainability-green-tech', 'Leaf', 'Environmental consulting, green energy, and ESG reporting', 137, true),
    ('Customer Experience & UX Research', 'customer-experience-ux-research', 'Search', 'User research, usability testing, journey mapping, and service design', 138, true),
    ('User Research', 'user-research', 'Search', 'User interviews, surveys, usability testing, and persona development', 139, true),
    ('Trades & Services', 'trades-services', 'Wrench', 'Electrical, plumbing, carpentry, HVAC, and contracting services', 140, true),
    ('Event Planning', 'event-planning', 'CalendarCheck2', 'Weddings, corporate events, parties, and trade show planning', 141, true),
    ('Travel & Hospitality', 'travel-hospitality', 'Plane', 'Travel planning, hotel management, tour guiding, and culinary', 142, true),
    ('Content Management', 'content-management', 'FileText', 'CMS management, content strategy, and editorial operations', 143, true)
  RETURNING id, name, slug
)
SELECT * FROM inserted_categories;
-- ============================================================
-- SUBCATEGORIES AND SKILLS SEED
-- Generated by scripts/seed-categories.js
-- ============================================================

DO $$
DECLARE
  cat_id uuid;
  sub_id uuid;

BEGIN

  -- development-it → Frontend Development
  SELECT id INTO cat_id FROM categories WHERE slug = 'development-it';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Frontend Development', lower(regexp_replace('Frontend Development', '[^a-zA-Z0-9]+', '-', 'g')), 'Frontend Development services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React.js', 'react-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Next.js', 'next-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'TypeScript', 'typescript');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JavaScript ES6+', 'javascript-es6');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tailwind CSS', 'tailwind-css');

  -- development-it → Backend Development
  SELECT id INTO cat_id FROM categories WHERE slug = 'development-it';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Backend Development', lower(regexp_replace('Backend Development', '[^a-zA-Z0-9]+', '-', 'g')), 'Backend Development services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Node.js', 'node-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Python', 'python');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Java', 'java');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Go', 'go');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Ruby on Rails', 'ruby-on-rails');

  -- development-it → Full Stack Development
  SELECT id INTO cat_id FROM categories WHERE slug = 'development-it';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Full Stack Development', lower(regexp_replace('Full Stack Development', '[^a-zA-Z0-9]+', '-', 'g')), 'Full Stack Development services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MERN Stack', 'mern-stack');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MEAN Stack', 'mean-stack');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Django + React', 'django-react');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'LAMP Stack', 'lamp-stack');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JAMstack', 'jamstack');

  -- development-it → Mobile Development
  SELECT id INTO cat_id FROM categories WHERE slug = 'development-it';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Mobile Development', lower(regexp_replace('Mobile Development', '[^a-zA-Z0-9]+', '-', 'g')), 'Mobile Development services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Native', 'react-native');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Flutter', 'flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Swift', 'swift');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kotlin', 'kotlin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Ionic', 'ionic');

  -- development-it → API Development
  SELECT id INTO cat_id FROM categories WHERE slug = 'development-it';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'API Development', lower(regexp_replace('API Development', '[^a-zA-Z0-9]+', '-', 'g')), 'API Development services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'REST APIs', 'rest-apis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GraphQL', 'graphql');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WebSocket', 'websocket');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'gRPC', 'grpc');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OpenAPI/Swagger', 'openapi-swagger');

  -- ai-machine-learning → Machine Learning Models
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-machine-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Machine Learning Models', lower(regexp_replace('Machine Learning Models', '[^a-zA-Z0-9]+', '-', 'g')), 'Machine Learning Models services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Supervised Learning', 'supervised-learning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Unsupervised Learning', 'unsupervised-learning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Reinforcement Learning', 'reinforcement-learning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Ensemble Methods', 'ensemble-methods');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Anomaly Detection', 'anomaly-detection');

  -- ai-machine-learning → Computer Vision
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-machine-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Computer Vision', lower(regexp_replace('Computer Vision', '[^a-zA-Z0-9]+', '-', 'g')), 'Computer Vision services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OpenCV', 'opencv');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'YOLO', 'yolo');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Image Classification', 'image-classification');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Object Detection', 'object-detection');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Facial Recognition', 'facial-recognition');

  -- ai-machine-learning → NLP
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-machine-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'NLP', lower(regexp_replace('NLP', '[^a-zA-Z0-9]+', '-', 'g')), 'NLP services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'BERT', 'bert');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GPT Models', 'gpt-models');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Text Classification', 'text-classification');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Sentiment Analysis', 'sentiment-analysis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Named Entity Recognition', 'named-entity-recognition');

  -- ai-machine-learning → MLOps
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-machine-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'MLOps', lower(regexp_replace('MLOps', '[^a-zA-Z0-9]+', '-', 'g')), 'MLOps services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MLflow', 'mlflow');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kubeflow', 'kubeflow');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Model Deployment', 'model-deployment');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'A/B Testing ML', 'a-b-testing-ml');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Feature Stores', 'feature-stores');

  -- ai-machine-learning → ML Frameworks
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-machine-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'ML Frameworks', lower(regexp_replace('ML Frameworks', '[^a-zA-Z0-9]+', '-', 'g')), 'ML Frameworks services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'TensorFlow', 'tensorflow');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PyTorch', 'pytorch');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Scikit-learn', 'scikit-learn');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'XGBoost', 'xgboost');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Keras', 'keras');

  -- ai-chatbots → Chatbot Platforms
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-chatbots';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Chatbot Platforms', lower(regexp_replace('Chatbot Platforms', '[^a-zA-Z0-9]+', '-', 'g')), 'Chatbot Platforms services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Dialogflow', 'dialogflow');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Rasa', 'rasa');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Amazon Lex', 'amazon-lex');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Microsoft Bot Framework', 'microsoft-bot-framework');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IBM Watson Assistant', 'ibm-watson-assistant');

  -- ai-chatbots → LLM Integration
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-chatbots';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'LLM Integration', lower(regexp_replace('LLM Integration', '[^a-zA-Z0-9]+', '-', 'g')), 'LLM Integration services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OpenAI API', 'openai-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'LangChain', 'langchain');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'LlamaIndex', 'llamaindex');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hugging Face', 'hugging-face');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Claude API', 'claude-api');

  -- ai-chatbots → Conversational Design
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-chatbots';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Conversational Design', lower(regexp_replace('Conversational Design', '[^a-zA-Z0-9]+', '-', 'g')), 'Conversational Design services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Conversational UI', 'conversational-ui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Intent Mapping', 'intent-mapping');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Dialog Flow Design', 'dialog-flow-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'User Personas', 'user-personas');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Response Templates', 'response-templates');

  -- ai-chatbots → Messaging Platforms
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-chatbots';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Messaging Platforms', lower(regexp_replace('Messaging Platforms', '[^a-zA-Z0-9]+', '-', 'g')), 'Messaging Platforms services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WhatsApp API', 'whatsapp-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Telegram Bot', 'telegram-bot');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Slack Bot', 'slack-bot');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Discord Bot', 'discord-bot');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Messenger Bot', 'messenger-bot');

  -- ai-chatbots → Chatbot Analytics
  SELECT id INTO cat_id FROM categories WHERE slug = 'ai-chatbots';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Chatbot Analytics', lower(regexp_replace('Chatbot Analytics', '[^a-zA-Z0-9]+', '-', 'g')), 'Chatbot Analytics services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bot Performance Metrics', 'bot-performance-metrics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'User Analytics', 'user-analytics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Conversation Logs', 'conversation-logs');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'A/B Testing Bots', 'a-b-testing-bots');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Sentiment Analysis', 'sentiment-analysis');

  -- generative-ai → Text Generation
  SELECT id INTO cat_id FROM categories WHERE slug = 'generative-ai';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Text Generation', lower(regexp_replace('Text Generation', '[^a-zA-Z0-9]+', '-', 'g')), 'Text Generation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GPT-4 Fine-tuning', 'gpt-4-fine-tuning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Prompt Engineering', 'prompt-engineering');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Content Generation', 'content-generation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Story Generation', 'story-generation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Code Generation', 'code-generation');

  -- generative-ai → Image Generation
  SELECT id INTO cat_id FROM categories WHERE slug = 'generative-ai';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Image Generation', lower(regexp_replace('Image Generation', '[^a-zA-Z0-9]+', '-', 'g')), 'Image Generation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Stable Diffusion', 'stable-diffusion');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'DALL-E', 'dall-e');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Midjourney', 'midjourney');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ControlNet', 'controlnet');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Image-to-Image', 'image-to-image');

  -- generative-ai → Audio Generation
  SELECT id INTO cat_id FROM categories WHERE slug = 'generative-ai';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Audio Generation', lower(regexp_replace('Audio Generation', '[^a-zA-Z0-9]+', '-', 'g')), 'Audio Generation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Speech Synthesis', 'speech-synthesis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Voice Cloning', 'voice-cloning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Music Generation', 'music-generation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Text-to-Speech', 'text-to-speech');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Audio Enhancement', 'audio-enhancement');

  -- generative-ai → Video Generation
  SELECT id INTO cat_id FROM categories WHERE slug = 'generative-ai';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Video Generation', lower(regexp_replace('Video Generation', '[^a-zA-Z0-9]+', '-', 'g')), 'Video Generation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Text-to-Video', 'text-to-video');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Video Enhancement', 'video-enhancement');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Deepfake Detection', 'deepfake-detection');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Animation Generation', 'animation-generation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Video Editing AI', 'video-editing-ai');

  -- generative-ai → GenAI Applications
  SELECT id INTO cat_id FROM categories WHERE slug = 'generative-ai';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'GenAI Applications', lower(regexp_replace('GenAI Applications', '[^a-zA-Z0-9]+', '-', 'g')), 'GenAI Applications services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'AI Art Creation', 'ai-art-creation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Design Generation', 'design-generation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, '3D Model Generation', '3d-model-generation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Code Assistants', 'code-assistants');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Augmentation', 'data-augmentation');

  -- deep-learning → Neural Networks
  SELECT id INTO cat_id FROM categories WHERE slug = 'deep-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Neural Networks', lower(regexp_replace('Neural Networks', '[^a-zA-Z0-9]+', '-', 'g')), 'Neural Networks services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CNNs', 'cnns');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'RNNs/LSTMs', 'rnns-lstms');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Transformers', 'transformers');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GANs', 'gans');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Autoencoders', 'autoencoders');

  -- deep-learning → Deep Learning Frameworks
  SELECT id INTO cat_id FROM categories WHERE slug = 'deep-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Deep Learning Frameworks', lower(regexp_replace('Deep Learning Frameworks', '[^a-zA-Z0-9]+', '-', 'g')), 'Deep Learning Frameworks services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PyTorch Deep', 'pytorch-deep');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'TensorFlow Deep', 'tensorflow-deep');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JAX', 'jax');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ONNX', 'onnx');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CUDA', 'cuda');

  -- deep-learning → Model Optimization
  SELECT id INTO cat_id FROM categories WHERE slug = 'deep-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Model Optimization', lower(regexp_replace('Model Optimization', '[^a-zA-Z0-9]+', '-', 'g')), 'Model Optimization services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Model Pruning', 'model-pruning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Quantization', 'quantization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Knowledge Distillation', 'knowledge-distillation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Transfer Learning', 'transfer-learning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hyperparameter Tuning', 'hyperparameter-tuning');

  -- deep-learning → Advanced Architectures
  SELECT id INTO cat_id FROM categories WHERE slug = 'deep-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Advanced Architectures', lower(regexp_replace('Advanced Architectures', '[^a-zA-Z0-9]+', '-', 'g')), 'Advanced Architectures services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Attention Mechanisms', 'attention-mechanisms');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Diffusion Models', 'diffusion-models');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Neural Architecture Search', 'neural-architecture-search');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Self-Supervised Learning', 'self-supervised-learning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Few-Shot Learning', 'few-shot-learning');

  -- deep-learning → Deep Learning Infrastructure
  SELECT id INTO cat_id FROM categories WHERE slug = 'deep-learning';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Deep Learning Infrastructure', lower(regexp_replace('Deep Learning Infrastructure', '[^a-zA-Z0-9]+', '-', 'g')), 'Deep Learning Infrastructure services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GPU Computing', 'gpu-computing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Distributed Training', 'distributed-training');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Horovod', 'horovod');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Ray', 'ray');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Weights & Biases', 'weights-biases');

  -- ml-engineering → ML Pipelines
  SELECT id INTO cat_id FROM categories WHERE slug = 'ml-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'ML Pipelines', lower(regexp_replace('ML Pipelines', '[^a-zA-Z0-9]+', '-', 'g')), 'ML Pipelines services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Pipelines', 'data-pipelines');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Feature Engineering', 'feature-engineering');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Model Training Pipelines', 'model-training-pipelines');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Inference Pipelines', 'inference-pipelines');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Monitoring', 'monitoring');

  -- ml-engineering → Model Deployment
  SELECT id INTO cat_id FROM categories WHERE slug = 'ml-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Model Deployment', lower(regexp_replace('Model Deployment', '[^a-zA-Z0-9]+', '-', 'g')), 'Model Deployment services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Docker ML', 'docker-ml');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kubernetes ML', 'kubernetes-ml');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'AWS SageMaker', 'aws-sagemaker');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Azure ML', 'azure-ml');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GCP AI Platform', 'gcp-ai-platform');

  -- ml-engineering → ML Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'ml-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'ML Testing', lower(regexp_replace('ML Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'ML Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Model Validation', 'model-validation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bias Detection', 'bias-detection');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Drift', 'data-drift');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Concept Drift', 'concept-drift');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Model Explainability', 'model-explainability');

  -- ml-engineering → ML Infrastructure
  SELECT id INTO cat_id FROM categories WHERE slug = 'ml-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'ML Infrastructure', lower(regexp_replace('ML Infrastructure', '[^a-zA-Z0-9]+', '-', 'g')), 'ML Infrastructure services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Feature Stores', 'feature-stores');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Model Registries', 'model-registries');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Experiment Tracking', 'experiment-tracking');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hyperparameter Optimization', 'hyperparameter-optimization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CI/CD for ML', 'ci-cd-for-ml');

  -- ml-engineering → Production ML
  SELECT id INTO cat_id FROM categories WHERE slug = 'ml-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Production ML', lower(regexp_replace('Production ML', '[^a-zA-Z0-9]+', '-', 'g')), 'Production ML services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'A/B Testing ML', 'a-b-testing-ml');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Canary Deployments', 'canary-deployments');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Shadow Mode', 'shadow-mode');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Model Versioning', 'model-versioning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SLA Monitoring', 'sla-monitoring');

  -- data-science → Statistical Analysis
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-science';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Statistical Analysis', lower(regexp_replace('Statistical Analysis', '[^a-zA-Z0-9]+', '-', 'g')), 'Statistical Analysis services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hypothesis Testing', 'hypothesis-testing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Regression Analysis', 'regression-analysis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bayesian Statistics', 'bayesian-statistics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Time Series Analysis', 'time-series-analysis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'A/B Testing', 'a-b-testing');

  -- data-science → Data Visualization
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-science';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Data Visualization', lower(regexp_replace('Data Visualization', '[^a-zA-Z0-9]+', '-', 'g')), 'Data Visualization services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tableau', 'tableau');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Power BI', 'power-bi');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Matplotlib', 'matplotlib');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Seaborn', 'seaborn');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'D3.js', 'd3-js');

  -- data-science → Data Wrangling
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-science';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Data Wrangling', lower(regexp_replace('Data Wrangling', '[^a-zA-Z0-9]+', '-', 'g')), 'Data Wrangling services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Pandas', 'pandas');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'NumPy', 'numpy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Cleaning', 'data-cleaning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Feature Engineering', 'feature-engineering');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Transformation', 'data-transformation');

  -- data-science → Scientific Computing
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-science';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Scientific Computing', lower(regexp_replace('Scientific Computing', '[^a-zA-Z0-9]+', '-', 'g')), 'Scientific Computing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'R Programming', 'r-programming');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MATLAB', 'matlab');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SAS', 'sas');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SPSS', 'spss');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Julia', 'julia');

  -- data-science → Data Storytelling
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-science';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Data Storytelling', lower(regexp_replace('Data Storytelling', '[^a-zA-Z0-9]+', '-', 'g')), 'Data Storytelling services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Dashboard Design', 'dashboard-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Reporting', 'data-reporting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'KPI Tracking', 'kpi-tracking');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Executive Dashboards', 'executive-dashboards');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Presentations', 'data-presentations');

  -- data-analytics → Business Intelligence
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-analytics';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Business Intelligence', lower(regexp_replace('Business Intelligence', '[^a-zA-Z0-9]+', '-', 'g')), 'Business Intelligence services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Power BI DAX', 'power-bi-dax');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tableau Prep', 'tableau-prep');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Looker', 'looker');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Metabase', 'metabase');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'QlikView', 'qlikview');

  -- data-analytics → SQL Analytics
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-analytics';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'SQL Analytics', lower(regexp_replace('SQL Analytics', '[^a-zA-Z0-9]+', '-', 'g')), 'SQL Analytics services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Advanced SQL', 'advanced-sql');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Window Functions', 'window-functions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CTEs', 'ctes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Query Optimization', 'query-optimization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Database Design', 'database-design');

  -- data-analytics → Web Analytics
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-analytics';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Web Analytics', lower(regexp_replace('Web Analytics', '[^a-zA-Z0-9]+', '-', 'g')), 'Web Analytics services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Google Analytics 4', 'google-analytics-4');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mixpanel', 'mixpanel');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Amplitude', 'amplitude');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Heap Analytics', 'heap-analytics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hotjar', 'hotjar');

  -- data-analytics → Product Analytics
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-analytics';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Product Analytics', lower(regexp_replace('Product Analytics', '[^a-zA-Z0-9]+', '-', 'g')), 'Product Analytics services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Funnel Analysis', 'funnel-analysis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cohort Analysis', 'cohort-analysis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Retention Analysis', 'retention-analysis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'User Segmentation', 'user-segmentation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Event Tracking', 'event-tracking');

  -- data-analytics → Reporting
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-analytics';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Reporting', lower(regexp_replace('Reporting', '[^a-zA-Z0-9]+', '-', 'g')), 'Reporting services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Automated Reports', 'automated-reports');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'KPI Dashboards', 'kpi-dashboards');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Executive Summaries', 'executive-summaries');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Warehousing', 'data-warehousing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ETL Pipelines', 'etl-pipelines');

  -- data-engineering → ETL/ELT
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'ETL/ELT', lower(regexp_replace('ETL/ELT', '[^a-zA-Z0-9]+', '-', 'g')), 'ETL/ELT services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Apache Airflow', 'apache-airflow');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'dbt', 'dbt');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Fivetran', 'fivetran');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Stitch', 'stitch');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Informatica', 'informatica');

  -- data-engineering → Data Warehousing
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Data Warehousing', lower(regexp_replace('Data Warehousing', '[^a-zA-Z0-9]+', '-', 'g')), 'Data Warehousing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Snowflake', 'snowflake');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'BigQuery', 'bigquery');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redshift', 'redshift');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Databricks', 'databricks');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ClickHouse', 'clickhouse');

  -- data-engineering → Stream Processing
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Stream Processing', lower(regexp_replace('Stream Processing', '[^a-zA-Z0-9]+', '-', 'g')), 'Stream Processing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Apache Kafka', 'apache-kafka');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Apache Flink', 'apache-flink');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Spark Streaming', 'spark-streaming');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kinesis', 'kinesis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Pub/Sub', 'pub-sub');

  -- data-engineering → Data Lake
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Data Lake', lower(regexp_replace('Data Lake', '[^a-zA-Z0-9]+', '-', 'g')), 'Data Lake services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Apache Spark', 'apache-spark');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'AWS Lake Formation', 'aws-lake-formation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Delta Lake', 'delta-lake');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Apache Iceberg', 'apache-iceberg');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Apache Hudi', 'apache-hudi');

  -- data-engineering → Data Modeling
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Data Modeling', lower(regexp_replace('Data Modeling', '[^a-zA-Z0-9]+', '-', 'g')), 'Data Modeling services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Star Schema', 'star-schema');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Vault', 'data-vault');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Dimensional Modeling', 'dimensional-modeling');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Medallion Architecture', 'medallion-architecture');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Reverse ETL', 'reverse-etl');

  -- data-annotation → Image Annotation
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-annotation';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Image Annotation', lower(regexp_replace('Image Annotation', '[^a-zA-Z0-9]+', '-', 'g')), 'Image Annotation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bounding Boxes', 'bounding-boxes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Semantic Segmentation', 'semantic-segmentation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Keypoint Annotation', 'keypoint-annotation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Polygon Annotation', 'polygon-annotation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, '3D Point Cloud', '3d-point-cloud');

  -- data-annotation → Text Annotation
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-annotation';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Text Annotation', lower(regexp_replace('Text Annotation', '[^a-zA-Z0-9]+', '-', 'g')), 'Text Annotation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Text Classification', 'text-classification');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'NER Labeling', 'ner-labeling');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Sentiment Labels', 'sentiment-labels');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Entity Linking', 'entity-linking');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Relation Extraction', 'relation-extraction');

  -- data-annotation → Audio Annotation
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-annotation';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Audio Annotation', lower(regexp_replace('Audio Annotation', '[^a-zA-Z0-9]+', '-', 'g')), 'Audio Annotation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Speech Transcription', 'speech-transcription');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Speaker Diarization', 'speaker-diarization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Audio Event Detection', 'audio-event-detection');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Emotion Labeling', 'emotion-labeling');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Language ID', 'language-id');

  -- data-annotation → Video Annotation
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-annotation';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Video Annotation', lower(regexp_replace('Video Annotation', '[^a-zA-Z0-9]+', '-', 'g')), 'Video Annotation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Video Tracking', 'video-tracking');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Action Recognition', 'action-recognition');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Frame-by-Frame', 'frame-by-frame');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Object Tracking', 'object-tracking');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Scene Detection', 'scene-detection');

  -- data-annotation → Quality Control
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-annotation';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Quality Control', lower(regexp_replace('Quality Control', '[^a-zA-Z0-9]+', '-', 'g')), 'Quality Control services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Annotation Validation', 'annotation-validation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Inter-annotator Agreement', 'inter-annotator-agreement');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Curation', 'data-curation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Label Consistency', 'label-consistency');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Review Workflows', 'review-workflows');

  -- data-entry → Data Entry Services
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-entry';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Data Entry Services', lower(regexp_replace('Data Entry Services', '[^a-zA-Z0-9]+', '-', 'g')), 'Data Entry Services services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Manual Data Entry', 'manual-data-entry');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Document Digitization', 'document-digitization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Copy-Paste Data', 'copy-paste-data');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Form Filling', 'form-filling');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Web Research', 'web-research');

  -- data-entry → Data Processing
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-entry';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Data Processing', lower(regexp_replace('Data Processing', '[^a-zA-Z0-9]+', '-', 'g')), 'Data Processing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Cleansing', 'data-cleansing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Formatting', 'data-formatting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Migration', 'data-migration');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Excel Data Entry', 'excel-data-entry');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CSV Processing', 'csv-processing');

  -- data-entry → Database Management
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-entry';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Database Management', lower(regexp_replace('Database Management', '[^a-zA-Z0-9]+', '-', 'g')), 'Database Management services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Record Updates', 'record-updates');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Deduplication', 'data-deduplication');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Database Cleanup', 'database-cleanup');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Upload', 'data-upload');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bulk Updates', 'bulk-updates');

  -- data-entry → Document Management
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-entry';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Document Management', lower(regexp_replace('Document Management', '[^a-zA-Z0-9]+', '-', 'g')), 'Document Management services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PDF Conversion', 'pdf-conversion');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OCR Processing', 'ocr-processing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Document Indexing', 'document-indexing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'File Organization', 'file-organization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Scanning', 'scanning');

  -- data-entry → Web Research
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-entry';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Web Research', lower(regexp_replace('Web Research', '[^a-zA-Z0-9]+', '-', 'g')), 'Web Research services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Lead Research', 'lead-research');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Contact Finding', 'contact-finding');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Market Research', 'market-research');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Competitor Analysis', 'competitor-analysis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Collection', 'data-collection');

  -- frontend-development → React Ecosystem
  SELECT id INTO cat_id FROM categories WHERE slug = 'frontend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'React Ecosystem', lower(regexp_replace('React Ecosystem', '[^a-zA-Z0-9]+', '-', 'g')), 'React Ecosystem services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React.js', 'react-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Next.js', 'next-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Gatsby', 'gatsby');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Remix', 'remix');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vite', 'vite');

  -- frontend-development → Vue Ecosystem
  SELECT id INTO cat_id FROM categories WHERE slug = 'frontend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Vue Ecosystem', lower(regexp_replace('Vue Ecosystem', '[^a-zA-Z0-9]+', '-', 'g')), 'Vue Ecosystem services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vue 3', 'vue-3');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Nuxt.js', 'nuxt-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Pinia', 'pinia');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vite Vue', 'vite-vue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Quasar', 'quasar');

  -- frontend-development → Angular Ecosystem
  SELECT id INTO cat_id FROM categories WHERE slug = 'frontend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Angular Ecosystem', lower(regexp_replace('Angular Ecosystem', '[^a-zA-Z0-9]+', '-', 'g')), 'Angular Ecosystem services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Angular 17+', 'angular-17');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'RxJS', 'rxjs');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'NgRx', 'ngrx');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Angular Material', 'angular-material');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PrimeNG', 'primeng');

  -- frontend-development → CSS & Styling
  SELECT id INTO cat_id FROM categories WHERE slug = 'frontend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'CSS & Styling', lower(regexp_replace('CSS & Styling', '[^a-zA-Z0-9]+', '-', 'g')), 'CSS & Styling services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tailwind CSS', 'tailwind-css');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SCSS/SASS', 'scss-sass');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Styled Components', 'styled-components');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CSS Modules', 'css-modules');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Framer Motion', 'framer-motion');

  -- frontend-development → Frontend Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'frontend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Frontend Testing', lower(regexp_replace('Frontend Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'Frontend Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jest', 'jest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Testing Library', 'react-testing-library');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cypress', 'cypress');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Playwright', 'playwright');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vitest', 'vitest');

  -- backend-development → Node.js Backend
  SELECT id INTO cat_id FROM categories WHERE slug = 'backend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Node.js Backend', lower(regexp_replace('Node.js Backend', '[^a-zA-Z0-9]+', '-', 'g')), 'Node.js Backend services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Express.js', 'express-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'NestJS', 'nestjs');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Fastify', 'fastify');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Socket.io', 'socket-io');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Prisma', 'prisma');

  -- backend-development → Python Backend
  SELECT id INTO cat_id FROM categories WHERE slug = 'backend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Python Backend', lower(regexp_replace('Python Backend', '[^a-zA-Z0-9]+', '-', 'g')), 'Python Backend services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Django', 'django');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'FastAPI', 'fastapi');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Flask', 'flask');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SQLAlchemy', 'sqlalchemy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Celery', 'celery');

  -- backend-development → Java Backend
  SELECT id INTO cat_id FROM categories WHERE slug = 'backend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Java Backend', lower(regexp_replace('Java Backend', '[^a-zA-Z0-9]+', '-', 'g')), 'Java Backend services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Spring Boot', 'spring-boot');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Micronaut', 'micronaut');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Quarkus', 'quarkus');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hibernate', 'hibernate');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JPA', 'jpa');

  -- backend-development → Go Backend
  SELECT id INTO cat_id FROM categories WHERE slug = 'backend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Go Backend', lower(regexp_replace('Go Backend', '[^a-zA-Z0-9]+', '-', 'g')), 'Go Backend services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Gin', 'gin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Echo', 'echo');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Fiber', 'fiber');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GORM', 'gorm');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Chi Router', 'chi-router');

  -- backend-development → API Gateways
  SELECT id INTO cat_id FROM categories WHERE slug = 'backend-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'API Gateways', lower(regexp_replace('API Gateways', '[^a-zA-Z0-9]+', '-', 'g')), 'API Gateways services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kong', 'kong');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'NGINX', 'nginx');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Traefik', 'traefik');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Envoy', 'envoy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'API Gateway AWS', 'api-gateway-aws');

  -- full-stack-development → MERN Stack
  SELECT id INTO cat_id FROM categories WHERE slug = 'full-stack-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'MERN Stack', lower(regexp_replace('MERN Stack', '[^a-zA-Z0-9]+', '-', 'g')), 'MERN Stack services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MongoDB', 'mongodb');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Express.js', 'express-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React.js', 'react-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Node.js', 'node-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redux', 'redux');

  -- full-stack-development → JAMstack
  SELECT id INTO cat_id FROM categories WHERE slug = 'full-stack-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'JAMstack', lower(regexp_replace('JAMstack', '[^a-zA-Z0-9]+', '-', 'g')), 'JAMstack services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Next.js', 'next-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vercel', 'vercel');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Sanity CMS', 'sanity-cms');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Stripe', 'stripe');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Auth0', 'auth0');

  -- full-stack-development → LAMP Stack
  SELECT id INTO cat_id FROM categories WHERE slug = 'full-stack-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'LAMP Stack', lower(regexp_replace('LAMP Stack', '[^a-zA-Z0-9]+', '-', 'g')), 'LAMP Stack services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Linux', 'linux');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Apache', 'apache');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MySQL', 'mysql');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PHP', 'php');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WordPress', 'wordpress');

  -- full-stack-development → Python Full Stack
  SELECT id INTO cat_id FROM categories WHERE slug = 'full-stack-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Python Full Stack', lower(regexp_replace('Python Full Stack', '[^a-zA-Z0-9]+', '-', 'g')), 'Python Full Stack services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Django', 'django');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PostgreSQL', 'postgresql');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React', 'react');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Docker', 'docker');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redis', 'redis');

  -- full-stack-development → Serverless Stack
  SELECT id INTO cat_id FROM categories WHERE slug = 'full-stack-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Serverless Stack', lower(regexp_replace('Serverless Stack', '[^a-zA-Z0-9]+', '-', 'g')), 'Serverless Stack services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'AWS Lambda', 'aws-lambda');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vercel Serverless', 'vercel-serverless');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Netlify Functions', 'netlify-functions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Supabase', 'supabase');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PlanetScale', 'planetscale');

  -- mobile-app-development → Native iOS
  SELECT id INTO cat_id FROM categories WHERE slug = 'mobile-app-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Native iOS', lower(regexp_replace('Native iOS', '[^a-zA-Z0-9]+', '-', 'g')), 'Native iOS services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Swift', 'swift');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SwiftUI', 'swiftui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'UIKit', 'uikit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Core Data', 'core-data');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Combine', 'combine');

  -- mobile-app-development → Native Android
  SELECT id INTO cat_id FROM categories WHERE slug = 'mobile-app-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Native Android', lower(regexp_replace('Native Android', '[^a-zA-Z0-9]+', '-', 'g')), 'Native Android services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kotlin', 'kotlin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jetpack Compose', 'jetpack-compose');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Android SDK', 'android-sdk');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Room DB', 'room-db');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Dagger Hilt', 'dagger-hilt');

  -- mobile-app-development → Cross Platform
  SELECT id INTO cat_id FROM categories WHERE slug = 'mobile-app-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Cross Platform', lower(regexp_replace('Cross Platform', '[^a-zA-Z0-9]+', '-', 'g')), 'Cross Platform services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Native', 'react-native');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Flutter', 'flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Xamarin', 'xamarin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, '.NET MAUI', 'net-maui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Capacitor', 'capacitor');

  -- mobile-app-development → Mobile UI/UX
  SELECT id INTO cat_id FROM categories WHERE slug = 'mobile-app-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Mobile UI/UX', lower(regexp_replace('Mobile UI/UX', '[^a-zA-Z0-9]+', '-', 'g')), 'Mobile UI/UX services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mobile Prototyping', 'mobile-prototyping');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'App Design', 'app-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Material Design', 'material-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'HIG iOS', 'hig-ios');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'App Animations', 'app-animations');

  -- mobile-app-development → App Store Deployment
  SELECT id INTO cat_id FROM categories WHERE slug = 'mobile-app-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'App Store Deployment', lower(regexp_replace('App Store Deployment', '[^a-zA-Z0-9]+', '-', 'g')), 'App Store Deployment services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'App Store Connect', 'app-store-connect');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Google Play Console', 'google-play-console');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Code Signing', 'code-signing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'TestFlight', 'testflight');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'In-App Purchases', 'in-app-purchases');

  -- ios-development → iOS Frameworks
  SELECT id INTO cat_id FROM categories WHERE slug = 'ios-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'iOS Frameworks', lower(regexp_replace('iOS Frameworks', '[^a-zA-Z0-9]+', '-', 'g')), 'iOS Frameworks services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SwiftUI', 'swiftui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'UIKit', 'uikit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Core ML', 'core-ml');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ARKit', 'arkit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Metal', 'metal');

  -- ios-development → iOS Architecture
  SELECT id INTO cat_id FROM categories WHERE slug = 'ios-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'iOS Architecture', lower(regexp_replace('iOS Architecture', '[^a-zA-Z0-9]+', '-', 'g')), 'iOS Architecture services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MVVM iOS', 'mvvm-ios');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Combine', 'combine');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Swift Concurrency', 'swift-concurrency');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Core Data', 'core-data');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CloudKit', 'cloudkit');

  -- ios-development → iOS Networking
  SELECT id INTO cat_id FROM categories WHERE slug = 'ios-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'iOS Networking', lower(regexp_replace('iOS Networking', '[^a-zA-Z0-9]+', '-', 'g')), 'iOS Networking services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'URLSession', 'urlsession');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Alamofire', 'alamofire');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GraphQL iOS', 'graphql-ios');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WebSockets', 'websockets');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Push Notifications', 'push-notifications');

  -- ios-development → iOS Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'ios-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'iOS Testing', lower(regexp_replace('iOS Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'iOS Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'XCTest', 'xctest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'XCTestUI', 'xctestui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Quick/Nimble', 'quick-nimble');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Snapshot Testing', 'snapshot-testing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Performance Testing', 'performance-testing');

  -- ios-development → App Store
  SELECT id INTO cat_id FROM categories WHERE slug = 'ios-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'App Store', lower(regexp_replace('App Store', '[^a-zA-Z0-9]+', '-', 'g')), 'App Store services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'App Store Review', 'app-store-review');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'TestFlight', 'testflight');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'App Analytics', 'app-analytics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'In-App Purchases', 'in-app-purchases');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Subscription Management', 'subscription-management');

  -- android-development → Android Frameworks
  SELECT id INTO cat_id FROM categories WHERE slug = 'android-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Android Frameworks', lower(regexp_replace('Android Frameworks', '[^a-zA-Z0-9]+', '-', 'g')), 'Android Frameworks services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jetpack Compose', 'jetpack-compose');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Material 3', 'material-3');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Android Architecture Components', 'android-architecture-components');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Dagger Hilt', 'dagger-hilt');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Room', 'room');

  -- android-development → Android Architecture
  SELECT id INTO cat_id FROM categories WHERE slug = 'android-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Android Architecture', lower(regexp_replace('Android Architecture', '[^a-zA-Z0-9]+', '-', 'g')), 'Android Architecture services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MVVM Android', 'mvvm-android');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Clean Architecture', 'clean-architecture');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MVI', 'mvi');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Use Cases', 'use-cases');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Repository Pattern', 'repository-pattern');

  -- android-development → Android Networking
  SELECT id INTO cat_id FROM categories WHERE slug = 'android-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Android Networking', lower(regexp_replace('Android Networking', '[^a-zA-Z0-9]+', '-', 'g')), 'Android Networking services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Retrofit', 'retrofit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OkHttp', 'okhttp');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GraphQL Android', 'graphql-android');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Firebase', 'firebase');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WebSocket Android', 'websocket-android');

  -- android-development → Android Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'android-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Android Testing', lower(regexp_replace('Android Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'Android Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JUnit', 'junit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Espresso', 'espresso');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MockK', 'mockk');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Compose Testing', 'compose-testing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Robolectric', 'robolectric');

  -- android-development → Google Play
  SELECT id INTO cat_id FROM categories WHERE slug = 'android-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Google Play', lower(regexp_replace('Google Play', '[^a-zA-Z0-9]+', '-', 'g')), 'Google Play services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Play Console', 'play-console');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'App Bundles', 'app-bundles');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'In-App Billing', 'in-app-billing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Play Integrity', 'play-integrity');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Firebase Analytics', 'firebase-analytics');

  -- flutter-development → Flutter UI
  SELECT id INTO cat_id FROM categories WHERE slug = 'flutter-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Flutter UI', lower(regexp_replace('Flutter UI', '[^a-zA-Z0-9]+', '-', 'g')), 'Flutter UI services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Widget Tree', 'widget-tree');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Custom Painters', 'custom-painters');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Animations', 'animations');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Responsive UI', 'responsive-ui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Material Flutter', 'material-flutter');

  -- flutter-development → Flutter State
  SELECT id INTO cat_id FROM categories WHERE slug = 'flutter-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Flutter State', lower(regexp_replace('Flutter State', '[^a-zA-Z0-9]+', '-', 'g')), 'Flutter State services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Riverpod', 'riverpod');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bloc', 'bloc');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Provider', 'provider');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GetX', 'getx');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redux Flutter', 'redux-flutter');

  -- flutter-development → Flutter Backend
  SELECT id INTO cat_id FROM categories WHERE slug = 'flutter-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Flutter Backend', lower(regexp_replace('Flutter Backend', '[^a-zA-Z0-9]+', '-', 'g')), 'Flutter Backend services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Firebase Flutter', 'firebase-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Supabase Flutter', 'supabase-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GraphQL Flutter', 'graphql-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'REST Flutter', 'rest-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WebSocket Flutter', 'websocket-flutter');

  -- flutter-development → Flutter Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'flutter-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Flutter Testing', lower(regexp_replace('Flutter Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'Flutter Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Flutter Test', 'flutter-test');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Integration Test', 'integration-test');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Widget Test', 'widget-test');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mockito Flutter', 'mockito-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Golden Tests', 'golden-tests');

  -- flutter-development → Flutter Platforms
  SELECT id INTO cat_id FROM categories WHERE slug = 'flutter-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Flutter Platforms', lower(regexp_replace('Flutter Platforms', '[^a-zA-Z0-9]+', '-', 'g')), 'Flutter Platforms services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'iOS Flutter', 'ios-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Android Flutter', 'android-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Web Flutter', 'web-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Desktop Flutter', 'desktop-flutter');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Flutter Packages', 'flutter-packages');

  -- react-native-development → RN Core
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-native-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'RN Core', lower(regexp_replace('RN Core', '[^a-zA-Z0-9]+', '-', 'g')), 'RN Core services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Navigation', 'react-navigation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Expo', 'expo');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Native Modules', 'native-modules');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hermes', 'hermes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Native Reanimated', 'react-native-reanimated');

  -- react-native-development → RN State Management
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-native-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'RN State Management', lower(regexp_replace('RN State Management', '[^a-zA-Z0-9]+', '-', 'g')), 'RN State Management services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redux Toolkit', 'redux-toolkit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Zustand', 'zustand');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MobX', 'mobx');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jotai', 'jotai');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Query', 'react-query');

  -- react-native-development → RN UI
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-native-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'RN UI', lower(regexp_replace('RN UI', '[^a-zA-Z0-9]+', '-', 'g')), 'RN UI services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Styled Components RN', 'styled-components-rn');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'NativeWind', 'nativewind');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Native Paper', 'react-native-paper');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Restyle', 'restyle');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Shopify Restyle', 'shopify-restyle');

  -- react-native-development → RN Backend
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-native-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'RN Backend', lower(regexp_replace('RN Backend', '[^a-zA-Z0-9]+', '-', 'g')), 'RN Backend services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Firebase RN', 'firebase-rn');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Supabase RN', 'supabase-rn');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GraphQL RN', 'graphql-rn');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'AsyncStorage', 'asyncstorage');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SQLite RN', 'sqlite-rn');

  -- react-native-development → RN Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-native-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'RN Testing', lower(regexp_replace('RN Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'RN Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Native Testing Library', 'react-native-testing-library');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Detox', 'detox');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jest RN', 'jest-rn');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Maestro', 'maestro');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Appium', 'appium');

  -- cross-platform-dev → .NET MAUI
  SELECT id INTO cat_id FROM categories WHERE slug = 'cross-platform-dev';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, '.NET MAUI', lower(regexp_replace('.NET MAUI', '[^a-zA-Z0-9]+', '-', 'g')), '.NET MAUI services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'C# MAUI', 'c-maui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'XAML', 'xaml');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MVVM MAUI', 'mvvm-maui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Shell Navigation', 'shell-navigation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MAUI Graphics', 'maui-graphics');

  -- cross-platform-dev → Xamarin
  SELECT id INTO cat_id FROM categories WHERE slug = 'cross-platform-dev';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Xamarin', lower(regexp_replace('Xamarin', '[^a-zA-Z0-9]+', '-', 'g')), 'Xamarin services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Xamarin Forms', 'xamarin-forms');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Xamarin Native', 'xamarin-native');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'iOS Xamarin', 'ios-xamarin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Android Xamarin', 'android-xamarin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Prism', 'prism');

  -- cross-platform-dev → Electron
  SELECT id INTO cat_id FROM categories WHERE slug = 'cross-platform-dev';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Electron', lower(regexp_replace('Electron', '[^a-zA-Z0-9]+', '-', 'g')), 'Electron services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Electron.js', 'electron-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IPC Main/Process', 'ipc-main-process');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Electron Security', 'electron-security');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Auto Updates', 'auto-updates');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Electron Builder', 'electron-builder');

  -- cross-platform-dev → Tauri
  SELECT id INTO cat_id FROM categories WHERE slug = 'cross-platform-dev';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Tauri', lower(regexp_replace('Tauri', '[^a-zA-Z0-9]+', '-', 'g')), 'Tauri services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tauri Rust', 'tauri-rust');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tauri Commands', 'tauri-commands');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tauri Security', 'tauri-security');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tauri Plugins', 'tauri-plugins');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tauri Bundler', 'tauri-bundler');

  -- cross-platform-dev → Progressive Web Apps
  SELECT id INTO cat_id FROM categories WHERE slug = 'cross-platform-dev';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Progressive Web Apps', lower(regexp_replace('Progressive Web Apps', '[^a-zA-Z0-9]+', '-', 'g')), 'Progressive Web Apps services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Service Workers', 'service-workers');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Web App Manifest', 'web-app-manifest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Offline First', 'offline-first');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Push Web', 'push-web');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PWA Caching', 'pwa-caching');

  -- web-development → Static Sites
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Static Sites', lower(regexp_replace('Static Sites', '[^a-zA-Z0-9]+', '-', 'g')), 'Static Sites services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'HTML/CSS', 'html-css');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JavaScript Vanilla', 'javascript-vanilla');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Static Generators', 'static-generators');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hugo', 'hugo');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jekyll', 'jekyll');

  -- web-development → Web Performance
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Web Performance', lower(regexp_replace('Web Performance', '[^a-zA-Z0-9]+', '-', 'g')), 'Web Performance services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Lighthouse', 'lighthouse');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Core Web Vitals', 'core-web-vitals');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Image Optimization', 'image-optimization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Code Splitting', 'code-splitting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CDN Configuration', 'cdn-configuration');

  -- web-development → Web Security
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Web Security', lower(regexp_replace('Web Security', '[^a-zA-Z0-9]+', '-', 'g')), 'Web Security services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'HTTPS/SSL', 'https-ssl');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CSP Headers', 'csp-headers');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'XSS Prevention', 'xss-prevention');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CSRF Protection', 'csrf-protection');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OAuth Integration', 'oauth-integration');

  -- web-development → Web Hosting
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Web Hosting', lower(regexp_replace('Web Hosting', '[^a-zA-Z0-9]+', '-', 'g')), 'Web Hosting services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vercel Deploy', 'vercel-deploy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Netlify Deploy', 'netlify-deploy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'AWS S3/CloudFront', 'aws-s3-cloudfront');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Firebase Hosting', 'firebase-hosting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'cPanel', 'cpanel');

  -- web-development → Web Accessibility
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Web Accessibility', lower(regexp_replace('Web Accessibility', '[^a-zA-Z0-9]+', '-', 'g')), 'Web Accessibility services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WCAG 2.2', 'wcag-2-2');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ARIA Attributes', 'aria-attributes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Screen Reader', 'screen-reader');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Keyboard Navigation', 'keyboard-navigation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Color Contrast', 'color-contrast');

  -- web-design → Website Design
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-design';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Website Design', lower(regexp_replace('Website Design', '[^a-zA-Z0-9]+', '-', 'g')), 'Website Design services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Landing Pages', 'landing-pages');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Corporate Websites', 'corporate-websites');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'E-commerce Design', 'e-commerce-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Portfolio Sites', 'portfolio-sites');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Blog Design', 'blog-design');

  -- web-design → Wireframing
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-design';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Wireframing', lower(regexp_replace('Wireframing', '[^a-zA-Z0-9]+', '-', 'g')), 'Wireframing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Figma Wireframes', 'figma-wireframes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Balsamiq', 'balsamiq');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Sketch Wireframes', 'sketch-wireframes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Adobe XD', 'adobe-xd');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Low-Fi Prototypes', 'low-fi-prototypes');

  -- web-design → UI Prototyping
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-design';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'UI Prototyping', lower(regexp_replace('UI Prototyping', '[^a-zA-Z0-9]+', '-', 'g')), 'UI Prototyping services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Figma Prototypes', 'figma-prototypes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Interactive Mockups', 'interactive-mockups');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Clickable Protos', 'clickable-protos');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'InVision', 'invision');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Principle', 'principle');

  -- web-design → Design Systems
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-design';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Design Systems', lower(regexp_replace('Design Systems', '[^a-zA-Z0-9]+', '-', 'g')), 'Design Systems services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Component Libraries', 'component-libraries');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Style Guides', 'style-guides');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Design Tokens', 'design-tokens');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Figma Components', 'figma-components');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Storybook', 'storybook');

  -- web-design → Responsive Design
  SELECT id INTO cat_id FROM categories WHERE slug = 'web-design';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Responsive Design', lower(regexp_replace('Responsive Design', '[^a-zA-Z0-9]+', '-', 'g')), 'Responsive Design services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mobile-First CSS', 'mobile-first-css');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Breakpoint Planning', 'breakpoint-planning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Fluid Layouts', 'fluid-layouts');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Media Queries', 'media-queries');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cross-Browser', 'cross-browser');

  -- react-development → React Core
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'React Core', lower(regexp_replace('React Core', '[^a-zA-Z0-9]+', '-', 'g')), 'React Core services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hooks API', 'hooks-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Context API', 'context-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Router', 'react-router');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Suspense', 'suspense');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Server Components', 'react-server-components');

  -- react-development → React State
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'React State', lower(regexp_replace('React State', '[^a-zA-Z0-9]+', '-', 'g')), 'React State services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redux Toolkit', 'redux-toolkit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Zustand', 'zustand');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jotai', 'jotai');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Recoil', 'recoil');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Query', 'react-query');

  -- react-development → React Performance
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'React Performance', lower(regexp_replace('React Performance', '[^a-zA-Z0-9]+', '-', 'g')), 'React Performance services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Code Splitting', 'code-splitting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React.memo', 'react-memo');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'useMemo/useCallback', 'usememo-usecallback');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Virtual List', 'virtual-list');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Lazy Loading', 'lazy-loading');

  -- react-development → React Ecosystem
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'React Ecosystem', lower(regexp_replace('React Ecosystem', '[^a-zA-Z0-9]+', '-', 'g')), 'React Ecosystem services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Next.js', 'next-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Gatsby', 'gatsby');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Remix', 'remix');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vite React', 'vite-react');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CRA', 'cra');

  -- react-development → React Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'react-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'React Testing', lower(regexp_replace('React Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'React Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'React Testing Library', 'react-testing-library');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cypress React', 'cypress-react');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Storybook Tests', 'storybook-tests');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Playwright React', 'playwright-react');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MSW', 'msw');

  -- vuejs-development → Vue Core
  SELECT id INTO cat_id FROM categories WHERE slug = 'vuejs-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Vue Core', lower(regexp_replace('Vue Core', '[^a-zA-Z0-9]+', '-', 'g')), 'Vue Core services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Composition API', 'composition-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vue Router', 'vue-router');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Pinia', 'pinia');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vuex', 'vuex');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Script Setup', 'script-setup');

  -- vuejs-development → Vue Ecosystem
  SELECT id INTO cat_id FROM categories WHERE slug = 'vuejs-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Vue Ecosystem', lower(regexp_replace('Vue Ecosystem', '[^a-zA-Z0-9]+', '-', 'g')), 'Vue Ecosystem services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Nuxt 3', 'nuxt-3');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vite Vue', 'vite-vue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vuetify', 'vuetify');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PrimeVue', 'primevue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Quasar Vue', 'quasar-vue');

  -- vuejs-development → Vue UI
  SELECT id INTO cat_id FROM categories WHERE slug = 'vuejs-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Vue UI', lower(regexp_replace('Vue UI', '[^a-zA-Z0-9]+', '-', 'g')), 'Vue UI services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tailwind Vue', 'tailwind-vue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SCSS Vue', 'scss-vue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vue Transitions', 'vue-transitions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Form Validation', 'form-validation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vue i18n', 'vue-i18n');

  -- vuejs-development → Vue Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'vuejs-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Vue Testing', lower(regexp_replace('Vue Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'Vue Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vue Test Utils', 'vue-test-utils');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vitest Vue', 'vitest-vue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cypress Vue', 'cypress-vue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Playwright Vue', 'playwright-vue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Testing Library Vue', 'testing-library-vue');

  -- vuejs-development → Vue Advanced
  SELECT id INTO cat_id FROM categories WHERE slug = 'vuejs-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Vue Advanced', lower(regexp_replace('Vue Advanced', '[^a-zA-Z0-9]+', '-', 'g')), 'Vue Advanced services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Custom Directives', 'custom-directives');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Render Functions', 'render-functions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Provide/Inject', 'provide-inject');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Teleport Vue', 'teleport-vue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Suspense Vue', 'suspense-vue');

  -- java-development → Java Core
  SELECT id INTO cat_id FROM categories WHERE slug = 'java-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Java Core', lower(regexp_replace('Java Core', '[^a-zA-Z0-9]+', '-', 'g')), 'Java Core services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Java 21+', 'java-21');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Streams API', 'streams-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Concurrency', 'concurrency');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Records/Sealed', 'records-sealed');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JVM Optimization', 'jvm-optimization');

  -- java-development → Spring Ecosystem
  SELECT id INTO cat_id FROM categories WHERE slug = 'java-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Spring Ecosystem', lower(regexp_replace('Spring Ecosystem', '[^a-zA-Z0-9]+', '-', 'g')), 'Spring Ecosystem services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Spring Boot 3', 'spring-boot-3');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Spring Data JPA', 'spring-data-jpa');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Spring Security', 'spring-security');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Spring Cloud', 'spring-cloud');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Spring WebFlux', 'spring-webflux');

  -- java-development → Java Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'java-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Java Testing', lower(regexp_replace('Java Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'Java Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JUnit 5', 'junit-5');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mockito', 'mockito');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Integration Tests', 'integration-tests');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'TestContainers', 'testcontainers');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ArchUnit', 'archunit');

  -- java-development → Java Build Tools
  SELECT id INTO cat_id FROM categories WHERE slug = 'java-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Java Build Tools', lower(regexp_replace('Java Build Tools', '[^a-zA-Z0-9]+', '-', 'g')), 'Java Build Tools services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Maven', 'maven');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Gradle', 'gradle');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Multi-module', 'multi-module');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Dependency Management', 'dependency-management');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Build Automation', 'build-automation');

  -- java-development → Java Enterprise
  SELECT id INTO cat_id FROM categories WHERE slug = 'java-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Java Enterprise', lower(regexp_replace('Java Enterprise', '[^a-zA-Z0-9]+', '-', 'g')), 'Java Enterprise services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jakarta EE', 'jakarta-ee');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MicroProfile', 'microprofile');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WildFly', 'wildfly');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Oracle DB', 'oracle-db');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JMS', 'jms');

  -- python-development → Python Core
  SELECT id INTO cat_id FROM categories WHERE slug = 'python-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Python Core', lower(regexp_replace('Python Core', '[^a-zA-Z0-9]+', '-', 'g')), 'Python Core services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Python 3.12+', 'python-3-12');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Async/Await', 'async-await');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Type Hints', 'type-hints');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Decorators', 'decorators');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Generators', 'generators');

  -- python-development → Web Frameworks
  SELECT id INTO cat_id FROM categories WHERE slug = 'python-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Web Frameworks', lower(regexp_replace('Web Frameworks', '[^a-zA-Z0-9]+', '-', 'g')), 'Web Frameworks services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Django', 'django');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'FastAPI', 'fastapi');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Flask', 'flask');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Sanic', 'sanic');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tornado', 'tornado');

  -- python-development → Python Data
  SELECT id INTO cat_id FROM categories WHERE slug = 'python-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Python Data', lower(regexp_replace('Python Data', '[^a-zA-Z0-9]+', '-', 'g')), 'Python Data services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Pandas', 'pandas');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'NumPy', 'numpy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Matplotlib', 'matplotlib');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SciPy', 'scipy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jupyter', 'jupyter');

  -- python-development → Python Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'python-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Python Testing', lower(regexp_replace('Python Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'Python Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'pytest', 'pytest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'unittest', 'unittest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mock', 'mock');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hypothesis', 'hypothesis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tox', 'tox');

  -- python-development → Python DevOps
  SELECT id INTO cat_id FROM categories WHERE slug = 'python-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Python DevOps', lower(regexp_replace('Python DevOps', '[^a-zA-Z0-9]+', '-', 'g')), 'Python DevOps services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Poetry', 'poetry');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Docker Python', 'docker-python');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Celery', 'celery');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redis Python', 'redis-python');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SQLAlchemy', 'sqlalchemy');

  -- sql-development → SQL Querying
  SELECT id INTO cat_id FROM categories WHERE slug = 'sql-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'SQL Querying', lower(regexp_replace('SQL Querying', '[^a-zA-Z0-9]+', '-', 'g')), 'SQL Querying services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SELECT Queries', 'select-queries');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Joins', 'joins');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Subqueries', 'subqueries');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Window Functions', 'window-functions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CTEs', 'ctes');

  -- sql-development → SQL Optimization
  SELECT id INTO cat_id FROM categories WHERE slug = 'sql-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'SQL Optimization', lower(regexp_replace('SQL Optimization', '[^a-zA-Z0-9]+', '-', 'g')), 'SQL Optimization services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Query Plans', 'query-plans');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Index Tuning', 'index-tuning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Partitioning', 'partitioning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Query Caching', 'query-caching');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Materialized Views', 'materialized-views');

  -- sql-development → SQL Databases
  SELECT id INTO cat_id FROM categories WHERE slug = 'sql-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'SQL Databases', lower(regexp_replace('SQL Databases', '[^a-zA-Z0-9]+', '-', 'g')), 'SQL Databases services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PostgreSQL', 'postgresql');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MySQL', 'mysql');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SQL Server', 'sql-server');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SQLite', 'sqlite');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Oracle SQL', 'oracle-sql');

  -- sql-development → Database Design
  SELECT id INTO cat_id FROM categories WHERE slug = 'sql-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Database Design', lower(regexp_replace('Database Design', '[^a-zA-Z0-9]+', '-', 'g')), 'Database Design services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Normalization', 'normalization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ER Diagrams', 'er-diagrams');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Schema Design', 'schema-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Constraints', 'constraints');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Triggers', 'triggers');

  -- sql-development → Advanced SQL
  SELECT id INTO cat_id FROM categories WHERE slug = 'sql-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Advanced SQL', lower(regexp_replace('Advanced SQL', '[^a-zA-Z0-9]+', '-', 'g')), 'Advanced SQL services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Stored Procedures', 'stored-procedures');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PL/pgSQL', 'pl-pgsql');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Functions', 'functions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JSON/JSONB', 'json-jsonb');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Full-Text Search', 'full-text-search');

  -- api-development → REST APIs
  SELECT id INTO cat_id FROM categories WHERE slug = 'api-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'REST APIs', lower(regexp_replace('REST APIs', '[^a-zA-Z0-9]+', '-', 'g')), 'REST APIs services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'RESTful Design', 'restful-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OpenAPI/Swagger', 'openapi-swagger');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Versioning', 'versioning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'HATEOAS', 'hateoas');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Rate Limiting', 'rate-limiting');

  -- api-development → GraphQL
  SELECT id INTO cat_id FROM categories WHERE slug = 'api-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'GraphQL', lower(regexp_replace('GraphQL', '[^a-zA-Z0-9]+', '-', 'g')), 'GraphQL services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Apollo Server', 'apollo-server');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GraphQL Schema', 'graphql-schema');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Resolvers', 'resolvers');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Subscriptions', 'subscriptions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Federation', 'federation');

  -- api-development → API Security
  SELECT id INTO cat_id FROM categories WHERE slug = 'api-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'API Security', lower(regexp_replace('API Security', '[^a-zA-Z0-9]+', '-', 'g')), 'API Security services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'JWT Auth', 'jwt-auth');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OAuth 2.0', 'oauth-2-0');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'API Keys', 'api-keys');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SSL/TLS', 'ssl-tls');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Input Validation', 'input-validation');

  -- api-development → API Documentation
  SELECT id INTO cat_id FROM categories WHERE slug = 'api-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'API Documentation', lower(regexp_replace('API Documentation', '[^a-zA-Z0-9]+', '-', 'g')), 'API Documentation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Swagger UI', 'swagger-ui');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Postman Collections', 'postman-collections');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ReadMe', 'readme');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redoc', 'redoc');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'API Blueprint', 'api-blueprint');

  -- api-development → API Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'api-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'API Testing', lower(regexp_replace('API Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'API Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Postman Tests', 'postman-tests');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Newman', 'newman');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jest API', 'jest-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Supertest', 'supertest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Load Testing APIs', 'load-testing-apis');

  -- software-development → Desktop Apps
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Desktop Apps', lower(regexp_replace('Desktop Apps', '[^a-zA-Z0-9]+', '-', 'g')), 'Desktop Apps services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Electron Desktop', 'electron-desktop');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tauri Desktop', 'tauri-desktop');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WPF/.NET', 'wpf-net');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Qt/C++', 'qt-c');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Java Swing', 'java-swing');

  -- software-development → Microservices
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Microservices', lower(regexp_replace('Microservices', '[^a-zA-Z0-9]+', '-', 'g')), 'Microservices services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Docker', 'docker');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kubernetes', 'kubernetes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Service Mesh', 'service-mesh');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Event-Driven', 'event-driven');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CQRS', 'cqrs');

  -- software-development → Design Patterns
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Design Patterns', lower(regexp_replace('Design Patterns', '[^a-zA-Z0-9]+', '-', 'g')), 'Design Patterns services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SOLID Principles', 'solid-principles');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Gang of Four', 'gang-of-four');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Repository Pattern', 'repository-pattern');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Factory Pattern', 'factory-pattern');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Observer Pattern', 'observer-pattern');

  -- software-development → Version Control
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Version Control', lower(regexp_replace('Version Control', '[^a-zA-Z0-9]+', '-', 'g')), 'Version Control services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Git Advanced', 'git-advanced');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GitHub Flow', 'github-flow');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GitLab CI', 'gitlab-ci');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Monorepo', 'monorepo');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Git Hooks', 'git-hooks');

  -- software-development → Code Quality
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Code Quality', lower(regexp_replace('Code Quality', '[^a-zA-Z0-9]+', '-', 'g')), 'Code Quality services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Code Review', 'code-review');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Static Analysis', 'static-analysis');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SonarQube', 'sonarqube');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ESLint/Prettier', 'eslint-prettier');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tech Debt Management', 'tech-debt-management');

  -- software-architecture → Architecture Patterns
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-architecture';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Architecture Patterns', lower(regexp_replace('Architecture Patterns', '[^a-zA-Z0-9]+', '-', 'g')), 'Architecture Patterns services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Microservices', 'microservices');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Event-Driven', 'event-driven');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Layered Architecture', 'layered-architecture');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hexagonal Architecture', 'hexagonal-architecture');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Clean Architecture', 'clean-architecture');

  -- software-architecture → System Design
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-architecture';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'System Design', lower(regexp_replace('System Design', '[^a-zA-Z0-9]+', '-', 'g')), 'System Design services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Scalability', 'scalability');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'High Availability', 'high-availability');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Disaster Recovery', 'disaster-recovery');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Capacity Planning', 'capacity-planning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Load Balancing', 'load-balancing');

  -- software-architecture → Architecture Documentation
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-architecture';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Architecture Documentation', lower(regexp_replace('Architecture Documentation', '[^a-zA-Z0-9]+', '-', 'g')), 'Architecture Documentation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'C4 Model', 'c4-model');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'UML Diagrams', 'uml-diagrams');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ADR Logs', 'adr-logs');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Architecture Reviews', 'architecture-reviews');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tech Radar', 'tech-radar');

  -- software-architecture → Performance Architecture
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-architecture';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Performance Architecture', lower(regexp_replace('Performance Architecture', '[^a-zA-Z0-9]+', '-', 'g')), 'Performance Architecture services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Caching Strategies', 'caching-strategies');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Database Sharding', 'database-sharding');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CDN Strategy', 'cdn-strategy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Async Processing', 'async-processing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Connection Pooling', 'connection-pooling');

  -- software-architecture → Cloud Architecture
  SELECT id INTO cat_id FROM categories WHERE slug = 'software-architecture';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Cloud Architecture', lower(regexp_replace('Cloud Architecture', '[^a-zA-Z0-9]+', '-', 'g')), 'Cloud Architecture services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'AWS Well-Architected', 'aws-well-architected');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Azure CAF', 'azure-caf');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GCP Architecture', 'gcp-architecture');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Multi-Cloud', 'multi-cloud');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hybrid Cloud', 'hybrid-cloud');

  -- devops-engineering → CI/CD
  SELECT id INTO cat_id FROM categories WHERE slug = 'devops-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'CI/CD', lower(regexp_replace('CI/CD', '[^a-zA-Z0-9]+', '-', 'g')), 'CI/CD services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GitHub Actions', 'github-actions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GitLab CI/CD', 'gitlab-ci-cd');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jenkins', 'jenkins');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CircleCI', 'circleci');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ArgoCD', 'argocd');

  -- devops-engineering → Containerization
  SELECT id INTO cat_id FROM categories WHERE slug = 'devops-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Containerization', lower(regexp_replace('Containerization', '[^a-zA-Z0-9]+', '-', 'g')), 'Containerization services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Docker', 'docker');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kubernetes', 'kubernetes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Helm Charts', 'helm-charts');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Docker Compose', 'docker-compose');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Podman', 'podman');

  -- devops-engineering → Infrastructure as Code
  SELECT id INTO cat_id FROM categories WHERE slug = 'devops-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Infrastructure as Code', lower(regexp_replace('Infrastructure as Code', '[^a-zA-Z0-9]+', '-', 'g')), 'Infrastructure as Code services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Terraform', 'terraform');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Pulumi', 'pulumi');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Ansible', 'ansible');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CloudFormation', 'cloudformation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CDK', 'cdk');

  -- devops-engineering → Monitoring
  SELECT id INTO cat_id FROM categories WHERE slug = 'devops-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Monitoring', lower(regexp_replace('Monitoring', '[^a-zA-Z0-9]+', '-', 'g')), 'Monitoring services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Prometheus', 'prometheus');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Grafana', 'grafana');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Datadog', 'datadog');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'New Relic', 'new-relic');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ELK Stack', 'elk-stack');

  -- devops-engineering → GitOps
  SELECT id INTO cat_id FROM categories WHERE slug = 'devops-engineering';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'GitOps', lower(regexp_replace('GitOps', '[^a-zA-Z0-9]+', '-', 'g')), 'GitOps services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ArgoCD GitOps', 'argocd-gitops');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Flux CD', 'flux-cd');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GitHub/GitLab CI', 'github-gitlab-ci');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Kustomize', 'kustomize');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SRE Principles', 'sre-principles');

  -- cloud-computing → AWS Services
  SELECT id INTO cat_id FROM categories WHERE slug = 'cloud-computing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'AWS Services', lower(regexp_replace('AWS Services', '[^a-zA-Z0-9]+', '-', 'g')), 'AWS Services services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'EC2', 'ec2');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Lambda', 'lambda');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'S3', 's3');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'RDS', 'rds');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ECS/EKS', 'ecs-eks');

  -- cloud-computing → Azure Services
  SELECT id INTO cat_id FROM categories WHERE slug = 'cloud-computing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Azure Services', lower(regexp_replace('Azure Services', '[^a-zA-Z0-9]+', '-', 'g')), 'Azure Services services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Azure Functions', 'azure-functions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'AKS', 'aks');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Azure SQL', 'azure-sql');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Blob Storage', 'blob-storage');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Azure DevOps', 'azure-devops');

  -- cloud-computing → GCP Services
  SELECT id INTO cat_id FROM categories WHERE slug = 'cloud-computing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'GCP Services', lower(regexp_replace('GCP Services', '[^a-zA-Z0-9]+', '-', 'g')), 'GCP Services services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cloud Run', 'cloud-run');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GKE', 'gke');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'BigQuery', 'bigquery');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cloud Storage', 'cloud-storage');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cloud Functions', 'cloud-functions');

  -- cloud-computing → Cloud Migration
  SELECT id INTO cat_id FROM categories WHERE slug = 'cloud-computing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Cloud Migration', lower(regexp_replace('Cloud Migration', '[^a-zA-Z0-9]+', '-', 'g')), 'Cloud Migration services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Lift and Shift', 'lift-and-shift');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Re-platforming', 're-platforming');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cloud Native', 'cloud-native');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hybrid Cloud', 'hybrid-cloud');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Multi-Cloud Strategy', 'multi-cloud-strategy');

  -- cloud-computing → Cloud Security
  SELECT id INTO cat_id FROM categories WHERE slug = 'cloud-computing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Cloud Security', lower(regexp_replace('Cloud Security', '[^a-zA-Z0-9]+', '-', 'g')), 'Cloud Security services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IAM Policies', 'iam-policies');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Security Groups', 'security-groups');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Encryption at Rest', 'encryption-at-rest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Secrets Management', 'secrets-management');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cloud Compliance', 'cloud-compliance');

  -- cybersecurity → Penetration Testing
  SELECT id INTO cat_id FROM categories WHERE slug = 'cybersecurity';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Penetration Testing', lower(regexp_replace('Penetration Testing', '[^a-zA-Z0-9]+', '-', 'g')), 'Penetration Testing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Network Pentest', 'network-pentest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Web App Pentest', 'web-app-pentest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mobile Pentest', 'mobile-pentest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cloud Pentest', 'cloud-pentest');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Social Engineering', 'social-engineering');

  -- cybersecurity → Vulnerability Assessment
  SELECT id INTO cat_id FROM categories WHERE slug = 'cybersecurity';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Vulnerability Assessment', lower(regexp_replace('Vulnerability Assessment', '[^a-zA-Z0-9]+', '-', 'g')), 'Vulnerability Assessment services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Nessus', 'nessus');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OpenVAS', 'openvas');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Qualys', 'qualys');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'NMAP', 'nmap');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Burp Suite', 'burp-suite');

  -- cybersecurity → Security Operations
  SELECT id INTO cat_id FROM categories WHERE slug = 'cybersecurity';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Security Operations', lower(regexp_replace('Security Operations', '[^a-zA-Z0-9]+', '-', 'g')), 'Security Operations services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SIEM', 'siem');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SOC', 'soc');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Incident Response', 'incident-response');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Threat Hunting', 'threat-hunting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Forensics', 'forensics');

  -- cybersecurity → Application Security
  SELECT id INTO cat_id FROM categories WHERE slug = 'cybersecurity';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Application Security', lower(regexp_replace('Application Security', '[^a-zA-Z0-9]+', '-', 'g')), 'Application Security services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SAST', 'sast');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'DAST', 'dast');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SCA', 'sca');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Secure Code Review', 'secure-code-review');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OWASP Top 10', 'owasp-top-10');

  -- cybersecurity → Compliance Security
  SELECT id INTO cat_id FROM categories WHERE slug = 'cybersecurity';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Compliance Security', lower(regexp_replace('Compliance Security', '[^a-zA-Z0-9]+', '-', 'g')), 'Compliance Security services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ISO 27001', 'iso-27001');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SOC 2', 'soc-2');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PCI DSS', 'pci-dss');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'HIPAA', 'hipaa');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'GDPR', 'gdpr');

  -- network-administration → Network Setup
  SELECT id INTO cat_id FROM categories WHERE slug = 'network-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Network Setup', lower(regexp_replace('Network Setup', '[^a-zA-Z0-9]+', '-', 'g')), 'Network Setup services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Router Config', 'router-config');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Switch Config', 'switch-config');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'VLAN Setup', 'vlan-setup');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Firewall Config', 'firewall-config');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'VPN Setup', 'vpn-setup');

  -- network-administration → Network Monitoring
  SELECT id INTO cat_id FROM categories WHERE slug = 'network-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Network Monitoring', lower(regexp_replace('Network Monitoring', '[^a-zA-Z0-9]+', '-', 'g')), 'Network Monitoring services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PRTG', 'prtg');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Zabbix', 'zabbix');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Nagios', 'nagios');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SolarWinds', 'solarwinds');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Wireshark', 'wireshark');

  -- network-administration → Network Security
  SELECT id INTO cat_id FROM categories WHERE slug = 'network-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Network Security', lower(regexp_replace('Network Security', '[^a-zA-Z0-9]+', '-', 'g')), 'Network Security services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Firewall Rules', 'firewall-rules');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IDS/IPS', 'ids-ips');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Network Segmentation', 'network-segmentation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Access Control', 'access-control');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Security Policies', 'security-policies');

  -- network-administration → Wireless Networks
  SELECT id INTO cat_id FROM categories WHERE slug = 'network-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Wireless Networks', lower(regexp_replace('Wireless Networks', '[^a-zA-Z0-9]+', '-', 'g')), 'Wireless Networks services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WiFi Design', 'wifi-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Access Points', 'access-points');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Site Survey', 'site-survey');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Wireless Security', 'wireless-security');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mesh Networks', 'mesh-networks');

  -- network-administration → Network Protocols
  SELECT id INTO cat_id FROM categories WHERE slug = 'network-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Network Protocols', lower(regexp_replace('Network Protocols', '[^a-zA-Z0-9]+', '-', 'g')), 'Network Protocols services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'TCP/IP', 'tcp-ip');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'DNS/DHCP', 'dns-dhcp');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'BGP/OSPF', 'bgp-ospf');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MPLS', 'mpls');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SD-WAN', 'sd-wan');

  -- database-administration → DB Management
  SELECT id INTO cat_id FROM categories WHERE slug = 'database-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'DB Management', lower(regexp_replace('DB Management', '[^a-zA-Z0-9]+', '-', 'g')), 'DB Management services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'PostgreSQL Admin', 'postgresql-admin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MySQL Admin', 'mysql-admin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Oracle Admin', 'oracle-admin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'MongoDB Admin', 'mongodb-admin');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Redis Admin', 'redis-admin');

  -- database-administration → DB Optimization
  SELECT id INTO cat_id FROM categories WHERE slug = 'database-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'DB Optimization', lower(regexp_replace('DB Optimization', '[^a-zA-Z0-9]+', '-', 'g')), 'DB Optimization services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Query Tuning', 'query-tuning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Index Strategy', 'index-strategy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Partitioning', 'partitioning');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vacuum/Analyze', 'vacuum-analyze');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Connection Pooling', 'connection-pooling');

  -- database-administration → Backup & Recovery
  SELECT id INTO cat_id FROM categories WHERE slug = 'database-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Backup & Recovery', lower(regexp_replace('Backup & Recovery', '[^a-zA-Z0-9]+', '-', 'g')), 'Backup & Recovery services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Automated Backups', 'automated-backups');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Point-in-Time Recovery', 'point-in-time-recovery');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Replication', 'replication');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Failover', 'failover');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Disaster Recovery', 'disaster-recovery');

  -- database-administration → DB Monitoring
  SELECT id INTO cat_id FROM categories WHERE slug = 'database-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'DB Monitoring', lower(regexp_replace('DB Monitoring', '[^a-zA-Z0-9]+', '-', 'g')), 'DB Monitoring services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Performance Monitor', 'performance-monitor');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Slow Query Log', 'slow-query-log');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'pg_stat_statements', 'pg-stat-statements');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Auto Scaling', 'auto-scaling');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Alerting', 'alerting');

  -- database-administration → DB Security
  SELECT id INTO cat_id FROM categories WHERE slug = 'database-administration';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'DB Security', lower(regexp_replace('DB Security', '[^a-zA-Z0-9]+', '-', 'g')), 'DB Security services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Access Control', 'access-control');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Encryption', 'encryption');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Audit Logging', 'audit-logging');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Row Level Security', 'row-level-security');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Masking', 'data-masking');

  -- it-consulting → IT Strategy
  SELECT id INTO cat_id FROM categories WHERE slug = 'it-consulting';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'IT Strategy', lower(regexp_replace('IT Strategy', '[^a-zA-Z0-9]+', '-', 'g')), 'IT Strategy services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Digital Transformation', 'digital-transformation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IT Roadmap', 'it-roadmap');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Technology Audit', 'technology-audit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vendor Selection', 'vendor-selection');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IT Budget Planning', 'it-budget-planning');

  -- it-consulting → Infrastructure
  SELECT id INTO cat_id FROM categories WHERE slug = 'it-consulting';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Infrastructure', lower(regexp_replace('Infrastructure', '[^a-zA-Z0-9]+', '-', 'g')), 'Infrastructure services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Server Infrastructure', 'server-infrastructure');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Storage Solutions', 'storage-solutions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Network Design', 'network-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Disaster Recovery', 'disaster-recovery');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Center', 'data-center');

  -- it-consulting → IT Compliance
  SELECT id INTO cat_id FROM categories WHERE slug = 'it-consulting';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'IT Compliance', lower(regexp_replace('IT Compliance', '[^a-zA-Z0-9]+', '-', 'g')), 'IT Compliance services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IT Audits', 'it-audits');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SOX Compliance', 'sox-compliance');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ISO Standards', 'iso-standards');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IT Governance', 'it-governance');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Risk Assessment', 'risk-assessment');

  -- it-consulting → Technology Advisory
  SELECT id INTO cat_id FROM categories WHERE slug = 'it-consulting';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Technology Advisory', lower(regexp_replace('Technology Advisory', '[^a-zA-Z0-9]+', '-', 'g')), 'Technology Advisory services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tech Stack Selection', 'tech-stack-selection');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cloud Strategy', 'cloud-strategy');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Digital Innovation', 'digital-innovation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IT Architecture', 'it-architecture');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Emerging Tech', 'emerging-tech');

  -- it-consulting → IT Operations
  SELECT id INTO cat_id FROM categories WHERE slug = 'it-consulting';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'IT Operations', lower(regexp_replace('IT Operations', '[^a-zA-Z0-9]+', '-', 'g')), 'IT Operations services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ITIL Framework', 'itil-framework');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Service Desk', 'service-desk');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SLA Management', 'sla-management');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IT Asset Management', 'it-asset-management');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Change Management', 'change-management');

  -- technical-support → Help Desk
  SELECT id INTO cat_id FROM categories WHERE slug = 'technical-support';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Help Desk', lower(regexp_replace('Help Desk', '[^a-zA-Z0-9]+', '-', 'g')), 'Help Desk services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Ticketing Systems', 'ticketing-systems');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Remote Support', 'remote-support');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Password Reset', 'password-reset');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Account Setup', 'account-setup');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Troubleshooting', 'troubleshooting');

  -- technical-support → Software Support
  SELECT id INTO cat_id FROM categories WHERE slug = 'technical-support';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Software Support', lower(regexp_replace('Software Support', '[^a-zA-Z0-9]+', '-', 'g')), 'Software Support services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Application Support', 'application-support');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SaaS Support', 'saas-support');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bug Reporting', 'bug-reporting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Feature Requests', 'feature-requests');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Release Testing', 'release-testing');

  -- technical-support → Hardware Support
  SELECT id INTO cat_id FROM categories WHERE slug = 'technical-support';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Hardware Support', lower(regexp_replace('Hardware Support', '[^a-zA-Z0-9]+', '-', 'g')), 'Hardware Support services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Desktop Support', 'desktop-support');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Printer Setup', 'printer-setup');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Peripherals', 'peripherals');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hardware Diagnostics', 'hardware-diagnostics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Asset Tracking', 'asset-tracking');

  -- technical-support → Customer Support Tech
  SELECT id INTO cat_id FROM categories WHERE slug = 'technical-support';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Customer Support Tech', lower(regexp_replace('Customer Support Tech', '[^a-zA-Z0-9]+', '-', 'g')), 'Customer Support Tech services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Zendesk', 'zendesk');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Freshdesk', 'freshdesk');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Intercom', 'intercom');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Jira Service', 'jira-service');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Confluence', 'confluence');

  -- technical-support → SLA Management
  SELECT id INTO cat_id FROM categories WHERE slug = 'technical-support';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'SLA Management', lower(regexp_replace('SLA Management', '[^a-zA-Z0-9]+', '-', 'g')), 'SLA Management services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Response Times', 'response-times');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Escalation Matrix', 'escalation-matrix');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Priority Levels', 'priority-levels');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Resolution SLAs', 'resolution-slas');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SLA Reporting', 'sla-reporting');

  -- blockchain-development → Smart Contracts
  SELECT id INTO cat_id FROM categories WHERE slug = 'blockchain-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Smart Contracts', lower(regexp_replace('Smart Contracts', '[^a-zA-Z0-9]+', '-', 'g')), 'Smart Contracts services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Solidity', 'solidity');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Rust (Solana)', 'rust-solana');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Hardhat', 'hardhat');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Foundry', 'foundry');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Remix IDE', 'remix-ide');

  -- blockchain-development → DApp Development
  SELECT id INTO cat_id FROM categories WHERE slug = 'blockchain-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'DApp Development', lower(regexp_replace('DApp Development', '[^a-zA-Z0-9]+', '-', 'g')), 'DApp Development services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ethers.js', 'ethers-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'web3.js', 'web3-js');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'wagmi', 'wagmi');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'RainbowKit', 'rainbowkit');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Thirdweb', 'thirdweb');

  -- blockchain-development → DeFi
  SELECT id INTO cat_id FROM categories WHERE slug = 'blockchain-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'DeFi', lower(regexp_replace('DeFi', '[^a-zA-Z0-9]+', '-', 'g')), 'DeFi services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Uniswap V3', 'uniswap-v3');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Aave', 'aave');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Compound', 'compound');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Yield Farming', 'yield-farming');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Liquidity Pools', 'liquidity-pools');

  -- blockchain-development → NFTs
  SELECT id INTO cat_id FROM categories WHERE slug = 'blockchain-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'NFTs', lower(regexp_replace('NFTs', '[^a-zA-Z0-9]+', '-', 'g')), 'NFTs services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ERC-721', 'erc-721');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ERC-1155', 'erc-1155');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'IPFS/Arweave', 'ipfs-arweave');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mint Sites', 'mint-sites');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Marketplace', 'marketplace');

  -- blockchain-development → Blockchain Platforms
  SELECT id INTO cat_id FROM categories WHERE slug = 'blockchain-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Blockchain Platforms', lower(regexp_replace('Blockchain Platforms', '[^a-zA-Z0-9]+', '-', 'g')), 'Blockchain Platforms services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Ethereum', 'ethereum');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Solana', 'solana');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Polygon', 'polygon');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Avalanche', 'avalanche');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Base', 'base');

  -- erp-development → SAP
  SELECT id INTO cat_id FROM categories WHERE slug = 'erp-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'SAP', lower(regexp_replace('SAP', '[^a-zA-Z0-9]+', '-', 'g')), 'SAP services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ABAP', 'abap');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SAP Fiori', 'sap-fiori');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SAP HANA', 'sap-hana');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SAP MM/SD', 'sap-mm-sd');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SAP FI/CO', 'sap-fi-co');

  -- erp-development → Odoo
  SELECT id INTO cat_id FROM categories WHERE slug = 'erp-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Odoo', lower(regexp_replace('Odoo', '[^a-zA-Z0-9]+', '-', 'g')), 'Odoo services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Odoo Dev', 'odoo-dev');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Odoo Modules', 'odoo-modules');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Odoo Customization', 'odoo-customization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Odoo Accounting', 'odoo-accounting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Odoo CRM', 'odoo-crm');

  -- erp-development → Oracle ERP
  SELECT id INTO cat_id FROM categories WHERE slug = 'erp-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Oracle ERP', lower(regexp_replace('Oracle ERP', '[^a-zA-Z0-9]+', '-', 'g')), 'Oracle ERP services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Oracle EBS', 'oracle-ebs');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Oracle Cloud ERP', 'oracle-cloud-erp');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Oracle SCM', 'oracle-scm');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Oracle HCM', 'oracle-hcm');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Oracle Financials', 'oracle-financials');

  -- erp-development → Microsoft Dynamics
  SELECT id INTO cat_id FROM categories WHERE slug = 'erp-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Microsoft Dynamics', lower(regexp_replace('Microsoft Dynamics', '[^a-zA-Z0-9]+', '-', 'g')), 'Microsoft Dynamics services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'D365 Finance', 'd365-finance');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'D365 Supply Chain', 'd365-supply-chain');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'D365 Sales', 'd365-sales');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Power Platform', 'power-platform');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'X++', 'x');

  -- erp-development → ERP Integration
  SELECT id INTO cat_id FROM categories WHERE slug = 'erp-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'ERP Integration', lower(regexp_replace('ERP Integration', '[^a-zA-Z0-9]+', '-', 'g')), 'ERP Integration services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'API Integration', 'api-integration');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'EDI', 'edi');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Migration ERP', 'data-migration-erp');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ERP Consulting', 'erp-consulting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ERP Support', 'erp-support');

  -- no-code-development → Bubble
  SELECT id INTO cat_id FROM categories WHERE slug = 'no-code-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Bubble', lower(regexp_replace('Bubble', '[^a-zA-Z0-9]+', '-', 'g')), 'Bubble services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bubble Workflows', 'bubble-workflows');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bubble Plugins', 'bubble-plugins');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bubble API', 'bubble-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bubble Database', 'bubble-database');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Bubble Responsive', 'bubble-responsive');

  -- no-code-development → Airtable
  SELECT id INTO cat_id FROM categories WHERE slug = 'no-code-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Airtable', lower(regexp_replace('Airtable', '[^a-zA-Z0-9]+', '-', 'g')), 'Airtable services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Airtable Bases', 'airtable-bases');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Interface Designer', 'interface-designer');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Airtable Automation', 'airtable-automation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Scripting Block', 'scripting-block');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Sync Tables', 'sync-tables');

  -- no-code-development → Zapier
  SELECT id INTO cat_id FROM categories WHERE slug = 'no-code-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Zapier', lower(regexp_replace('Zapier', '[^a-zA-Z0-9]+', '-', 'g')), 'Zapier services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Zapier Workflows', 'zapier-workflows');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Multi-Step Zaps', 'multi-step-zaps');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Webhooks Zapier', 'webhooks-zapier');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Filters/Paths', 'filters-paths');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Zapier Integrations', 'zapier-integrations');

  -- no-code-development → Make (Integromat)
  SELECT id INTO cat_id FROM categories WHERE slug = 'no-code-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Make (Integromat)', lower(regexp_replace('Make (Integromat)', '[^a-zA-Z0-9]+', '-', 'g')), 'Make (Integromat) services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Make Scenarios', 'make-scenarios');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Make Modules', 'make-modules');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Transformation', 'data-transformation');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Make Routers', 'make-routers');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Make Webhooks', 'make-webhooks');

  -- no-code-development → Low-Code Platforms
  SELECT id INTO cat_id FROM categories WHERE slug = 'no-code-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Low-Code Platforms', lower(regexp_replace('Low-Code Platforms', '[^a-zA-Z0-9]+', '-', 'g')), 'Low-Code Platforms services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Retool', 'retool');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Appsmith', 'appsmith');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Tooljet', 'tooljet');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'FlutterFlow', 'flutterflow');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'OutSystems', 'outsystems');

  -- webflow-development → Webflow Design
  SELECT id INTO cat_id FROM categories WHERE slug = 'webflow-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Webflow Design', lower(regexp_replace('Webflow Design', '[^a-zA-Z0-9]+', '-', 'g')), 'Webflow Design services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Webflow Designer', 'webflow-designer');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CMS Collections', 'cms-collections');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Interactions/Animations', 'interactions-animations');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Responsive Webflow', 'responsive-webflow');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Custom Code', 'custom-code');

  -- webflow-development → Webflow CMS
  SELECT id INTO cat_id FROM categories WHERE slug = 'webflow-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Webflow CMS', lower(regexp_replace('Webflow CMS', '[^a-zA-Z0-9]+', '-', 'g')), 'Webflow CMS services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Blog CMS', 'blog-cms');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Dynamic Content', 'dynamic-content');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Collection Templates', 'collection-templates');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'CMS API', 'cms-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'SEO Webflow', 'seo-webflow');

  -- shopify-development → Shopify Themes
  SELECT id INTO cat_id FROM categories WHERE slug = 'shopify-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Shopify Themes', lower(regexp_replace('Shopify Themes', '[^a-zA-Z0-9]+', '-', 'g')), 'Shopify Themes services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Liquid Templates', 'liquid-templates');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Theme Customization', 'theme-customization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Shopify 2.0', 'shopify-2-0');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Section/Blocks', 'section-blocks');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Mobile Responsive', 'mobile-responsive');

  -- shopify-development → Shopify Apps
  SELECT id INTO cat_id FROM categories WHERE slug = 'shopify-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Shopify Apps', lower(regexp_replace('Shopify Apps', '[^a-zA-Z0-9]+', '-', 'g')), 'Shopify Apps services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'App Integration', 'app-integration');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Custom Apps', 'custom-apps');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Shopify API', 'shopify-api');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Webhooks Shopify', 'webhooks-shopify');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Checkout Customization', 'checkout-customization');

  -- wordpress-development → WordPress Themes
  SELECT id INTO cat_id FROM categories WHERE slug = 'wordpress-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'WordPress Themes', lower(regexp_replace('WordPress Themes', '[^a-zA-Z0-9]+', '-', 'g')), 'WordPress Themes services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Theme Development', 'theme-development');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Block Themes', 'block-themes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'FSE Themes', 'fse-themes');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Theme Customization', 'theme-customization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Child Themes', 'child-themes');

  -- wordpress-development → WordPress Plugins
  SELECT id INTO cat_id FROM categories WHERE slug = 'wordpress-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'WordPress Plugins', lower(regexp_replace('WordPress Plugins', '[^a-zA-Z0-9]+', '-', 'g')), 'WordPress Plugins services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Plugin Development', 'plugin-development');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'WooCommerce', 'woocommerce');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Custom Post Types', 'custom-post-types');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'REST API WP', 'rest-api-wp');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Shortcodes', 'shortcodes');

  -- game-development → Unity Development
  SELECT id INTO cat_id FROM categories WHERE slug = 'game-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Unity Development', lower(regexp_replace('Unity Development', '[^a-zA-Z0-9]+', '-', 'g')), 'Unity Development services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Unity 2D', 'unity-2d');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Unity 3D', 'unity-3d');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'C# Scripting', 'c-scripting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Unity Physics', 'unity-physics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Unity UI', 'unity-ui');

  -- game-development → Unreal Engine
  SELECT id INTO cat_id FROM categories WHERE slug = 'game-development';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Unreal Engine', lower(regexp_replace('Unreal Engine', '[^a-zA-Z0-9]+', '-', 'g')), 'Unreal Engine services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Blueprints', 'blueprints');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'C++ UE', 'c-ue');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'UE5 Features', 'ue5-features');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Nanite/Lumen', 'nanite-lumen');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'UE Animations', 'ue-animations');

  -- graphic-design → Print Design
  SELECT id INTO cat_id FROM categories WHERE slug = 'graphic-design';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Print Design', lower(regexp_replace('Print Design', '[^a-zA-Z0-9]+', '-', 'g')), 'Print Design services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Business Cards', 'business-cards');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Brochures', 'brochures');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Flyers', 'flyers');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Brand Collateral', 'brand-collateral');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Packaging Design', 'packaging-design');

  -- graphic-design → Digital Graphics
  SELECT id INTO cat_id FROM categories WHERE slug = 'graphic-design';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Digital Graphics', lower(regexp_replace('Digital Graphics', '[^a-zA-Z0-9]+', '-', 'g')), 'Digital Graphics services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Social Media Graphics', 'social-media-graphics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Banner Ads', 'banner-ads');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Email Templates', 'email-templates');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Infographics', 'infographics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'E-books', 'e-books');

  -- video-editing → Post-Production
  SELECT id INTO cat_id FROM categories WHERE slug = 'video-editing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Post-Production', lower(regexp_replace('Post-Production', '[^a-zA-Z0-9]+', '-', 'g')), 'Post-Production services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Adobe Premiere', 'adobe-premiere');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'DaVinci Resolve', 'davinci-resolve');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Final Cut Pro', 'final-cut-pro');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Color Grading', 'color-grading');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Audio Mixing', 'audio-mixing');

  -- video-editing → Effects & Compositing
  SELECT id INTO cat_id FROM categories WHERE slug = 'video-editing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Effects & Compositing', lower(regexp_replace('Effects & Compositing', '[^a-zA-Z0-9]+', '-', 'g')), 'Effects & Compositing services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'After Effects', 'after-effects');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Motion Graphics', 'motion-graphics');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Green Screen', 'green-screen');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Visual Effects', 'visual-effects');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Title Animation', 'title-animation');

  -- seo → On-Page SEO
  SELECT id INTO cat_id FROM categories WHERE slug = 'seo';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'On-Page SEO', lower(regexp_replace('On-Page SEO', '[^a-zA-Z0-9]+', '-', 'g')), 'On-Page SEO services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Keyword Research', 'keyword-research');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Meta Tags', 'meta-tags');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Content Optimization', 'content-optimization');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Header Structure', 'header-structure');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Internal Linking', 'internal-linking');

  -- seo → Off-Page SEO
  SELECT id INTO cat_id FROM categories WHERE slug = 'seo';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Off-Page SEO', lower(regexp_replace('Off-Page SEO', '[^a-zA-Z0-9]+', '-', 'g')), 'Off-Page SEO services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Link Building', 'link-building');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Guest Posting', 'guest-posting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Digital PR', 'digital-pr');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Brand Mentions', 'brand-mentions');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Outreach', 'outreach');

  -- social-media-marketing → Content Creation
  SELECT id INTO cat_id FROM categories WHERE slug = 'social-media-marketing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Content Creation', lower(regexp_replace('Content Creation', '[^a-zA-Z0-9]+', '-', 'g')), 'Content Creation services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Reels/Shorts', 'reels-shorts');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Carousel Posts', 'carousel-posts');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Story Design', 'story-design');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Video Content', 'video-content');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Copywriting', 'copywriting');

  -- social-media-marketing → Ad Campaigns
  SELECT id INTO cat_id FROM categories WHERE slug = 'social-media-marketing';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Ad Campaigns', lower(regexp_replace('Ad Campaigns', '[^a-zA-Z0-9]+', '-', 'g')), 'Ad Campaigns services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Facebook Ads', 'facebook-ads');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Instagram Ads', 'instagram-ads');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'LinkedIn Ads', 'linkedin-ads');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'TikTok Ads', 'tiktok-ads');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Twitter Ads', 'twitter-ads');

  -- lead-generation → B2B Lead Gen
  SELECT id INTO cat_id FROM categories WHERE slug = 'lead-generation';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'B2B Lead Gen', lower(regexp_replace('B2B Lead Gen', '[^a-zA-Z0-9]+', '-', 'g')), 'B2B Lead Gen services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'LinkedIn Outreach', 'linkedin-outreach');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Email Prospecting', 'email-prospecting');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Cold Email', 'cold-email');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Account Based Marketing', 'account-based-marketing');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Lead Scoring', 'lead-scoring');

  -- lead-generation → B2C Lead Gen
  SELECT id INTO cat_id FROM categories WHERE slug = 'lead-generation';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'B2C Lead Gen', lower(regexp_replace('B2C Lead Gen', '[^a-zA-Z0-9]+', '-', 'g')), 'B2C Lead Gen services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Social Media Leads', 'social-media-leads');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Content Lead Gen', 'content-lead-gen');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Webinar Leads', 'webinar-leads');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Referral Programs', 'referral-programs');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Lead Magnets', 'lead-magnets');

  -- customer-support → Phone Support
  SELECT id INTO cat_id FROM categories WHERE slug = 'customer-support';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Phone Support', lower(regexp_replace('Phone Support', '[^a-zA-Z0-9]+', '-', 'g')), 'Phone Support services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Inbound Calls', 'inbound-calls');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Outbound Calls', 'outbound-calls');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Customer Service', 'customer-service');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Complaint Handling', 'complaint-handling');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Call Scripting', 'call-scripting');

  -- customer-support → Live Chat Support
  SELECT id INTO cat_id FROM categories WHERE slug = 'customer-support';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Live Chat Support', lower(regexp_replace('Live Chat Support', '[^a-zA-Z0-9]+', '-', 'g')), 'Live Chat Support services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Chat Systems', 'chat-systems');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Real-time Support', 'real-time-support');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Multi-language Chat', 'multi-language-chat');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Chatbots', 'chatbots');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Response Templates', 'response-templates');

  -- virtual-assistance → Admin Support
  SELECT id INTO cat_id FROM categories WHERE slug = 'virtual-assistance';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Admin Support', lower(regexp_replace('Admin Support', '[^a-zA-Z0-9]+', '-', 'g')), 'Admin Support services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Calendar Management', 'calendar-management');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Email Management', 'email-management');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Data Entry', 'data-entry');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Travel Booking', 'travel-booking');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Document Prep', 'document-prep');

  -- virtual-assistance → Executive Support
  SELECT id INTO cat_id FROM categories WHERE slug = 'virtual-assistance';
  INSERT INTO subcategories (category_id, name, slug, description, is_active)
  VALUES (cat_id, 'Executive Support', lower(regexp_replace('Executive Support', '[^a-zA-Z0-9]+', '-', 'g')), 'Executive Support services', true)
  RETURNING id INTO sub_id;
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Meeting Coordination', 'meeting-coordination');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Expense Reports', 'expense-reports');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Presentation Prep', 'presentation-prep');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Client Communication', 'client-communication');
  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Project Tracking', 'project-tracking');

  -- Remaining categories get generic subcategories
  FOR cat_id IN SELECT id FROM categories WHERE slug NOT IN (
    'development-it', 'ai-machine-learning', 'ai-chatbots', 'generative-ai', 'deep-learning', 'ml-engineering', 'data-science', 'data-analytics', 'data-engineering', 'data-annotation', 'data-entry', 'frontend-development', 'backend-development', 'full-stack-development', 'mobile-app-development', 'ios-development', 'android-development', 'flutter-development', 'react-native-development', 'cross-platform-dev', 'web-development', 'web-design', 'react-development', 'vuejs-development', 'java-development', 'python-development', 'sql-development', 'api-development', 'software-development', 'software-architecture', 'devops-engineering', 'cloud-computing', 'cybersecurity', 'network-administration', 'database-administration', 'it-consulting', 'technical-support', 'blockchain-development', 'erp-development', 'no-code-development', 'webflow-development', 'shopify-development', 'wordpress-development', 'game-development', 'graphic-design', 'video-editing', 'seo', 'social-media-marketing', 'lead-generation', 'customer-support', 'virtual-assistance'
  )
  LOOP
    INSERT INTO subcategories (category_id, name, slug, description, is_active)
    VALUES (cat_id, 'General Services', lower(regexp_replace('General Services', '[^a-zA-Z0-9]+', '-', 'g')), 'General Services services', true)
    RETURNING id INTO sub_id;
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Consultation', 'consultation');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Strategy Planning', 'strategy-planning');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Implementation', 'implementation');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Management', 'management');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Support', 'support');

    INSERT INTO subcategories (category_id, name, slug, description, is_active)
    VALUES (cat_id, 'Specialized Services', lower(regexp_replace('Specialized Services', '[^a-zA-Z0-9]+', '-', 'g')), 'Specialized Services services', true)
    RETURNING id INTO sub_id;
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Advanced Analytics', 'advanced-analytics');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Custom Development', 'custom-development');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Integration', 'integration');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Optimization', 'optimization');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Automation', 'automation');

    INSERT INTO subcategories (category_id, name, slug, description, is_active)
    VALUES (cat_id, 'Consulting', lower(regexp_replace('Consulting', '[^a-zA-Z0-9]+', '-', 'g')), 'Consulting services', true)
    RETURNING id INTO sub_id;
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Needs Assessment', 'needs-assessment');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Solution Design', 'solution-design');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Roadmap Planning', 'roadmap-planning');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Vendor Selection', 'vendor-selection');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'ROI Analysis', 'roi-analysis');

    INSERT INTO subcategories (category_id, name, slug, description, is_active)
    VALUES (cat_id, 'Management & Support', lower(regexp_replace('Management & Support', '[^a-zA-Z0-9]+', '-', 'g')), 'Management & Support services', true)
    RETURNING id INTO sub_id;
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Ongoing Management', 'ongoing-management');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Technical Support', 'technical-support');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Performance Monitoring', 'performance-monitoring');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Reporting', 'reporting');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Training', 'training');

    INSERT INTO subcategories (category_id, name, slug, description, is_active)
    VALUES (cat_id, 'Quality Assurance', lower(regexp_replace('Quality Assurance', '[^a-zA-Z0-9]+', '-', 'g')), 'Quality Assurance services', true)
    RETURNING id INTO sub_id;
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Testing', 'testing');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Review', 'review');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Compliance Check', 'compliance-check');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Optimization', 'optimization');
    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, 'Documentation', 'documentation');

  END LOOP;
END $$;

