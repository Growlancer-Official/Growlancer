-- Fix: fund_escrow auth check fails when called from webhooks (service_role)
-- fund_escrow is called from paypal-webhook via service_role where auth.uid() is NULL.
-- Add service_role bypass (same pattern as wallet RPCs).

CREATE OR REPLACE FUNCTION public.fund_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow service_role (webhook edge functions) OR the contract owner
  IF (current_setting('role', true) <> 'service_role') AND p_client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN public.admin_fund_escrow(p_contract_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fund_escrow(UUID, UUID) TO authenticated, service_role;
