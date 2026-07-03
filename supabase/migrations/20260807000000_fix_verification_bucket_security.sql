-- Fix Verification Documents Bucket Security
-- Change from public to private, add proper RLS with signed URLs
-- Also create missing identity_verifications and disputes table definitions

-- ====================================================================
-- 1. VERIFICATION-DOCUMENTS BUCKET: Make private with proper RLS
-- ====================================================================

-- Update bucket to private (public = false) with 10MB limit for docs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']::text[];

-- Drop any existing public read policies on verification-documents
DROP POLICY IF EXISTS "Public can view verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view verification documents" ON storage.objects;

-- Users can upload to their own folder
DROP POLICY IF EXISTS "Users can upload their own verification documents" ON storage.objects;
CREATE POLICY "Users can upload their own verification documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can view their own documents (via signed URLs)
DROP POLICY IF EXISTS "Users can view own verification documents" ON storage.objects;
CREATE POLICY "Users can view own verification documents" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can view all verification documents
DROP POLICY IF EXISTS "Admins can view all verification documents" ON storage.objects;
CREATE POLICY "Admins can view all verification documents" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Users can update their own documents
DROP POLICY IF EXISTS "Users can update own verification documents" ON storage.objects;
CREATE POLICY "Users can update own verification documents" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own documents
DROP POLICY IF EXISTS "Users can delete own verification documents" ON storage.objects;
CREATE POLICY "Users can delete own verification documents" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ====================================================================
-- 2. IDENTITY_VERIFICATIONS TABLE (missing from migrations)
-- ====================================================================

CREATE TABLE IF NOT EXISTS identity_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('passport', 'drivers_license', 'national_id', 'other')),
  document_url TEXT NOT NULL,
  document_number TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own verification
DROP POLICY IF EXISTS "Users can view own identity verification" ON identity_verifications;
CREATE POLICY "Users can view own identity verification" ON identity_verifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own verification
DROP POLICY IF EXISTS "Users can insert own identity verification" ON identity_verifications;
CREATE POLICY "Users can insert own identity verification" ON identity_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all verifications
DROP POLICY IF EXISTS "Admins can view all identity verifications" ON identity_verifications;
CREATE POLICY "Admins can view all identity verifications" ON identity_verifications
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Admins can update verifications
DROP POLICY IF EXISTS "Admins can update identity verifications" ON identity_verifications;
CREATE POLICY "Admins can update identity verifications" ON identity_verifications
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ====================================================================
-- 3. DISPUTES TABLE (missing from migrations)
-- ====================================================================

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  raised_against UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  resolution TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- Participants can view their own disputes
DROP POLICY IF EXISTS "Dispute participants can view" ON disputes;
CREATE POLICY "Dispute participants can view" ON disputes
  FOR SELECT USING (auth.uid() = raised_by OR auth.uid() = raised_against);

-- Users can raise disputes
DROP POLICY IF EXISTS "Users can raise disputes" ON disputes;
CREATE POLICY "Users can raise disputes" ON disputes
  FOR INSERT WITH CHECK (auth.uid() = raised_by);

-- Admins can view all disputes
DROP POLICY IF EXISTS "Admins can view all disputes" ON disputes;
CREATE POLICY "Admins can view all disputes" ON disputes
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Admins can update disputes
DROP POLICY IF EXISTS "Admins can update disputes" ON disputes;
CREATE POLICY "Admins can update disputes" ON disputes
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ====================================================================
-- 4. WAITLIST TABLE (for India-only gating)
-- ====================================================================

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  country TEXT NOT NULL,
  signup_source TEXT NOT NULL CHECK (signup_source IN ('direct_signup', 'google_oauth', 'linkedin_oauth')),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Admins can view waitlist
DROP POLICY IF EXISTS "Admins can view waitlist" ON waitlist;
CREATE POLICY "Admins can view waitlist" ON waitlist
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Users can insert themselves into waitlist
DROP POLICY IF EXISTS "Users can join waitlist" ON waitlist;
CREATE POLICY "Users can join waitlist" ON waitlist
  FOR INSERT WITH CHECK (true);

-- ====================================================================
-- 5. RLS ON ORPHANED TABLES (milestones, workspaces, etc.)
-- ====================================================================

-- Enable RLS on tables that may have been created without it
DO $$
DECLARE
  tbl text;
  tables_to_fix text[] := ARRAY['milestones', 'workspaces', 'workspace_members', 'workspace_activity_logs', 'team_invitations', 'opportunity_events', 'fraud_events'];
BEGIN
  FOREACH tbl IN ARRAY tables_to_fix
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
      
      -- Drop default deny policy if exists, then create restrictive one
      EXECUTE format('DROP POLICY IF EXISTS \"Owner can access %I\" ON %I;', tbl, tbl);
      EXECUTE format('CREATE POLICY \"Owner can access %I\" ON %I FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() = user_id);', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- ====================================================================
-- 6. INDEXES
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_identity_verifications_user_id ON identity_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_status ON identity_verifications(status);
CREATE INDEX IF NOT EXISTS idx_disputes_contract_id ON disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_raised_by ON disputes(raised_by);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_country ON waitlist(country);
