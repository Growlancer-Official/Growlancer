-- ══════════════════════════════════════════════════════════════════════════════
-- DISPOSABLE EMAIL BLOCKLIST UPGRADE — 8,310 community-curated domains
-- Source: https://github.com/disposable-email-domains/disposable-email-domains
-- ══════════════════════════════════════════════════════════════════════════════
-- This migration:
-- 1. Creates a dedicated disposable_email_domains table
-- 2. Seeds it from the community blocklist (8,310 domains)
-- 3. Replaces the old inline-array is_disposable_email_domain() function
--    with a table-backed version that also matches subdomains
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Create the lookup table
CREATE TABLE IF NOT EXISTS public.disposable_email_domains (
  domain TEXT PRIMARY KEY
);

TRUNCATE public.disposable_email_domains;

-- 2. Seed from community blocklist
-- NOTE: The actual domain data is loaded via supabase db query --file
-- from disposable_email_blocklist_2026.txt (8,310 entries).
-- This file serves as the migration record; data loading is done
-- separately because the INSERT statements are too large for a
-- single migration file.

-- 3. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_ded_domain ON public.disposable_email_domains (domain);

-- 4. RLS — only service_role and authenticated can read
ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.disposable_email_domains
  FOR ALL TO service_role USING (true);
CREATE POLICY "Authenticated read" ON public.disposable_email_domains
  FOR SELECT TO authenticated USING (true);

-- 5. Updated function — uses table lookup with subdomain matching
CREATE OR REPLACE FUNCTION public.is_disposable_email_domain(p_domain text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  d text := lower(btrim(p_domain));
  pos int;
BEGIN
  -- Direct match
  IF EXISTS (SELECT 1 FROM public.disposable_email_domains WHERE domain = d) THEN
    RETURN true;
  END IF;
  -- Subdomain match (foo.mailinator.com → mailinator.com)
  LOOP
    pos := position('.' IN d);
    IF pos = 0 THEN RETURN false; END IF;
    d := substring(d FROM pos + 1);
    IF EXISTS (SELECT 1 FROM public.disposable_email_domains WHERE domain = d) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;
