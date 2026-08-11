-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY MILESTONE DELIVERED / APPROVED (2026-12-10)
--
-- Gap: when the freelancer marks a milestone "completed" (final delivery) via
-- the mark_milestone_status RPC, only the contracts.milestones JSON changes —
-- no notification trigger fires, so the CLIENT had no real-time way of knowing
-- the work was delivered. Similarly, when the client approves a milestone, the
-- freelancer got no in-app ping.
--
-- This migration adds one trigger on contracts (AFTER UPDATE OF milestones)
-- that:
--   1. milestone -> 'completed'  → notify the CLIENT  ("Delivered — review")
--      (only when the freelancer is the actor, so no self-notifications)
--   2. milestone -> 'approved'   → notify the FREELANCER ("Approved — releasing")
--      (only when the client is the actor)
--
-- Follows the exact schema/pattern of the restored notification triggers
-- (notifications: user_id, type, title, message, action_url, metadata).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_milestone_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_idx int;
  v_old_status text;
  v_new_status text;
  v_milestone_title text;
  v_project_title text;
BEGIN
  IF NEW.milestones IS NULL OR NEW.milestones IS NOT DISTINCT FROM OLD.milestones THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.milestones) <> 'array' THEN
    RETURN NEW;
  END IF;

  v_old := OLD.milestones;
  IF v_old IS NOT NULL AND jsonb_typeof(v_old) <> 'array' THEN
    v_old := NULL;
  END IF;

  SELECT title INTO v_project_title FROM public.projects WHERE id = NEW.project_id;

  FOR v_idx IN 0 .. jsonb_array_length(NEW.milestones) - 1 LOOP
    v_new_status := NEW.milestones->v_idx->>'status';
    v_old_status := NULL;
    IF v_old IS NOT NULL AND v_idx < jsonb_array_length(v_old) THEN
      v_old_status := v_old->v_idx->>'status';
    END IF;
    v_milestone_title := NEW.milestones->v_idx->>'title';

    -- 1) Freelancer marks a milestone completed (FINAL DELIVERY) → CLIENT
    IF v_new_status = 'completed' AND v_old_status IS DISTINCT FROM 'completed'
       AND auth.uid() IS NOT NULL AND auth.uid() = NEW.freelancer_id THEN
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (
        NEW.client_id,
        'milestone',
        'Final Delivery Submitted — Review Required',
        'The freelancer delivered "' || COALESCE(v_milestone_title, 'a milestone')
          || '" on "' || COALESCE(v_project_title, 'your project')
          || '". Please review the work and release the escrow payment when satisfied.',
        '/client/workspace?contract=' || NEW.id,
        jsonb_build_object('contract_id', NEW.id, 'milestone_index', v_idx, 'event', 'delivered')
      );
    END IF;

    -- 2) Client approves a milestone → FREELANCER
    IF v_new_status = 'approved' AND v_old_status IS DISTINCT FROM 'approved'
       AND auth.uid() IS NOT NULL AND auth.uid() = NEW.client_id THEN
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (
        NEW.freelancer_id,
        'milestone',
        'Milestone Approved — Payment Released',
        'The client approved "' || COALESCE(v_milestone_title, 'your milestone')
          || '" on "' || COALESCE(v_project_title, 'your project')
          || '". The escrow payment is being released to your wallet.',
        '/dashboard/workspace?contract=' || NEW.id,
        jsonb_build_object('contract_id', NEW.id, 'milestone_index', v_idx, 'event', 'approved')
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_milestone_delivered ON public.contracts;
CREATE TRIGGER trigger_milestone_delivered
AFTER UPDATE OF milestones ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.notify_milestone_delivered();

-- Trigger functions run as SECURITY DEFINER, but the function must be
-- executable by the roles that fire the update (authenticated users + edge
-- functions).
GRANT EXECUTE ON FUNCTION public.notify_milestone_delivered() TO authenticated, service_role;

-- Ensure notifications realtime publication is intact (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
