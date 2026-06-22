-- Broadcast dispute row changes for contract/workspace UIs (optional but aligns with workflow).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.disputes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already member%' THEN NULL;
    ELSE RAISE;
    END IF;
END $$;
