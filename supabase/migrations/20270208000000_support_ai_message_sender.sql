-- Support conversations need to distinguish AI replies from customer messages.
-- Historical replies remain user-authored by default; no existing rows are removed.
ALTER TABLE public.ticket_messages
  ADD COLUMN IF NOT EXISTS sender_type text NOT NULL DEFAULT 'user';

DO $support_sender_type_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.ticket_messages'::regclass
       AND conname = 'ticket_messages_sender_type_check'
  ) THEN
    ALTER TABLE public.ticket_messages
      ADD CONSTRAINT ticket_messages_sender_type_check
      CHECK (sender_type IN ('user', 'assistant', 'support'));
  END IF;
END;
$support_sender_type_guard$;

-- The Edge Function verifies the caller and ticket ownership before invoking
-- this RPC. This function atomically records the AI response and leaves the
-- ticket pending until the user explicitly confirms resolution.
CREATE OR REPLACE FUNCTION public.append_ai_support_message(
  p_ticket_id uuid,
  p_owner_id uuid,
  p_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $append_ai_support_message$
DECLARE
  v_message public.ticket_messages%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF p_message IS NULL OR length(btrim(p_message)) = 0 OR length(p_message) > 12000 THEN
    RAISE EXCEPTION 'invalid AI support message' USING ERRCODE = '22023';
  END IF;

  UPDATE public.support_tickets
     SET status = 'pending', updated_at = now()
   WHERE id = p_ticket_id
     AND user_id = p_owner_id
     AND status NOT IN ('resolved', 'closed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket unavailable' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.ticket_messages(ticket_id, user_id, message, is_internal, sender_type)
  VALUES (p_ticket_id, p_owner_id, p_message, false, 'assistant')
  RETURNING * INTO v_message;

  RETURN to_jsonb(v_message);
END;
$append_ai_support_message$;

REVOKE ALL ON FUNCTION public.append_ai_support_message(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_ai_support_message(uuid, uuid, text) TO service_role;
