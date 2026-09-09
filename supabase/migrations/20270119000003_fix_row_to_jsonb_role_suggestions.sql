-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000003_fix_row_to_jsonb_role_suggestions.sql
--
-- CRITICAL runtime fix discovered in playtest (2026-09-07): team-role
-- creation was completely broken in production.
--
-- refresh_role_suggestions() (created by 20270105000000) calls
-- `row_to_jsonb(t.*)` — but row_to_jsonb does NOT exist in PostgreSQL (only
-- row_to_json does; the jsonb conversion is to_jsonb). PL/pgSQL bodies are
-- not validated at CREATE time, so the migration applied cleanly and the
-- function only exploded at runtime — on the very first INSERT into
-- team_project_roles, because trg_team_role_suggestions (AFTER INSERT)
-- invokes refresh_role_suggestions(). The exception aborted the insert and
-- PostgREST surfaced it as:
--
--   function row_to_jsonb(record) does not exist
--
-- So no team-project role could EVER be created through the UI (every role
-- insert rolled back). Fix: row_to_jsonb → to_jsonb. Everything else in the
-- function is unchanged.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_role_suggestions(p_role_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_role_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.team_project_roles
    WHERE id = p_role_id
      AND status IN ('open', 'matched')
      AND cardinality(public.matching_text_array(required_skills)) > 0
  ) INTO v_role_exists;

  IF NOT v_role_exists THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(jsonb_agg(s.suggested ORDER BY s.match_score DESC, s.name ASC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT to_jsonb(t.*) AS suggested, t.match_score, t.name
    FROM public.role_match_rows(p_role_id) t
  ) s;

  UPDATE public.team_project_roles
  SET suggested_freelancers = v_result,
      updated_at = now()
  WHERE id = p_role_id;

  RETURN jsonb_array_length(v_result);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_role_suggestions(uuid) FROM PUBLIC;