-- ═══════════════════════════════════════════════════════════════════════════
-- KYC: REAL-TIME PROVIDER ENGINE (shared by freelancers AND clients)
-- Migration 20270110000000
--
-- Existing system reviewed:
--   • identity_verifications table + triggers (auto-verify, notification,
--     duplicate-identity guard, 24h cooldown) already exist — REUSED, not
--     duplicated.
--   • kyc_verify_row() is currently a no-op (manual-review-only era) and no
--     real verification provider is wired in.
--   • FOUND BUG: nothing server-side synced profiles.verification_status on
--     status transitions — an admin approval flipped the row but the public
--     verified badge never moved. Fixed below with a dedicated sync trigger.
--
-- THIS MIGRATION:
--   1. Adds provider-engine columns (provider_reference, failure_category,
--      review_reason, failed_at) — data minimisation: masked metadata only,
--      never raw provider responses, never raw PAN storage beyond the
--      existing document_number column (already access-restricted by RLS).
--   2. Extends status CHECK with 'review' (exceptional fallback ONLY —
--      provider error/timeout/ambiguity; never auto-verified, never part of
--      the normal journey).
--   3. RLS hardening: users can INSERT their own PENDING row and SELECT own
--      rows; users can NO LONGER UPDATE rows at all (kyc_status, verified_at,
--      verification_provider etc. are service-role/owner-only). Admin
--      review access stays for exceptional cases.
--   4. NEW: kyc_sync_profile_status_fn trigger — the missing badge sync:
--      verified → profiles.verification_status='verified' + kyc_verified_at;
--      rejected → reset to 'unverified' (clean resubmit slate). Runs for
--      BOTH roles (profiles is shared; freelancer_profiles synced too).
--   5. Audit: status transitions continue to fire the existing notification
--      trigger; provider decisions are audited by the kyc-submit edge
--      function into payment_audit_logs.
--
-- Mobile OTP: none (email verification is the account-level gate — enforced
-- in the kyc-submit edge function via auth email_confirmed_at).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path = '';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Provider-engine columns
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS verification_metadata JSONB,
  ADD COLUMN IF NOT EXISTS failure_category TEXT
    CHECK (failure_category IN (
      'invalid_pan', 'name_mismatch', 'duplicate_identity',
      'provider_error', 'provider_timeout', 'rate_limited',
      'invalid_request', 'email_unverified'
    )),
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_identity_verifications_provider_reference
  ON public.identity_verifications (provider_reference)
  WHERE provider_reference IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Status CHECK: add 'review' (replace whatever check constraint exists)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  con_name TEXT;
BEGIN
  -- Drop EVERY legacy status check (auto-named constraints drift across
  -- environments: identity_verifications_status_check, ..._check1, etc.)
  FOR con_name IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_attribute a ON a.attrelid = t.oid
       AND a.attnum = ANY (c.conkey)
     WHERE t.relname = 'identity_verifications'
       AND c.contype = 'c'
       AND a.attname = 'status'
  LOOP
    EXECUTE format('ALTER TABLE public.identity_verifications DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

-- Named constraint so future migrations can reference it deterministically.
-- (Re-add only if a constraint with this name is not already present.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'identity_verifications_status_check'
       AND conrelid = 'public.identity_verifications'::regclass
  ) THEN
    ALTER TABLE public.identity_verifications
      ADD CONSTRAINT identity_verifications_status_check
      CHECK (status IN ('pending', 'verified', 'rejected', 'review'));
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS hardening
--    Users: INSERT own pending row + SELECT own rows. NO UPDATE policy for
--    end users (status/provider/reference/verified_at are backend-only).
--    Admins: SELECT all + UPDATE (exception handling only).
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own identity verification" ON public.identity_verifications;

DROP POLICY IF EXISTS "Users can insert own identity verification" ON public.identity_verifications;
CREATE POLICY "Users can insert own pending verification"
  ON public.identity_verifications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    -- The engine provider is set server-side by kyc-submit; browser
    -- submissions can never claim a provider or a verified state.
    AND verification_provider IS NOT DISTINCT FROM 'manual'
    AND verified_at IS NULL
  );

-- The kyc-submit edge function inserts with the service key (bypasses RLS);
-- keep browser INSERT grants intact for the tightened policy above. UPDATE is
-- revoked — row state is exclusively backend-controlled.
GRANT SELECT, INSERT ON public.identity_verifications TO authenticated;
REVOKE UPDATE ON public.identity_verifications FROM authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Badge sync trigger (the missing piece — fixes admin-approve desync too)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kyc_sync_profile_status_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'verified' THEN
    -- Bypass the privilege-column guard: server-side recompute from the
    -- authoritative verification row (same pattern as sync_profile_pro_flag).
    PERFORM set_config('app.bypass_privilege_check', 'true', true);

    UPDATE public.profiles
       SET verification_status = 'verified',
           kyc_verified_at = COALESCE(kyc_verified_at, NEW.verified_at, NOW())
     WHERE id = NEW.user_id;
    UPDATE public.freelancer_profiles
       SET verification_status = 'verified'
     WHERE user_id = NEW.user_id;
  ELSIF NEW.status = 'rejected' THEN
    PERFORM set_config('app.bypass_privilege_check', 'true', true);

    -- Reset badge (clean slate for resubmit); never demote others' state.
    UPDATE public.profiles
       SET verification_status = 'unverified',
           kyc_verified_at = NULL
     WHERE id = NEW.user_id
       AND verification_status = 'verified';
    UPDATE public.freelancer_profiles
       SET verification_status = 'unverified'
     WHERE user_id = NEW.user_id
       AND verification_status = 'verified';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_sync_profile_status ON public.identity_verifications;
CREATE TRIGGER trg_kyc_sync_profile_status
  AFTER UPDATE OF status ON public.identity_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.kyc_sync_profile_status_fn();

REVOKE ALL ON FUNCTION public.kyc_sync_profile_status_fn() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kyc_sync_profile_status_fn() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kyc_sync_profile_status_fn() TO service_role;
