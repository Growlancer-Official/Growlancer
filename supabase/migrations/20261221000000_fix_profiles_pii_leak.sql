-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: profiles PII leak — move sensitive columns to profiles_private
-- ═══════════════════════════════════════════════════════════════════════════

-- 0. Drop previous partial attempt objects
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_profile_private();
DROP FUNCTION IF EXISTS public.sync_profile_private();
DROP FUNCTION IF EXISTS public.get_my_private_profile();
DROP FUNCTION IF EXISTS public.get_user_email(UUID);
DROP FUNCTION IF EXISTS public.is_user_admin();
DROP TABLE IF EXISTS public.profiles_private CASCADE;

-- 1. Drop dependent objects before column removal
DROP VIEW IF EXISTS public.active_users;
DROP TRIGGER IF EXISTS trg_validate_india_phone ON public.profiles;

-- 2. Create profiles_private table FIRST (before any functions reference it)
CREATE TABLE public.profiles_private (
  id          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email       TEXT,
  phone       TEXT,
  is_admin    BOOLEAN DEFAULT FALSE,
  suspended_at TIMESTAMPTZ,
  suspend_reason TEXT,
  suspended_by  UUID,
  banned_at   TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  referral_code TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

-- 3. Migrate existing data
INSERT INTO public.profiles_private (
  id, email, phone, is_admin, suspended_at, suspend_reason, suspended_by,
  banned_at, onboarding_completed, referral_code, created_at, updated_at
)
SELECT
  id, email, phone, is_admin, suspended_at, suspend_reason, suspended_by,
  banned_at, onboarding_completed, referral_code,
  COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
FROM public.profiles
ON CONFLICT (id) DO NOTHING;

-- 4. RLS policies for profiles_private
CREATE POLICY "Owner reads own private profile"
  ON public.profiles_private FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Owner updates own private profile"
  ON public.profiles_private FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role full access on profiles_private"
  ON public.profiles_private FOR ALL USING (true) WITH CHECK (true);

-- 5. Recreate validate_india_phone for profiles_private
CREATE OR REPLACE FUNCTION public.validate_india_phone()
RETURNS TRIGGER AS $$
DECLARE
  raw_phone TEXT;
BEGIN
  raw_phone := COALESCE(NEW.phone, '');
  IF raw_phone = '' THEN RETURN NEW; END IF;
  IF raw_phone ~ '^\+91' THEN
    RAISE EXCEPTION 'International format (+91) is not allowed. Use 10-digit Indian format.';
  END IF;
  IF length(regexp_replace(raw_phone, '[^0-9]', '', 'g')) != 10 THEN
    RAISE EXCEPTION 'Phone number must be exactly 10 digits.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_india_phone
  BEFORE INSERT OR UPDATE ON public.profiles_private
  FOR EACH ROW EXECUTE FUNCTION public.validate_india_phone();

-- 6. Helper functions (can reference profiles_private now)
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles_private WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_private_profile()
RETURNS SETOF public.profiles_private
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles_private WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_email(target_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles_private WHERE id = target_user_id;
$$;

-- 7. Update user_reports_admin_all policy to use function instead of profiles.is_admin
DROP POLICY IF EXISTS "user_reports_admin_all" ON public.user_reports;
CREATE POLICY "user_reports_admin_all"
  ON public.user_reports FOR ALL
  USING (public.is_user_admin())
  WITH CHECK (public.is_user_admin());

-- 8. Sync triggers for profiles -> profiles_private
CREATE OR REPLACE FUNCTION public.handle_new_profile_private()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles_private (id, email, phone, is_admin, onboarding_completed, referral_code, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NEW.phone, COALESCE(NEW.is_admin, false), COALESCE(NEW.onboarding_completed, false), NEW.referral_code, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    is_admin = EXCLUDED.is_admin,
    onboarding_completed = EXCLUDED.onboarding_completed,
    referral_code = EXCLUDED.referral_code,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_private();

CREATE OR REPLACE FUNCTION public.sync_profile_private()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles_private SET
    email = COALESCE(NEW.email, OLD.email),
    phone = COALESCE(NEW.phone, OLD.phone),
    is_admin = COALESCE(NEW.is_admin, OLD.is_admin),
    onboarding_completed = COALESCE(NEW.onboarding_completed, OLD.onboarding_completed),
    referral_code = COALESCE(NEW.referral_code, OLD.referral_code),
    updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_updated
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_private();

-- 9. NOW drop sensitive columns from public profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS suspended_at;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS suspend_reason;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS suspended_by;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS banned_at;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS onboarding_completed;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS referral_code;

-- 10. Refresh the public profiles SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view public profiles"
  ON public.profiles FOR SELECT USING (true);

-- 11. Grants
GRANT SELECT, INSERT, UPDATE ON public.profiles_private TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(UUID) TO service_role;
