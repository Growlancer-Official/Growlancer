-- Seed invites, proposals, notifications, referral stats
DO $$
DECLARE
  v_freelancer_id UUID := 'a07d7cd6-4e9e-4a46-9bdf-62d33171dd17';
  v_client_id UUID := 'c5250cbf-71fb-4159-92dd-0ae02784bcd0';
  v_project_id UUID := '7cf7c734-c8dc-4f0a-9b94-2dd9163e1d46';
  v_other_project_id UUID;
BEGIN
  -- Get or create second project
  SELECT id INTO v_other_project_id FROM projects WHERE title = 'Mobile App Development' AND client_id = v_client_id LIMIT 1;
  
  IF v_other_project_id IS NULL THEN
    INSERT INTO projects (client_id, title, description, budget_min, budget_max, category, skills_required, experience_level, status, visibility, created_at, updated_at)
    VALUES (v_client_id, 'Mobile App Development', 'Build a cross-platform mobile app for iOS and Android using React Native.', 8000, 12000, 'Mobile Development', ARRAY['React Native', 'TypeScript', 'Firebase'], 'expert', 'open', 'public', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
    RETURNING id INTO v_other_project_id;
  END IF;

  -- Invite
  IF NOT EXISTS (SELECT 1 FROM invites WHERE freelancer_id = v_freelancer_id AND project_id = v_project_id) THEN
    INSERT INTO invites (freelancer_id, client_id, project_id, status, message, created_at, updated_at, expires_at)
    VALUES (v_freelancer_id, v_client_id, v_project_id, 'pending',
      'We loved your portfolio! Your experience with React and D3.js is exactly what we need.',
      NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days');
  END IF;

  -- Proposals (pending)
  IF v_other_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proposals WHERE freelancer_id = v_freelancer_id) THEN
    INSERT INTO proposals (freelancer_id, project_id, proposed_rate, rate_type, estimated_duration, message, status, application_type, created_at, updated_at)
    VALUES (v_freelancer_id, v_other_project_id, 9000, 'fixed', 45,
      'I have extensive experience building cross-platform mobile apps with React Native. I have delivered 10+ apps to both App Store and Google Play.',
      'pending', 'standard', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');
  END IF;

  -- Notifications for freelancer
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = v_freelancer_id LIMIT 1) THEN
    INSERT INTO notifications (user_id, type, title, message, read, created_at) VALUES
      (v_freelancer_id, 'contract', 'Milestone Completed', 'The milestone UI/UX Design & Wireframes has been completed.', false, NOW() - INTERVAL '5 days'),
      (v_freelancer_id, 'invite', 'New Project Invitation', 'You have been invited to E-commerce Dashboard Redesign by Demo Client.', false, NOW() - INTERVAL '1 day'),
      (v_freelancer_id, 'proposal', 'Proposal Under Review', 'Your proposal for Mobile App Development is being reviewed.', false, NOW() - INTERVAL '2 days'),
      (v_freelancer_id, 'payment', 'Payment Received', 'You received $1,500.00 for milestone completion.', false, NOW() - INTERVAL '5 days'),
      (v_freelancer_id, 'system', 'Profile Completion', 'Complete your profile to get 2x more project matches!', true, NOW() - INTERVAL '7 days');
  END IF;

  -- Notifications for client
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = v_client_id LIMIT 1) THEN
    INSERT INTO notifications (user_id, type, title, message, read, created_at) VALUES
      (v_client_id, 'proposal', 'New Proposal Received', 'Demo Freelancer has submitted a proposal for Mobile App Development.', false, NOW() - INTERVAL '2 days'),
      (v_client_id, 'contract', 'Contract Active', 'Contract for E-commerce Dashboard Redesign is now active.', false, NOW() - INTERVAL '14 days'),
      (v_client_id, 'system', 'Welcome to Growlancer', 'Welcome! Post your first project to find top freelance talent.', true, NOW() - INTERVAL '30 days');
  END IF;

  -- Referral stats
  INSERT INTO referral_stats (user_id, total_referrals, valid_referrals, points, level)
  VALUES (v_freelancer_id, 8, 6, 320, 3)
  ON CONFLICT (user_id) DO UPDATE SET total_referrals = 8, valid_referrals = 6, points = 320, level = 3;

  -- Messages for contract
  IF NOT EXISTS (SELECT 1 FROM messages WHERE sender_id = v_client_id AND contract_id IN (SELECT id FROM contracts WHERE freelancer_id = v_freelancer_id LIMIT 1) LIMIT 1) THEN
    DECLARE v_contract_id UUID;
    BEGIN
      SELECT id INTO v_contract_id FROM contracts WHERE freelancer_id = v_freelancer_id LIMIT 1;
      IF v_contract_id IS NOT NULL THEN
        INSERT INTO messages (contract_id, sender_id, content, message_type, created_at) VALUES
          (v_contract_id, v_client_id, 'Hi! Welcome to the project. I am excited to get started on the dashboard redesign.', 'text', NOW() - INTERVAL '13 days'),
          (v_contract_id, v_freelancer_id, 'Thank you! I have reviewed the requirements and will start working on the wireframes.', 'text', NOW() - INTERVAL '12 days'),
          (v_contract_id, v_client_id, 'The wireframes look amazing! Exactly what we had in mind.', 'text', NOW() - INTERVAL '6 days'),
          (v_contract_id, v_freelancer_id, 'Glad you like them! I have started on the frontend implementation.', 'text', NOW() - INTERVAL '3 days');
      END IF;
    END;
  END IF;

  RAISE NOTICE '✅ Invites, proposals, notifications, referral stats, messages seeded';
END $$;
