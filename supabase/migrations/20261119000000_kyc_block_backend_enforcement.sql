-- KYC: Backend enforcement of the 24-hour cooldown.
-- The 24h block was previously enforced only in the frontend — a blocked user
-- could insert a fresh row (rejection_count resets to 0) and bypass the cooldown.
-- This BEFORE INSERT trigger raises an exception whenever the user already has a
-- row with blocked_until in the future (active block).

CREATE OR REPLACE FUNCTION public.kyc_guard_submit_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked_until timestamptz;
BEGIN
  -- Look up the most recent verification for this user.
  SELECT blocked_until
    INTO v_blocked_until
    FROM public.identity_verifications
   WHERE user_id = NEW.user_id
     AND blocked_until IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_blocked_until IS NOT NULL AND v_blocked_until > now() THEN
    RAISE EXCEPTION
      'KYC submission blocked until % (cooldown after 3 failed attempts)',
      v_blocked_until;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kyc_guard_submit ON public.identity_verifications;
CREATE TRIGGER kyc_guard_submit
  BEFORE INSERT ON public.identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.kyc_guard_submit_fn();
