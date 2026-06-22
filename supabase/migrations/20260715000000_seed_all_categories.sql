-- ============================================================================
-- SEED ALL MAJOR + MINOR CATEGORIES
-- Adds comprehensive categories and subcategories for the Growlancer platform
-- ============================================================================

-- First, add new MAJOR categories (beyond the existing 11)
-- Existing: Development & IT, Design & Creative, Writing & Translation, Digital Marketing,
--            Sales & Customer Support, Finance & Accounting, Engineering & Architecture,
--            Legal Services, HR & Recruitment, Admin & Operations, Education & Training

INSERT INTO categories (name, slug, description, display_order, icon) VALUES
  ('Data Science & AI', 'data-science-ai', 'Machine learning, data analysis, AI development, and business intelligence', 12, 'BrainCircuit'),
  ('IT & Network Security', 'it-network-security', 'System administration, cybersecurity, cloud infrastructure, and networking', 13, 'Shield'),
  ('Blockchain & Web3', 'blockchain-web3', 'Smart contracts, cryptocurrency, NFTs, and decentralized applications', 14, 'Link2'),
  ('Video & Animation', 'video-animation', 'Video production, motion graphics, 3D animation, and post-production', 15, 'Video'),
  ('Music & Audio', 'music-audio', 'Audio production, voiceover, sound design, and music composition', 16, 'Music2'),
  ('Photography', 'photography', 'Product photography, portrait photography, event coverage, and photo editing', 17, 'Camera'),
  ('Content Management', 'content-management', 'CMS development, content strategy, blogging, and editorial management', 18, 'FileText'),
  ('Health & Wellness', 'health-wellness', 'Fitness coaching, nutrition planning, mental health, and medical consulting', 19, 'Heart'),
  ('Real Estate', 'real-estate', 'Property management, real estate marketing, valuation, and architecture consulting', 20, 'Building2'),
  ('Supply Chain & Logistics', 'supply-chain-logistics', 'Inventory management, shipping, procurement, and warehouse operations', 21, 'Truck'),
  ('Gaming & eSports', 'gaming-esports', 'Game development, game design, esports management, and gaming content', 22, 'Gamepad2'),
  ('Consulting & Strategy', 'consulting-strategy', 'Business strategy, management consulting, market analysis, and operations', 23, 'LineChart'),
  ('Science & Research', 'science-research', 'Academic research, data collection, scientific writing, and lab work', 24, 'FlaskConical'),
  ('Trades & Services', 'trades-services', 'Electrical work, plumbing, carpentry, HVAC, and general contracting', 25, 'Wrench'),
  ('Event Planning', 'event-planning', 'Wedding planning, corporate events, party coordination, and venue management', 26, 'CalendarCheck2'),
  ('Travel & Hospitality', 'travel-hospitality', 'Travel planning, hotel management, tour guiding, and hospitality services', 27, 'Plane'),
  ('E-commerce Management', 'ecommerce-management', 'Shopify/WooCommerce management, product listings, and online store optimization', 28, 'ShoppingCart'),
  ('Social Media Management', 'social-media-management', 'Social media strategy, community management, influencer marketing, and analytics', 29, 'Share2'),
  ('Sustainability & Green Tech', 'sustainability-green-tech', 'Environmental consulting, green energy, sustainability reporting, and eco-design', 30, 'Leaf'),
  ('Customer Experience & UX Research', 'customer-experience-ux-research', 'User research, usability testing, customer journey mapping, and service design', 31, 'Search')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SUBCATEGORIES FOR EXISTING + NEW CATEGORIES
-- ============================================================================

-- 1. Development & IT
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'development-it';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Frontend Development', 'frontend-development', 'React, Vue, Angular, Next.js, and modern web UI'),
    (cat_id, 'Backend Development', 'backend-development', 'Node.js, Python, Ruby, Java, Go, and server-side logic'),
    (cat_id, 'Full Stack Development', 'full-stack-development', 'Combined frontend and backend development expertise'),
    (cat_id, 'Mobile App Development', 'mobile-app-development', 'Native iOS (Swift), Android (Kotlin), and cross-platform apps'),
    (cat_id, 'Cross Platform Development', 'cross-platform-development', 'React Native, Flutter, Xamarin, and Ionic apps'),
    (cat_id, 'API Development & Integration', 'api-development-integration', 'REST, GraphQL, third-party API integration, and microservices'),
    (cat_id, 'Database Administration', 'database-administration', 'PostgreSQL, MySQL, MongoDB, Redis, and database optimization'),
    (cat_id, 'DevOps & Cloud Infrastructure', 'devops-cloud-infrastructure', 'AWS, GCP, Azure, Docker, Kubernetes, and CI/CD pipelines'),
    (cat_id, 'Software Testing & QA', 'software-testing-qa', 'Manual testing, automated testing, integration testing, and QA automation'),
    (cat_id, 'Website Maintenance', 'website-maintenance', 'WordPress, CMS updates, security patches, and performance optimization')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 2. Design & Creative
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'design-creative';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'UI/UX Design', 'ui-ux-design', 'Figma, Sketch, user interface design, and user experience design'),
    (cat_id, 'Graphic Design', 'graphic-design', 'Branding, print design, social media graphics, and marketing materials'),
    (cat_id, 'Logo & Brand Identity', 'logo-brand-identity', 'Logo design, brand guides, visual identity, and brand strategy'),
    (cat_id, 'Illustration', 'illustration', 'Digital illustration, vector art, character design, and iconography'),
    (cat_id, 'Motion Graphics', 'motion-graphics', 'After Effects, 2D/3D motion, kinetic typography, and explainers'),
    (cat_id, 'Print Design', 'print-design', 'Brochures, flyers, business cards, magazines, and packaging design'),
    (cat_id, 'Presentation Design', 'presentation-design', 'PowerPoint, Keynote, pitch decks, and investor presentations'),
    (cat_id, 'Infographic Design', 'infographic-design', 'Data visualization, infographics, diagrams, and visual storytelling'),
    (cat_id, '3D Modeling & Rendering', '3d-modeling-rendering', 'Blender, Maya, 3ds Max, product visualization, and architectural rendering'),
    (cat_id, 'Fashion Design', 'fashion-design', 'Apparel design, fashion illustration, textile design, and pattern making')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 3. Writing & Translation
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'writing-translation';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Content Writing', 'content-writing', 'Blog posts, articles, web content, and SEO writing'),
    (cat_id, 'Copywriting', 'copywriting', 'Sales copy, ad copy, email campaigns, and landing pages'),
    (cat_id, 'Creative Writing', 'creative-writing', 'Storytelling, poetry, fiction, screenwriting, and narrative content'),
    (cat_id, 'Technical Writing', 'technical-writing', 'Documentation, manuals, API docs, and technical guides'),
    (cat_id, 'Translation Services', 'translation-services', 'Document translation, localization, and multilingual content'),
    (cat_id, 'Proofreading & Editing', 'proofreading-editing', 'Grammar checking, style editing, substantive editing, and revision'),
    (cat_id, 'Grant Writing', 'grant-writing', 'Research grants, nonprofit funding, and proposal development'),
    (cat_id, 'Resume & Cover Letter Writing', 'resume-cover-letter', 'Professional resume writing, CV optimization, and cover letters'),
    (cat_id, 'Ghostwriting', 'ghostwriting', 'Books, memoirs, articles, and content ghostwritten for clients'),
    (cat_id, 'Script Writing', 'script-writing', 'Video scripts, podcast scripts, YouTube content, and dialogue writing')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 4. Digital Marketing
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'digital-marketing';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Search Engine Optimization (SEO)', 'seo-services', 'On-page SEO, off-page SEO, technical SEO, and keyword research'),
    (cat_id, 'Pay-Per-Click (PPC) Advertising', 'ppc-advertising', 'Google Ads, Facebook Ads, LinkedIn Ads, and ad optimization'),
    (cat_id, 'Social Media Marketing', 'social-media-marketing', 'Content strategy, social media management, and paid social campaigns'),
    (cat_id, 'Email Marketing', 'email-marketing', 'Campaign creation, automation, list management, and newsletter design'),
    (cat_id, 'Content Marketing', 'content-marketing', 'Content strategy, editorial planning, and content distribution'),
    (cat_id, 'Affiliate Marketing', 'affiliate-marketing', 'Program management, partner recruitment, and commission optimization'),
    (cat_id, 'Influencer Marketing', 'influencer-marketing', 'Campaign management, influencer outreach, and brand partnerships'),
    (cat_id, 'Marketing Analytics', 'marketing-analytics', 'Google Analytics, data analysis, reporting, and conversion tracking'),
    (cat_id, 'Growth Hacking', 'growth-hacking', 'Growth strategies, viral marketing, A/B testing, and funnel optimization'),
    (cat_id, 'Market Research', 'market-research', 'Competitor analysis, customer surveys, market sizing, and trend analysis')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 5. Sales & Customer Support
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'sales-support';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Lead Generation', 'lead-generation', 'B2B/B2C lead gen, list building, and prospect research'),
    (cat_id, 'Telemarketing & Cold Calling', 'telemarketing-cold-calling', 'Outbound sales calls, appointment setting, and B2B outreach'),
    (cat_id, 'Customer Support', 'customer-support', 'Email support, live chat, phone support, and helpdesk management'),
    (cat_id, 'Technical Support', 'technical-support', 'SaaS support, troubleshooting, bug reporting, and escalation handling'),
    (cat_id, 'CRM Management', 'crm-management', 'Salesforce, HubSpot, Zoho setup, management, and automation'),
    (cat_id, 'Sales Copywriting', 'sales-copywriting', 'Sales scripts, pitch decks, proposal writing, and objection handling'),
    (cat_id, 'Account Management', 'account-management', 'Client retention, upselling, cross-selling, and relationship management'),
    (cat_id, 'Sales Operations', 'sales-operations', 'Sales pipeline management, forecasting, and process optimization'),
    (cat_id, 'Virtual Assistant', 'virtual-assistant', 'Administrative support, scheduling, email management, and research'),
    (cat_id, 'Live Chat Support', 'live-chat-support', 'Real-time customer engagement, chatbot management, and conversion support')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 6. Finance & Accounting
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'finance-accounting';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Bookkeeping', 'bookkeeping', 'QuickBooks, Xero, transaction recording, and reconciliation'),
    (cat_id, 'Financial Analysis', 'financial-analysis', 'Financial modeling, forecasting, variance analysis, and reporting'),
    (cat_id, 'Tax Preparation', 'tax-preparation', 'Individual/business tax filing, tax planning, and IRS representation'),
    (cat_id, 'Payroll Management', 'payroll-management', 'Payroll processing, compliance, benefits administration, and reporting'),
    (cat_id, 'Financial Planning', 'financial-planning', 'Personal finance, retirement planning, investment strategy, and wealth management'),
    (cat_id, 'Auditing Services', 'auditing-services', 'Internal audit, external audit, compliance audit, and risk assessment'),
    (cat_id, 'Invoice Processing', 'invoice-processing', 'Accounts payable/receivable, invoicing, and collections'),
    (cat_id, 'Cryptocurrency Accounting', 'cryptocurrency-accounting', 'Crypto tax reporting, DeFi accounting, and blockchain audit'),
    (cat_id, 'Financial Consulting', 'financial-consulting', 'CFO services, financial strategy, fundraising, and M&A support'),
    (cat_id, 'Insurance Services', 'insurance-services', 'Policy review, claims processing, insurance consulting, and risk management')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 7. Engineering & Architecture
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'engineering-architecture';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'AutoCAD & Drafting', 'autocad-drafting', '2D/3D drafting, blueprints, architectural drawings, and CAD services'),
    (cat_id, 'Civil Engineering', 'civil-engineering', 'Structural design, site planning, road design, and infrastructure'),
    (cat_id, 'Mechanical Engineering', 'mechanical-engineering', 'Product design, CAD modeling, FEA analysis, and thermal systems'),
    (cat_id, 'Electrical Engineering', 'electrical-engineering', 'Circuit design, power systems, electronics, and embedded systems'),
    (cat_id, 'Interior Design', 'interior-design', 'Residential/commercial interior design, space planning, and styling'),
    (cat_id, 'Landscape Architecture', 'landscape-architecture', 'Garden design, landscape planning, and outdoor space design'),
    (cat_id, 'Structural Engineering', 'structural-engineering', 'Steel/concrete design, load analysis, and structural assessments'),
    (cat_id, 'HVAC Engineering', 'hvac-engineering', 'Heating, ventilation, and air conditioning system design'),
    (cat_id, 'Industrial Design', 'industrial-design', 'Product design, prototyping, manufacturing consulting, and ergonomics'),
    (cat_id, 'Urban Planning', 'urban-planning', 'City planning, zoning analysis, transportation planning, and environmental impact')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 8. Legal Services
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'legal-services';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Contract Law', 'contract-law', 'Drafting, reviewing, and negotiating business contracts and agreements'),
    (cat_id, 'Corporate Law', 'corporate-law', 'Business formation, compliance, governance, and mergers'),
    (cat_id, 'Intellectual Property', 'intellectual-property', 'Trademark, copyright, patent filing, and IP protection'),
    (cat_id, 'Immigration Law', 'immigration-law', 'Visa applications, green cards, citizenship, and immigration consulting'),
    (cat_id, 'Real Estate Law', 'real-estate-law', 'Property transactions, leases, title searches, and land use'),
    (cat_id, 'Employment Law', 'employment-law', 'Employment contracts, labor compliance, workplace policies, and disputes'),
    (cat_id, 'Family Law', 'family-law', 'Divorce, child custody, adoption, and family legal matters'),
    (cat_id, 'Criminal Law', 'criminal-law', 'Criminal defense, case review, legal research, and appeals'),
    (cat_id, 'Tax Law', 'tax-law', 'Tax compliance, tax disputes, IRS representation, and tax planning'),
    (cat_id, 'Legal Research & Writing', 'legal-research-writing', 'Case law research, brief writing, memos, and legal document preparation')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 9. HR & Recruitment
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'hr-recruitment';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Talent Acquisition', 'talent-acquisition', 'Full-cycle recruiting, sourcing, interviewing, and offer management'),
    (cat_id, 'Resume Screening', 'resume-screening', 'CV review, candidate filtering, skills assessment, and shortlisting'),
    (cat_id, 'HR Consulting', 'hr-consulting', 'HR strategy, organizational design, and employee relations'),
    (cat_id, 'Benefits Administration', 'benefits-administration', 'Health insurance, retirement plans, leave management, and compliance'),
    (cat_id, 'Training & Development', 'training-development', 'Employee training, leadership development, eLearning, and workshops'),
    (cat_id, 'Performance Management', 'performance-management', 'Review systems, OKR/KPI tracking, and feedback processes'),
    (cat_id, 'Payroll & Compliance', 'payroll-compliance', 'Wage compliance, labor law compliance, and payroll administration'),
    (cat_id, 'Executive Search', 'executive-search', 'C-suite and senior leadership recruitment, headhunting, and placement'),
    (cat_id, 'HR Analytics & Reporting', 'hr-analytics-reporting', 'Workforce analytics, turnover analysis, and HR metrics dashboards'),
    (cat_id, 'Onboarding & Offboarding', 'onboarding-offboarding', 'New hire integration, exit interviews, and offboarding processes')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 10. Admin & Operations
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'admin-operations';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Data Entry', 'data-entry', 'Data input, data cleaning, spreadsheet management, and database entry'),
    (cat_id, 'Project Management', 'project-management', 'Asana, Trello, Jira setup, sprint planning, and project coordination'),
    (cat_id, 'Business Operations', 'business-operations', 'Process improvement, SOP development, and operational efficiency'),
    (cat_id, 'Research Services', 'research-services', 'Market research, competitor analysis, academic research, and data collection'),
    (cat_id, 'Administrative Support', 'administrative-support', 'Calendar management, email handling, scheduling, and office support'),
    (cat_id, 'Executive Assistance', 'executive-assistance', 'C-suite support, travel booking, expense reporting, and board support'),
    (cat_id, 'Data Analysis', 'data-analysis', 'Excel, Power BI, Tableau, statistical analysis, and data reporting'),
    (cat_id, 'Transcription', 'transcription', 'Audio/video transcription, meeting notes, and closed captioning'),
    (cat_id, 'Business Process Outsourcing', 'business-process-outsourcing', 'Outsourcing management, vendor coordination, and BPO services'),
    (cat_id, 'Quality Assurance', 'quality-assurance', 'Process quality, ISO standards, audits, and continuous improvement')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 11. Education & Training
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'education-training';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Online Tutoring', 'online-tutoring', 'One-on-one tutoring, homework help, and test preparation'),
    (cat_id, 'Course Creation', 'course-creation', 'Udemy/Teachable course development, curriculum design, and eLearning'),
    (cat_id, 'Career Coaching', 'career-coaching', 'Career guidance, interview preparation, job search strategy, and mentoring'),
    (cat_id, 'Language Training', 'language-training', 'ESL, foreign language instruction, and language assessment'),
    (cat_id, 'Test Preparation', 'test-preparation', 'SAT, ACT, GRE, GMAT, TOEFL, and IELTS preparation'),
    (cat_id, 'Curriculum Development', 'curriculum-development', 'Educational program design, lesson planning, and assessment creation'),
    (cat_id, 'Educational Technology', 'educational-technology', 'LMS setup, educational apps, digital learning tools, and EdTech'),
    (cat_id, 'Special Education', 'special-education', 'Special needs tutoring, IEP development, and learning support'),
    (cat_id, 'STEM Education', 'stem-education', 'Science, technology, engineering, and math instruction'),
    (cat_id, 'Corporate Training', 'corporate-training', 'Workplace training programs, soft skills training, and professional development')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 12. Data Science & AI
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'data-science-ai';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Machine Learning', 'machine-learning', 'ML models, deep learning, NLP, computer vision, and predictive analytics'),
    (cat_id, 'Data Analysis & Visualization', 'data-analysis-visualization', 'Tableau, Power BI, Python/R analytics, and dashboard creation'),
    (cat_id, 'Data Engineering', 'data-engineering', 'Data pipelines, ETL processes, data warehousing, and big data infrastructure'),
    (cat_id, 'Business Intelligence', 'business-intelligence', 'Reporting automation, KPI dashboards, and data-driven decision tools'),
    (cat_id, 'AI Chatbot Development', 'ai-chatbot-development', 'GPT integration, conversational AI, customer service bots, and RAG systems'),
    (cat_id, 'Data Scraping & Mining', 'data-scraping-mining', 'Web scraping, data collection, crawling, and data extraction'),
    (cat_id, 'Natural Language Processing', 'natural-language-processing', 'Text analysis, sentiment analysis, language models, and text generation'),
    (cat_id, 'Computer Vision', 'computer-vision', 'Image recognition, object detection, facial recognition, and video analysis'),
    (cat_id, 'AI Consulting', 'ai-consulting', 'AI strategy, model selection, deployment, and MLOps'),
    (cat_id, 'Database Management', 'database-management', 'SQL optimization, data modeling, schema design, and database migration')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 13. IT & Network Security
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'it-network-security';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Cybersecurity', 'cybersecurity', 'Penetration testing, vulnerability assessment, and security audits'),
    (cat_id, 'Network Administration', 'network-administration', 'Cisco, Juniper, network setup, configuration, and troubleshooting'),
    (cat_id, 'Cloud Infrastructure', 'cloud-infrastructure', 'AWS, Azure, GCP architecture, migration, and cost optimization'),
    (cat_id, 'System Administration', 'system-administration', 'Linux/Windows server management, virtualization, and monitoring'),
    (cat_id, 'Information Security', 'information-security', 'ISO 27001, compliance, data protection, and security policies'),
    (cat_id, 'Ethical Hacking', 'ethical-hacking', 'Security testing, red teaming, exploit analysis, and bug bounty'),
    (cat_id, 'Disaster Recovery', 'disaster-recovery', 'Backup solutions, business continuity planning, and data restoration'),
    (cat_id, 'Identity & Access Management', 'identity-access-management', 'SSO, MFA, directory services, and access control implementation'),
    (cat_id, 'IT Support & Helpdesk', 'it-support-helpdesk', 'Tier 1-3 support, remote troubleshooting, and hardware/software setup'),
    (cat_id, 'Blockchain Security', 'blockchain-security', 'Smart contract auditing, DeFi security, and web3 security assessment')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 14. Blockchain & Web3
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'blockchain-web3';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Smart Contract Development', 'smart-contract-development', 'Solidity, Rust, Vyper, and smart contract deployment'),
    (cat_id, 'DeFi Development', 'defi-development', 'Decentralized finance protocols, DEX, lending, and yield farming'),
    (cat_id, 'NFT Creation & Marketplace', 'nft-marketplace', 'NFT minting, marketplace development, and digital collectibles'),
    (cat_id, 'Web3 Frontend Development', 'web3-frontend-development', 'ethers.js, web3.js, DApp interfaces, and wallet integration'),
    (cat_id, 'Solidity Development', 'solidity-development', 'Ethereum smart contract programming and testing'),
    (cat_id, 'Crypto Trading Bots', 'crypto-trading-bots', 'Automated trading systems, arbitrage bots, and market making'),
    (cat_id, 'Tokenomics Design', 'tokenomics-design', 'Token economics, governance design, and incentive structures'),
    (cat_id, 'DAO Development', 'dao-development', 'Decentralized autonomous organizations, governance, and treasury management'),
    (cat_id, 'Web3 Consulting', 'web3-consulting', 'Blockchain strategy, tokenization, and decentralized architecture advice'),
    (cat_id, 'Metaverse Development', 'metaverse-development', 'Virtual worlds, 3D environments, and metaverse platform integration')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 15. Video & Animation
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'video-animation';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Video Editing', 'video-editing', 'Premiere Pro, Final Cut, editing, color grading, and post-production'),
    (cat_id, 'Motion Graphics', 'video-motion-graphics', 'After Effects, lower thirds, title animations, and transitions'),
    (cat_id, '3D Animation', '3d-animation', 'Blender, Maya, Cinema 4D, character animation, and product visualization'),
    (cat_id, '2D Animation', '2d-animation', 'Anime, cartoon, whiteboard animation, and explainer videos'),
    (cat_id, 'Explainers & Product Demos', 'explainer-product-demos', 'Product walkthroughs, animated explainers, and demo videos'),
    (cat_id, 'Video Production', 'video-production', 'Filming, directing, lighting, sound recording, and production management'),
    (cat_id, 'YouTube Content Creation', 'youtube-content-creation', 'Channel management, video optimization, and content strategy'),
    (cat_id, 'Short Form Content', 'short-form-content', 'TikTok, Reels, Shorts creation, and viral content production'),
    (cat_id, 'Corporate Video Production', 'corporate-video-production', 'Training videos, company presentations, testimonials, and events'),
    (cat_id, 'Visual Effects (VFX)', 'visual-effects-vfx', 'CGI, compositing, green screen, and visual effects for film/video')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 16. Music & Audio
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'music-audio';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Audio Production', 'audio-production', 'Mixing, mastering, recording, and audio engineering'),
    (cat_id, 'Voice Over', 'voice-over', 'Professional voice over, narration, IVR, and commercial voice work'),
    (cat_id, 'Sound Design', 'sound-design', 'Sound effects, ambient design, and audio branding'),
    (cat_id, 'Music Composition', 'music-composition', 'Original music, scoring, jingles, and background tracks'),
    (cat_id, 'Podcast Production', 'podcast-production', 'Editing, show notes, audio cleanup, and podcast launch'),
    (cat_id, 'Audio Editing', 'audio-editing', 'Dialog editing, noise reduction, timing correction, and restoration'),
    (cat_id, 'Music Production', 'music-production', 'Beat making, song production, arrangement, and session work'),
    (cat_id, 'Audiobook Production', 'audiobook-production', 'Audiobook narration, editing, mastering, and ACX distribution'),
    (cat_id, 'Audio Restoration', 'audio-restoration', 'Old recording restoration, noise removal, and audio cleanup'),
    (cat_id, 'Mixing & Mastering', 'mixing-mastering', 'Professional audio mixing, mastering, and stem processing')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 17. Photography
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'photography';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Product Photography', 'product-photography', 'E-commerce photos, product shots, 360-degree views, and flat lays'),
    (cat_id, 'Portrait Photography', 'portrait-photography', 'Headshots, family portraits, senior portraits, and professional photos'),
    (cat_id, 'Event Photography', 'event-photography', 'Weddings, corporate events, conferences, and party coverage'),
    (cat_id, 'Photo Editing & Retouching', 'photo-editing-retouching', 'Photoshop editing, color correction, retouching, and restoration'),
    (cat_id, 'Real Estate Photography', 'real-estate-photography', 'Property photos, virtual tours, drone shots, and staging'),
    (cat_id, 'Food Photography', 'food-photography', 'Menu photos, food styling, restaurant photography, and editorial'),
    (cat_id, 'Fashion Photography', 'fashion-photography', 'Editorial shoots, lookbooks, campaigns, and catalog photography'),
    (cat_id, 'Aerial & Drone Photography', 'aerial-drone-photography', 'Drone videography, aerial shots, mapping, and inspection'),
    (cat_id, 'Candid & Lifestyle Photography', 'candid-lifestyle-photography', 'Natural lifestyle shots, branding imagery, and documentary style'),
    (cat_id, 'Travel Photography', 'travel-photography', 'Destination coverage, travel content, and location scouting')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 18. Health & Wellness
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'health-wellness';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Fitness Training', 'fitness-training', 'Personal training, workout plans, online coaching, and program design'),
    (cat_id, 'Nutrition Planning', 'nutrition-planning', 'Meal plans, diet counseling, nutrition analysis, and recipe development'),
    (cat_id, 'Mental Health', 'mental-health', 'Counseling, therapy, meditation coaching, and wellness coaching'),
    (cat_id, 'Yoga & Pilates Instruction', 'yoga-pilates-instruction', 'Online classes, pose guides, and wellness programming'),
    (cat_id, 'Medical Writing', 'medical-writing', 'Medical content, health blogs, clinical documentation, and research'),
    (cat_id, 'Health Coaching', 'health-coaching', 'Holistic health, habit formation, lifestyle changes, and wellness programs'),
    (cat_id, 'Nursing & Care Consulting', 'nursing-care-consulting', 'Elder care, pediatric care, disability support, and home health'),
    (cat_id, 'Pharmaceutical Consulting', 'pharmaceutical-consulting', 'Drug research, regulatory affairs, and medical affairs'),
    (cat_id, 'Physical Therapy', 'physical-therapy', 'Rehabilitation, injury prevention, exercise therapy, and recovery plans'),
    (cat_id, 'Telemedicine Support', 'telemedicine-support', 'Virtual healthcare support, patient coordination, and health tech')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 19. Real Estate
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'real-estate';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Property Management', 'property-management', 'Tenant management, lease administration, and property maintenance'),
    (cat_id, 'Real Estate Marketing', 'real-estate-marketing', 'Property listings, virtual tours, brochures, and marketing campaigns'),
    (cat_id, 'Property Valuation', 'property-valuation', 'Appraisal, comparative market analysis, and valuation reports'),
    (cat_id, 'Real Estate Investing', 'real-estate-investing', 'Investment analysis, deal sourcing, and portfolio management'),
    (cat_id, 'Lease Administration', 'lease-administration', 'Lease drafting, negotiation, compliance, and abstract management'),
    (cat_id, 'Home Staging', 'home-staging', 'Interior staging, decluttering, and show-ready preparation'),
    (cat_id, 'Commercial Real Estate', 'commercial-real-estate', 'Office, retail, industrial property consulting and management'),
    (cat_id, 'Real Estate Legal Support', 'real-estate-legal-support', 'Title searches, due diligence, contract review, and closing support'),
    (cat_id, 'Mortgage & Financing', 'mortgage-financing', 'Loan processing, refinancing, and mortgage consulting'),
    (cat_id, 'Property Inspection', 'property-inspection', 'Home inspections, building inspections, and report preparation')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 20. Supply Chain & Logistics
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'supply-chain-logistics';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Inventory Management', 'inventory-management', 'Stock optimization, inventory tracking, and demand forecasting'),
    (cat_id, 'Logistics Coordination', 'logistics-coordination', 'Freight coordination, route planning, and delivery management'),
    (cat_id, 'Procurement', 'procurement', 'Vendor sourcing, purchasing, contract negotiation, and supplier management'),
    (cat_id, 'Supply Chain Optimization', 'supply-chain-optimization', 'Process improvement, cost reduction, and efficiency analysis'),
    (cat_id, 'Warehouse Operations', 'warehouse-operations', 'Warehouse layout, picking/packing operations, and WMS implementation'),
    (cat_id, 'Freight Forwarding', 'freight-forwarding', 'International shipping, customs clearance, and cargo management'),
    (cat_id, 'Fleet Management', 'fleet-management', 'Vehicle tracking, maintenance scheduling, and fleet optimization'),
    (cat_id, 'Last Mile Delivery', 'last-mile-delivery', 'Delivery route optimization, courier management, and tracking systems'),
    (cat_id, 'Import/Export Compliance', 'import-export-compliance', 'Customs documentation, trade compliance, and international regulations'),
    (cat_id, 'Sustainability in Supply Chain', 'sustainability-supply-chain', 'Green logistics, carbon footprint tracking, and sustainable sourcing')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 21. Gaming & eSports
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'gaming-esports';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Game Development', 'game-development', 'Unity, Unreal Engine, game programming, and game mechanics'),
    (cat_id, 'Game Design', 'game-design', 'Level design, game balance, systems design, and game mechanics'),
    (cat_id, 'Game Art & Assets', 'game-art-assets', 'Character modeling, environment art, textures, and 2D game sprites'),
    (cat_id, 'Esports Management', 'esports-management', 'Team management, tournament organization, and esports operations'),
    (cat_id, 'Game Testing', 'game-testing', 'QA testing, bug reporting, playtesting, and quality assurance'),
    (cat_id, 'Gaming Content Creation', 'gaming-content-creation', 'Twitch streaming, YouTube gaming content, and gaming articles'),
    (cat_id, 'Game Audio & Sound', 'game-audio-sound', 'SFX, soundtrack composition, voice acting, and audio implementation'),
    (cat_id, 'Game Marketing', 'game-marketing', 'Launch campaigns, community management, and game PR'),
    (cat_id, 'Mobile Game Development', 'mobile-game-development', 'iOS/Android game development, hypercasual games, and app store optimization'),
    (cat_id, 'VR/AR Game Development', 'vr-ar-game-development', 'Virtual reality, augmented reality, and mixed reality game development')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 22. Consulting & Strategy
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'consulting-strategy';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Business Strategy', 'business-strategy', 'Strategic planning, go-to-market strategy, and business model design'),
    (cat_id, 'Management Consulting', 'management-consulting', 'Operations consulting, organizational change, and process improvement'),
    (cat_id, 'Market Analysis', 'market-analysis', 'Market sizing, competitive analysis, and opportunity assessment'),
    (cat_id, 'Digital Transformation', 'digital-transformation', 'Technology strategy, digital adoption, and innovation consulting'),
    (cat_id, 'Startup Consulting', 'startup-consulting', 'Lean methodology, MVP development, fundraising prep, and pitch coaching'),
    (cat_id, 'Pricing Strategy', 'pricing-strategy', 'Price optimization, value-based pricing, and revenue modeling'),
    (cat_id, 'Risk Management', 'risk-management', 'Risk assessment, mitigation strategies, and compliance frameworks'),
    (cat_id, 'Sustainability Consulting', 'sustainability-consulting', 'ESG strategy, carbon footprint analysis, and sustainable business practices'),
    (cat_id, 'Change Management', 'change-management', 'Organizational change, culture transformation, and stakeholder engagement'),
    (cat_id, 'Mergers & Acquisitions', 'mergers-acquisitions', 'M&A advisory, due diligence, valuation, and integration planning')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 23. Science & Research
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'science-research';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Academic Research', 'academic-research', 'Literature reviews, research papers, data collection, and analysis'),
    (cat_id, 'Scientific Writing', 'scientific-writing', 'Journal articles, white papers, thesis editing, and grant proposals'),
    (cat_id, 'Data Collection & Surveys', 'data-collection-surveys', 'Survey design, data gathering, statistical analysis, and reporting'),
    (cat_id, 'Laboratory Services', 'laboratory-services', 'Lab testing, sample analysis, experimental design, and protocol writing'),
    (cat_id, 'Clinical Research', 'clinical-research', 'Clinical trials, regulatory documentation, and medical research'),
    (cat_id, 'Environmental Science', 'environmental-science', 'EIA reports, environmental monitoring, and sustainability research'),
    (cat_id, 'Social Science Research', 'social-science-research', 'Qualitative/quantitative research, interviews, and behavioral studies'),
    (cat_id, 'Biotechnology Research', 'biotechnology-research', 'Bioinformatics, genetics research, and molecular biology'),
    (cat_id, 'Statistics & Data Modeling', 'statistics-data-modeling', 'SPSS, R, Stata, statistical modeling, and hypothesis testing'),
    (cat_id, 'Peer Review Services', 'peer-review-services', 'Manuscript review, editing, and academic peer review support')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 24. Trades & Services
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'trades-services';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Electrical Services', 'electrical-services', 'Wiring, panel installation, lighting, and electrical repairs'),
    (cat_id, 'Plumbing Services', 'plumbing-services', 'Pipe repair, fixture installation, drainage, and water systems'),
    (cat_id, 'Carpentry & Woodworking', 'carpentry-woodworking', 'Custom furniture, cabinetry, millwork, and wood repairs'),
    (cat_id, 'HVAC Services', 'hvac-services', 'AC/heating installation, maintenance, repair, and duct work'),
    (cat_id, 'Painting & Decorating', 'painting-decorating', 'Interior/exterior painting, wallpaper, and decorative finishes'),
    (cat_id, 'Roofing Services', 'roofing-services', 'Roof installation, repair, inspection, and gutter services'),
    (cat_id, 'Flooring Services', 'flooring-services', 'Hardwood, tile, carpet, laminate installation, and floor refinishing'),
    (cat_id, 'General Contracting', 'general-contracting', 'Home renovation, remodeling, project management, and construction'),
    (cat_id, 'Appliance Repair', 'appliance-repair', 'Refrigerator, washer, dryer, oven repair, and maintenance'),
    (cat_id, 'Handyman Services', 'handyman-services', 'General repairs, home maintenance, assembling furniture, and odd jobs')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 25. Event Planning
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'event-planning';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Wedding Planning', 'wedding-planning', 'Full wedding coordination, vendor management, and day-of coordination'),
    (cat_id, 'Corporate Event Planning', 'corporate-event-planning', 'Conferences, retreats, product launches, and company events'),
    (cat_id, 'Party & Social Events', 'party-social-events', 'Birthday parties, celebrations, themed events, and social gatherings'),
    (cat_id, 'Trade Show Management', 'trade-show-management', 'Booth design, exhibitor coordination, and event logistics'),
    (cat_id, 'Virtual Event Management', 'virtual-event-management', 'Webinars, virtual conferences, live streaming, and online events'),
    (cat_id, 'Event Design & Decor', 'event-design-decor', 'Event styling, floral design, lighting, and set decoration'),
    (cat_id, 'Catering Services', 'catering-services', 'Menu planning, food service, beverage management, and staffing'),
    (cat_id, 'Entertainment Booking', 'entertainment-booking', 'Artist booking, DJ booking, performer management, and talent coordination'),
    (cat_id, 'Venue Management', 'venue-management', 'Venue sourcing, contract negotiation, and space planning'),
    (cat_id, 'Nonprofit Fundraising Events', 'nonprofit-fundraising-events', 'Gala planning, auction management, donor engagement, and benefit events')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 26. Travel & Hospitality
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'travel-hospitality';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Travel Planning', 'travel-planning', 'Itinerary design, trip coordination, and travel research'),
    (cat_id, 'Hotel Management', 'hotel-management', 'Hotel operations, booking management, and guest services'),
    (cat_id, 'Tour Guiding', 'tour-guiding', 'Walking tours, cultural tours, and local experience guiding'),
    (cat_id, 'Vacation Rental Management', 'vacation-rental-management', 'Airbnb management, property listing, guest communication, and cleaning'),
    (cat_id, 'Travel Writing', 'travel-writing', 'Travel blogs, destination guides, and travel content'),
    (cat_id, 'Airline & Flight Services', 'airline-flight-services', 'Flight booking, loyalty programs, and travel logistics'),
    (cat_id, 'Cruise Planning', 'cruise-planning', 'Cruise booking, itinerary planning, and shore excursion coordination'),
    (cat_id, 'Hospitality Consulting', 'hospitality-consulting', 'Hotel consulting, revenue management, and guest experience optimization'),
    (cat_id, 'Culinary Services', 'culinary-services', 'Chef services, menu development, and culinary consulting'),
    (cat_id, 'Wellness Tourism', 'wellness-tourism', 'Wellness retreats, spa services, and health-focused travel experiences')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 27. E-commerce Management
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'ecommerce-management';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Shopify Development', 'shopify-development', 'Theme customization, app integration, and store setup'),
    (cat_id, 'WooCommerce Development', 'woocommerce-development', 'WordPress e-commerce, plugin integration, and store management'),
    (cat_id, 'Amazon FBA & Seller Services', 'amazon-fba-seller-services', 'Product listing, optimization, PPC, and account management'),
    (cat_id, 'Product Listing Optimization', 'product-listing-optimization', 'SEO listings, copywriting, image optimization, and A+ content'),
    (cat_id, 'E-commerce SEO', 'ecommerce-seo', 'Product page SEO, site structure, and e-commerce search optimization'),
    (cat_id, 'Conversion Rate Optimization', 'conversion-rate-optimization', 'CRO, A/B testing, funnel analysis, and checkout optimization'),
    (cat_id, 'Dropshipping Management', 'dropshipping-management', 'Supplier sourcing, order fulfillment, and store automation'),
    (cat_id, 'E-commerce Analytics', 'ecommerce-analytics', 'Revenue analysis, customer behavior tracking, and reporting'),
    (cat_id, 'Online Store Management', 'online-store-management', 'Daily operations, inventory updates, customer service, and order processing'),
    (cat_id, 'Multi-channel Selling', 'multi-channel-selling', 'Omnichannel strategy, marketplace integration, and channel management')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 28. Social Media Management
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'social-media-management';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Social Media Strategy', 'social-media-strategy', 'Platform strategy, content planning, and audience growth'),
    (cat_id, 'Community Management', 'community-management', 'Engagement, moderation, customer interaction, and community building'),
    (cat_id, 'Content Creation for Social', 'content-creation-social', 'Visual content, copywriting, and multimedia for social platforms'),
    (cat_id, 'Influencer Marketing', 'social-influencer-marketing', 'Campaign management, influencer outreach, and brand partnerships'),
    (cat_id, 'Social Media Advertising', 'social-media-advertising', 'Facebook Ads, Instagram Ads, TikTok Ads, and LinkedIn Ads'),
    (cat_id, 'Analytics & Reporting', 'social-analytics-reporting', 'Performance tracking, insights, and actionable reporting'),
    (cat_id, 'LinkedIn Optimization', 'linkedin-optimization', 'Profile optimization, LinkedIn marketing, and B2B lead generation'),
    (cat_id, 'TikTok Marketing', 'tiktok-marketing', 'TikTok strategy, viral content, and TikTok advertising'),
    (cat_id, 'Social Media Audits', 'social-media-audits', 'Account audit, competitor analysis, and improvement recommendations'),
    (cat_id, 'Brand Reputation Management', 'brand-reputation-management', 'Online reputation monitoring, crisis management, and brand sentiment')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 29. Sustainability & Green Tech
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'sustainability-green-tech';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'Environmental Consulting', 'environmental-consulting', 'EIA, environmental auditing, and regulatory compliance'),
    (cat_id, 'Green Energy Solutions', 'green-energy-solutions', 'Solar, wind, renewable energy consulting and implementation'),
    (cat_id, 'Sustainability Reporting', 'sustainability-reporting', 'ESG reporting, carbon footprint analysis, and sustainability metrics'),
    (cat_id, 'Eco-Design', 'eco-design', 'Sustainable product design, circular economy, and green materials'),
    (cat_id, 'Waste Management Consulting', 'waste-management-consulting', 'Waste reduction, recycling programs, and circular economy strategies'),
    (cat_id, 'Carbon Offset Strategy', 'carbon-offset-strategy', 'Carbon credits, net-zero planning, and offset project management'),
    (cat_id, 'Green Building Consulting', 'green-building-consulting', 'LEED certification, energy efficiency, and sustainable architecture'),
    (cat_id, 'Corporate Social Responsibility', 'corporate-social-responsibility', 'CSR strategy, community engagement, and impact reporting'),
    (cat_id, 'Sustainable Agriculture', 'sustainable-agriculture', 'Organic farming, permaculture, and food system sustainability'),
    (cat_id, 'Climate Tech Consulting', 'climate-tech-consulting', 'Climate technology assessment, cleantech innovation, and green startups')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- 30. Customer Experience & UX Research
DO $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM categories WHERE slug = 'customer-experience-ux-research';
  
  INSERT INTO subcategories (category_id, name, slug, description) VALUES
    (cat_id, 'User Research', 'user-research', 'User interviews, surveys, ethnographic research, and persona development'),
    (cat_id, 'Usability Testing', 'usability-testing', 'Moderated/unmoderated testing, A/B testing, and prototype testing'),
    (cat_id, 'Customer Journey Mapping', 'customer-journey-mapping', 'Journey maps, service blueprints, and touchpoint analysis'),
    (cat_id, 'Service Design', 'service-design', 'Service innovation, experience design, and front/backstage processes'),
    (cat_id, 'UX Audits & Reviews', 'ux-audits-reviews', 'Heuristic evaluation, expert review, and UX assessment'),
    (cat_id, 'Information Architecture', 'information-architecture', 'Site mapping, navigation design, content hierarchy, and taxonomy'),
    (cat_id, 'Customer Experience Strategy', 'customer-experience-strategy', 'CX vision, NPS improvement, and customer-centric transformation'),
    (cat_id, 'Accessibility Consulting', 'accessibility-consulting', 'WCAG compliance, inclusive design, and accessibility audits'),
    (cat_id, 'Voice of Customer Programs', 'voice-of-customer-programs', 'VoC program design, feedback analysis, and insight activation'),
    (cat_id, 'UX Research Operations', 'ux-research-operations', 'ResearchOps, participant recruitment, and research repository management')
  ON CONFLICT (slug) DO NOTHING;
END $$;
