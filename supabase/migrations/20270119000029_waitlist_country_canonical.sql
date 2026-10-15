-- ═══════════════════════════════════════════════════════════════════════════════
-- Waitlist country consistency — one spelling per country, everywhere
--
-- Two entry points wrote two different shapes of the same fact:
--   • onboarding's dropdown  → `join_country_waitlist('United States')`, resolved
--     against public.countries before the INSERT;
--   • the OAuth country gate → `join_waitlist(p_country: 'US')`, stored raw.
--
-- So the admin's "Interest by Country" chart counted US and United States as two
-- separate countries, and neither matched the names normalize_country() produces
-- for profiles. "Everywhere, A→Z, never more in one place than another" is a data
-- contract, not a UI preference.
--
-- Fix in the same order the codebase already uses (20270119000011):
--   1. the write path normalizes (join_waitlist, the only raw writer left)
--   2. existing rows converge on the canonical name (idempotent backfill)
--   3. fail-closed assertions, plus a positive control that proves the
--      normalization actually runs
--
-- Security notes (CLAUDE.md): §6 join_waitlist keeps the caller-owns-p_user_id
-- guard and never derives identity from the body; §4 no privilege change here —
-- grants are re-stated below exactly as 20270119000028 left them (anon keeps its
-- pre-signup capture path on purpose).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. join_waitlist: store the canonical name the whole platform uses ───────
-- Body is otherwise the shipped one (20270119000028): the uuid id read, the
-- country-required check, the caller-owns guard, the idempotent UPDATE/INSERT.
-- The only change is that p_country now passes through public.normalize_country,
-- which resolves 'US' → 'United States' (and passes through an already-canonical
-- name unchanged, so this is idempotent for existing callers).
CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_email text,
  p_country text,
  p_signup_source text DEFAULT 'oauth',
  p_user_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_existing_id uuid;
  v_result jsonb;
  v_country text;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF; -- authz-guard: caller-owns-p_user_id

  IF p_country IS NULL OR btrim(p_country) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Country is required');
  END IF;

  -- Canonical name: ISO codes and legacy spellings converge on countries.name,
  -- which is what profiles.country and join_country_waitlist already store.
  -- Fully qualified because this function runs with search_path = ''.
  v_country := public.normalize_country(p_country);

  SELECT w.id INTO v_existing_id
  FROM public.waitlist w
  WHERE lower(w.email) = lower(btrim(p_email))
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.waitlist w
    SET
      country = v_country,
      signup_source = COALESCE(p_signup_source, w.signup_source),
      user_id = COALESCE(p_user_id, w.user_id),
      name = COALESCE(p_name, w.name),
      updated_at = now()
    WHERE w.id = v_existing_id
    RETURNING jsonb_build_object(
      'success', true,
      'waitlist_id', w.id,
      'already_exists', true
    ) INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Update failed'));
  END IF;

  INSERT INTO public.waitlist (email, name, country, signup_source, user_id)
  VALUES (lower(btrim(p_email)), p_name, v_country, p_signup_source, p_user_id)
  RETURNING jsonb_build_object(
    'success', true,
    'waitlist_id', id,
    'already_exists', false
  ) INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Insert failed'));
END;
$fn$;

-- Grants unchanged: pre-signup capture still runs before a session exists.
REVOKE ALL ON FUNCTION public.join_waitlist(text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waitlist(text, text, text, uuid, text) TO anon, authenticated, service_role;

-- ─── 2. Existing rows: converge on the canonical name (idempotent) ────────────
-- normalize_country falls back to btrim(input) for a value it cannot resolve
-- (e.g. a legacy 'OTHER'), so nothing is nulled out or lost by this pass.
UPDATE public.waitlist w
SET country = public.normalize_country(w.country),
    updated_at = now()
WHERE w.country IS NOT NULL
  AND public.normalize_country(w.country) IS DISTINCT FROM w.country;

-- ─── 3. Fail-closed assertions ────────────────────────────────────────────────
DO $assert$
DECLARE
  v_count integer;
  v_oid oid;
  v_resolved text;
BEGIN
  -- 3a. The write path must normalize — read prosrc, because "did the body
  --     change" is the whole point of this migration.
  SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'join_waitlist'
     AND p.prosrc LIKE '%normalize_country%';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'assertion failed: join_waitlist does not normalize the country it stores';
  END IF;

  -- 3b. No ISO-code country may remain in the waitlist — a code that resolves
  --     to a country name is exactly the split this migration removes.
  SELECT count(*) INTO v_count
    FROM public.waitlist w
   WHERE w.country IS NOT NULL
     AND public.normalize_country(w.country) IS DISTINCT FROM w.country;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'assertion failed: % waitlist row(s) still hold a non-canonical country', v_count;
  END IF;

  -- 3c. normalize_country must still resolve a code → name (the helper this
  --     migration depends on), asserted by calling it, not by grepping it.
  SELECT public.normalize_country('US') INTO v_resolved;
  IF v_resolved IS DISTINCT FROM 'United States' THEN
    RAISE EXCEPTION 'assertion failed: normalize_country(''US'') = %, expected United States', v_resolved;
  END IF;

  -- 3d. Grants — resolved by OID so a wrong arg list cannot silently pass.
  v_oid := to_regprocedure('public.join_waitlist(text,text,text,uuid,text)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'assertion failed: join_waitlist(text,text,text,uuid,text) missing after rewrite';
  END IF;
  IF NOT has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon lost EXECUTE on join_waitlist() (pre-signup capture)';
  END IF;
  IF has_function_privilege('public', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: PUBLIC regained EXECUTE on join_waitlist()';
  END IF;
END $assert$;

-- ─── 4. Positive control — 3b must be able to fail ────────────────────────────
-- Plant an un-normalized row, prove the assertion above sees it, remove it.
-- A check that cannot fail is not a check. (The whole migration is one
-- transaction: if this control raises, the INSERT rolls back with it.)
DO $control$
DECLARE
  v_count integer;
  v_email constant text := '__country_canonical_control__@example.invalid';
BEGIN
  INSERT INTO public.waitlist (email, name, country, signup_source)
  VALUES (v_email, 'Control', 'US', 'onboarding_dropdown');

  -- the EXACT predicate assertion 3b uses
  SELECT count(*) INTO v_count
    FROM public.waitlist w
   WHERE w.country IS NOT NULL
     AND public.normalize_country(w.country) IS DISTINCT FROM w.country;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: the canonical-country check did not see a planted US row';
  END IF;

  DELETE FROM public.waitlist w WHERE w.email = v_email;

  SELECT count(*) INTO v_count
    FROM public.waitlist w
   WHERE w.email = v_email;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: the planted row survived the cleanup';
  END IF;

  -- the live table must be clean again (assertion 3b re-runs on every deploy)
  SELECT count(*) INTO v_count
    FROM public.waitlist w
   WHERE w.country IS NOT NULL
     AND public.normalize_country(w.country) IS DISTINCT FROM w.country;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: % row(s) left non-canonical after cleanup', v_count;
  END IF;
END $control$;
