-- ================================================================
-- SEED COMPREHENSIVE TEST DATA
-- Populates every section with real backend data for browser testing
-- ================================================================

-- User IDs
-- Freelancer: a07d7cd6-4e9e-4a46-9bdf-62d33171dd17
-- Client: c5250cbf-71fb-4159-92dd-0ae02784bcd0
-- Project: 7cf7c734-c8dc-4f0a-9b94-2dd9163e1d46

DO $$
DECLARE
  v_freelancer_id UUID := 'a07d7cd6-4e9e-4a46-9bdf-62d33171dd17';
  v_client_id UUID := 'c5250cbf-71fb-4159-92dd-0ae02784bcd0';
  v_project_id UUID := '7cf7c734-c8dc-4f0a-9b94-2dd9163e1d46';
  v_contract_id UUID;
  v_invite_id UUID;
  v_proposal_id UUID;
  v_notif_id UUID;
  v_wallet_id UUID;
BEGIN

  -- ================================================================
  -- 1. CREATE SECOND PROJECT (for more variety)
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE title = 'Mobile App Development' AND client_id = v_client_id) THEN
    INSERT INTO public.projects (client_id, title, description, budget_min, budget_max, category, skills_required, experience_level, status, visibility, created_at, updated_at)
    VALUES (v_client_id, 'Mobile App Development', 'Build a cross-platform mobile app for iOS and Android using React Native. Features include user authentication, real-time chat, push notifications, and payment integration.', 8000, 12000, 'Mobile Development', ARRAY['React Native', 'TypeScript', 'Firebase', 'Stripe'], 'expert', 'open', 'public', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');
  END IF;

  -- ================================================================
  -- 2. CREATE INVITES
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.invites WHERE freelancer_id = v_freelancer_id AND project_id = v_project_id) THEN
    INSERT INTO public.invites (freelancer_id, client_id, project_id, status, message, created_at, updated_at, expires_at)
    VALUES (v_freelancer_id, v_client_id, v_project_id, 'pending',
      'We loved your portfolio! Your experience with React and D3.js is exactly what we need for this dashboard redesign. Would you be interested in discussing the project details?',
      NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days');
  END IF;

  -- ================================================================
  -- 3. CREATE PROPOSALS (one pending, one accepted)
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE freelancer_id = v_freelancer_id) THEN
    -- Get another project ID for the proposal
    DECLARE v_other_project_id UUID;
    BEGIN
      SELECT id INTO v_other_project_id FROM public.projects WHERE title = 'Mobile App Development' AND client_id = v_client_id LIMIT 1;
      
      IF v_other_project_id IS NOT NULL THEN
        INSERT INTO public.proposals (freelancer_id, project_id, proposed_rate, rate_type, estimated_duration, message, status, application_type, created_at, updated_at)
        VALUES (v_freelancer_id, v_other_project_id, 9000, 'fixed', 45,
          'I have extensive experience building cross-platform mobile apps with React Native. I''ve delivered 10+ apps to both App Store and Google Play. I can start immediately and deliver within 45 days.',
          'pending', 'standard', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');
      END IF;
    END;
  END IF;

  -- ================================================================
  -- 4. CREATE CONTRACT + MILESTONES + WALLET + TRANSACTIONS
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE freelancer_id = v_freelancer_id) THEN
    -- Insert contract
    INSERT INTO public.contracts (project_id, freelancer_id, client_id, amount, platform_fee, freelancer_amount, status, start_date, end_date, milestones, created_at, updated_at)
    VALUES (v_project_id, v_freelancer_id, v_client_id, 6500, 325, 6175, 'active', NOW() - INTERVAL '14 days', NOW() + INTERVAL '30 days',
      jsonb_build_array(
        jsonb_build_object('title', 'UI/UX Design & Wireframes', 'description', 'Deliver complete Figma mockups for all 8 dashboard screens', 'amount', 1500, 'status', 'completed', 'due_date', (NOW() - INTERVAL '7 days')::text),
        jsonb_build_object('title', 'Frontend Implementation', 'description', 'Implement all dashboard components in React with TypeScript and Tailwind CSS', 'amount', 2500, 'status', 'in_progress', 'due_date', (NOW() + INTERVAL '10 days')::text),
        jsonb_build_object('title', 'Backend API Integration', 'description', 'Connect to Supabase backend, implement real-time sync and data visualization', 'amount', 1500, 'status', 'pending', 'due_date', (NOW() + INTERVAL '20 days')::text),
        jsonb_build_object('title', 'Testing & Deployment', 'description', 'Write unit tests, E2E tests, and deploy to production', 'amount', 1000, 'status', 'pending', 'due_date', (NOW() + INTERVAL '30 days')::text)
      ),
      NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days')
      RETURNING id INTO v_contract_id;

    -- Create/update wallet for freelancer
    INSERT INTO public.wallets (user_id, balance, pending_balance, created_at, updated_at)
    VALUES (v_freelancer_id, 6175, 1500, NOW() - INTERVAL '14 days', NOW())
    ON CONFLICT (user_id) DO UPDATE SET balance = 6175, pending_balance = 1500, updated_at = NOW()
    RETURNING id INTO v_wallet_id;

    -- Create escrow entry for the contract
    INSERT INTO public.escrow (contract_id, freelancer_id, client_id, amount, status, created_at, updated_at)
    VALUES (v_contract_id, v_freelancer_id, v_client_id, 1500, 'funded', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days');

    -- Create transaction records (credits from escrow releases)
    INSERT INTO public.transactions (user_id, contract_id, amount, type, status, source, description, created_at)
    VALUES (v_freelancer_id, v_contract_id, 1500, 'credit', 'completed', 'escrow', 'Payment received for milestone: UI/UX Design & Wireframes', NOW() - INTERVAL '5 days');

    -- Create a withdrawal (completed)
    INSERT INTO public.withdrawals (user_id, amount, fee, net_amount, method, status, created_at, updated_at)
    VALUES (v_freelancer_id, 500, 14.50, 485.50, 'paypal', 'completed', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days');

    -- Create a pending withdrawal
    INSERT INTO public.withdrawals (user_id, amount, fee, net_amount, method, status, created_at, updated_at)
    VALUES (v_freelancer_id, 800, 23.20, 776.80, 'paypal', 'pending', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day');
  END IF;

  -- ================================================================
  -- 5. CREATE NOTIFICATIONS
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_freelancer_id LIMIT 1) THEN
    INSERT INTO public.notifications (user_id, type, title, message, read, created_at)
    VALUES 
      (v_freelancer_id, 'contract', 'Milestone Completed', 'The milestone "UI/UX Design & Wireframes" has been marked as completed. Release payment when satisfied.', false, NOW() - INTERVAL '5 days'),
      (v_freelancer_id, 'invite', 'New Project Invitation', 'You have been invited to the project "E-commerce Dashboard Redesign" by Demo Client.', false, NOW() - INTERVAL '1 day'),
      (v_freelancer_id, 'proposal', 'Proposal Under Review', 'Your proposal for "Mobile App Development" is being reviewed by the client.', false, NOW() - INTERVAL '2 days'),
      (v_freelancer_id, 'payment', 'Payment Received', 'You received $1,500.00 for milestone completion on E-commerce Dashboard Redesign.', false, NOW() - INTERVAL '5 days'),
      (v_freelancer_id, 'system', 'Profile Completion', 'Complete your profile to get 2x more project matches!', true, NOW() - INTERVAL '7 days');

    -- Also create notifications for client
    INSERT INTO public.notifications (user_id, type, title, message, read, created_at)
    VALUES 
      (v_client_id, 'proposal', 'New Proposal Received', 'Demo Freelancer has submitted a proposal for your project "Mobile App Development".', false, NOW() - INTERVAL '2 days'),
      (v_client_id, 'contract', 'Contract Active', 'The contract for "E-commerce Dashboard Redesign" is now active with Demo Freelancer.', false, NOW() - INTERVAL '14 days'),
      (v_client_id, 'system', 'Welcome to Growlancer', 'Welcome! Post your first project to find top freelance talent.', true, NOW() - INTERVAL '30 days');
  END IF;

  -- ================================================================
  -- 6. CREATE REFERRAL STATS (already created via migration but ensure)
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.referral_stats WHERE user_id = v_freelancer_id) THEN
    INSERT INTO public.referral_stats (user_id, total_referrals, valid_referrals, points, level)
    VALUES (v_freelancer_id, 8, 6, 320, 3);
  ELSE
    UPDATE public.referral_stats SET total_referrals = 8, valid_referrals = 6, points = 320, level = 3
    WHERE user_id = v_freelancer_id;
  END IF;

  -- Create some referral stats for leaderboard (other users)
  IF NOT EXISTS (SELECT 1 FROM public.referral_stats WHERE user_id != v_freelancer_id LIMIT 1) THEN
    -- Note: These won't show in leaderboard if the users don't exist, but just in case
    INSERT INTO public.referral_stats (user_id, total_referrals, valid_referrals, points, level)
    VALUES 
      ('00000000-0000-0000-0000-000000000001', 15, 12, 580, 5),
      ('00000000-0000-0000-0000-000000000002', 10, 8, 410, 4),
      ('00000000-0000-0000-0000-000000000003', 6, 5, 250, 2)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- ================================================================
  -- 7. CREATE SUBSCRIPTION PLANS (if empty) + FREELANCER SUBSCRIPTION
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = v_freelancer_id) THEN
    -- Get the free plan ID
    DECLARE v_free_plan_id UUID;
    BEGIN
      SELECT id INTO v_free_plan_id FROM public.subscription_plans WHERE price = 0 AND role = 'freelancer' LIMIT 1;
      
      IF v_free_plan_id IS NOT NULL THEN
        INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at)
        VALUES (v_freelancer_id, v_free_plan_id, 'active', NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days');
      END IF;
    END;
  END IF;

  -- ================================================================
  -- 8. CREATE MESSAGES for the contract
  -- ================================================================
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = v_freelancer_id LIMIT 1) LIMIT 1) THEN
    DECLARE v_msg_contract_id UUID;
    BEGIN
      SELECT id INTO v_msg_contract_id FROM public.contracts WHERE freelancer_id = v_freelancer_id LIMIT 1;
      
      IF v_msg_contract_id IS NOT NULL THEN
        INSERT INTO public.messages (contract_id, sender_id, content, message_type, created_at)
        VALUES 
          (v_msg_contract_id, v_client_id, 'Hi! Welcome to the project. I''m excited to get started on the dashboard redesign. Let me know if you have any questions about the requirements.', 'text', NOW() - INTERVAL '13 days'),
          (v_msg_contract_id, v_freelancer_id, 'Thank you! I''ve reviewed the requirements and I''m confident we can deliver an outstanding result. I''ll start working on the wireframes and share them by end of week.', 'text', NOW() - INTERVAL '12 days'),
          (v_msg_contract_id, v_client_id, 'That sounds great! Looking forward to seeing the wireframes. Do you need access to our current analytics dashboard?', 'text', NOW() - INTERVAL '11 days'),
          (v_msg_contract_id, v_freelancer_id, 'Yes, that would be very helpful! Please share read-only access and I can start analyzing the data structure.', 'text', NOW() - INTERVAL '10 days'),
          (v_msg_contract_id, v_client_id, 'Great! I just shared access. The wireframes you shared look amazing — exactly what we had in mind!', 'text', NOW() - INTERVAL '6 days'),
          (v_msg_contract_id, v_freelancer_id, 'Glad you like them! I''ve started on the frontend implementation. The components are coming together nicely.', 'text', NOW() - INTERVAL '3 days');
      END IF;
    END;
  END IF;

  RAISE NOTICE '===============================================';
  RAISE NOTICE '✅ SEED DATA COMPLETED SUCCESSFULLY';
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Seeded: invites, proposals, contracts, milestones,';
  RAISE NOTICE 'wallet, transactions, withdrawals, notifications,';
  RAISE NOTICE 'referral stats, messages, and subscriptions.';
  RAISE NOTICE '===============================================';

END $$;
