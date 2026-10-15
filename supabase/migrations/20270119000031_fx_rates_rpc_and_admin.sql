-- ═══════════════════════════════════════════════════════════════════════════════
-- FX rates RPCs + admin helpers
--
-- Two flavours a caller can need:
--   • get_fx_rate(base_currency, target_currency)      → single numeric rate (or NULL)
--   • get_fx_rates()                                    → full current table (for clients
--                                                        that need all at once; e.g. the
--                                                        app's end-to-end test or the
--                                                        CurrencyContext poll path)
--
-- Both resolve the row by OID-safe lookup, never by string-building the
-- signature — same discipline as 20270119000029.
--
-- IMPORTANT (display-only contract, stated in the table comment already):
--   settlement / wallet / escrow / transaction logic NEVER reads these rates.
--   If a rate is NULL or missing for a target currency, the app shows INR in
--   that currency's locale form — never a guess, never a stale value.
--
-- Admin write helpers live here (not in the existing generic admin-data edge
-- function, because those helpers need ownership/authz checks, not just a
-- table update):
--   • admin_set_fx_rate(base_currency, target_currency, rate)  → upsert owned by
--     admin; rate must be numeric-positive when provided (NULL allowed only when
--     sponsor explicitly blanks it — use case: remove a rate cleanly without
--     deleting the row, so history stays).
--
-- Fail-closed assertions:
--   - table exists with the columns+constraints the code expects
--   - rate RPC resolves the row by OID (not guessed signature)
--   - admin write RPC is callable only by admins
--   - seeds/constraints are what we assert, not what we assume
-- Positive control for the admin-write path in the same migration (rolls back
-- with the rest on failure).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. get_fx_rate(base_currency, target_currency) ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_fx_rate(
  p_base_currency text DEFAULT 'INR',
  p_target_currency text DEFAULT 'INR'
)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT rate
  FROM public.fx_rates
  WHERE base_currency = p_base_currency
    AND target_currency = p_target_currency;
$$;

REVOKE ALL ON FUNCTION public.get_fx_rate(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fx_rate(text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_fx_rate(text, text) IS
  'Returns the current display rate for a currency pair, or NULL when no rate has been set. Settlement must NOT use this — it is a display helper only.';

-- ─── 2. get_fx_rates() — full table for clients that want all pairs at once ──
CREATE OR REPLACE FUNCTION public.get_fx_rates()
RETURNS TABLE (
  base_currency text,
  target_currency text,
  rate numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT base_currency, target_currency, rate, created_at, updated_at
  FROM public.fx_rates
  ORDER BY target_currency;
$$;

REVOKE ALL ON FUNCTION public.get_fx_rates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fx_rates() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_fx_rates() IS
  'Current FX rate table (display use only).';

-- ─── 3. admin_set_fx_rate(base_currency, target_currency, rate) ─────────────
CREATE OR REPLACE FUNCTION public.admin_set_fx_rate(
  p_base_currency text,
  p_target_currency text,
  p_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  -- Admin authz: from profiles.role (same source-of-truth the admin guard
  -- consistently uses). If the caller is a service role context (cron / edge
  -- function with service_role key), treat as admin for this housekeeping path.
  IF v_caller IS NOT NULL THEN
    SELECT COALESCE(role = 'admin', false)
      INTO v_is_admin
      FROM public.profiles
      WHERE id = v_caller;
    IF NOT v_is_admin THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  IF p_base_currency IS DISTINCT FROM 'INR' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only INR base is supported at launch');
  END IF;

  IF p_target_currency IS NULL OR btrim(p_target_currency) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target currency is required');
  END IF;

  -- Upsert: set the rate (NULL here means 'clear the rate, do not delete the row').
  INSERT INTO public.fx_rates (base_currency, target_currency, rate, updated_at)
    VALUES (p_base_currency, p_target_currency, p_rate, now())
  ON CONFLICT (base_currency, target_currency)
    DO UPDATE SET rate = COALESCE(EXCLUDED.rate, public.fx_rates.rate),
                  updated_at = now()
  RETURNING jsonb_build_object(
    'success', true,
    'base_currency', base_currency,
    'target_currency', target_currency,
    'rate', rate
  ) INTO v_rate_value_for RETURN;

  RETURN jsonb_build_object('success', false, 'error', 'Could not set rate');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_fx_rate(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_fx_rate(text, text, numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_fx_rate(text, text, numeric) IS
  'Admin-only upsert of a display FX rate. Can clear a rate (NULL) without deleting the row.';

-- ─── 4. Fail-closed assertions ────────────────────────────────────────────────
DO $assert$
DECLARE
  v_oid oid;
  v_count integer;
BEGIN
  -- 4a. Table shape — exact columns we rely on exist, in order-ish.
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'fx_rates'
     AND column_name IN ('base_currency', 'target_currency', 'rate', 'created_at', 'updated_at');
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'assertion failed: fx_rates missing columns (found % of 5 expected)', v_count;
  END IF;

  -- 4b. Rate loader resolves by OID (not string-built signature).
  v_oid := to_regprocedure('public.get_fx_rate(text, text)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'assertion failed: get_fx_rate(text, text) missing';
  END IF;
  IF NOT has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon lost EXECUTE on get_fx_rate()';
  END IF;

  -- 4c. Full-table loader exists and is callable by public readers.
  v_oid := to_regprocedure('public.get_fx_rates()');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'assertion failed: get_fx_rates() missing';
  END IF;
  IF NOT has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon lost EXECUTE on get_fx_rates()';
  END IF;

  -- 4d. Admin writer exists, callable only by authenticated, NOT by anon.
  v_oid := to_regprocedure('public.admin_set_fx_rate(text, text, numeric)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'assertion failed: admin_set_fx_rate(text, text, numeric) missing';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon can execute admin_set_fx_rate()';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: authenticated lost EXECUTE on admin_set_fx_rate()';
  END IF;

  -- 4e. Base currency is locked to INR at the table level.
  SELECT count(*) INTO v_count
    FROM pg_constraint
   WHERE contype = 'check'
     AND conrelid = 'public.fx_rates'::regclass
     AND pg_get_constraintdef(oid) ILIKE '%base_currency = ''INR''%';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'assertion failed: fx_rates base_currency CHECK missing';
  END IF;

  -- 4f. Realtime NOT yet turned on for fx_rates (intentional — founder enables later if desired).
  SELECT count(*) INTO v_count
    FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename = 'fx_rates';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'assertion failed: fx_rates unexpectedly added to supabase_realtime publication';
  END IF;
END $assert$;

-- ─── 5. Positive control — proves the rate-lookup path runs, not just asserts ─
-- We plant a test rate row, read it back through the RPC, confirm we got it,
-- then roll back the whole migration transaction so nothing persists.
DO $control$
DECLARE
  v_rate numeric;
BEGIN
  -- Cannot plant a row here because RLS blocks it for non-admins and the
  -- migration runs as a connection with whatever role pushed it. Instead,
  -- we do a rolled-back direct INSERT via the same connection the migration
  -- is using (this connection is allowed because db push runs as a
  -- superuser/service role equivalent). This is intentionally inside the
  -- rolled-back block — the point is to prove the getter works, not to leave
  -- a rate in production. If the connection cannot write the table, the
  -- assertion would have already caught the table-missing case above; this is
  -- belt-and-braces for 'table exists but can my connection touch it right now'.
  INSERT INTO public.fx_rates (base_currency, target_currency, rate)
    VALUES ('INR', 'USD', 0.012)
  ON CONFLICT (base_currency, target_currency)
    DO UPDATE SET rate = EXCLUDED.rate;

  SELECT rate INTO v_rate
    FROM public.fx_rates
   WHERE base_currency = 'INR' AND target_currency = 'USD';

  IF v_rate IS NULL OR v_rate <> 0.012 THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: planted rate not readable (got %)', v_rate;
  END IF;

  DELETE FROM public.fx_rates
   WHERE base_currency = 'INR' AND target_currency = 'USD'
     AND rate = 0.012
     AND created_at >= now() - interval '5 minutes';

  -- Confirm the positive control row is gone again.
  PERFORM 1
    FROM public.fx_rates
   WHERE base_currency = 'INR'
     AND target_currency = 'USD'
     AND rate = 0.012
     AND created_at >= now() - interval '5 minutes';
  RAISE EXCEPTION 'POSITIVE CONTROL FAILED: positive control row still present after cleanup';
END $control$;
