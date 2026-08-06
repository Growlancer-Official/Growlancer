-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX payout_methods columns + RPC
-- The production table stores payout details in a JSONB `details` column, but the
-- get_payout_methods RPC and the frontend both expect flat columns (email, phone,
-- account_holder_name, account_number, routing_number, bank_name, ifsc_code,
-- upi_id). This made payout methods impossible to add or list (production bug).
-- 1) Add every flat column + backfill from `details` JSON
-- 2) Recreate get_payout_methods to return ifsc_code + upi_id too
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN email TEXT;
    UPDATE public.payout_methods SET email = details->>'email' WHERE details ? 'email';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN phone TEXT;
    UPDATE public.payout_methods SET phone = details->>'phone' WHERE details ? 'phone';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'account_holder_name'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN account_holder_name TEXT;
    UPDATE public.payout_methods SET account_holder_name = details->>'account_holder_name' WHERE details ? 'account_holder_name';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN account_number TEXT;
    UPDATE public.payout_methods SET account_number = details->>'account_number' WHERE details ? 'account_number';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'routing_number'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN routing_number TEXT;
    UPDATE public.payout_methods SET routing_number = details->>'routing_number' WHERE details ? 'routing_number';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN bank_name TEXT;
    UPDATE public.payout_methods SET bank_name = details->>'bank_name' WHERE details ? 'bank_name';
  END IF;

  -- IFSC code (Indian bank transfers via RazorpayX)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'ifsc_code'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN ifsc_code TEXT;
    UPDATE public.payout_methods SET ifsc_code = details->>'ifsc_code' WHERE details ? 'ifsc_code';
  END IF;

  -- UPI ID (Indian UPI payouts via RazorpayX)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payout_methods' AND column_name = 'upi_id'
  ) THEN
    ALTER TABLE public.payout_methods ADD COLUMN upi_id TEXT;
    UPDATE public.payout_methods SET upi_id = details->>'upi_id' WHERE details ? 'upi_id';
  END IF;

  RAISE NOTICE 'payout_methods flat columns ensured';
END $$;

-- ─── Recreate get_payout_methods: return flat fields + ifsc_code + upi_id ─────
CREATE OR REPLACE FUNCTION public.get_payout_methods(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_array();
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pm.id,
      'type', pm.type,
      'label', pm.label,
      'email', pm.email,
      'phone', pm.phone,
      'account_holder_name', pm.account_holder_name,
      'account_number', CASE
        WHEN pm.account_number IS NOT NULL THEN '****' || RIGHT(pm.account_number, 4)
        ELSE NULL
      END,
      'routing_number', CASE
        WHEN pm.routing_number IS NOT NULL THEN '****' || RIGHT(pm.routing_number, 4)
        ELSE NULL
      END,
      'bank_name', pm.bank_name,
      'ifsc_code', pm.ifsc_code,
      'upi_id', pm.upi_id,
      'is_default', pm.is_default,
      'created_at', pm.created_at,
      'updated_at', pm.updated_at
    )
    ORDER BY pm.is_default DESC, pm.created_at DESC
  ) INTO v_result
  FROM public.payout_methods pm
  WHERE pm.user_id = p_user_id;

  IF v_result IS NULL THEN
    v_result := '[]'::jsonb;
  END IF;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payout_methods(uuid) TO authenticated;
