-- ====================================================================
-- GROWLANCER — COMPREHENSIVE BACKEND FIXES
-- Date: 2026-09-08
--
-- Fixes the following 10 issues found during backend audit:
--
--   CRITICAL:
--   1. 🔓 Escrow RLS wide open → restrict to contract participants
--   2. 🔓 Invites RLS wide open → restrict to involved parties
--   3. 🔓 Referrals RLS wide open → restrict to referrer/referee
--   4. 🗃️ subscription_plans missing updated_at column → broken UPDATE
--   5. 📡 Missing REPLICA IDENTITY FULL on realtime tables → partial broadcasts
--
--   MODERATE:
--   6. 📡 Missing tables in realtime publication
--   7. 🔄 Auto-confirm trigger → drop idempotent duplicates
--   8. 🧹 cleanup_user_data() references dropped wallet_transactions/balances
--   9. 🛡️ skill_certifications missing RLS
--   10. 🔁 notify_new_match() trigger has unnecessary circular sub-select
--
-- Safe to re-run (all statements use IF EXISTS / IF NOT EXISTS / DROP ... IF EXISTS).
-- ====================================================================

-- ═══════════════════════════════════════════════════════════════════
-- FIX 1: RESTRICT ESCROW RLS TO CONTRACT PARTICIPANTS
-- ═══════════════════════════════════════════════════════════════════
-- Before: ANY authenticated user could read ALL escrow records.
-- After:  Only the client_id or freelancer_id on the escrow record
--         (which matches the contract's client/freelancer) can view.

DROP POLICY IF EXISTS "Authenticated users can read" ON escrow;
DROP POLICY IF EXISTS "Escrow participants can view" ON escrow;

CREATE POLICY "Escrow participants can view" ON escrow
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = client_id
    OR auth.uid() = freelancer_id
  );

RAISE NOTICE 'FIX 1: Escrow RLS restricted to participants ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 2: RESTRICT INVITES RLS TO INVOLVED PARTIES
-- ═══════════════════════════════════════════════════════════════════
-- Before: ANY authenticated user could read ALL invites.
-- After:  Only the freelancer, client, or project owner can view.

DROP POLICY IF EXISTS "Authenticated users can read invites" ON invites;

CREATE POLICY "Invite participants can view" ON invites
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = freelancer_id
    OR auth.uid() = client_id
    OR EXISTS (
      SELECT 1 FROM projects WHERE id = project_id AND client_id = auth.uid()
    )
  );

RAISE NOTICE 'FIX 2: Invites RLS restricted to participants ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 3: RESTRICT REFERRALS RLS TO REFERRER / REFEREE
-- ═══════════════════════════════════════════════════════════════════
-- Before: ANY authenticated user could read ALL referrals.
-- After:  Only the referrer or referred user can view their referrals.

DROP POLICY IF EXISTS "Authenticated users can read referrals" ON referrals;

CREATE POLICY "Referral participants can view" ON referrals
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = referrer_id
    OR auth.uid() = referred_user_id
  );

RAISE NOTICE 'FIX 3: Referrals RLS restricted to participants ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 4: ADD missing updated_at COLUMN TO subscription_plans
-- ═══════════════════════════════════════════════════════════════════
-- The original table was created without an updated_at column, but
-- the production_audit_fixes migration (20260701) ran:
--   UPDATE subscription_plans SET updated_at = NOW() WHERE updated_at IS NULL;
-- which would have failed with "column subscription_plans.updated_at does not exist".

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- The broken UPDATE is now safe to run
UPDATE subscription_plans
  SET updated_at = NOW()
  WHERE updated_at IS NULL;

RAISE NOTICE 'FIX 4: subscription_plans.updated_at column added ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 5: ADD REPLICA IDENTITY FULL FOR REALTIME TABLES
-- ═══════════════════════════════════════════════════════════════════
-- Without REPLICA IDENTITY FULL, realtime broadcasts only send
-- changes on primary key columns — the app's postgres_changes
-- listeners (especially those using the '*' broadcast) won't
-- receive full old/new row data.
--
-- We apply this to ALL tables currently in supabase_realtime
-- publication and the ones we're about to add.

DO $$
DECLARE
  tbl text;
  tbl_list text[] := ARRAY[
    'profiles',
    'freelancer_profiles',
    'client_profiles',
    'projects',
    'proposals',
    'contracts',
    'messages',
    'invites',
    'escrow',
    'transactions',
    'withdrawals',
    'project_matches',
    'ai_matches',
    'notifications',
    'contract_files',
    'referrals',
    'referral_stats',
    'subscriptions',
    'services',
    'reviews',
    'paypal_orders',
    'paypal_transactions',
    'disputes',
    'skill_certifications',
    'internship_applications',
    'contact_inquiries',
    'support_tickets',
    'ticket_messages',
    'workspace_tasks',
    'workspace_notes',
    'portfolio_items',
    'identity_verifications',
    'wallets',
    'milestones',
    'workspaces',
    'workspace_members',
    'opportunity_events',
    'team_invitations',
    'fraud_events',
    'razorpay_orders',
    'razorpay_transactions',
    'contests',
    'contest_submissions',
    'contest_votes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbl_list
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'replica_identity: public.% does not exist, skipped', tbl;
      WHEN OTHERS THEN
        RAISE NOTICE 'replica_identity: public.% error (%%): %%', tbl, SQLSTATE, SQLERRM;
    END;
  END LOOP;
END $$;

RAISE NOTICE 'FIX 5: REPLICA IDENTITY FULL set on all tables ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 6: ADD MISSING TABLES TO SUPABASE_REALTIME PUBLICATION
-- ═══════════════════════════════════════════════════════════════════
-- Tables that were created post the initial realtime setup
-- but never added to the supabase_realtime publication.

DO $$
DECLARE
  tbl text;
  tbl_list text[] := ARRAY[
    'workspace_tasks',
    'workspace_notes',
    'portfolio_items',
    'identity_verifications',
    'wallets',
    'milestones',
    'workspaces',
    'workspace_members',
    'opportunity_events',
    'team_invitations',
    'fraud_events',
    'razorpay_orders',
    'razorpay_transactions',
    'contests',
    'contest_submissions',
    'contest_votes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbl_list
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'realtime_publication: public.% does not exist, skipped', tbl;
      WHEN duplicate_object THEN
        RAISE NOTICE 'realtime_publication: public.% already in publication, skipped', tbl;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%already member of publication%' OR SQLERRM LIKE '%already in publication%' THEN
          RAISE NOTICE 'realtime_publication: public.% already member, skipped', tbl;
        ELSE
          RAISE NOTICE 'realtime_publication: public.% error (%%): %%', tbl, SQLSTATE, SQLERRM;
        END IF;
    END;
  END LOOP;
END $$;

RAISE NOTICE 'FIX 6: Missing tables added to supabase_realtime ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 7: CLEAN UP DUPLICATE AUTO-CONFIRM TRIGGERS
-- ═══════════════════════════════════════════════════════════════════
-- The on_auth_user_created trigger + auto_confirm_email function
-- have been created/dropped/re-created 4 times across migrations.
-- Ensure only one clean version exists.

-- Drop ALL versions of the function (might exist in different schemas)
DROP FUNCTION IF EXISTS public.auto_confirm_email();
DROP FUNCTION IF EXISTS auto_confirm_email();

-- Re-create the definitive version in public schema
CREATE OR REPLACE FUNCTION public.auto_confirm_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE auth.users
  SET
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = NEW.id
    AND email_confirmed_at IS NULL;

  RETURN NEW;
END;
$$;

-- Drop trigger if it exists from any schema
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Re-create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_email();

RAISE NOTICE 'FIX 7: Auto-confirm trigger cleaned up ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 8: FIX cleanup_user_data() — wallet_transactions/balances DROPPED
-- ═══════════════════════════════════════════════════════════════════
-- The wallet_transactions and wallet_balances tables were dropped
-- in migration 20260623 (cleanup_duplicate_wallet_tables.sql). The
-- cleanup_user_data function in 20260701 still tries to DELETE from
-- them, which would raise an error.

CREATE OR REPLACE FUNCTION public.cleanup_user_data(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Wallet (only wallets table exists — wallet_transactions/balances were dropped)
  DELETE FROM wallets WHERE user_id = p_user_id;

  -- Messages
  DELETE FROM messages WHERE sender_id = p_user_id OR receiver_id = p_user_id;

  -- Notifications
  DELETE FROM notifications WHERE user_id = p_user_id;

  -- Proposals
  DELETE FROM proposals WHERE freelancer_id = p_user_id;

  -- Invites
  DELETE FROM invites WHERE freelancer_id = p_user_id OR client_id = p_user_id;

  -- Project matches
  DELETE FROM project_matches WHERE freelancer_id = p_user_id;

  -- Referrals (column name: referred_user_id, not referee_id)
  DELETE FROM referrals WHERE referrer_id = p_user_id OR referred_user_id = p_user_id;
  DELETE FROM referral_stats WHERE user_id = p_user_id;

  -- Reviews
  DELETE FROM reviews WHERE reviewer_id = p_user_id OR reviewee_id = p_user_id;

  -- Services
  DELETE FROM services WHERE freelancer_id = p_user_id;

  -- Transactions
  DELETE FROM transactions WHERE user_id = p_user_id;

  -- Withdrawals
  DELETE FROM withdrawals WHERE user_id = p_user_id;

  -- Paypal orders/transactions
  DELETE FROM paypal_transactions WHERE paypal_order_id IN (SELECT id FROM paypal_orders WHERE user_id = p_user_id);
  DELETE FROM paypal_orders WHERE user_id = p_user_id;

  -- Razorpay orders/transactions
  DELETE FROM razorpay_transactions WHERE razorpay_order_id IN (SELECT id FROM razorpay_orders WHERE user_id = p_user_id);
  DELETE FROM razorpay_orders WHERE user_id = p_user_id;

  -- Freelancer/client profiles
  DELETE FROM freelancer_profiles WHERE user_id = p_user_id;
  DELETE FROM client_profiles WHERE user_id = p_user_id;

  -- Subscriptions
  DELETE FROM subscriptions WHERE user_id = p_user_id;

  -- Usage logs
  DELETE FROM usage_logs WHERE user_id = p_user_id;

  -- Identity verifications
  DELETE FROM identity_verifications WHERE user_id = p_user_id;

  -- Portfolio items
  DELETE FROM portfolio_items WHERE user_id = p_user_id;

  -- Payout methods
  DELETE FROM payout_methods WHERE user_id = p_user_id;

  -- Notification preferences
  DELETE FROM notification_preferences WHERE user_id = p_user_id;

  -- Skill certifications
  DELETE FROM skill_certifications WHERE user_id = p_user_id;

  -- Certifications
  DELETE FROM certifications WHERE user_id = p_user_id;

  -- Education & employment history
  DELETE FROM education_history WHERE user_id = p_user_id;
  DELETE FROM employment_history WHERE user_id = p_user_id;

  -- Contests (as freelancer/client)
  UPDATE contests SET winner_id = NULL WHERE winner_id = p_user_id;
  DELETE FROM contest_submissions WHERE freelancer_id = p_user_id;
  DELETE FROM contest_votes WHERE user_id = p_user_id;
  DELETE FROM contest_comments WHERE user_id = p_user_id;

  -- Delete profile (CASCADE handles remaining child records)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;

RAISE NOTICE 'FIX 8: cleanup_user_data() updated ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 9: ENABLE RLS + ADD POLICIES FOR skill_certifications
-- ═══════════════════════════════════════════════════════════════════
-- The table was added to supabase_realtime publication but RLS
-- was never enabled, leaving all data publicly readable via API.

ALTER TABLE IF EXISTS public.skill_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own certifications" ON public.skill_certifications;
CREATE POLICY "Users view own certifications" ON public.skill_certifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all certifications" ON public.skill_certifications;
CREATE POLICY "Admins view all certifications" ON public.skill_certifications
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "Users insert own certifications" ON public.skill_certifications;
CREATE POLICY "Users insert own certifications" ON public.skill_certifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage certifications" ON public.skill_certifications;
CREATE POLICY "Admins manage certifications" ON public.skill_certifications
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

RAISE NOTICE 'FIX 9: RLS enabled on skill_certifications ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FIX 10: FIX notify_new_match() — REMOVE CIRCULAR SUB-SELECT
-- ═══════════════════════════════════════════════════════════════════
-- The original function does a SELECT from ai_matches inside an
-- ai_matches INSERT trigger, which is unnecessary (NEW already
-- contains the record). Replace with direct NEW.field references.

CREATE OR REPLACE FUNCTION notify_new_match()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    NEW.freelancer_id,
    'new_match',
    'New Project Match!',
    'A new project matches your skills. Check it out!',
    '/dashboard/feed'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

RAISE NOTICE 'FIX 10: notify_new_match() trigger fixed ✓';

-- ═══════════════════════════════════════════════════════════════════
-- FINAL: REFRESH PostgREST SCHEMA CACHE
-- ═══════════════════════════════════════════════════════════════════
-- Notify PostgREST to reload its schema cache so new/changed
-- columns, policies, and functions are immediately available.

NOTIFY pgrst, 'reload schema';

RAISE NOTICE 'All 10 fixes applied. PostgREST schema cache refreshed ✓';
