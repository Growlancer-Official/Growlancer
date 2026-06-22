-- Create test users for browser testing (IDEMPOTENT — safe to re-run)
DO $$
DECLARE
  v_freelancer_id UUID;
  v_client_id UUID;
  v_freelancer_exists BOOLEAN;
  v_client_exists BOOLEAN;
BEGIN
  -- ================================================================
  -- Check if users already exist
  -- ================================================================
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = 'test-freelancer-demo@growlancer.test') INTO v_freelancer_exists;
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = 'test-client-demo@growlancer.test') INTO v_client_exists;

  -- ================================================================
  -- 1. Create/update test freelancer
  -- ================================================================
  IF NOT v_freelancer_exists THEN
    v_freelancer_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_freelancer_id,
      'authenticated',
      'authenticated',
      'test-freelancer-demo@growlancer.test',
      crypt('DemoTest123!', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', 'Demo Freelancer', 'role', 'freelancer'),
      NOW(), NOW(), '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, role, avatar, onboarding_completed, created_at, updated_at)
    VALUES (v_freelancer_id, 'test-freelancer-demo@growlancer.test', 'Demo Freelancer', 'freelancer',
      'https://api.dicebear.com/7.x/avataaars/svg?seed=demo-freelancer', true, NOW(), NOW());

    INSERT INTO public.freelancer_profiles (
      user_id, title, bio, hourly_rate, skills, experience, location,
      portfolio_url, availability, languages, created_at, updated_at
    ) VALUES (
      v_freelancer_id,
      'Senior Full Stack Developer',
      'Senior full-stack developer with 7+ years of experience building web applications using React, Node.js, and PostgreSQL.',
      75,
      ARRAY['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Python', 'AWS', 'GraphQL'],
      7,
      'Austin, TX',
      'https://github.com/demo-freelancer',
      true,
      ARRAY['English', 'French'],
      NOW(), NOW()
    );

    RAISE NOTICE 'Freelancer created: test-freelancer-demo@growlancer.test / DemoTest123!';
  ELSE
    RAISE NOTICE 'Freelancer already exists, skipping';
    SELECT id INTO v_freelancer_id FROM public.profiles WHERE email = 'test-freelancer-demo@growlancer.test';
  END IF;

  -- ================================================================
  -- 2. Create/update test client
  -- ================================================================
  IF NOT v_client_exists THEN
    v_client_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_client_id,
      'authenticated',
      'authenticated',
      'test-client-demo@growlancer.test',
      crypt('DemoTest123!', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', 'Demo Client', 'role', 'client'),
      NOW(), NOW(), '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, role, avatar, onboarding_completed, created_at, updated_at)
    VALUES (v_client_id, 'test-client-demo@growlancer.test', 'Demo Client', 'client',
      'https://api.dicebear.com/7.x/avataaars/svg?seed=demo-client', true, NOW(), NOW());

    INSERT INTO public.client_profiles (user_id, company_name, description, location, created_at, updated_at)
    VALUES (v_client_id, 'TechStartup Inc.',
      'TechStartup Inc. is building next-generation AI-powered analytics tools for e-commerce.',
      'San Francisco, CA', NOW(), NOW());

    RAISE NOTICE 'Client created: test-client-demo@growlancer.test / DemoTest123!';
  ELSE
    RAISE NOTICE 'Client already exists, skipping';
    SELECT id INTO v_client_id FROM public.profiles WHERE email = 'test-client-demo@growlancer.test';
  END IF;

  -- ================================================================
  -- 3. Create test project for client (idempotent)
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE title = 'E-commerce Dashboard Redesign' AND client_id = v_client_id) THEN
    INSERT INTO public.projects (
      client_id, title, description, budget_min, budget_max,
      category, skills_required, experience_level, status, visibility, created_at, updated_at
    ) VALUES (
      v_client_id,
      'E-commerce Dashboard Redesign',
      'Redesign our e-commerce analytics dashboard. React, D3.js, real-time data visualization.',
      5000, 8000,
      'Web Development',
      ARRAY['React', 'TypeScript', 'D3.js', 'Node.js'],
      'intermediate', 'open', 'public', NOW(), NOW()
    );
    RAISE NOTICE 'Test project created for client';
  ELSE
    RAISE NOTICE 'Test project already exists';
  END IF;

  -- ================================================================
  -- 4. Set up referral stats for freelancer
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.referral_stats WHERE user_id = v_freelancer_id) THEN
    INSERT INTO public.referral_stats (user_id, total_referrals, valid_referrals, points, level)
    VALUES (v_freelancer_id, 5, 3, 150, 2);
    RAISE NOTICE 'Referral stats created';
  END IF;

END $$;

-- ================================================================
-- 5. Verify
-- ================================================================
SELECT '--- USERS ---' AS info;
SELECT id, email, name, role FROM public.profiles
WHERE email IN ('test-freelancer-demo@growlancer.test', 'test-client-demo@growlancer.test');

SELECT '--- PROJECT ---' AS info;
SELECT p.title, p.budget_min, p.budget_max, p.status, pr.name AS client_name
FROM public.projects p
JOIN public.profiles pr ON p.client_id = pr.id
WHERE p.title = 'E-commerce Dashboard Redesign';
