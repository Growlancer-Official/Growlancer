-- ═══════════════════════════════════════════════════════════════════════════
-- KYC: MANUAL COMPLIANCE REVIEW ONLY (MNC-style)
-- Migration 20270104000002
--
-- WHY: identity verification was auto-approved the moment a document number
-- matched a format pattern (kyc_verify_row auto-flipped 'pending' → 'verified'
-- with provider='auto'). Auto-trusting a document scan is not a professional
-- KYC process and lets non-authentic documents through without any human
-- review.
--
-- THIS MIGRATION:
--   • kyc_verify_row() becomes a no-op for pending rows — documents ALWAYS
--     wait for the compliance team (admin) to approve/reject. No format-based
--     auto-verify, no auto-approve.
--   • The INSERT trigger + cron sweep keep calling it (safe — it returns
--     immediately for non-pending rows), so no other code changes.
--   • The admin approve/reject UPDATE path is untouched: kyc_auto_verify_trigger_fn
--     still syncs profiles.verification_status and notifies the user in
--     real time (verified / rejected + reason).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.kyc_verify_row(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.identity_verifications%ROWTYPE;
BEGIN
  -- Manual review pipeline: submissions stay 'pending' until a compliance
  -- admin approves or rejects them (AdminIdentityVerificationPage). This
  -- function is kept as a safety net / sweep entry point but never
  -- auto-approves or auto-rejects on format patterns alone.
  SELECT * INTO v_rec FROM public.identity_verifications WHERE id = p_id;
  IF NOT FOUND OR v_rec.status <> 'pending' THEN
    RETURN;
  END IF;

  -- Leave pending — no automated decision. Rejection/approval reasons are
  -- set by the human reviewer.
  UPDATE public.identity_verifications
    SET updated_at = now()
    WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kyc_verify_row(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kyc_verify_row(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';