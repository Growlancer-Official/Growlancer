-- Fix delete_user_all_data function - replace mismatched table names
-- Errors found:
--   portfolio       → portfolio_items
--   wallet_transactions → (table doesn't exist, remove)
--   client_payment_methods → payment_methods
--   pro_subscriptions  → subscriptions
--   ai_subscriptions   → subscriptions
--   verifications      → (table doesn't exist, remove)

CREATE OR REPLACE FUNCTION public.delete_user_all_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 1. Identify role
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- 2. Delete AI matches (both as freelancer and as project owner)
  DELETE FROM public.ai_matches WHERE freelancer_id = p_user_id;
  DELETE FROM public.ai_matches WHERE project_id IN (
    SELECT id FROM public.projects WHERE client_id = p_user_id
  );

  -- 3. Delete messages (sent or received in any contract)
  DELETE FROM public.messages
    WHERE sender_id = p_user_id
       OR contract_id IN (
           SELECT id FROM public.contracts
            WHERE freelancer_id = p_user_id OR client_id = p_user_id
         );

  -- 4. Delete contract files
  DELETE FROM public.contract_files
    WHERE contract_id IN (
      SELECT id FROM public.contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 5. Delete escrow records
  DELETE FROM public.escrow
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 6. Delete transactions
  DELETE FROM public.transactions WHERE user_id = p_user_id;

  -- 7. Delete disputes
  DELETE FROM public.disputes
    WHERE contract_id IN (
      SELECT id FROM public.contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 8. Delete contracts
  DELETE FROM public.contracts
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 9. Delete proposals (as freelancer OR on own projects)
  DELETE FROM public.proposals
    WHERE freelancer_id = p_user_id
       OR project_id IN (SELECT id FROM public.projects WHERE client_id = p_user_id);

  -- 10. Delete invites (as client OR as freelancer)
  DELETE FROM public.invites
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 11. Delete projects (client only; freelancer has no projects)
  DELETE FROM public.projects WHERE client_id = p_user_id;

  -- 12. Delete services (freelancer)
  DELETE FROM public.services WHERE freelancer_id = p_user_id;

  -- 13. Delete portfolio items (FIXED: was 'portfolio')
  DELETE FROM public.portfolio_items WHERE user_id = p_user_id;

  -- 14. Delete certifications
  DELETE FROM public.certifications WHERE user_id = p_user_id;

  -- 15. Delete reviews (given or received)
  DELETE FROM public.reviews
    WHERE reviewer_id = p_user_id OR reviewee_id = p_user_id;

  -- 16. Delete referrals (referred_by or referred_user)
  DELETE FROM public.referrals
    WHERE referrer_id = p_user_id OR referred_id = p_user_id;

  -- 17. Delete notifications
  DELETE FROM public.notifications WHERE user_id = p_user_id;

  -- 18. Delete wallet (FIXED: removed wallet_transactions - handled by transactions step 6)
  DELETE FROM public.wallets WHERE user_id = p_user_id;

  -- 19. Delete payment methods (FIXED: was 'client_payment_methods')
  DELETE FROM public.payment_methods WHERE user_id = p_user_id;
  DELETE FROM public.payout_methods WHERE user_id = p_user_id;

  -- 20. Delete subscriptions (FIXED: was 'pro_subscriptions' and 'ai_subscriptions')
  DELETE FROM public.subscriptions WHERE user_id = p_user_id;

  -- 21. Delete withdrawal records
  DELETE FROM public.withdrawals WHERE user_id = p_user_id;

  -- 22. Delete time tracking entries
  DELETE FROM public.time_entries
    WHERE contract_id IN (
      SELECT id FROM public.contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 23. Delete deletion requests
  DELETE FROM public.user_deletion_requests WHERE user_id = p_user_id;

  -- 24. Delete role-specific profile
  IF v_role = 'freelancer' THEN
    DELETE FROM public.freelancer_profiles WHERE user_id = p_user_id;
  ELSIF v_role = 'client' THEN
    DELETE FROM public.client_profiles WHERE user_id = p_user_id;
  END IF;

  -- 25. Delete main profile (this will CASCADE delete anything left)
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 26. Delete the auth user (must be last; requires service role)
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', p_user_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
