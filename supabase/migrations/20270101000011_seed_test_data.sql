-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Realistic test data for launch QA
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Guard: skip seed data in production to prevent fake wallets/portfolio
  -- from leaking to real users. This migration is for local/staging QA only.
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE NOTICE 'Skipping seed data in production environment';
    RETURN;
  END IF;

  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  -- ═══ SERVICES for Wyman (Full Stack Developer) ═══
  INSERT INTO services (freelancer_id, title, description, category, price, price_type, delivery_days, revisions, tags, status, active, features, packages, currency)
  VALUES
    ('3baa9544-29db-4c17-8b81-812a61921d5c',
     'Build a Modern React Dashboard',
     'I will build a fully responsive, production-ready React dashboard with real-time data visualization, authentication, and role-based access.',
     'Web Development', 45000, 'fixed', 14, 3,
     ARRAY['React', 'TypeScript', 'Dashboard', 'Supabase', 'Tailwind'],
     'active', true,
     '["Responsive design for all devices", "Authentication and role-based access", "Real-time data updates", "Dark/Light mode toggle", "Export to PDF/CSV"]'::jsonb,
     '[{"name": "Basic", "price": 25000, "description": "Simple dashboard with 3 pages", "delivery_days": 7, "revisions": 2}, {"name": "Standard", "price": 45000, "description": "Full dashboard with 8 pages, auth, real-time data", "delivery_days": 14, "revisions": 3}, {"name": "Premium", "price": 80000, "description": "Enterprise dashboard with 15+ pages, analytics, API integration", "delivery_days": 21, "revisions": 5}]'::jsonb,
     'INR'),
    ('3baa9544-29db-4c17-8b81-812a61921d5c',
     'Full Stack SaaS Application Development',
     'End-to-end SaaS product development including frontend, backend, database design, authentication, payments integration, and deployment.',
     'Software Development', 150000, 'fixed', 30, 5,
     ARRAY['SaaS', 'Full Stack', 'Node.js', 'React', 'PostgreSQL'],
     'active', true,
     '["Complete SaaS architecture", "Payment integration (Razorpay/PayPal)", "Admin panel included", "CI/CD deployment", "30 days free support"]'::jsonb,
     '[{"name": "MVP", "price": 80000, "description": "Core SaaS features, 5 pages, basic auth", "delivery_days": 21, "revisions": 3}, {"name": "Growth", "price": 150000, "description": "Full SaaS with payments, admin, analytics", "delivery_days": 30, "revisions": 5}, {"name": "Enterprise", "price": 300000, "description": "Complete platform with multi-tenancy, API, white-label", "delivery_days": 45, "revisions": 8}]'::jsonb,
     'INR'),
  -- ═══ SERVICES for pemin (UI/UX Designer) ═══
    ('e3048ee4-703d-48a0-831d-b74cb166c53e',
     'Professional UI/UX Design for Web and Mobile',
     'I will design a beautiful, intuitive user interface for your web app or mobile app. From wireframes to high-fidelity prototypes in Figma.',
     'Design & Creative', 35000, 'fixed', 10, 3,
     ARRAY['UI/UX', 'Figma', 'Prototyping', 'Web Design', 'Mobile Design'],
     'active', true,
     '["User research and persona creation", "Wireframes and user flow mapping", "High-fidelity Figma prototypes", "Interactive click-through demo", "Design system documentation"]'::jsonb,
     '[{"name": "Wireframes", "price": 15000, "description": "Low-fi wireframes for up to 5 screens", "delivery_days": 5, "revisions": 2}, {"name": "UI Design", "price": 35000, "description": "High-fi designs for up to 10 screens with prototype", "delivery_days": 10, "revisions": 3}, {"name": "Full Design System", "price": 70000, "description": "Complete design system with 20+ screens", "delivery_days": 20, "revisions": 5}]'::jsonb,
     'INR'),
    ('e3048ee4-703d-48a0-831d-b74cb166c53e',
     'Brand Identity and Logo Design',
     'Complete brand identity package including logo design, color palette, typography, and brand guidelines.',
     'Design & Creative', 25000, 'fixed', 7, 2,
     ARRAY['Logo', 'Branding', 'Identity', 'Graphic Design'],
     'active', true,
     '["3 unique logo concepts", "Unlimited revisions on chosen concept", "All file formats (SVG, PNG, PDF)", "Brand color palette", "Brand guidelines document"]'::jsonb,
     '[{"name": "Logo Only", "price": 15000, "description": "3 logo concepts with 2 revisions", "delivery_days": 5, "revisions": 2}, {"name": "Brand Starter", "price": 25000, "description": "Logo + colors + typography + guidelines", "delivery_days": 7, "revisions": 3}, {"name": "Full Brand Kit", "price": 50000, "description": "Complete identity with stationery, social kit, brand book", "delivery_days": 14, "revisions": 5}]'::jsonb,
     'INR'),
  -- ═══ SERVICES for piveme (Digital Marketing) ═══
    ('89ce29dc-1d66-44be-a822-efd7b4b8f50b',
     'SEO Optimization and Strategy',
     'I will create and implement a comprehensive SEO strategy for your website. Includes technical SEO audit, keyword research, on-page optimization.',
     'Digital Marketing', 20000, 'fixed', 14, 2,
     ARRAY['SEO', 'Google', 'Keywords', 'Content Strategy', 'Analytics'],
     'active', true,
     '["Complete technical SEO audit", "Keyword research (50+ keywords)", "On-page optimization guide", "Content calendar (30 days)", "Monthly ranking report"]'::jsonb,
     '[{"name": "Quick Audit", "price": 8000, "description": "Technical SEO audit with actionable report", "delivery_days": 3, "revisions": 1}, {"name": "Full Strategy", "price": 20000, "description": "Audit + keyword research + 30-day content plan", "delivery_days": 14, "revisions": 2}, {"name": "Growth Plan", "price": 40000, "description": "3-month SEO management with weekly reporting", "delivery_days": 30, "revisions": 4}]'::jsonb,
     'INR')
  ON CONFLICT DO NOTHING;

  -- ═══ PORTFOLIO ITEMS (using correct column names) ═══
  INSERT INTO portfolio_items (user_id, title, description, project_url, technologies_used, created_at)
  VALUES
    ('3baa9544-29db-4c17-8b81-812a61921d5c', 'E-Commerce SaaS Platform', 'Built a complete multi-vendor e-commerce platform with real-time inventory, payment processing, and admin dashboard.', 'https://demo.growlancer.com/ecommerce', ARRAY['React', 'Node.js', 'PostgreSQL', 'Stripe'], now()),
    ('3baa9544-29db-4c17-8b81-812a61921d5c', 'Healthcare Analytics Dashboard', 'Real-time healthcare analytics platform for hospital management. Tracks patient flow and treatment outcomes.', 'https://demo.growlancer.com/healthcare', ARRAY['React', 'D3.js', 'Python', 'FastAPI'], now()),
    ('e3048ee4-703d-48a0-831d-b74cb166c53e', 'Fintech Mobile App Redesign', 'Redesigned a banking mobile app used by 500K+ users. Improved task completion rate by 35%.', 'https://dribbble.com/shots/fintech', ARRAY['Figma', 'Prototyping', 'User Research'], now())
  ON CONFLICT DO NOTHING;

  -- ═══ WALLETS ═══
  INSERT INTO wallets (user_id, balance, currency)
  VALUES
    ('3baa9544-29db-4c17-8b81-812a61921d5c', 12500, 'INR'),
    ('e3048ee4-703d-48a0-831d-b74cb166c53e', 8000, 'INR'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 250000, 'INR')
  ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance;

  -- ⚠️ SUBSCRIPTION PLANS intentionally NOT seeded here.
  -- The single canonical plan (premium_monthly, ₹299) is seeded by the
  -- base migration. Test-data seeds must NEVER touch subscription_plans
  -- to avoid duplicate/incorrect plans with pay-to-win features.

END $$;
