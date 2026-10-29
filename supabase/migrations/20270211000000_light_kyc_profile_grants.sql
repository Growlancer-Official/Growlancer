-- ─────────────────────────────────────────────────────────────────────────────
-- Light KYC added four columns to `public.profiles` but did not extend the
-- reviewed `authenticated` SELECT allowlist from 20270119000025.
--
-- That migration is explicit about the rule: "from now on, a migration that ADDs
-- a profile column must also GRANT SELECT on it (to authenticated, and to anon
-- only if it is genuinely public) — otherwise those wildcard embeds fail loudly.
-- That is the intended fail-closed behaviour."
--
-- It did fail loudly: after 20270210000000 the live privilege pentest reported
-- 0/5 on "own profile name still writable after completing onboarding", because
-- PostgREST's `PATCH /profiles … RETURNING *` expands to every column and the
-- four new ones were unreadable for `authenticated`. The same breakage hit the
-- six `profiles!fk(*)` embeds (contracts, workspace, proposals, disputes).
--
-- This migration closes it the way the boundary was designed:
--   • grant SELECT on the four new columns to `authenticated` only — none of
--     them is public browsing data, so `anon` gets nothing;
--   • extend the detector's allowlist in the same breath, so the hourly
--     security-drift sweep does not alert on a reviewed column;
--   • prove the boundary is clean before this migration can commit.
--
-- What the columns are: `kyc_name` (the legal name the user confirmed — the
-- profile already carries a public display `name`), `phone_verified_at` (when
-- the OTP was confirmed; the product shows a verified badge), and the two
-- bookkeeping fields `kyc_last_checked_at` / `kyc_method`. No phone number, no
-- document reference and no provider payload is stored on this table.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT (
  kyc_name,
  phone_verified_at,
  kyc_last_checked_at,
  kyc_method
) ON public.profiles TO authenticated;

-- ── Detector: same body as 20270119000025 with the four reviewed columns ────
CREATE OR REPLACE FUNCTION public.authenticated_readable_profile_columns()
RETURNS TABLE(column_name text, reason text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
  WITH allowlist(column_name) AS (
    VALUES ('id'), ('role'), ('name'), ('avatar'), ('is_pro'),
           ('created_at'), ('updated_at'), ('rating'), ('total_reviews'),
           ('deleted_at'), ('country'), ('verification_status'),
           ('kyc_verified_at'), ('name_changed_at'),
           ('kyc_name'), ('phone_verified_at'), ('kyc_last_checked_at'),
           ('kyc_method')
  )
  SELECT '*',
         'authenticated holds table-level SELECT on public.profiles — every current AND future column is readable by any signed-in account'
   WHERE has_table_privilege('authenticated', 'public.profiles', 'SELECT')
  UNION ALL
  SELECT c.column_name,
         'authenticated can SELECT public.profiles.' || c.column_name || ' but it is not part of the reviewed allowlist'
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'profiles'
     AND has_column_privilege('authenticated', 'public.profiles', c.column_name, 'SELECT')
     AND c.column_name NOT IN (SELECT a.column_name FROM allowlist a);
$function$;

REVOKE ALL ON FUNCTION public.authenticated_readable_profile_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authenticated_readable_profile_columns() TO service_role;

-- ── Fail-closed deploy check ────────────────────────────────────────────────
DO $kyc_grant_check$
DECLARE
  v_count integer;
  v_detail text;
BEGIN
  -- 1. The boundary must be clean: every column readable by `authenticated` is
  --    now in the reviewed allowlist (branch 2), and no table-level grant came
  --    back (branch 1).
  SELECT count(*) INTO v_count FROM public.authenticated_readable_profile_columns();
  IF v_count <> 0 THEN
    SELECT string_agg(column_name || ' — ' || reason, ' | ')
      INTO v_detail FROM public.authenticated_readable_profile_columns();
    RAISE EXCEPTION 'authenticated profile-column boundary is not clean after the KYC grants: %',
      coalesce(v_detail, '(unavailable)');
  END IF;

  -- 2. Anon must NOT have picked the KYC columns up: none of them is public.
  SELECT count(*) INTO v_count
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'profiles'
     AND c.column_name IN ('kyc_name', 'phone_verified_at', 'kyc_last_checked_at', 'kyc_method')
     AND has_column_privilege('anon', 'public.profiles', c.column_name, 'SELECT');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'anon must not read the light-KYC columns (found % readable)', v_count;
  END IF;

  -- 3. And the reverse guard: the four columns must genuinely be readable by a
  --    signed-in account, or PATCH … RETURNING * breaks again.
  SELECT count(*) INTO v_count
    FROM unnest(ARRAY['kyc_name', 'phone_verified_at', 'kyc_last_checked_at', 'kyc_method']) AS t(col)
   WHERE has_column_privilege('authenticated', 'public.profiles', t.col, 'SELECT');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'only % of the 4 light-KYC columns are readable by authenticated', v_count;
  END IF;
END
$kyc_grant_check$;
