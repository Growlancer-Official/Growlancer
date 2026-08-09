-- ═══════════════════════════════════════════════════════════════════════════
-- RESTORE NOTIFICATION TRIGGERS (2026-10-25)
-- Root cause: the original notify_* trigger functions (notify_new_proposal,
-- notify_proposal_status, notify_new_contract, notify_contract_completion,
-- notify_new_invite, notify_new_message) were created against the OLD
-- notifications schema (column `link`) in migration 20240515. The current
-- table uses `action_url`, and these functions no longer exist in the DB —
-- so NOTHING was inserting rows into `notifications`, which made the
-- real-time in-app notification feed permanently empty.
--
-- This migration recreates every trigger with the current schema
-- (action_url), scoped to the realtime publication so INSERT/UPDATE events
-- broadcast to the client instantly.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. New proposal received → notify the CLIENT ───────────────────────────
CREATE OR REPLACE FUNCTION public.notify_new_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_title text;
BEGIN
  SELECT client_id, title INTO v_client_id, v_title
  FROM public.projects WHERE id = NEW.project_id;

  IF v_client_id IS NOT NULL AND v_client_id IS DISTINCT FROM NEW.freelancer_id THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      v_client_id,
      'proposal',
      'New Proposal Received',
      'A freelancer just submitted a proposal for "' || COALESCE(v_title, 'your project') || '".',
      '/client/proposals?project=' || NEW.project_id,
      jsonb_build_object('project_id', NEW.project_id, 'proposal_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_proposal ON public.proposals;
CREATE TRIGGER trigger_new_proposal
AFTER INSERT ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_proposal();

-- ── 2. Proposal accepted/rejected → notify the FREELANCER ──────────────────
CREATE OR REPLACE FUNCTION public.notify_proposal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      NEW.freelancer_id,
      'proposal',
      CASE
        WHEN NEW.status = 'accepted' THEN 'Proposal Accepted!'
        WHEN NEW.status = 'rejected' THEN 'Proposal Not Selected'
        ELSE 'Proposal Status Updated'
      END,
      CASE
        WHEN NEW.status = 'accepted' THEN 'Your proposal has been accepted. Check your contracts for details.'
        WHEN NEW.status = 'rejected' THEN 'Your proposal was not selected for this project.'
        ELSE 'Your proposal status has been updated.'
      END,
      '/dashboard/proposals',
      jsonb_build_object('project_id', NEW.project_id, 'proposal_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proposal_status ON public.proposals;
CREATE TRIGGER trigger_proposal_status
AFTER UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.notify_proposal_status();

-- ── 3. New contract → notify BOTH freelancer AND client ────────────────────
CREATE OR REPLACE FUNCTION public.notify_new_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES
    (
      NEW.freelancer_id,
      'contract',
      'New Contract Started!',
      'You have a new contract. View details in your workspace.',
      '/dashboard/contracts',
      jsonb_build_object('contract_id', NEW.id, 'project_id', NEW.project_id)
    ),
    (
      NEW.client_id,
      'contract',
      'Contract Created',
      'A new contract has been created. Fund escrow to get started.',
      '/client/contracts',
      jsonb_build_object('contract_id', NEW.id, 'project_id', NEW.project_id)
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_contract ON public.contracts;
CREATE TRIGGER trigger_new_contract
AFTER INSERT ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_contract();

-- ── 4. Contract completed → notify BOTH users ──────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_contract_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES
      (
        NEW.freelancer_id,
        'contract',
        'Contract Completed!',
        'Your contract has been completed. Funds have been released.',
        '/dashboard/wallet',
        jsonb_build_object('contract_id', NEW.id)
      ),
      (
        NEW.client_id,
        'contract',
        'Project Completed',
        'The project has been completed successfully.',
        '/client/contracts',
        jsonb_build_object('contract_id', NEW.id)
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_contract_completion ON public.contracts;
CREATE TRIGGER trigger_contract_completion
AFTER UPDATE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.notify_contract_completion();

-- ── 5. New invite → notify the FREELANCER ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_new_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
  v_title text;
BEGIN
  SELECT COALESCE(p.name, 'A client') INTO v_client_name
  FROM public.profiles p WHERE p.id = NEW.client_id;

  SELECT title INTO v_title FROM public.projects WHERE id = NEW.project_id;    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      NEW.freelancer_id,
      'invite',
    'New Project Invite',
    v_client_name || ' invited you to "' || COALESCE(v_title, 'a project') || '".',
    '/dashboard/invites',
    jsonb_build_object('invite_id', NEW.id, 'project_id', NEW.project_id, 'client_id', NEW.client_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_invite ON public.invites;
CREATE TRIGGER trigger_new_invite
AFTER INSERT ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_invite();

-- ── 6. Escrow funded → notify the FREELANCER (funds secured) ───────────────
CREATE OR REPLACE FUNCTION public.notify_escrow_funded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('funded', 'active') THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      NEW.freelancer_id,
      'escrow',
      'Escrow Funded — Start Working!',
      'The client has funded the escrow. You can now start working on the contract.',
      '/dashboard/workspace?contract=' || NEW.contract_id,
      jsonb_build_object('contract_id', NEW.contract_id, 'escrow_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_escrow_funded ON public.escrow;
CREATE TRIGGER trigger_escrow_funded
AFTER UPDATE ON public.escrow
FOR EACH ROW
EXECUTE FUNCTION public.notify_escrow_funded();

-- ── 7. Milestone released → notify the FREELANCER ──────────────────────────
CREATE OR REPLACE FUNCTION public.notify_milestone_released()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('released', 'paid', 'completed') THEN
    IF NEW.freelancer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (
        NEW.freelancer_id,
        'escrow',
        'Milestone Released',
        'A milestone payment has been released to your wallet.',
        '/dashboard/wallet',
        jsonb_build_object('escrow_id', NEW.id, 'contract_id', NEW.contract_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_milestone_released ON public.escrow;
CREATE TRIGGER trigger_milestone_released
AFTER UPDATE ON public.escrow
FOR EACH ROW
EXECUTE FUNCTION public.notify_milestone_released();

-- ── 8. Grant RLS-safe access (triggers run as SECURITY DEFINER, but the
--      functions must be executable by the role that fires them) ────────────
GRANT EXECUTE ON FUNCTION public.notify_new_proposal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_proposal_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_new_contract() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_contract_completion() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_new_invite() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_escrow_funded() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_milestone_released() TO authenticated, service_role;

-- ── 9. Ensure notifications table is in the realtime publication ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
