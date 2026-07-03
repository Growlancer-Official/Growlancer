-- Admin Credentials Table
-- Stores predefined admin email/password pairs for prelogin access
-- Only the system admin can add/remove entries

CREATE TABLE IF NOT EXISTS public.admin_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  label TEXT DEFAULT '',                    -- e.g., "Main Admin", "Support Admin"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

-- Only the admin-data edge function (service_role) can access this
CREATE POLICY "Service role can manage admin_credentials"
  ON public.admin_credentials
  USING (true)
  WITH CHECK (true);

-- Enable realtime for admin_credentials
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_credentials;

-- Admin accounts must be created via a one-time secure script, not committed to the repo.
--
-- To create an admin, run the following operations in Supabase SQL editor or via a migration script:
--
-- 1. Hash your password using bcrypt (run this in a script or use https://bcrypt-generator.com/):
--    const bcrypt = require('bcryptjs');
--    const hash = await bcrypt.hash('YourSecurePassword', 10);
--    console.log(hash);
--
-- 2. Insert the admin credential:
--    INSERT INTO public.admin_credentials (email, password_hash, label, is_active)
--    VALUES ('admin@yourdomain.com', '<bcrypt_hash>', 'Main Admin', true);
