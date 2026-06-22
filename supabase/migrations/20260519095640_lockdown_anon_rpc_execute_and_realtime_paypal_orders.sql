-- Applied via Supabase MCP (project Growlancer).
-- Security: SECURITY DEFINER RPCs must not rely on PUBLIC execute for anonymous clients.
-- Realtime: PayPal order row changes for in-app subscriptions (see src/lib/paypal.ts).

REVOKE ALL ON FUNCTION public.generate_project_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_project_matches(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_project_matches(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.raise_contract_dispute(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raise_contract_dispute(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.raise_contract_dispute(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_contract_dispute(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_contract_dispute(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_contract_dispute(uuid, text) TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.paypal_orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already member%' THEN NULL;
    ELSE RAISE;
    END IF;
END $$;
