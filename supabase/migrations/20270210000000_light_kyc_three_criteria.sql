-- ─────────────────────────────────────────────────────────────────────────────
-- LIGHT KYC — name + email + phone. Both roles. Verified in real time.
--
-- Product decision (founder, Oct 2026): as an early-stage startup the identity
-- check is exactly three criteria and nothing else:
--
--   1. NAME  — the legal name on file. Self-declared, must read as a real full
--              name (two or more words, letters/spaces/'-/. only).
--   2. EMAIL — confirmed through the auth provider. The truth is
--              auth.users.email_confirmed_at, which only the email link can set.
--   3. PHONE — confirmed OTP. The truth is auth.users.phone_confirmed_at, which
--              only a code delivered to the number can set.
--
-- PAN, GSTIN, Aadhaar, business registrations and document uploads are NOT part
-- of this flow and are deliberately absent from it.
--
-- The app can never write profiles.verification_status directly (the privilege
-- trigger blocks self-modification), so this SECURITY DEFINER function is the
-- only writer: it DERIVES the status from the auth record and never trusts a
-- client-supplied "verified" claim.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_name TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_method TEXT;

COMMENT ON COLUMN public.profiles.kyc_name IS
  'Legal name captured in the light KYC flow (self-declared, 2+ words).';
COMMENT ON COLUMN public.profiles.phone_verified_at IS
  'Mirror of auth.users.phone_confirmed_at for fast reads in the app.';
COMMENT ON COLUMN public.profiles.kyc_method IS
  'Which verification path produced the current status: light | document (legacy).';

-- ── The evaluator ────────────────────────────────────────────────────────────
-- Called by the KYC page after each step (name saved, email confirmed, phone
-- confirmed) and idempotent: it recomputes all three criteria from source and
-- writes the resulting status. A previously verified identity is never
-- downgraded by a later visit, and an admin-owned rejection/pending state is
-- never overwritten.
CREATE OR REPLACE FUNCTION public.refresh_light_kyc(p_full_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $refresh_light_kyc$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := coalesce(auth.role(), '');
  v_name TEXT;
  v_words INTEGER;
  v_email_confirmed TIMESTAMPTZ;
  v_phone TEXT;
  v_phone_confirmed TIMESTAMPTZ;
  v_name_ok BOOLEAN;
  v_email_ok BOOLEAN;
  v_phone_ok BOOLEAN;
  v_complete BOOLEAN;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- 1. NAME ──────────────────────────────────────────────────────────────────
  IF p_full_name IS NOT NULL THEN
    v_name := nullif(btrim(regexp_replace(p_full_name, '\s+', ' ', 'g')), '');
    IF v_name IS NULL OR length(v_name) < 3 THEN
      RAISE EXCEPTION 'enter your full name' USING ERRCODE = '22023';
    END IF;
    IF length(v_name) > 120 THEN
      RAISE EXCEPTION 'name is too long' USING ERRCODE = '22023';
    END IF;
    IF v_name !~ '^[A-Za-z][A-Za-z .''-]+$' THEN
      RAISE EXCEPTION 'name may only contain letters, spaces, hyphens and apostrophes'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.profiles
       SET kyc_name = v_name,
           name = coalesce(nullif(btrim(name), ''), v_name)
     WHERE id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'profile missing' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT p.kyc_name INTO v_name FROM public.profiles p WHERE p.id = v_uid;
  END IF;

  IF v_name IS NOT NULL THEN
    v_words := array_length(regexp_split_to_array(btrim(v_name), '\s+'), 1);
  ELSE
    v_words := 0;
  END IF;
  v_name_ok := coalesce(v_words, 0) >= 2;

  -- 2. EMAIL / 3. PHONE — read straight from the auth record ──────────────────
  SELECT u.email_confirmed_at, u.phone, u.phone_confirmed_at
    INTO v_email_confirmed, v_phone, v_phone_confirmed
    FROM auth.users u
   WHERE u.id = v_uid;

  v_email_ok := v_email_confirmed IS NOT NULL;
  v_phone_ok := v_phone_confirmed IS NOT NULL AND coalesce(v_phone, '') <> '';
  v_complete := v_name_ok AND v_email_ok AND v_phone_ok;

  -- The privilege trigger on profiles exists to stop a client from writing
  -- these columns itself; this function is the sanctioned writer.
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.profiles
     SET kyc_last_checked_at = now(),
         phone_verified_at = CASE WHEN v_phone_ok THEN v_phone_confirmed ELSE phone_verified_at END,
         verification_status = CASE WHEN v_complete THEN 'verified' ELSE verification_status END,
         kyc_verified_at = CASE WHEN v_complete THEN coalesce(kyc_verified_at, now()) ELSE kyc_verified_at END,
         kyc_method = CASE WHEN v_complete THEN coalesce(kyc_method, 'light') ELSE kyc_method END
   WHERE id = v_uid;

  -- Freelancer profiles carry the same status for the marketplace UI.
  IF v_complete THEN
    UPDATE public.freelancer_profiles
       SET verification_status = 'verified'
     WHERE user_id = v_uid
       AND verification_status IS DISTINCT FROM 'verified';
  END IF;

  PERFORM set_config('app.bypass_privilege_check', 'false', true);

  SELECT p.verification_status INTO v_status FROM public.profiles p WHERE p.id = v_uid;

  RETURN jsonb_build_object(
    'status', v_status,
    'name', v_name,
    'name_ok', v_name_ok,
    'email_ok', v_email_ok,
    'phone_ok', v_phone_ok,
    'phone_masked', CASE
      WHEN v_phone IS NULL OR length(v_phone) < 4 THEN NULL
      ELSE repeat('•', greatest(length(v_phone) - 4, 1)) || right(v_phone, 4)
    END,
    'verified', v_status = 'verified'
  );
END;
$refresh_light_kyc$;

REVOKE ALL ON FUNCTION public.refresh_light_kyc(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_light_kyc(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.refresh_light_kyc(TEXT) IS
  'Light KYC for both roles: derives verification_status from the legal name, the confirmed email and the confirmed phone on the auth record. The only writer of profiles.verification_status for the light flow.';
