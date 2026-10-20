-- ============================================================================
-- Upgrade unused legacy referral codes to `GRW-XXXX-XXXX`
--
-- 20270201000000 only formats codes written from then on, so existing accounts
-- kept the old `GRW-<ROLE>-<hash>` shape — and would keep showing it on their
-- referral page forever. That defeats the point of the change.
--
-- Guard rails (a shared link must never die):
--   • only codes matching the AUTO-GENERATED legacy shape are touched, so a
--     hand-picked code an admin set is left alone;
--   • only accounts with NO referral rows are touched, in both directions —
--     a code that earned or was recorded in a referral has already been used
--     by someone and stays valid;
--   • the new code comes from public.generate_referral_code(), which checks
--     for collisions against profiles_private.
--
-- Every untouched account keeps a working link. Every upgraded account gets the
-- branded format immediately — the referral page reads the code live.
-- ============================================================================

DO $upgrade_codes$
DECLARE
  v_row record;
  v_upgraded integer := 0;
BEGIN
  FOR v_row IN
    SELECT pp.id
    FROM public.profiles_private pp
    WHERE pp.referral_code ~* '^GRW-[A-Z]{2}-[0-9A-Z]{4,8}$'
      AND NOT EXISTS (
        SELECT 1 FROM public.referrals r WHERE r.referrer_id = pp.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.referrals r2 WHERE r2.referral_code = pp.referral_code
      )
  LOOP
    UPDATE public.profiles_private
       SET referral_code = public.generate_referral_code()
     WHERE id = v_row.id;

    v_upgraded := v_upgraded + 1;
  END LOOP;

  RAISE NOTICE 'upgraded % unused legacy referral code(s) to GRW-XXXX-XXXX', v_upgraded;
END
$upgrade_codes$;

COMMENT ON FUNCTION public.generate_referral_code() IS
  'Single source of truth for the GRW-XXXX-XXXX referral code format. Checks profiles_private for collisions before returning. Used by the signup trigger, the profiles_private insert trigger and the legacy-code upgrade migration.';
