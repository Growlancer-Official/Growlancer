-- ────────────────────────────────────────────────────────────────────────────
-- GROWLANCER — Drop open PUBLIC write policies (audit check 9 findings)
-- Date: 2026-12-15
--
-- 1. razorpay_transactions."Edge function can insert razorpay transactions"
--    → roles={public} + WITH CHECK true = KOI BHI user fake payment
--      transaction insert kar sakta tha (wahi hole jo audit v4 me
--      razorpay_orders ka tha). Edge function ab service-role (supabaseAdmin)
--      se insert karta hai — policy ki zaroorat nahi. DROP.
--
-- 2. newsletter_subscribers."Anyone can subscribe to newsletter"
--    → public INSERT + WITH CHECK true = bina rate-limit ke direct REST
--      spam possible. Frontend edge function invoke karta hai, aur wo function
--      pehle se SUPABASE_SERVICE_ROLE_KEY se insert karta hai (rate-limited +
--      disposable-email checked) — policy redundant. DROP.
--
-- SELECT policies (view-own / admin) untouched.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Edge function can insert razorpay transactions" ON public.razorpay_transactions;
DROP POLICY IF EXISTS "Anyone can subscribe to newsletter" ON public.newsletter_subscribers;

-- Verify:
--   SELECT policyname, cmd, roles, with_check FROM pg_policies
--   WHERE schemaname='public'
--     AND (tablename='razorpay_transactions' OR tablename='newsletter_subscribers')
--     AND cmd IN ('ALL','INSERT','UPDATE','DELETE');
--   → sirf "Admins can manage all subscribers" (ALL, admin-checked) bachegi
