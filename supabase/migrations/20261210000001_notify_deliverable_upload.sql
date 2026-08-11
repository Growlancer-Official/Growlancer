-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFY DELIVERABLE UPLOAD (2026-12-10)
--
-- Milestone-less contracts: the freelancer "delivers" by uploading the final
-- work as a file in the workspace. Previously the client had no real-time
-- signal that a deliverable had been shared.
--
-- This trigger fires on contract_files INSERT and notifies the CLIENT when
-- the FREELANCER uploads a file ("New Deliverable Shared — Review Required").
-- Actor-scoped via auth.uid() so client's own uploads don't self-notify.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_deliverable_upload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract RECORD;
  v_project_title text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.client_id, c.freelancer_id, p.title
    INTO v_contract.client_id, v_contract.freelancer_id, v_project_title
  FROM public.contracts c
  LEFT JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = NEW.contract_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Only the freelancer's uploads signal a delivery to the client.
  IF auth.uid() = v_contract.freelancer_id AND v_contract.client_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      v_contract.client_id,
      'milestone',
      'New Deliverable Shared — Review Required',
      'The freelancer uploaded "' || COALESCE(NEW.file_name, 'a file')
        || '" on "' || COALESCE(v_project_title, 'your project')
        || '". Please review the deliverable and release the escrow payment when satisfied.',
      '/client/workspace?contract=' || NEW.contract_id,
      jsonb_build_object('contract_id', NEW.contract_id, 'file_id', NEW.id, 'event', 'deliverable')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_deliverable_upload ON public.contract_files;
CREATE TRIGGER trigger_deliverable_upload
AFTER INSERT ON public.contract_files
FOR EACH ROW
EXECUTE FUNCTION public.notify_deliverable_upload();

GRANT EXECUTE ON FUNCTION public.notify_deliverable_upload() TO authenticated, service_role;
