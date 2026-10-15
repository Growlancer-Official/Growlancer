-- ============================================================================
-- MR-05 (finding IDOR-001) — P0 SECURITY
--
-- Problem:
--   public.get_wallet_balance(p_user_id UUID) is SECURITY DEFINER and trusted
--   the client-supplied p_user_id:
--       SELECT ... FROM wallets WHERE user_id = p_user_id;
--   Any authenticated caller could read ANY user's wallet (balance,
--   pending_balance, escrow_balance) by passing that user's id — a horizontal
--   privilege escalation / IDOR. The latest definition in-repo
--   (20270101000023_fix_rpc_postgrest_schema_cache.sql) still trusts the
--   parameter, and the browser helper dbFunctions.getWalletBalance sent it.
--
-- Fix:
--   Derive the identity from the verified JWT via auth.uid(). p_user_id is
--   retained ONLY for backward compatibility with existing PostgREST calls
--   (same function signature) but is deliberately IGNORED — it can never
--   select another user's wallet. Return shape is preserved. search_path is
--   pinned to `public, pg_temp` to prevent schema-hijack.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_balance NUMERIC;
  v_pending NUMERIC;
  v_escrow NUMERIC;
  v_currency TEXT;
BEGIN
  -- Authoritative identity: the verified session only.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- NOTE: p_user_id is intentionally NOT used below. Callers cannot select
  -- another user's wallet by passing a client-supplied id.
  SELECT balance, pending_balance, COALESCE(escrow_balance, 0), currency
  INTO v_balance, v_pending, v_escrow, v_currency
  FROM public.wallets
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'balance', 0,
      'pending_balance', 0,
      'escrow_balance', 0,
      'currency', 'INR');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance,
    'pending_balance', v_pending,
    'escrow_balance', v_escrow,
    'currency', v_currency);
END;
$$;

-- Tighten execute grants: authenticated callers own their session; anon never.
REVOKE EXECUTE ON FUNCTION public.get_wallet_balance(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_wallet_balance(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID) TO authenticated, service_role;

-- Force PostgREST to reload its schema cache for the recreated function.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- LIVE-DB VERIFICATION REQUIRED (run after applying):
--
--   -- (a) function body no longer references the caller-supplied parameter:
--   SELECT pg_get_functiondef('public.get_wallet_balance(uuid)'::regprocedure);
--   -- Expect: WHERE user_id = v_uid  (auth.uid()-derived), and search_path=public, pg_temp.
--
--   -- (b) IDOR closed — as user A, asking for user B's wallet returns A's own:
--   --   (run two authenticated sessions; A calls)
--   SELECT public.get_wallet_balance('<USER_B_UUID>'::uuid);
--   -- Expect: A's own balance (identical to get_wallet_balance()), never B's.
--
--   -- (c) anon cannot execute:
--   SET ROLE anon;
--   SELECT public.get_wallet_balance();  -- Expect: permission denied
--   RESET ROLE;
--
--   -- (d) SCHEMA-DRIFT SWEEP — find ANY wallet-balance RPC variant that exists
--   --     live but is NOT defined in the repo (e.g. get_wallet_balance_v2, which
--   --     appears in src/types/supabase.ts but has no migration). Any such
--   --     variant is an unchecked IDOR surface and MUST be neutralised:
--   SELECT p.proname,
--          pg_get_function_identity_arguments(p.oid) AS args,
--          p.prosecdef AS security_definer,
--          pg_get_functiondef(p.oid) AS def
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname LIKE 'get_wallet_balance%'
--   ORDER BY p.proname;
--   -- Expect: ONLY get_wallet_balance(uuid) remains. For every other row:
--   --   * if it accepts a client-supplied user-id parameter, either
--   --       DROP FUNCTION public.<name>(<args>);            -- if unused
--   --     or re-create it auth-derived exactly like this migration; and
--   --   * REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT ... TO authenticated, service_role;
--   -- Re-run this query until only get_wallet_balance(uuid) is returned.
-- ============================================================================
