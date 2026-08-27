-- ═══════════════════════════════════════════════════════════════════════════
-- CRITICAL SECURITY FIX: Prevent privilege escalation via direct UPDATE
--
-- Vulnerability: The "Users can update own profile" RLS policy on `profiles`
-- only had USING (auth.uid() = id) with NO WITH CHECK clause. This means any
-- authenticated user could PATCH their own row and set role='admin', is_pro=true,
-- or verification_status='verified' — granting themselves admin access, PRO
-- badge, or verified status without going through the proper server-side flows.
--
-- Similarly, "Freelancers can update own" on `freelancer_profiles` had no
-- WITH CHECK, allowing self-escalation of seller_level and verification_status.
--
-- Fix: Replace both policies with WITH CHECK clauses:
--   - profiles: Block role escalation to 'admin' (freelancer↔client is allowed
--     for onboarding flow). Block is_pro and verification_status entirely.
--   - freelancer_profiles: Block verification_status and seller_level entirely.
--
-- All privileged changes go through SECURITY DEFINER functions (bypass RLS):
--   - role→admin → grant_admin_role() (admin-signup edge function, service_role)
--   - is_pro → subscription payment RPCs (pay_subscription_with_wallet, etc.)
--   - verification_status → kyc_verify_row() (auto-verification trigger)
--   - seller_level → recompute_seller_level() (contract completion trigger)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. PROFILES — prevent self-escalation of is_pro, verification_status,
--    and role escalation to 'admin'
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
-- 2. FREELANCER_PROFILES — prevent self-escalation of verification_status,
--    seller_level
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

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Verify admin & subscription paths are unaffected:
--
--    grant_admin_role() → SECURITY DEFINER, GRANT only to service_role
--    is_pro update → inside SECURITY DEFINER subscription payment RPCs
--    verification_status → kyc_verify_row() SECURITY DEFINER
--    seller_level → recompute_seller_level() SECURITY DEFINER
--
--    SECURITY DEFINER functions execute with the function owner's privileges,
--    so RLS WITH CHECK clauses are bypassed — these paths are unaffected.
-- ───────────────────────────────────────────────────────────────────────────
