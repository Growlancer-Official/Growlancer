-- ════════════════════════════════════════════════════════════════════════
-- GROWLANCER — BUSINESS ACCOUNTS + GST (client side)
-- Companies can register as "business" accounts: company name + GST number
-- (+ existing company_logo). GST is validated server-side on insert/update so
-- an invalid GSTIN can never reach the database. Individual accounts stay
-- untouched. Invoice rendering (edge function) picks up company_name + GST.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. New columns ───────────────────────────────────────────────────────
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'individual'
  CHECK (account_type IN ('individual', 'business'));

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS gst_number TEXT;

-- ── 2. Backfill: existing rows with a company name become business accounts ──
UPDATE public.client_profiles
SET account_type = 'business'
WHERE account_type = 'individual'
  AND company_name IS NOT NULL
  AND company_name <> '';

-- ── 3. Server-side GSTIN validation trigger ──────────────────────────────
-- Valid Indian GSTIN: 15 chars — 2 digit state code + 10-char PAN + 1 entity
-- code + 'Z' + 1 check char. Blank/NULL is allowed (individual accounts or
-- business accounts that haven't added GST yet). If a value IS provided it
-- must be a valid GSTIN, otherwise the write is rejected.
CREATE OR REPLACE FUNCTION public.validate_client_gstin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_gst TEXT;
BEGIN
  v_gst := NULLIF(BTRIM(COALESCE(NEW.gst_number, '')), '');
  IF v_gst IS NULL THEN
    NEW.gst_number := NULL;
    RETURN NEW;
  END IF;

  v_gst := UPPER(v_gst);
  IF NOT (
    v_gst ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
    AND LENGTH(v_gst) = 15
  ) THEN
    RAISE EXCEPTION 'Invalid GSTIN format';
  END IF;

  NEW.gst_number := v_gst;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_client_gstin ON public.client_profiles;
CREATE TRIGGER trg_validate_client_gstin
  BEFORE INSERT OR UPDATE OF gst_number ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_client_gstin();

-- ── 4. RLS: ensure authenticated owner can still update these columns ─────
-- client_profiles existing policies are owner-scoped; new columns are covered
-- by the same policies automatically. Nothing else to change here.
