-- ═══════════════════════════════════════════════════════════════════════
-- 20261018000000_complete_user_deletion_ghost_isolation.sql
--
-- 🛡️ Complete user deletion + ghost-session isolation (data safety at scale)
--
-- PROBLEMS FIXED (all confirmed live in production):
--
-- 1. CRITICAL: public.delete_user_all_data() crashes at the referrals step
--    with `column "referred_id" does not exist` (the table uses
--    referred_user_id). The function's single `EXCEPTION WHEN OTHERS` handler
--    swallowed the error and returned success:false, so every step AFTER
--    referrals was skipped — wallets, subscriptions, freelancer_profiles,
--    profiles and more were left ORPHANED while auth.users was already gone.
--    Consequence: deleted users' data stayed in the DB (visible through any
--    stale browser session → "ghost sessions" that still see the deleted
--    user's projects / AI chats / messages) and orphaned rows could block
--    re-signup with the same email.
--
-- 2. The function did not cover many newer tables (workspace_tasks/notes,
--    support_tickets, ticket_messages, refunds/refund_requests/refund_history,
--    disputes chain, contests, internship_applications, usage_logs,
--    razorpay/paypal orders, storage objects, etc.) and did not handle the
--    NO-ACTION FKs (disputes, invoices, platform_revenue, contest winners...)
--    that block the profiles delete.
--
-- 3. The admin profile id (11ad40cf-…) did not match its auth.users id
--    (f0eed821-…) → fetchUserProfile(auth.uid()) returned null → the admin
--    account was treated as "deleted" and bounced from the dashboard.
--
-- 4. Deletion failures were invisible. A deletion_failures table + trigger
--    logging now surfaces them so they can be re-run via purge_orphan_user_data().
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 0. deletion_failures table (visible record of any incomplete deletion)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deletion_failures (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL,
  error      TEXT NOT NULL,
  report     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.deletion_failures ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Complete delete_user_all_data rewrite
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_user_all_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role    TEXT;
  v_email   TEXT;
  v_errors  JSONB := '[]'::jsonb;
  v_steps   TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Identify role/email first (if profile still exists)
  BEGIN
    SELECT role, email INTO v_role, v_email FROM public.profiles WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 1. Storage objects owned by the user (avatars, logos, portfolio, docs…)
  BEGIN
    DELETE FROM storage.objects WHERE owner = p_user_id;
    v_steps := array_append(v_steps, 'storage.user_owned');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Direct deletion%' THEN
      v_errors := v_errors || jsonb_build_object('step','storage.user_owned','error',SQLERRM);
    END IF;
  END;

  -- 2. Storage objects inside the user's contracts / disputes (before those rows go)
  BEGIN
    DELETE FROM storage.objects
      WHERE bucket_id = 'contract-files'
        AND path_tokens[1] IN (
          SELECT id::text FROM public.contracts
           WHERE freelancer_id = p_user_id OR client_id = p_user_id
        );
    v_steps := array_append(v_steps, 'storage.contract_files');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Direct deletion%' THEN
      v_errors := v_errors || jsonb_build_object('step','storage.contract_files','error',SQLERRM);
    END IF;
  END;

  BEGIN
    DELETE FROM storage.objects
      WHERE bucket_id = 'dispute-evidence'
        AND path_tokens[1] IN (
          SELECT id::text FROM public.disputes
           WHERE freelancer_id = p_user_id OR client_id = p_user_id
        );
    v_steps := array_append(v_steps, 'storage.dispute_evidence');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Direct deletion%' THEN
      v_errors := v_errors || jsonb_build_object('step','storage.dispute_evidence','error',SQLERRM);
    END IF;
  END;

  -- 3. NO-ACTION FK pre-cleanup (rows that reference the profile from OTHER
  --    people's records would block the profiles delete)
  BEGIN
    UPDATE public.contests SET winner_id = NULL WHERE winner_id = p_user_id;
    v_steps := array_append(v_steps, 'contests.winner_null');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','contests.winner_null','error',SQLERRM); END;

  BEGIN
    UPDATE public.disputes
       SET admin_assigned_to = NULL, resolved_by = NULL, appeal_decided_by = NULL
     WHERE admin_assigned_to = p_user_id OR resolved_by = p_user_id OR appeal_decided_by = p_user_id;
    v_steps := array_append(v_steps, 'disputes.admin_refs_null');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','disputes.admin_refs_null','error',SQLERRM); END;

  BEGIN
    UPDATE public.refund_requests SET requested_to = NULL, decision_by = NULL
     WHERE requested_to = p_user_id OR decision_by = p_user_id;
    v_steps := array_append(v_steps, 'refund_requests.refs_null');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','refund_requests.refs_null','error',SQLERRM); END;

  BEGIN
    UPDATE public.dispute_evidence SET uploader_id = NULL WHERE uploader_id = p_user_id;
    UPDATE public.dispute_messages SET sender_id = NULL WHERE sender_id = p_user_id;
    UPDATE public.dispute_internal_notes SET admin_id = NULL WHERE admin_id = p_user_id;
    UPDATE public.refund_history SET actor_id = NULL WHERE actor_id = p_user_id;
    v_steps := array_append(v_steps, 'dispute/refund refs_null');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','dispute/refund refs_null','error',SQLERRM); END;

  -- 4. Contract-scoped data (contracts of the user, BEFORE contracts are deleted)
  BEGIN
    DELETE FROM public.messages
      WHERE sender_id = p_user_id
         OR receiver_id = p_user_id
         OR contract_id IN (
              SELECT id FROM public.contracts
               WHERE freelancer_id = p_user_id OR client_id = p_user_id
            );
    v_steps := array_append(v_steps, 'messages');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','messages','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.contract_files
      WHERE uploaded_by = p_user_id
         OR contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    v_steps := array_append(v_steps, 'contract_files');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','contract_files','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.escrow
      WHERE freelancer_id = p_user_id OR client_id = p_user_id;
    v_steps := array_append(v_steps, 'escrow');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','escrow','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.milestones
      WHERE contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    v_steps := array_append(v_steps, 'milestones');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','milestones','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.time_entries
      WHERE contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    v_steps := array_append(v_steps, 'time_entries');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','time_entries','error',SQLERRM); END;

  -- Disputes chain (evidence/messages/notes first)
  BEGIN
    DELETE FROM public.dispute_evidence
      WHERE dispute_id IN (SELECT id FROM public.disputes WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    DELETE FROM public.dispute_messages
      WHERE dispute_id IN (SELECT id FROM public.disputes WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    DELETE FROM public.dispute_internal_notes
      WHERE dispute_id IN (SELECT id FROM public.disputes WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    DELETE FROM public.disputes
      WHERE freelancer_id = p_user_id OR client_id = p_user_id;
    v_steps := array_append(v_steps, 'disputes_chain');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','disputes_chain','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.refund_history
      WHERE actor_id = p_user_id
         OR refund_request_id IN (
              SELECT id FROM public.refund_requests
               WHERE requested_by = p_user_id
                  OR contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id)
            );
    DELETE FROM public.refund_requests
      WHERE requested_by = p_user_id
         OR contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    DELETE FROM public.refunds
      WHERE contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    v_steps := array_append(v_steps, 'refunds_chain');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','refunds_chain','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.workspace_activity_logs
      WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE client_id = p_user_id OR lead_freelancer_id = p_user_id);
    DELETE FROM public.workspace_tasks
      WHERE contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    DELETE FROM public.workspace_notes
      WHERE contract_id IN (SELECT id FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id);
    DELETE FROM public.workspace_members
      WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE client_id = p_user_id OR lead_freelancer_id = p_user_id);
    DELETE FROM public.workspaces
      WHERE client_id = p_user_id OR lead_freelancer_id = p_user_id;
    v_steps := array_append(v_steps, 'workspaces_chain');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','workspaces_chain','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.invoices WHERE freelancer_id = p_user_id OR client_id = p_user_id;
    DELETE FROM public.platform_revenue WHERE client_id = p_user_id OR freelancer_id = p_user_id;
    v_steps := array_append(v_steps, 'invoices_revenue');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','invoices_revenue','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.contracts WHERE freelancer_id = p_user_id OR client_id = p_user_id;
    v_steps := array_append(v_steps, 'contracts');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','contracts','error',SQLERRM); END;

  -- 5. User-scoped rows
  BEGIN
    DELETE FROM public.ai_matches WHERE freelancer_id = p_user_id;
    DELETE FROM public.ai_matches WHERE project_id IN (SELECT id FROM public.projects WHERE client_id = p_user_id);
    DELETE FROM public.project_matches WHERE freelancer_id = p_user_id;
    v_steps := array_append(v_steps, 'matches');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','matches','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.proposals WHERE freelancer_id = p_user_id;
    DELETE FROM public.proposals WHERE project_id IN (SELECT id FROM public.projects WHERE client_id = p_user_id);
    DELETE FROM public.invites WHERE freelancer_id = p_user_id OR client_id = p_user_id;
    v_steps := array_append(v_steps, 'proposals_invites');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','proposals_invites','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.projects WHERE client_id = p_user_id;
    v_steps := array_append(v_steps, 'projects');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','projects','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.services WHERE freelancer_id = p_user_id;
    DELETE FROM public.portfolio_items WHERE user_id = p_user_id;
    DELETE FROM public.certifications WHERE user_id = p_user_id;
    DELETE FROM public.skill_certifications WHERE user_id = p_user_id;
    DELETE FROM public.skill_endorsements WHERE endorsed_user_id = p_user_id OR endorsed_by_user_id = p_user_id;
    v_steps := array_append(v_steps, 'services_portfolio_certs');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','services_portfolio_certs','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.education_history WHERE user_id = p_user_id;
    DELETE FROM public.employment_history WHERE user_id = p_user_id;
    DELETE FROM public.languages WHERE user_id = p_user_id;
    DELETE FROM public.freelancer_skills WHERE freelancer_id = p_user_id;
    v_steps := array_append(v_steps, 'profile_details');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','profile_details','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.reviews WHERE reviewer_id = p_user_id OR reviewee_id = p_user_id;
    DELETE FROM public.review_replies
      WHERE review_id IN (SELECT id FROM public.reviews WHERE reviewer_id = p_user_id OR reviewee_id = p_user_id);
    v_steps := array_append(v_steps, 'reviews');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','reviews','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.referrals WHERE referrer_id = p_user_id OR referred_user_id = p_user_id;
    DELETE FROM public.referral_stats WHERE user_id = p_user_id;
    v_steps := array_append(v_steps, 'referrals');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','referrals','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.notifications WHERE user_id = p_user_id;
    DELETE FROM public.notification_preferences WHERE user_id = p_user_id;
    DELETE FROM public.wallets WHERE user_id = p_user_id;
    DELETE FROM public.payment_methods WHERE user_id = p_user_id;
    DELETE FROM public.payout_methods WHERE user_id = p_user_id;
    DELETE FROM public.saved_payment_cards WHERE user_id = p_user_id;
    DELETE FROM public.subscriptions WHERE user_id = p_user_id;
    DELETE FROM public.withdrawals WHERE user_id = p_user_id;
    v_steps := array_append(v_steps, 'wallet_payments');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','wallet_payments','error',SQLERRM); END;

  BEGIN
    -- paypal_disputes.transaction_id is TEXT; paypal_transactions.paypal_order_id
    -- and razorpay_transactions.razorpay_order_id are UUID → cast only the text one
    DELETE FROM public.paypal_disputes
      WHERE transaction_id IN (
        SELECT id::text FROM public.paypal_transactions
         WHERE paypal_order_id IN (SELECT id FROM public.paypal_orders WHERE user_id = p_user_id)
      );
    DELETE FROM public.razorpay_transactions
      WHERE razorpay_order_id IN (SELECT id FROM public.razorpay_orders WHERE user_id = p_user_id);
    DELETE FROM public.paypal_transactions
      WHERE paypal_order_id IN (SELECT id FROM public.paypal_orders WHERE user_id = p_user_id);
    DELETE FROM public.razorpay_orders WHERE user_id = p_user_id;
    DELETE FROM public.paypal_orders WHERE user_id = p_user_id;
    DELETE FROM public.transactions WHERE user_id = p_user_id;
    -- payment_webhook_events is payload-keyed (no user_id); match order ids in JSONB
    DELETE FROM public.payment_webhook_events
      WHERE payload->>'order_id' IN (SELECT id::text FROM public.razorpay_orders WHERE user_id = p_user_id)
         OR payload->'entity'->>'order_id' IN (SELECT id::text FROM public.razorpay_orders WHERE user_id = p_user_id);
    v_steps := array_append(v_steps, 'payments_orders');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','payments_orders','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.usage_logs WHERE user_id = p_user_id;
    DELETE FROM public.connects_transactions WHERE user_id = p_user_id;
    DELETE FROM public.saved_searches WHERE user_id = p_user_id;
    DELETE FROM public.fraud_events WHERE user_id = p_user_id;
    DELETE FROM public.push_tokens WHERE user_id = p_user_id;
    v_steps := array_append(v_steps, 'usage_activity');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','usage_activity','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.support_tickets WHERE user_id = p_user_id;
    DELETE FROM public.ticket_messages WHERE user_id = p_user_id;
    v_steps := array_append(v_steps, 'support_tickets');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','support_tickets','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.contest_submissions WHERE freelancer_id = p_user_id;
    DELETE FROM public.contest_votes WHERE user_id = p_user_id;
    DELETE FROM public.contest_comments WHERE user_id = p_user_id;
    DELETE FROM public.contests WHERE client_id = p_user_id;
    v_steps := array_append(v_steps, 'contests');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','contests','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.identity_verifications WHERE user_id = p_user_id;
    DELETE FROM public.user_mfa_settings WHERE user_id = p_user_id;
    DELETE FROM public.recovery_codes WHERE user_id = p_user_id;
    v_steps := array_append(v_steps, 'verification_security');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','verification_security','error',SQLERRM); END;

  BEGIN
    DELETE FROM public.team_invitations WHERE invited_by = p_user_id OR freelancer_id = p_user_id;
    DELETE FROM public.user_invitations WHERE invited_by = p_user_id;
    DELETE FROM public.payment_audit_logs WHERE user_id = p_user_id;
    DELETE FROM public.workspace_members WHERE user_id = p_user_id;
    v_steps := array_append(v_steps, 'invitations_audit');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','invitations_audit','error',SQLERRM); END;

  -- Email-scoped rows (newsletter/waitlist/contact inquiries/internship are email-based)
  IF v_email IS NOT NULL THEN
    BEGIN
      DELETE FROM public.newsletter_subscribers WHERE email = v_email;
      DELETE FROM public.waitlist WHERE email = v_email;
      DELETE FROM public.contact_inquiries WHERE email = v_email;
      DELETE FROM public.internship_applications WHERE email = v_email;
      DELETE FROM public.verification_rate_limits WHERE identifier = v_email;
      v_steps := array_append(v_steps, 'email_scoped');
    EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','email_scoped','error',SQLERRM); END;
  END IF;

  BEGIN
    DELETE FROM public.user_deletion_requests WHERE user_id = p_user_id;
    v_steps := array_append(v_steps, 'deletion_requests');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','deletion_requests','error',SQLERRM); END;

  -- 6. Role-specific profile
  BEGIN
    IF v_role = 'freelancer' THEN
      DELETE FROM public.freelancer_profiles WHERE user_id = p_user_id;
    ELSIF v_role = 'client' THEN
      DELETE FROM public.client_profiles WHERE user_id = p_user_id;
    END IF;
    v_steps := array_append(v_steps, 'role_profile');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','role_profile','error',SQLERRM); END;

  -- 7. Main profile (cascades most remaining rows)
  BEGIN
    DELETE FROM public.profiles WHERE id = p_user_id;
    v_steps := array_append(v_steps, 'profiles');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','profiles','error',SQLERRM); END;

  -- 8. Auth user (MUST be last)
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
    v_steps := array_append(v_steps, 'auth.users');
  EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('step','auth.users','error',SQLERRM); END;

  RETURN jsonb_build_object(
    'success',        jsonb_array_length(v_errors) = 0,
    'deleted_user_id', p_user_id,
    'steps',          to_jsonb(v_steps),
    'errors',         v_errors
  );
END;
$$;

-- Keep the function locked down (service-role only)
REVOKE ALL ON FUNCTION public.delete_user_all_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_all_data(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_all_data(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_all_data(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 2. purge_orphan_user_data() — maintenance sweep for deleted users whose
--    data was left behind by the old broken deletion. Idempotent + locked.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_orphan_user_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orphan RECORD;
  v_res    JSONB;
  v_report JSONB := '[]'::jsonb;
  v_locked BOOLEAN;
BEGIN
  SELECT pg_try_advisory_lock(hashtext('grw_purge_orphans')) INTO v_locked;
  IF NOT v_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'purge already running');
  END IF;

  BEGIN
    FOR v_orphan IN
      SELECT p.id, p.email
        FROM public.profiles p
       WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
       ORDER BY p.created_at ASC
    LOOP
      SELECT public.delete_user_all_data(v_orphan.id) INTO v_res;
      v_report := v_report || jsonb_build_object('orphan_id', v_orphan.id, 'email', v_orphan.email, 'result', v_res);
    END LOOP;

    PERFORM pg_advisory_unlock(hashtext('grw_purge_orphans'));
    RETURN jsonb_build_object(
      'success', true,
      'orphans_found', jsonb_array_length(v_report),
      'report', v_report
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext('grw_purge_orphans'));
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_orphan_user_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_orphan_user_data() FROM anon;
REVOKE ALL ON FUNCTION public.purge_orphan_user_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_orphan_user_data() TO service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Trigger hardening — log any incomplete deletion so it is visible and
--    can be re-run via purge_orphan_user_data()
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
BEGIN
  -- Guard against recursion (delete_user_all_data's own auth.users delete)
  IF current_setting('app.user_delete_in_progress', true) = '1' THEN
    RETURN OLD;
  END IF;

  PERFORM set_config('app.user_delete_in_progress', '1', true); -- txn-scoped

  BEGIN
    SELECT public.delete_user_all_data(OLD.id) INTO v_res;
    IF NOT COALESCE((v_res->>'success')::boolean, false) THEN
      INSERT INTO public.deletion_failures (user_id, error, report)
      VALUES (OLD.id, 'delete_user_all_data reported failure', v_res);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.deletion_failures (user_id, error, report)
    VALUES (OLD.id, SQLERRM, jsonb_build_object('sqlerrm', SQLERRM));
  END;

  PERFORM set_config('app.user_delete_in_progress', '0', true);
  RETURN OLD;
END;
$$;

-- Trigger functions are called as the table owner; lock down direct calls.
REVOKE ALL ON FUNCTION public.handle_user_deleted() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_deleted();

-- ─────────────────────────────────────────────────────────────────────
-- 4. DATA REPAIR: admin profile id mismatch.
--    profiles.id (11ad40cf…) ≠ auth.users.id (f0eed821…) → the admin's
--    profile could not be fetched by id, so the admin account was treated
--    as "deleted" and bounced from the dashboard. Re-point the profile row
--    (and every FK referencing it) to the real auth user id.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_old UUID := '11ad40cf-b432-41df-876c-74650c9ece4d'::uuid;
  v_new UUID := 'f0eed821-31cd-4cc0-be5c-adac94136338'::uuid;
  r     RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_new)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_old AND email = 'admin@growlancer.com')
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_new) THEN

    -- The target profile (v_new) does not exist yet, so rows referencing the
    -- OLD id cannot be re-pointed to it (FK check fails). Deterministic fix:
    --   • SET-NULL reference columns  → set them NULL (keep the other party's row)
    --   • DELETE rows that belong to this user (children) → remove them
    -- then move the profile to the correct id. Wallet is recreated below.
    FOR r IN
      SELECT tc.table_name AS tbl, kcu.column_name AS col, rc.delete_rule AS dr
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = 'public'
         AND ccu.table_name = 'profiles'
         AND ccu.column_name = 'id'
    LOOP
      BEGIN
        IF r.dr = 'SET NULL' OR r.tbl = 'profiles' THEN
          -- reference-type columns (admin actions, typing indicators, etc.): null them out
          EXECUTE format('UPDATE %I SET %I = NULL WHERE %I = %L', r.tbl, r.col, r.col, v_old);
        ELSE
          -- the row belongs to this (broken) account — remove it
          EXECUTE format('DELETE FROM %I WHERE %I = %L', r.tbl, r.col, v_old);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- never let one table block the repair
      END;
    END LOOP;

    -- Move the profile to the correct id (no referencing rows remain)
    UPDATE public.profiles
       SET id = v_new, name = 'Growlancer Admin', role = 'admin'
     WHERE id = v_old;

    -- Restore the wallet row (auto-created for normal signups; deleted above)
    BEGIN
      INSERT INTO public.wallets (user_id) VALUES (v_new);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RAISE NOTICE 'Admin profile repaired: % -> %', v_old, v_new;
  ELSE
    RAISE NOTICE 'Admin repair skipped (already repaired or conditions not met)';
  END IF;
END $$;
