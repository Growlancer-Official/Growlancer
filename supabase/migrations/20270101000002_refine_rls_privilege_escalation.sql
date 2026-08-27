-- ═══════════════════════════════════════════════════════════════════════════
-- REFINEMENT: Allow onboarding role selection (freelancer↔client) while
-- still blocking privilege escalation (role='admin', is_pro, verification_status)
--
-- Previous migration (20270101000001) blocked ALL role changes. This is too
-- restrictive: the onboarding flow legitimately changes role from 'freelancer'
-- to 'client' (or vice versa) when the user picks their role on the welcome
-- step. Only 'admin' escalation must be blocked.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. PROFILES — refined WITH CHECK
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- is_pro must not change (only set by SECURITY DEFINER subscription RPCs)
    AND is_pro = (SELECT is_pro FROM public.profiles WHERE id = auth.uid())
    -- verification_status must not change (only set by kyc_verify_row SECURITY DEFINER)
    AND verification_status = (SELECT verification_status FROM public.profiles WHERE id = auth.uid())
    -- role must not escalate to 'admin' (freelancer↔client allowed for onboarding)
    AND role IN ('freelancer', 'client')
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2. FREELANCER_PROFILES — unchanged from previous migration
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Freelancers can update own" ON public.freelancer_profiles;

CREATE POLICY "Freelancers can update own" ON public.freelancer_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- verification_status must not change (only set by kyc_verify_row SECURITY DEFINER)
    AND verification_status = (SELECT verification_status FROM public.freelancer_profiles WHERE user_id = auth.uid())
    -- seller_level must not change (only set by recompute_seller_level SECURITY DEFINER)
    AND seller_level = (SELECT seller_level FROM public.freelancer_profiles WHERE user_id = auth.uid())
  );
