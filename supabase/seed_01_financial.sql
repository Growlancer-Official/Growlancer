-- Seed contract + wallet + escrow + transactions + withdrawals
DO $$
DECLARE
  v_contract_id UUID;
  v_freelancer_id UUID := 'a07d7cd6-4e9e-4a46-9bdf-62d33171dd17';
  v_client_id UUID := 'c5250cbf-71fb-4159-92dd-0ae02784bcd0';
  v_project_id UUID := '7cf7c734-c8dc-4f0a-9b94-2dd9163e1d46';
BEGIN
  -- Contract (if not exists)
  IF NOT EXISTS (SELECT 1 FROM contracts WHERE freelancer_id = v_freelancer_id) THEN
    INSERT INTO contracts (project_id, freelancer_id, client_id, amount, platform_fee, freelancer_amount, status, start_date, end_date, milestones, created_at, updated_at)
    VALUES (v_project_id, v_freelancer_id, v_client_id, 6500, 325, 6175, 'active', NOW() - INTERVAL '14 days', NOW() + INTERVAL '30 days',
      jsonb_build_array(
        jsonb_build_object('title', 'UI/UX Design & Wireframes', 'description', 'Deliver complete Figma mockups for all 8 dashboard screens', 'amount', 1500, 'status', 'completed', 'due_date', (NOW() - INTERVAL '7 days')::text),
        jsonb_build_object('title', 'Frontend Implementation', 'description', 'Implement all dashboard components in React with TypeScript', 'amount', 2500, 'status', 'in_progress', 'due_date', (NOW() + INTERVAL '10 days')::text),
        jsonb_build_object('title', 'Backend API Integration', 'description', 'Connect to Supabase backend and implement real-time sync', 'amount', 1500, 'status', 'pending', 'due_date', (NOW() + INTERVAL '20 days')::text),
        jsonb_build_object('title', 'Testing & Deployment', 'description', 'Write unit tests, E2E tests, and deploy to production', 'amount', 1000, 'status', 'pending', 'due_date', (NOW() + INTERVAL '30 days')::text)
      ),
      NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days')
    RETURNING id INTO v_contract_id;
  ELSE
    SELECT id INTO v_contract_id FROM contracts WHERE freelancer_id = v_freelancer_id LIMIT 1;
  END IF;

  -- Wallet
  INSERT INTO wallets (user_id, balance, pending_balance, created_at, updated_at)
  VALUES (v_freelancer_id, 6175, 1500, NOW() - INTERVAL '14 days', NOW())
  ON CONFLICT (user_id) DO UPDATE SET balance = GREATEST(wallets.balance, 6175), pending_balance = GREATEST(wallets.pending_balance, 1500);

  -- Escrow
  IF NOT EXISTS (SELECT 1 FROM escrow WHERE contract_id = v_contract_id) THEN
    INSERT INTO escrow (contract_id, freelancer_id, client_id, amount, status)
    VALUES (v_contract_id, v_freelancer_id, v_client_id, 1500, 'funded');
  END IF;

  -- Transaction (credit)
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE user_id = v_freelancer_id AND source = 'escrow') THEN
    INSERT INTO transactions (user_id, contract_id, amount, type, status, source, description, created_at)
    VALUES (v_freelancer_id, v_contract_id, 1500, 'credit', 'completed', 'escrow', 'Payment received for milestone: UI/UX Design & Wireframes', NOW() - INTERVAL '5 days');
  END IF;

  -- Withdrawal (completed)
  IF NOT EXISTS (SELECT 1 FROM withdrawals WHERE user_id = v_freelancer_id AND status = 'completed') THEN
    INSERT INTO withdrawals (user_id, amount, fee, net_amount, method, status, created_at, updated_at)
    VALUES (v_freelancer_id, 500, 14.50, 485.50, 'paypal', 'completed', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days');
  END IF;

  -- Withdrawal (pending)
  IF NOT EXISTS (SELECT 1 FROM withdrawals WHERE user_id = v_freelancer_id AND status = 'pending') THEN
    INSERT INTO withdrawals (user_id, amount, fee, net_amount, method, status, created_at, updated_at)
    VALUES (v_freelancer_id, 800, 23.20, 776.80, 'paypal', 'pending', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day');
  END IF;

  RAISE NOTICE '✅ Financial data seeded successfully';
END $$;
