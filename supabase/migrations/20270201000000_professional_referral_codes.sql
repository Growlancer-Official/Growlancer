-- ============================================================================
-- Professional referral codes — `GRW-XXXX-XXXX`
--
-- Why: the old shape `GRW-<ROLE>-<4 chars>` leaked whether the owner was a
-- freelancer or a client, exposed the role in every shared link, and had only
-- 36^4 possible codes. The canonical format is the brand prefix plus 8 symbols
-- from an ambiguity-free alphabet (no 0/O, 1/I/L/U), grouped in fours.
--
-- What this migration does:
--   1. public.generate_referral_code() — the single server-side generator.
--   2. public.normalize_referral_code() — dash/case tolerant comparison.
--   3. BEFORE INSERT trigger on profiles_private — every writer (signup
--      trigger, create_user_profile RPC, admin tools) emits the new format.
--   4. process_referral — looks codes up by their normalized form, so a code
--      pasted with or without dashes, in any case, still credits the referrer.
--
-- Existing codes are NOT rewritten: a link someone already shared must keep
-- working. The trigger only formats codes on INSERT.
-- ============================================================================

-- ─── 1. Generator ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  -- No 0/O, 1/I/L, U — characters people mistype reading a code off a screen.
  v_alphabet CONSTANT text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_hex text;
  v_byte integer;
  v_code text;
  v_attempt integer := 0;
BEGIN
  WHILE v_attempt < 25 LOOP
    v_attempt := v_attempt + 1;

    -- 16 hex chars → 8 random bytes. `byte % 32` is uniform because 32
    -- divides 256 exactly.
    v_hex := md5(
      random()::text || clock_timestamp()::text || coalesce(txid_current()::text, '') || v_attempt::text
    );
    v_code := 'GRW-';

    FOR i IN 0..7 LOOP
      v_byte := ('x' || substr(v_hex, i * 2 + 1, 2))::bit(8)::integer;
      v_code := v_code || substr(v_alphabet, (v_byte % 32) + 1, 1);
      IF i = 3 THEN
        v_code := v_code || '-';
      END IF;
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles_private pp WHERE pp.referral_code = v_code
    );
  END LOOP;

  IF v_attempt >= 25 AND EXISTS (
    SELECT 1 FROM public.profiles_private pp WHERE pp.referral_code = v_code
  ) THEN
    RAISE EXCEPTION 'generate_referral_code: could not find a free code after 25 attempts';
  END IF;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.generate_referral_code() IS
  'Single source of truth for the GRW-XXXX-XXXX referral code format. Checks profiles_private for collisions before returning.';

-- ─── 2. Normalization ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_referral_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

COMMENT ON FUNCTION public.normalize_referral_code(text) IS
  'Dash- and case-tolerant form of a referral code: GRW-7K2M-9QXT, grw7k2m9qxt and GRW7K2M9QXT all normalize to GRW7K2M9QXT.';

-- ─── 3. Every insert emits the canonical format ───────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_professional_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '' THEN
    NEW.referral_code := public.generate_referral_code();
    RETURN NEW;
  END IF;

  -- The signup trigger still builds `GRW-<ROLE>-<hash>` locally. Rewrite that
  -- auto-generated shape on insert so role data never reaches a shared code.
  -- (Existing rows are untouched: UPDATE never passes through this trigger.)
  IF NEW.referral_code ~* '^GRW-[A-Z]{2}-[0-9A-Z]{4,8}$' THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_professional_referral_code ON public.profiles_private;
CREATE TRIGGER enforce_professional_referral_code
  BEFORE INSERT ON public.profiles_private
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_professional_referral_code();

CREATE INDEX IF NOT EXISTS idx_profiles_private_referral_code
  ON public.profiles_private (referral_code);

-- ─── 4. Referral lookup tolerates the formatting the user actually pasted ──
-- Behaviour is unchanged except for the comparison itself and the code that is
-- recorded on the referral row (the referrer's stored code, not the input).
CREATE OR REPLACE FUNCTION public.process_referral(
  p_referral_code text,
  p_new_user_id uuid,
  p_new_user_email text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_code TEXT;
  v_normalized TEXT := public.normalize_referral_code(p_referral_code);
BEGIN
  IF p_new_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_normalized = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No referral code provided');
  END IF;

  IF p_new_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user ID provided');
  END IF;

  SELECT pp.id, pp.referral_code
    INTO v_referrer_id, v_referrer_code
  FROM public.profiles_private pp
  WHERE public.normalize_referral_code(pp.referral_code) = v_normalized
    AND pp.id != p_new_user_id
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referrer_id = v_referrer_id AND referred_user_id = p_new_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already referred');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, referred_email, referral_code, status, bonus_claimed)
  VALUES (v_referrer_id, p_new_user_id, p_new_user_email, v_referrer_code, 'pending', false);

  INSERT INTO public.referral_stats (user_id, total_referrals, valid_referrals, points, level, updated_at)
  VALUES (v_referrer_id, 1, 0, 0, 1, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_referrals = COALESCE(referral_stats.total_referrals, 0) + 1,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id
  );
END;
$$;
