-- ============================================================
-- SECURITY HARDENING v6 — profiles no longer anon-readable
--
-- profiles contains email, phone, is_admin, verification_status,
-- kyc_verified_at, suspend_reason — ALL rows were readable by
-- ANYONE (including unauthenticated anon) via "Anyone can view
-- profiles" (USING true), i.e. emails/phones could be scraped
-- with a single anon-key query.
--
-- Public marketplace browsing (freelancer listings, public
-- profiles, services, projects) reads freelancer_profiles /
-- services / projects — NOT profiles — so restricting the
-- profiles table to authenticated users breaks nothing.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;

-- Authenticated users may read profile rows (needed for contract
-- parties, proposals, reviews joins). Anonymous clients get ZERO
-- rows — emails/phones/is_admin are no longer scrapeable.
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
