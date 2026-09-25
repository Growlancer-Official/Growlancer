-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000019 — surface-audit authorization fixes
--
-- Found by `scripts/e2e/surface-audit.mjs`, which walks the *whole* live surface
-- (every private table, every anon-executable helper that takes a caller-supplied
-- id) the way a browser reaches it: PostgREST + RLS + ACL + a real JWT. Every
-- finding below was reproduced at runtime before this migration was written.
--
-- F1 CRITICAL  get_payout_methods(p_user_id) leaked ANOTHER USER'S payout
--              details to an UNAUTHENTICATED caller. Runtime: an anon RPC call
--              returned the victim's upi_id, bank_name, ifsc_code,
--              account_holder_name, masked account number, email, phone and
--              razorpay_fund_account_id. Cause: `IF p_user_id <> auth.uid()`.
--              For anon, auth.uid() IS NULL, so the comparison is NULL, so the
--              branch never executed. Same NULL-unsafe shape as 20270119000016.
-- F2 CRITICAL  delete_payout_method — an anon caller DELETED the victim's payout
--              method (response {"success":true}). Same cause.
-- F3 HIGH      set_default_payout_method — an anon caller flipped the victim's
--              payout method to default. Same cause.
-- F4 HIGH      update_reputation_score — an anon caller ran the ONLY writer of
--              the merit-ranking columns (rating / total_reviews /
--              reputation_score / weighted_rating). 20261202000000 revoked it,
--              but a later CREATE OR REPLACE reset the ACL to PUBLIC — the
--              documented "PUBLIC default ACL returns on DROP+CREATE" trap.
-- F5 HIGH      _refund_audit / _refund_history_event / _refund_notify — internal
--              writers with NO guard at all, still EXECUTE-granted to anon. An
--              anon caller successfully INSERTED a payment_audit_logs row, and
--              _refund_history_event executed its body (it failed only on the
--              seeded row's foreign key, which is proof it ran).
-- F6 HIGH      workspace RLS was BOTH recursive and tautological. Runtime:
--              `42P17 infinite recursion detected in policy for relation
--              "workspace_members"` — every authenticated read of
--              workspace_members / workspace_activity_logs returned HTTP 500, so
--              the feature is not merely leaky, it is non-functional. The same
--              policies also contained `wm.workspace_id = wm.workspace_id`, an
--              unqualified-name mistake that would have turned the fix into a
--              cross-tenant leak.
-- F7 MEDIUM    service_offers insert check contained `services.freelancer_id =
--              freelancer_id` — a tautology, so the "the offer must name the
--              service's real owner" rule never applied.
-- F8 LOW       razorpay_transactions had a second, redundant SELECT policy whose
--              predicate compared razorpay_orders.id to
--              razorpay_orders.razorpay_order_id (both sides the same table). It
--              is dead today and therefore fail-closed, but it is a latent
--              full-table read the moment those columns ever align.
--
-- Not changed on purpose: get_profile_views / record_profile_view are reachable
-- by anon BY DESIGN — the public freelancer profile page calls them for a public
-- view counter. That was checked against the call site, not assumed.
--
-- FAIL-CLOSED, WITH POSITIVE CONTROLS: each new detector is required to flag a
-- planted violator inside this migration's own transaction before the live
-- schema is required to come back clean. A detector that is merely quiet fails
-- here as loudly as one that is noisy.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. F1/F2/F3 — the payout trio: NULL-safe owner guard, then narrow the grant.
--
--    `IS DISTINCT FROM` never yields NULL, so the guard cannot be skipped. The
--    `auth.uid() IS NULL` branch keeps the service-role path (admin tooling)
--    working while refusing every sessionless caller. Bodies are reproduced
--    verbatim from the live definitions except for the guard itself.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_payout_methods(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'auth'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- authz-guard: owner-only, NULL-safe (20270119000019)
  IF auth.uid() IS NULL THEN
    IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
      RETURN '[]'::jsonb;
    END IF;
  ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN '[]'::jsonb;
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
      'razorpay_fund_account_id', pm.razorpay_fund_account_id,
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_payout_method(p_method_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'auth'
AS $function$
DECLARE
  v_method RECORD;
BEGIN
  -- authz-guard: owner-only, NULL-safe (20270119000019)
  IF auth.uid() IS NULL THEN
    IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
  ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify the payout method belongs to the user and delete it
  DELETE FROM public.payout_methods
  WHERE id = p_method_id AND user_id = p_user_id
  RETURNING * INTO v_method;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout method not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_default_payout_method(p_method_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'auth'
AS $function$
DECLARE
  v_method RECORD;
BEGIN
  -- authz-guard: owner-only, NULL-safe (20270119000019)
  IF auth.uid() IS NULL THEN
    IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
  ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify the payout method belongs to the user
  SELECT * INTO v_method
  FROM public.payout_methods
  WHERE id = p_method_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout method not found');
  END IF;

  -- Unset all default flags for this user
  UPDATE public.payout_methods
  SET is_default = false,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Set the target method as default
  UPDATE public.payout_methods
  SET is_default = true,
      updated_at = NOW()
  WHERE id = p_method_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Narrow the grant as well as fixing the guard: a sessionless caller should not
-- be able to reach these at all, so a future edit to the guard cannot re-open
-- them on its own. `authenticated` keeps them (the browser calls
-- get_payout_methods from src/lib/supabase.ts); service_role keeps them.
REVOKE EXECUTE ON FUNCTION public.get_payout_methods(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_payout_method(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_default_payout_method(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payout_methods(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_payout_method(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_default_payout_method(uuid, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. F4/F5 — internal writers become server-only.
--
--    Every caller of these is a SECURITY DEFINER function owned by postgres
--    (verified against the live catalog before writing this), so revoking the
--    app roles cannot break them: the definer executes as the owner, which keeps
--    EXECUTE by ownership. The razorpay-webhook edge function calls
--    _refund_history_event through its service-role client, so service_role is
--    re-granted explicitly.
-- ───────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public._refund_audit(uuid, text, text, text, numeric, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._refund_history_event(uuid, text, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._refund_notify(uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reputation_score(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._refund_audit(uuid, text, text, text, numeric, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public._refund_history_event(uuid, text, uuid, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public._refund_notify(uuid, text, text, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_reputation_score(uuid)
  TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2b. Two more functions carry the same shape. Neither is reachable today
--     (both are server-only or require a session), so there is no live hole —
--     but `<> auth.uid()` is indistinguishable from the bug that leaked the
--     payout table, and leaving it in place would keep the detector's baseline
--     non-zero, which is how a detector stops being a signal. The service-role
--     path each one relies on is preserved explicitly instead of accidentally.
-- ───────────────────────────────────────────────────────────────────────────

DO $patch_guards$
DECLARE
  v_src text;
  v_anchor text;
BEGIN
  -- release_milestone: only the contract's client may release a milestone.
  -- Before: the service-role/cron path passed only because `client_id <>
  -- NULL` is NULL. Now the sessionless path is named.
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'release_milestone';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'release_milestone() not found — cannot patch its guard';
  END IF;
  IF v_src NOT LIKE '%auth.uid() IS NULL%' THEN
    v_anchor := '  IF v_contract.client_id <> auth.uid() THEN';
    IF position(v_anchor in v_src) = 0 THEN
      RAISE EXCEPTION 'release_milestone() guard anchor not found — patch would be a silent no-op';
    END IF;
    v_src := replace(v_src, v_anchor,
      '  -- authz-guard: NULL-safe owner-or-server (20270119000019)' || chr(10) ||
      '  IF auth.uid() IS NULL THEN' || chr(10) ||
      '    IF current_setting(''role'', true) IS DISTINCT FROM ''service_role'' THEN' || chr(10) ||
      '      RETURN jsonb_build_object(''success'', false, ''error'', ''Unauthorized: release requires a session or the service role'');' || chr(10) ||
      '    END IF;' || chr(10) ||
      '  ELSIF v_contract.client_id IS DISTINCT FROM auth.uid() THEN');
    EXECUTE v_src;
  END IF;

  -- process_withdrawal_complete: owner or admin. Same treatment.
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'process_withdrawal_complete';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'process_withdrawal_complete() not found — cannot patch its guard';
  END IF;
  IF v_src NOT LIKE '%auth.uid() IS NULL%' THEN
    v_anchor := '  IF v_withdrawal.user_id <> auth.uid() AND NOT EXISTS (';
    IF position(v_anchor in v_src) = 0 THEN
      RAISE EXCEPTION 'process_withdrawal_complete() guard anchor not found — patch would be a silent no-op';
    END IF;
    v_src := replace(v_src, v_anchor,
      '  -- authz-guard: NULL-safe owner-or-admin-or-server (20270119000019)' || chr(10) ||
      '  IF auth.uid() IS NULL THEN' || chr(10) ||
      '    IF current_setting(''role'', true) IS DISTINCT FROM ''service_role'' THEN' || chr(10) ||
      '      RETURN jsonb_build_object(''success'', false, ''error'', ''Unauthorized');' || chr(10) ||
      '    END IF;' || chr(10) ||
      '  ELSIF v_withdrawal.user_id IS DISTINCT FROM auth.uid() AND NOT EXISTS (');
    EXECUTE v_src;
  END IF;
END
$patch_guards$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. F6 — workspace RLS: kill the recursion AND the tautology.
--
--    The membership test moves into a SECURITY DEFINER helper. That is what
--    breaks the cycle: pg_policies no longer has to evaluate workspace_members'
--    own policy to answer a workspace_members query, which is what produced
--    `42P17 infinite recursion`.
--
--    The helper takes the ids as ARGUMENTS instead of reading the row's columns
--    through an unqualified name, which is what made
--    `wm.workspace_id = workspace_id` silently collapse to
--    `wm.workspace_id = wm.workspace_id`. Both defects are fixed by the same
--    change; fixing only one would have traded a 500 for a cross-tenant leak.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p_user_id IS NOT NULL
     AND p_workspace_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.workspace_members wm
        WHERE wm.workspace_id = p_workspace_id
          AND wm.user_id = p_user_id
     );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members view own workspaces" ON public.workspaces;
CREATE POLICY "Members view own workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    client_id = auth.uid()
    OR lead_freelancer_id = auth.uid()
    OR public.is_workspace_member(id, auth.uid())
  );

DROP POLICY IF EXISTS "Members view workspace members" ON public.workspace_members;
CREATE POLICY "Members view workspace members" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "Members view activity logs" ON public.workspace_activity_logs;
CREATE POLICY "Members view activity logs" ON public.workspace_activity_logs
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. F7 — service_offers: make the "real owner" check mean something.
--    Unqualified `freelancer_id` resolved to services.freelancer_id, so the
--    comparison was against itself. Qualify both sides.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_offers_insert_client" ON public.service_offers;
CREATE POLICY "service_offers_insert_client" ON public.service_offers
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1 FROM public.services
      WHERE services.id = service_offers.service_id
        AND services.freelancer_id = service_offers.freelancer_id
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 5. F8 — drop the redundant, non-correlated razorpay_transactions policy.
--    The surviving policy is correctly correlated through razorpay_orders.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users read own razorpay transactions" ON public.razorpay_transactions;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Two new detectors, so these classes cannot come back unnoticed.
-- ───────────────────────────────────────────────────────────────────────────

-- NULL-unsafe authorization guards.
--
-- The class: a guard that compares a caller-supplied value to auth.uid() with
-- <> / != / NOT IN and no NULL check. It reads as a guard and behaves as nothing
-- for an anonymous caller, because auth.uid() IS NULL makes the comparison NULL
-- and a NULL condition is falsy in plpgsql. It has now appeared three times
-- (20270119000016 raise_contract_dispute, 20270119000019 the payout trio), so it
-- gets a detector rather than another one-off fix.
--
-- `IS DISTINCT FROM` and an `auth.uid() IS NULL` check are the two accepted safe
-- forms, so both are excluded. SQL comments are stripped first: this migration's
-- own prose names the broken shape, and prose must never be mistaken for a guard
-- (the 20270119000018 lesson).
--
-- STATED BLIND SPOT: this rule is textual. It catches the comparison shapes, not
-- a guard that is missing entirely (_refund_audit had none — that was found by
-- reading the catalog, and is now covered by the server-only grant assertion in
-- section 8c instead).
CREATE OR REPLACE FUNCTION public.null_unsafe_auth_guard()
RETURNS TABLE(function_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH src AS (
    SELECT p.proname::text AS fname,
           -- strip -- comments so prose cannot be mistaken for code
           regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') AS body
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.proname NOT IN (
         'check_security_drift', 'null_unsafe_auth_guard', 'self_referential_policy_predicate'
       )
  )
  SELECT DISTINCT fname
    FROM src
   WHERE (
       -- the two comparison spellings, in either operand order
       body ~ '(<>|!=)\s*auth\.uid\(\)'
       OR body ~ 'auth\.uid\(\)\s*(<>|!=)'
       -- …and the set form, which is NULL-unsafe for the same reason
       OR body ~* 'not\s+in\s*\([^)]*auth\.uid\(\)'
     )
     -- accepted NULL-safe forms: an explicit NULL check, or IS [NOT] DISTINCT
     -- FROM in either operand order, or coalesce()
     AND body !~* 'auth\.uid\(\)\s+IS\s+(NOT\s+)?NULL'
     AND body !~* 'auth\.uid\(\)\s+IS\s+(NOT\s+)?DISTINCT\s+FROM'
     AND body !~* 'IS\s+(NOT\s+)?DISTINCT\s+FROM\s+auth\.uid\(\)'
     AND body !~* 'coalesce\s*\(\s*auth\.uid\(\)'
   ORDER BY fname;
$function$;

-- Self-referential policy predicates: a USING / WITH CHECK clause that compares
-- a column to itself, or that subqueries the very table the policy guards.
-- The first is a tautology (it permits everything); the second recurses (42P17).
-- Both were live in the workspace policies.
CREATE OR REPLACE FUNCTION public.self_referential_policy_predicate()
RETURNS TABLE(table_name text, policy_name text, kind text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p.tablename::text,
         p.policyname::text,
         CASE
           WHEN coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
                ~ '([a-z_]+)\.([a-z_]+)\s*=\s*\1\.\2'
             THEN 'tautology'
           ELSE 'self_reference'
         END
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND (
       -- `x.y = x.y` — always true, so the clause constrains nothing
       coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
         ~ '([a-z_]+)\.([a-z_]+)\s*=\s*\1\.\2'
       -- the policy subqueries its own relation, which recurses during
       -- policy evaluation
       OR coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
          ~* ('from\s+(public\.)?' || p.tablename || '\M')
     )
   ORDER BY p.tablename, p.policyname;
$function$;

REVOKE EXECUTE ON FUNCTION public.null_unsafe_auth_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.self_referential_policy_predicate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.null_unsafe_auth_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.self_referential_policy_predicate() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Positive controls — the detectors must fire before the live schema is
--    allowed to look clean.
-- ───────────────────────────────────────────────────────────────────────────

DO $controls$
DECLARE
  v_count integer;
  v_kind text;
BEGIN
  -- 7a. A NULL-unsafe guard must be flagged.
  CREATE OR REPLACE FUNCTION public.__surface_audit_null_unsafe()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
  AS $fn$
  BEGIN
    IF p_user_id <> auth.uid() THEN
      RETURN jsonb_build_object('success', false);
    END IF;
    RETURN jsonb_build_object('success', true);
  END $fn$;
  v_count := (SELECT count(*) FROM public.null_unsafe_auth_guard() WHERE function_name = '__surface_audit_null_unsafe');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: null_unsafe_auth_guard() did not flag a planted `p_user_id <> auth.uid()` guard';
  END IF;
  DROP FUNCTION public.__surface_audit_null_unsafe();

  -- 7b. A safe guard must NOT be flagged (negative control).
  CREATE OR REPLACE FUNCTION public.__surface_audit_null_safe()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
  AS $fn$
  BEGIN
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('success', false);
    END IF;
    RETURN jsonb_build_object('success', true);
  END $fn$;
  v_count := (SELECT count(*) FROM public.null_unsafe_auth_guard() WHERE function_name = '__surface_audit_null_safe');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'NEGATIVE CONTROL FAILED: null_unsafe_auth_guard() flagged a safe `IS DISTINCT FROM` guard';
  END IF;
  DROP FUNCTION public.__surface_audit_null_safe();

  -- 7c. A tautological policy must be flagged.
  CREATE TABLE public.__surface_audit_violator (id uuid PRIMARY KEY, owner_id uuid);
  ALTER TABLE public.__surface_audit_violator ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "__surface_audit_tautology" ON public.__surface_audit_violator
    FOR SELECT TO authenticated
    USING (owner_id = owner_id);
  v_count := (SELECT count(*) FROM public.self_referential_policy_predicate()
              WHERE table_name = '__surface_audit_violator' AND kind = 'tautology');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: self_referential_policy_predicate() did not flag a planted `owner_id = owner_id` tautology';
  END IF;

  -- 7d. A policy that subqueries its own table must be flagged as recursion.
  CREATE POLICY "__surface_audit_recursion" ON public.__surface_audit_violator
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.__surface_audit_violator v WHERE v.owner_id = auth.uid()));
  v_kind := (SELECT kind FROM public.self_referential_policy_predicate()
             WHERE policy_name = '__surface_audit_recursion');
  IF v_kind IS DISTINCT FROM 'self_reference' THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: self_referential_policy_predicate() did not flag a self-subquerying policy (got %)', coalesce(v_kind, 'nothing');
  END IF;
  DROP TABLE public.__surface_audit_violator;

  -- 7e. The workspace helper must actually answer membership correctly, or the
  --     three policies it backs are just a differently-shaped hole.
  IF public.is_workspace_member('00000000-0000-0000-0000-000000000000'::uuid,
                                '00000000-0000-0000-0000-000000000000'::uuid) IS NOT FALSE THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: is_workspace_member() returned non-false for a workspace/member pair that does not exist';
  END IF;
  IF public.is_workspace_member(NULL, NULL) IS NOT FALSE THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: is_workspace_member(NULL, NULL) must be false (NULL-safe)';
  END IF;
END
$controls$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Fail-closed assertions about the LIVE schema.
--    If any of these is false the migration aborts and changes nothing.
-- ───────────────────────────────────────────────────────────────────────────

DO $assertions$
DECLARE
  v_count integer;
  v_text text;
BEGIN
  -- 8a. The payout trio is no longer reachable without a session.
  SELECT count(*) INTO v_count FROM (
    VALUES ('get_payout_methods'), ('delete_payout_method'), ('set_default_payout_method')
  ) AS t(fn)
  WHERE has_function_privilege('anon', ('public.' || t.fn || '(uuid)')::regprocedure, 'EXECUTE');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % of the payout trio is still EXECUTE-granted to anon', v_count;
  END IF;

  -- 8b. …and all five NULL-unsafe guards seen at runtime now carry the NULL-safe
  --     form, so the new detector's baseline is genuinely zero rather than
  --     "zero because nothing was checked".
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'get_payout_methods', 'delete_payout_method', 'set_default_payout_method',
       'release_milestone', 'process_withdrawal_complete'
     )
     AND pg_get_functiondef(p.oid) LIKE '%auth.uid() IS NULL%';
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: only % of 5 fixed functions carries the NULL-safe guard', v_count;
  END IF;

  -- 8b2. The recreated payout trio must keep the owner-only comparison too.
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('get_payout_methods', 'delete_payout_method', 'set_default_payout_method')
     AND pg_get_functiondef(p.oid) LIKE '%IS DISTINCT FROM auth.uid()%';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: only % of the payout trio keeps IS DISTINCT FROM auth.uid()', v_count;
  END IF;

  -- 8c. Internal writers are server-only.
  SELECT count(*) INTO v_count FROM (
    VALUES
      ('_refund_audit'), ('_refund_history_event'), ('_refund_notify'), ('update_reputation_score')
  ) AS t(fn)
  WHERE has_function_privilege('anon', ('public.' || t.fn || '(uuid)')::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', ('public.' || t.fn || '(uuid)')::regprocedure, 'EXECUTE');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % internal writer(s) still reachable by an app role', v_count;
  END IF;

  -- 8d. The workspace helper exists, is hardened, and is not anon-callable.
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_workspace_member'
     AND p.prosecdef
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: is_workspace_member() is missing, not SECURITY DEFINER, or has no search_path';
  END IF;
  IF has_function_privilege('anon', 'public.is_workspace_member(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: is_workspace_member() is EXECUTE-granted to anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.is_workspace_member(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated cannot execute is_workspace_member(), so the workspace policies would deny everyone';
  END IF;

  -- 8e. The three workspace policies go through the helper.
  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (tablename, policyname) IN (
       ('workspaces', 'Members view own workspaces'),
       ('workspace_members', 'Members view workspace members'),
       ('workspace_activity_logs', 'Members view activity logs')
     )
     AND coalesce(qual, '') LIKE '%is_workspace_member%';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: only % of 3 workspace policies route through is_workspace_member()', v_count;
  END IF;

  -- 8f. No live policy keeps a self-referential predicate.
  SELECT count(*) INTO v_count FROM public.self_referential_policy_predicate();
  IF v_count <> 0 THEN
    SELECT string_agg(table_name || '.' || policy_name || ' (' || kind || ')', ', ')
      INTO v_text FROM public.self_referential_policy_predicate();
    RAISE EXCEPTION 'ASSERTION FAILED: self-referential policy predicates remain: %', v_text;
  END IF;

  -- 8g. No live SECURITY DEFINER function keeps a NULL-unsafe auth guard.
  SELECT count(*) INTO v_count FROM public.null_unsafe_auth_guard();
  IF v_count <> 0 THEN
    SELECT string_agg(function_name, ', ') INTO v_text FROM public.null_unsafe_auth_guard();
    RAISE EXCEPTION 'ASSERTION FAILED: NULL-unsafe auth guards remain: %', v_text;
  END IF;

  -- 8h. The dead razorpay_transactions policy is gone.
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'razorpay_transactions'
     AND policyname = 'Users read own razorpay transactions';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the non-correlated razorpay_transactions policy is still present';
  END IF;
END
$assertions$;

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Wire both detectors into the existing hourly sweep.
--    Anchored patch, not a retype: if the anchor stops matching, this fails
--    loudly instead of silently doing nothing.
-- ───────────────────────────────────────────────────────────────────────────

DO $patch$
DECLARE
  v_src text;
  v_new text;
  v_anchor text;
  v_added text := '';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'check_security_drift'
     AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'check_security_drift() not found — cannot patch';
  END IF;

  IF v_src LIKE '%null_unsafe_auth_guard%' THEN
    RETURN; -- already patched (idempotent)
  END IF;

  v_added :=
    '  -- 🔴 HIGH: a NULL-unsafe authorization guard. Reads as a guard, behaves as' || chr(10) ||
    '  --    nothing for an anonymous caller: `p_x <> auth.uid()` is NULL when' || chr(10) ||
    '  --    auth.uid() is NULL, and a NULL condition is falsy in plpgsql, so the' || chr(10) ||
    '  --    check is skipped entirely. This is what leaked every payout method to' || chr(10) ||
    '  --    an unauthenticated caller (20270119000019) and what let anon freeze a' || chr(10) ||
    '  --    contract''s escrow (20270119000016).' || chr(10) ||
    '  FOR v_finding IN' || chr(10) ||
    '    SELECT function_name FROM public.null_unsafe_auth_guard()' || chr(10) ||
    '  LOOP' || chr(10) ||
    '    IF NOT EXISTS (' || chr(10) ||
    '      SELECT 1 FROM public.security_alerts' || chr(10) ||
    '      WHERE category = ''null_unsafe_auth_guard''' || chr(10) ||
    '        AND detail LIKE ''%'' || v_finding.function_name || ''%''' || chr(10) ||
    '        AND (is_resolved = false OR resolved_at > NOW() - interval ''7 days'')' || chr(10) ||
    '    ) THEN' || chr(10) ||
    '      INSERT INTO public.security_alerts (severity, category, detail)' || chr(10) ||
    '      VALUES (' || chr(10) ||
    '        ''high'',' || chr(10) ||
    '        ''null_unsafe_auth_guard'',' || chr(10) ||
    '        format(''Function %s compares a caller-supplied value to the caller identity without a NULL check — for an anonymous caller the comparison is NULL, so the guard never fires'', v_finding.function_name)' || chr(10) ||
    '      );' || chr(10) ||
    '      v_new := v_new + 1;' || chr(10) ||
    '    END IF;' || chr(10) ||
    '  END LOOP;' || chr(10) || chr(10) ||
    '  -- 🔴 CRITICAL: a self-referential policy predicate — either a tautology' || chr(10) ||
    '  --    (`x.y = x.y`, which permits everything) or a policy that subqueries its' || chr(10) ||
    '  --    own relation (42P17 infinite recursion, which breaks the feature for' || chr(10) ||
    '  --    every signed-in user). Both were live in the workspace policies.' || chr(10) ||
    '  FOR v_finding IN' || chr(10) ||
    '    SELECT table_name, policy_name, kind FROM public.self_referential_policy_predicate()' || chr(10) ||
    '  LOOP' || chr(10) ||
    '    IF NOT EXISTS (' || chr(10) ||
    '      SELECT 1 FROM public.security_alerts' || chr(10) ||
    '      WHERE category = ''self_referential_policy''' || chr(10) ||
    '        AND detail LIKE ''%'' || v_finding.policy_name || ''%''' || chr(10) ||
    '        AND (is_resolved = false OR resolved_at > NOW() - interval ''7 days'')' || chr(10) ||
    '    ) THEN' || chr(10) ||
    '      INSERT INTO public.security_alerts (severity, category, detail)' || chr(10) ||
    '      VALUES (' || chr(10) ||
    '        CASE WHEN v_finding.kind = ''tautology'' THEN ''critical'' ELSE ''high'' END,' || chr(10) ||
    '        ''self_referential_policy'',' || chr(10) ||
    '        format(''Policy %s on %s is self-referential (%s) — a tautology permits every row, a self-subquery recurses (42P17) and breaks the table for all signed-in users'', v_finding.policy_name, v_finding.table_name, v_finding.kind)' || chr(10) ||
    '      );' || chr(10) ||
    '      v_new := v_new + 1;' || chr(10) ||
    '    END IF;' || chr(10) ||
    '  END LOOP;' || chr(10) || chr(10) ||
    '  -- 📨 Real-time admin email via the CRON_SECRET-protected notify function';

  v_anchor := '  -- 📨 Real-time admin email via the CRON_SECRET-protected notify function';

  IF position(v_anchor in v_src) = 0 THEN
    RAISE EXCEPTION 'check_security_drift() anchor not found — the patch would have been a silent no-op';
  END IF;

  v_new := replace(v_src, v_anchor, v_added);

  IF v_new = v_src THEN
    RAISE EXCEPTION 'check_security_drift() patch produced no change';
  END IF;

  EXECUTE v_new;
END
$patch$;

DO $final$
DECLARE
  v_count integer;
BEGIN
  IF (SELECT count(*) FROM public.null_unsafe_auth_guard()) <> 0 THEN
    RAISE EXCEPTION 'POST-PATCH FAILED: null_unsafe_auth_guard() is non-empty on the live schema';
  END IF;
  IF (SELECT count(*) FROM public.self_referential_policy_predicate()) <> 0 THEN
    RAISE EXCEPTION 'POST-PATCH FAILED: self_referential_policy_predicate() is non-empty on the live schema';
  END IF;
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'check_security_drift') NOT LIKE '%null_unsafe_auth_guard%' THEN
    RAISE EXCEPTION 'POST-PATCH FAILED: check_security_drift() does not sweep null_unsafe_auth_guard()';
  END IF;
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE '__surface_audit_%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'POST-PATCH FAILED: % positive-control artefact(s) left behind', v_count;
  END IF;
END
$final$;
