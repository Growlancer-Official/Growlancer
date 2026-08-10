-- KYC sweep guard: never re-process rows already flagged for manual admin
-- review (rejection_reason set) — otherwise the 10-minute cron re-validates
-- them forever. Only fresh pending submissions are auto-verified.
CREATE OR REPLACE FUNCTION public.auto_verify_kyc()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT id
    FROM public.identity_verifications
    WHERE status = 'pending'
      AND coalesce(rejection_reason, '') = ''
      AND created_at <= now() - interval '10 minutes'
  LOOP
    PERFORM public.kyc_verify_row(v_row.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
