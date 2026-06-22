-- ============================================================
-- GROWLANCER: Complete Account Hard-Delete System
-- Run in Supabase SQL Editor
-- ============================================================

-- Drop old soft-delete function if needed (no-op if not exists)
DROP FUNCTION IF EXISTS request_account_deletion(UUID, TEXT);

-- ============================================================
-- FUNCTION: delete_user_all_data
-- Called by Service Role only (Edge Function)
-- Deletes every row belonging to the user across all tables
-- and then removes the auth.users entry.
-- ============================================================
CREATE OR REPLACE FUNCTION delete_user_all_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 1. Identify role
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- 2. Delete AI matches (both as freelancer and as project owner)
  DELETE FROM ai_matches WHERE freelancer_id = p_user_id;
  DELETE FROM ai_matches WHERE project_id IN (
    SELECT id FROM projects WHERE client_id = p_user_id
  );

  -- 3. Delete messages (sent or received in any contract)
  DELETE FROM messages
    WHERE sender_id = p_user_id
       OR contract_id IN (
           SELECT id FROM contracts
            WHERE freelancer_id = p_user_id OR client_id = p_user_id
         );

  -- 4. Delete contract files
  DELETE FROM contract_files
    WHERE contract_id IN (
      SELECT id FROM contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 5. Delete escrow records
  DELETE FROM escrow
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 6. Delete transactions
  DELETE FROM transactions WHERE user_id = p_user_id;

  -- 7. Delete disputes
  DELETE FROM disputes
    WHERE contract_id IN (
      SELECT id FROM contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 8. Delete contracts
  DELETE FROM contracts
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 9. Delete proposals (as freelancer OR on own projects)
  DELETE FROM proposals
    WHERE freelancer_id = p_user_id
       OR project_id IN (SELECT id FROM projects WHERE client_id = p_user_id);

  -- 10. Delete invites (as client OR as freelancer)
  DELETE FROM invites
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 11. Delete projects (client only; freelancer has no projects)
  DELETE FROM projects WHERE client_id = p_user_id;

  -- 12. Delete services (freelancer)
  DELETE FROM services WHERE freelancer_id = p_user_id;

  -- 13. Delete portfolio items
  DELETE FROM portfolio WHERE user_id = p_user_id;

  -- 14. Delete certifications
  DELETE FROM certifications WHERE user_id = p_user_id;

  -- 15. Delete reviews (given or received)
  DELETE FROM reviews
    WHERE reviewer_id = p_user_id OR reviewee_id = p_user_id;

  -- 16. Delete referrals (referred_by or referred_user)
  DELETE FROM referrals
    WHERE referrer_id = p_user_id OR referred_id = p_user_id;

  -- 17. Delete notifications
  DELETE FROM notifications WHERE user_id = p_user_id;

  -- 18. Delete wallet / wallet_transactions
  DELETE FROM wallet_transactions
    WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = p_user_id);
  DELETE FROM wallets WHERE user_id = p_user_id;

  -- 19. Delete payment methods
  DELETE FROM client_payment_methods WHERE user_id = p_user_id;

  -- 20. Delete pro subscriptions
  DELETE FROM pro_subscriptions WHERE user_id = p_user_id;

  -- 21. Delete AI subscription
  DELETE FROM ai_subscriptions WHERE user_id = p_user_id;

  -- 22. Delete verification records
  DELETE FROM verifications WHERE user_id = p_user_id;

  -- 23. Delete time tracking entries
  DELETE FROM time_entries
    WHERE contract_id IN (
      SELECT id FROM contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 24. Delete deletion requests
  DELETE FROM user_deletion_requests WHERE user_id = p_user_id;

  -- 25. Delete role-specific profile
  IF v_role = 'freelancer' THEN
    DELETE FROM freelancer_profiles WHERE user_id = p_user_id;
  ELSIF v_role = 'client' THEN
    DELETE FROM client_profiles WHERE user_id = p_user_id;
  END IF;

  -- 26. Delete main profile (this will CASCADE delete anything left)
  DELETE FROM profiles WHERE id = p_user_id;

  -- 27. Delete the auth user (must be last; requires service role)
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', p_user_id);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute to service role only (called from Edge Function)
REVOKE ALL ON FUNCTION delete_user_all_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_user_all_data(UUID) FROM anon;
REVOKE ALL ON FUNCTION delete_user_all_data(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION delete_user_all_data(UUID) TO service_role;

-- ============================================================
-- Keep cancel_account_deletion for backward compatibility
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_account_deletion(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op: immediate deletion doesn't use the old request table
  RETURN jsonb_build_object('success', true, 'message', 'No pending deletion request to cancel');
END;
$$;
