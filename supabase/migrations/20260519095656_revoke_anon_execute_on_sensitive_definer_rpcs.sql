-- Applied via Supabase MCP. Supabase keeps default EXECUTE for role `anon` on RPCs;
-- explicitly remove anon on these SECURITY DEFINER entrypoints (linter 0028).

REVOKE EXECUTE ON FUNCTION public.generate_project_matches(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.raise_contract_dispute(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_contract_dispute(uuid, text) FROM anon;
