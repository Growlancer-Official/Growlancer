-- COMPREHENSIVE FIX: delete_user_all_data
-- 1. Fix referred_id → referred_user_id
-- 2. Add 22 missing tables for complete user data cleanup

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

  -- 2. Delete AI matches
  DELETE FROM public.ai_matches WHERE freelancer_id = p_user_id;
  DELETE FROM public.ai_matches WHERE project_id IN (
    SELECT id FROM public.projects WHERE client_id = p_user_id
  );

  -- 3. Delete project_matches (for freelancer)
  DELETE FROM public.project_matches WHERE freelancer_id = p_user_id;

  -- 4. Delete messages
  DELETE FROM public.messages
    WHERE sender_id = p_user_id
       OR contract_id IN (
           SELECT id FROM public.contracts
            WHERE freelancer_id = p_user_id OR client_id = p_user_id
         );

  -- 5. Delete contract files
  DELETE FROM public.contract_files
    WHERE contract_id IN (
      SELECT id FROM public.contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 6. Delete escrow records
  DELETE FROM public.escrow
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 7. Delete transactions
  DELETE FROM public.transactions WHERE user_id = p_user_id;

  -- 8. Delete connects_transactions
  DELETE FROM public.connects_transactions WHERE user_id = p_user_id;

  -- 9. Delete disputes
  DELETE FROM public.disputes
    WHERE contract_id IN (
      SELECT id FROM public.contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 10. Delete contracts
  DELETE FROM public.contracts
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 11. Delete proposals
  DELETE FROM public.proposals
    WHERE freelancer_id = p_user_id
       OR project_id IN (SELECT id FROM public.projects WHERE client_id = p_user_id);

  -- 12. Delete invites
  DELETE FROM public.invites
    WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- 13. Delete projects + contests (client)
  DELETE FROM public.projects WHERE client_id = p_user_id;
  DELETE FROM public.contests WHERE client_id = p_user_id;
  DELETE FROM public.contest_submissions WHERE freelancer_id = p_user_id;
  DELETE FROM public.contest_comments WHERE user_id = p_user_id;
  DELETE FROM public.contest_votes WHERE user_id = p_user_id;

  -- 14. Delete services (freelancer)
  DELETE FROM public.services WHERE freelancer_id = p_user_id;

  -- 15. Delete portfolio / certifications / skills / education / employment
  DELETE FROM public.portfolio_items WHERE user_id = p_user_id;
  DELETE FROM public.certifications WHERE user_id = p_user_id;
  DELETE FROM public.skill_certifications WHERE user_id = p_user_id;
  DELETE FROM public.freelancer_skills WHERE freelancer_id = p_user_id;
  DELETE FROM public.education_history WHERE user_id = p_user_id;
  DELETE FROM public.employment_history WHERE user_id = p_user_id;

  -- 16. Delete reviews (given or received)
  DELETE FROM public.reviews
    WHERE reviewer_id = p_user_id OR reviewee_id = p_user_id;

  -- 17. Delete review_replies
  DELETE FROM public.review_replies WHERE user_id = p_user_id;

  -- 18. Delete referrals AND referral_stats (FIXED: referred_id → referred_user_id)
  DELETE FROM public.referrals
    WHERE referrer_id = p_user_id OR referred_user_id = p_user_id;
  DELETE FROM public.referral_stats WHERE user_id = p_user_id;

  -- 19. Delete skill_endorsements
  DELETE FROM public.skill_endorsements
    WHERE endorsed_user_id = p_user_id OR endorsed_by_user_id = p_user_id;

  -- 20. Delete notifications
  DELETE FROM public.notifications WHERE user_id = p_user_id;

  -- 21. Delete wallet / payment / subscription / withdrawal data
  DELETE FROM public.wallets WHERE user_id = p_user_id;
  DELETE FROM public.payment_methods WHERE user_id = p_user_id;
  DELETE FROM public.payout_methods WHERE user_id = p_user_id;
  DELETE FROM public.subscriptions WHERE user_id = p_user_id;
  DELETE FROM public.withdrawals WHERE user_id = p_user_id;
  DELETE FROM public.paypal_orders WHERE user_id = p_user_id;

  -- 22. Delete saved_searches
  DELETE FROM public.saved_searches WHERE user_id = p_user_id;

  -- 23. Delete workspace data
  DELETE FROM public.workspace_tasks WHERE created_by = p_user_id;
  DELETE FROM public.workspace_notes WHERE created_by = p_user_id;

  -- 24. Delete time tracking
  DELETE FROM public.time_entries
    WHERE contract_id IN (
      SELECT id FROM public.contracts
       WHERE freelancer_id = p_user_id OR client_id = p_user_id
    );

  -- 25. Delete security/auth related data
  DELETE FROM public.user_deletion_requests WHERE user_id = p_user_id;
  DELETE FROM public.user_mfa_settings WHERE user_id = p_user_id;
  DELETE FROM public.recovery_codes WHERE user_id = p_user_id;
  DELETE FROM public.push_tokens WHERE user_id = p_user_id;
  DELETE FROM public.notification_preferences WHERE user_id = p_user_id;

  -- 26. Delete usage logs
  DELETE FROM public.usage_logs WHERE user_id = p_user_id;

  -- 27. Delete role-specific profile
  IF v_role = 'freelancer' THEN
    DELETE FROM public.freelancer_profiles WHERE user_id = p_user_id;
  ELSIF v_role = 'client' THEN
    DELETE FROM public.client_profiles WHERE user_id = p_user_id;
  END IF;

  -- 28. Delete main profile (last DB record)
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 29. Delete the auth user (must be last; requires service role key)
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', p_user_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
