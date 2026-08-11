-- ────────────────────────────────────────────────────────────────────────────
-- GROWLANCER — Close PII data leak + admin_users public write hole
-- Date: 2026-12-15
--
-- Fix 1: `profiles` — anon (kisi bhi bina-login visitor ko) email + phone
--        SELECT kar sakta tha ("Anyone can view profiles" qual=true).
--        Live exploit proven: anon key se `select('email')` kaam kar raha tha.
--        → REVOKE ALL from anon, phir SIRF safe public columns re-grant
--          (name, avatar, rating, is_pro, …). email / phone / is_admin /
--          suspend_reason / suspended_by hamesha anon se chhupe.
--        Signup safe hai: handle_new_user + create_user_profile dono
--          SECURITY DEFINER hain (postgres privileges se profile banate hain).
--
-- Fix 2: `admin_users` — "Service role can manage admin_users" policy was
--        created with roles = {public} + qual=true + with_check=true, meaning
--        ANY user (anon samet) SELECT/INSERT/UPDATE/DELETE kar sakta tha.
--        → DROP policy + admin-only SELECT policy.
--
-- Idempotent: dobara chalane par safe (REVOKE ALL → GRANT sequence).
-- ────────────────────────────────────────────────────────────────────────────

-- ── Fix 1: anon se saare profiles privileges hatao ────────────────────────
REVOKE ALL ON public.profiles FROM anon;

-- Sirf safe public columns grant (marketplace visibility ke liye).
-- email / phone / is_admin / suspend_reason / suspended_by kabhi nahi.
GRANT SELECT (
  id,
  role,
  name,
  avatar,
  onboarding_completed,
  is_pro,
  referral_code,
  created_at,
  updated_at,
  rating,
  total_reviews,
  deleted_at,
  suspended_at,
  banned_at,
  country
) ON public.profiles TO anon;

-- ── Fix 2: admin_users public ALL policy drop + admin-only SELECT ─────────
DROP POLICY IF EXISTS "Service role can manage admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
CREATE POLICY "Admins can view admin_users" ON public.admin_users
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Verify helpers (audit script + drift monitor ke liye) ─────────────────
-- anon ko profiles par SELECT(email)/SELECT(phone) false hona chahiye:
--   SELECT has_column_privilege('anon','public.profiles','email','SELECT'); -- false
--   SELECT has_column_privilege('anon','public.profiles','phone','SELECT'); -- false
-- anon ko name/avatar/rating SELECT true hona chahiye:
--   SELECT has_column_privilege('anon','public.profiles','name','SELECT');  -- true
-- admin_users par koi public policy nahi honi chahiye:
--   SELECT count(*) FROM pg_policies
--   WHERE schemaname='public' AND tablename='admin_users' AND roles::text LIKE '%{public}%'; -- 0
