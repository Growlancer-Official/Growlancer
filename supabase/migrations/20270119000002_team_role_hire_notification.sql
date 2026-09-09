-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000002_team_role_hire_notification.sql
--
-- Completes the pending "team-project freelancer notification" gap.
--
-- Previously create_team_role_contract() created the contract + escrow with
-- NO notification to the freelancer — the client could hire a freelancer for
-- a team role and the freelancer would never be told (they'd only discover it
-- by browsing their contracts list). This adds a best-effort in-app
-- notification (type 'contract') telling the freelancer they've been hired.
--
-- The contract stays 'pending' with escrow_funded=false, so NO money moves
-- until the client funds the contract — this notification never authorizes a
-- transfer. A notification failure is explicitly non-fatal (RAISE NOTICE, not
-- an exception) so it can never block contract creation.
--
-- Idempotent: CREATE OR REPLACE FUNCTION (identical signature/grants).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_team_role_contract(
  p_team_project_id UUID,
  p_team_project_role_id UUID,
  p_freelancer_id UUID,
  p_amount NUMERIC,
  p_client_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public, pg_catalog'
AS $$
DECLARE
  v_contract_id UUID;
  v_platform_fee NUMERIC;
  v_freelancer_amount NUMERIC;
  v_role_status TEXT;
  v_project_title TEXT;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Role must belong to this team project and be fillable
  SELECT status INTO v_role_status
  FROM public.team_project_roles
  WHERE id = p_team_project_role_id AND team_project_id = p_team_project_id;
  IF v_role_status IS NULL THEN
    RAISE EXCEPTION 'Role not found on this team project';
  END IF;
  IF v_role_status NOT IN ('open','matched') THEN
    RAISE EXCEPTION 'Role is not open for hiring';
  END IF;

  -- Amount must be positive and bounded (same cap as the single-contract RPC)
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Invalid contract amount';
  END IF;

  -- Same fee math as create_contract_with_escrow: the flat 5% platform fee is
  -- charged to the CLIENT on top at payment time (order = amount + 5%). The
  -- freelancer receives 100% of the role amount in their wallet.
  v_platform_fee := ROUND(p_amount * 0.05, 2);
  v_freelancer_amount := p_amount; -- 100% to the freelancer

  INSERT INTO public.contracts (
    project_id, freelancer_id, client_id, amount, platform_fee,
    freelancer_amount, status, escrow_funded,
    team_project_id, team_project_role_id
  ) VALUES (
    NULL, p_freelancer_id, p_client_id, p_amount, v_platform_fee,
    v_freelancer_amount, 'pending', false,
    p_team_project_id, p_team_project_role_id
  )
  RETURNING id INTO v_contract_id;

  -- escrow.client_id / freelancer_id are NOT NULL — required for the existing
  -- release_escrow payout path (full pool belongs to the freelancer).
  INSERT INTO public.escrow (contract_id, client_id, freelancer_id, amount, status)
  VALUES (v_contract_id, p_client_id, p_freelancer_id, p_amount, 'pending');

  -- Notify the freelancer in-app that they've been hired for a team role.
  -- Best-effort ONLY: a notification failure must never block the contract.
  BEGIN
    SELECT title INTO v_project_title
    FROM public.team_projects
    WHERE id = p_team_project_id;

    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      p_freelancer_id,
      'contract',
      'You''ve been hired for a team role! 🎉',
      'A client selected you for "' || coalesce(v_project_title, 'a team project') ||
        '". Your contract is ready — you''ll be notified once it''s funded and active.',
      '/dashboard/contracts',
      jsonb_build_object(
        'team_project_id', p_team_project_id,
        'team_project_role_id', p_team_project_role_id,
        'contract_id', v_contract_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Team role hire notification failed (contract %): %', v_contract_id, SQLERRM;
  END;

  RETURN v_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_role_contract(UUID, UUID, UUID, NUMERIC, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_team_role_contract(UUID, UUID, UUID, NUMERIC, UUID) FROM PUBLIC, anon;