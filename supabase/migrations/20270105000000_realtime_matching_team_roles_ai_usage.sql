-- ═══════════════════════════════════════════════════════════════════════════
-- REAL-TIME MATCHING (ALL PATHS) + TEAM-ROLE SUGGESTIONS + AI WRITER USAGE
-- Migration 20270105000000
--
-- WHAT THIS FIXES (user-reported, verified against code + live drift):
--   1. Freelancer rematch only fired on UPDATE OF categories — editing SKILLS
--      never re-scored existing ai_matches nor matched new open projects, so
--      real-time matching "stopped" the moment a freelancer added a skill.
--   2. TEAM projects (big projects with multiple freelancer roles) had NO
--      server-side matching: team_project_roles.suggested_freelancers was only
--      filled by a client-side JS call ("Find AI Matches" / "Refresh matches").
--      No trigger on role create/edit, none on freelancer skill changes, and
--      team_project_roles was not even in the supabase_realtime publication.
--   3. Clients (project_title/project_description) were throttled by the SAME
--      5/day monetized AI-writer cap as freelancers — violates the platform
--      rule "client AI free for life; backend fair-use protection only".
--   4. No read path to AI-writer usage → frontend could not show a real-time
--      remaining counter next to service title/description generation.
--
-- DESIGN RULES (enforced):
--   • STRICTLY merit-based — is_pro / subscription NEVER appears in any
--     scoring, sorting or threshold (pay-to-win is forbidden).
--   • Drift-tolerant: array columns normalized via matching_text_array() so the
--     same SQL runs on jsonb (live) and text[] (repo) columns.
--   • One shared scoring helper so every path scores identically.
--   • Idempotent: safe on live, safe on a fresh --include-all deployment.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. services.skills — per-service skill tags ───────────────────────────
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}';

-- ─── 1. Realtime publication — team-project tables (idempotent) ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'team_project_roles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_project_roles;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'team_projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_projects;
  END IF;
END $$;

-- ─── 2. Drift-tolerant array normalizer (ensure exists everywhere) ─────────
CREATE OR REPLACE FUNCTION public.matching_text_array(col anyelement)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out text[];
BEGIN
  IF pg_typeof(col) = 'jsonb'::regtype THEN
    SELECT array_agg(x) INTO v_out FROM jsonb_array_elements_text(col::jsonb) AS x;
  ELSE
    SELECT array_agg(x) INTO v_out FROM unnest(col::text[]) AS x;
  END IF;
  RETURN COALESCE(v_out, ARRAY[]::text[]);
END;
$$;
REVOKE ALL ON FUNCTION public.matching_text_array(anyelement) FROM PUBLIC;

-- ─── 3. AI-writer usage RPC (real-time meter for the frontend) ─────────────
-- SECURITY DEFINER + auth.uid() — never accepts a user id from the request.
CREATE OR REPLACE FUNCTION public.get_ai_writer_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_used integer := 0;
  v_limit integer := 5;
  v_is_pro boolean := false;
  v_role text := NULL;
  v_window timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role, COALESCE(is_pro, false) INTO v_role, v_is_pro
  FROM public.profiles
  WHERE id = v_user;

  v_window := date_trunc('day', now()); -- UTC day — matches ai-writer's window
  SELECT COALESCE(count, 0) INTO v_used
  FROM public.rate_limits
  WHERE identifier = v_user::text
    AND route = 'ai-writer'
    AND window_start >= v_window;

  v_limit := CASE WHEN v_is_pro THEN 100 ELSE 5 END;

  RETURN jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used),
    'is_pro', v_is_pro,
    'role', v_role
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_ai_writer_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_writer_usage() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- NORMAL PROJECT MATCHING — ONE SHARED SCORING SOURCE
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 4. Score ONE (freelancer × project). Empty result = ineligible ────────
CREATE OR REPLACE FUNCTION public.project_match_components(p_project_id uuid, p_freelancer_id uuid)
RETURNS TABLE (
  category_matched boolean,
  category_score integer,
  skill_score integer,
  experience_score integer,
  budget_score integer,
  availability_score integer,
  completion_score integer,
  match_score integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_fp record;
  v_cats text[];
  v_fp_skills text[];
  v_required text[];
  v_matched_skills integer := 0;
  v_cat_matched boolean := false;
  v_exp_years numeric := 0;
  v_exp_level text;
  v_hourly numeric := 0;
  v_budget_max numeric := 0;
  v_implied_hourly numeric := 0;
  v_completion numeric := 100;
  v_cat_score integer := 100;
  v_skill_score integer := 50;
  v_exp_score integer := 50;
  v_budget_score integer := 50;
  v_avail_score integer := 40;
  v_comp_score integer := 100;
  v_overall integer := 0;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_project.status IS DISTINCT FROM 'open'
     OR v_project.category IS NULL
     OR v_project.category = '' THEN
    RETURN;
  END IF;

  SELECT fp.categories AS categories, fp.skills AS skills,
         fp.experience AS experience, fp.availability AS availability,
         fp.hourly_rate AS hourly_rate, fp.completion_rate AS completion_rate
  INTO v_fp
  FROM public.freelancer_profiles fp
  JOIN public.profiles p ON p.id = fp.user_id
  WHERE fp.user_id = p_freelancer_id
    AND p.role = 'freelancer' AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_cats := public.matching_text_array(v_fp.categories);
  v_fp_skills := public.matching_text_array(v_fp.skills);

  -- CATEGORY is the anchor — freelancer must cover the project's category
  v_cat_matched := EXISTS (
    SELECT 1 FROM unnest(v_cats) AS cat(c)
    WHERE lower(btrim(cat.c)) = lower(btrim(v_project.category))
  );
  IF NOT v_cat_matched THEN
    RETURN;
  END IF;
  v_cat_score := 100;

  -- SKILLS boost (never disqualifies)
  v_required := public.matching_text_array(v_project.skills_required);
  SELECT count(*) INTO v_matched_skills
  FROM unnest(v_required) AS req(s)
  WHERE EXISTS (
    SELECT 1 FROM unnest(v_fp_skills) AS fs(s2)
    WHERE lower(btrim(fs.s2)) = lower(btrim(req.s))
  );
  v_skill_score := CASE
    WHEN cardinality(v_required) > 0
      THEN round((v_matched_skills::numeric / cardinality(v_required)) * 100)::integer
    ELSE 50
  END;

  -- EXPERIENCE
  v_exp_years := COALESCE(v_fp.experience, 0);
  v_exp_level := lower(COALESCE(v_project.experience_level, ''));
  IF v_exp_level = 'expert' THEN
    v_exp_score := CASE WHEN v_exp_years >= 7 THEN 100 WHEN v_exp_years >= 4 THEN 80 WHEN v_exp_years >= 2 THEN 50 ELSE 30 END;
  ELSIF v_exp_level = 'intermediate' THEN
    v_exp_score := CASE WHEN v_exp_years >= 3 AND v_exp_years < 7 THEN 100 WHEN v_exp_years >= 1 THEN 80 ELSE 40 END;
  ELSE
    v_exp_score := CASE WHEN v_exp_years <= 1 THEN 100 WHEN v_exp_years <= 3 THEN 80 ELSE 50 END;
  END IF;

  -- BUDGET (hourly rate vs implied project hourly budget)
  v_hourly := COALESCE(v_fp.hourly_rate, 0);
  v_budget_max := COALESCE(v_project.budget_max, 0);
  v_implied_hourly := CASE WHEN v_budget_max > 0 THEN v_budget_max / 80 ELSE 0 END;
  IF v_hourly > 0 AND v_implied_hourly > 0 THEN
    IF v_hourly <= v_implied_hourly AND v_hourly >= v_implied_hourly * 0.4 THEN
      v_budget_score := 100;
    ELSIF v_hourly <= v_implied_hourly * 1.3 THEN
      v_budget_score := 80;
    ELSIF v_hourly < v_implied_hourly * 0.4 THEN
      v_budget_score := 70;
    ELSIF v_hourly <= v_implied_hourly * 1.8 THEN
      v_budget_score := 50;
    ELSE
      v_budget_score := 30;
    END IF;
  END IF;

  -- AVAILABILITY + COMPLETION
  v_avail_score := CASE WHEN COALESCE(v_fp.availability, false) IS TRUE THEN 100 ELSE 40 END;
  v_completion := COALESCE(v_fp.completion_rate, 100);
  v_comp_score := GREATEST(0, LEAST(100, v_completion));

  -- WEIGHTED OVERALL — STRICTLY merit-based
  v_overall := LEAST(100, round(
    (v_cat_score * 0.35) +
    (v_skill_score * 0.25) +
    (v_exp_score   * 0.15) +
    (v_budget_score * 0.12) +
    (v_avail_score * 0.08) +
    (v_comp_score  * 0.05)
  )::numeric)::integer;

  RETURN QUERY SELECT v_cat_matched, v_cat_score, v_skill_score, v_exp_score,
                       v_budget_score, v_avail_score, v_comp_score, v_overall;
END;
$$;
REVOKE ALL ON FUNCTION public.project_match_components(uuid, uuid) FROM PUBLIC;

-- ─── 5. Project-scoped rebuild (project posted / reopened / backfill) ───────
CREATE OR REPLACE FUNCTION public.generate_project_matches(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_freelancer record;
  v_m record;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF v_project.status IS DISTINCT FROM 'open'
     OR v_project.category IS NULL OR v_project.category = '' THEN
    RETURN 0;
  END IF;

  -- Replace stale matches for this project
  DELETE FROM public.ai_matches WHERE project_id = p_project_id;

  FOR v_freelancer IN
    SELECT fp.user_id
    FROM public.freelancer_profiles fp
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE p.role = 'freelancer' AND p.deleted_at IS NULL
  LOOP
    FOR v_m IN
      SELECT * FROM public.project_match_components(p_project_id, v_freelancer.user_id)
    LOOP
      IF v_m.match_score >= 40 THEN
        INSERT INTO public.ai_matches (
          project_id, freelancer_id, match_score, skill_score, experience_score,
          budget_score, availability_score, completion_score, category_score,
          ai_score, match_reason
        ) VALUES (
          p_project_id, v_freelancer.user_id, v_m.match_score, v_m.skill_score,
          v_m.experience_score, v_m.budget_score, v_m.availability_score,
          v_m.completion_score, v_m.category_score, NULL, NULL
        );
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_project_matches(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_project_matches(uuid) FROM authenticated;
-- SECURITY DEFINER + notification fan-out: NEVER callable by end-users.
-- Matching is fully trigger-driven now; the client fallback inserts rows
-- through owner-scoped RLS policies instead.
GRANT EXECUTE ON FUNCTION public.generate_project_matches(uuid) TO service_role;

-- ─── 6. Non-destructive project refresh (any existing caller) ───────────────
-- Upserts fresh scores for qualifying freelancers; never deletes existing rows.
CREATE OR REPLACE FUNCTION public.upsert_project_matches(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_freelancer record;
  v_m record;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF v_project.status IS DISTINCT FROM 'open'
     OR v_project.category IS NULL OR v_project.category = '' THEN
    RETURN 0;
  END IF;

  FOR v_freelancer IN
    SELECT fp.user_id
    FROM public.freelancer_profiles fp
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE p.role = 'freelancer' AND p.deleted_at IS NULL
  LOOP
    FOR v_m IN
      SELECT * FROM public.project_match_components(p_project_id, v_freelancer.user_id)
    LOOP
      IF v_m.match_score >= 40 THEN
        INSERT INTO public.ai_matches (
          project_id, freelancer_id, match_score, skill_score, experience_score,
          budget_score, availability_score, completion_score, category_score,
          ai_score, match_reason
        ) VALUES (
          p_project_id, v_freelancer.user_id, v_m.match_score, v_m.skill_score,
          v_m.experience_score, v_m.budget_score, v_m.availability_score,
          v_m.completion_score, v_m.category_score, NULL, NULL
        )
        ON CONFLICT (project_id, freelancer_id) DO UPDATE SET
          match_score = EXCLUDED.match_score,
          skill_score = EXCLUDED.skill_score,
          experience_score = EXCLUDED.experience_score,
          budget_score = EXCLUDED.budget_score,
          availability_score = EXCLUDED.availability_score,
          completion_score = EXCLUDED.completion_score,
          category_score = EXCLUDED.category_score;
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_project_matches(uuid) FROM PUBLIC;
-- service_role only — SECURITY DEFINER; never callable by end-users
GRANT EXECUTE ON FUNCTION public.upsert_project_matches(uuid) TO service_role;

-- ─── 7. Freelancer-scoped refresh — runs when a freelancer edits ANY of
--        categories/skills so matches react in REAL TIME. Stale rows for
--        projects that stopped qualifying are removed; live rows re-scored.
CREATE OR REPLACE FUNCTION public.refresh_freelancer_project_matches(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cats text[];
  v_skills text[];
  v_project record;
  v_m record;
  v_count integer := 0;
BEGIN
  SELECT public.matching_text_array(categories),
         public.matching_text_array(skills)
  INTO v_cats, v_skills
  FROM public.freelancer_profiles
  WHERE user_id = p_user_id;

  IF v_cats IS NULL AND v_skills IS NULL THEN
    -- Profile row gone — drop whatever this freelancer had
    DELETE FROM public.ai_matches WHERE freelancer_id = p_user_id;
    RETURN 0;
  END IF;

  IF cardinality(v_cats) = 0 THEN
    -- No categories → can never qualify for a project match; remove stale rows
    DELETE FROM public.ai_matches WHERE freelancer_id = p_user_id;
  ELSE
    -- Remove matches for projects that are closed or whose category the
    -- freelancer no longer covers
    DELETE FROM public.ai_matches m
    USING public.projects p
    WHERE m.freelancer_id = p_user_id
      AND m.project_id = p.id
      AND (p.status IS DISTINCT FROM 'open'
           OR p.category IS NULL OR p.category = ''
           OR NOT EXISTS (
             SELECT 1 FROM unnest(v_cats) AS cat(c)
             WHERE lower(btrim(cat.c)) = lower(btrim(p.category))
           ));
  END IF;

  IF cardinality(v_cats) = 0 THEN
    RETURN 0;
  END IF;

  -- Re-score against the most recent open projects (bounded for safety)
  FOR v_project IN
    SELECT id FROM public.projects
    WHERE status = 'open' AND category IS NOT NULL AND category <> ''
    ORDER BY created_at DESC
    LIMIT 300
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM unnest(v_cats) AS cat(c)
      WHERE lower(btrim(cat.c)) = lower(btrim(v_project.category))
    ) THEN
      CONTINUE;
    END IF;

    FOR v_m IN
      SELECT * FROM public.project_match_components(v_project.id, p_user_id)
    LOOP
      IF v_m.match_score >= 40 THEN
        INSERT INTO public.ai_matches (
          project_id, freelancer_id, match_score, skill_score, experience_score,
          budget_score, availability_score, completion_score, category_score,
          ai_score, match_reason
        ) VALUES (
          v_project.id, p_user_id, v_m.match_score, v_m.skill_score,
          v_m.experience_score, v_m.budget_score, v_m.availability_score,
          v_m.completion_score, v_m.category_score, NULL, NULL
        )
        ON CONFLICT (project_id, freelancer_id) DO UPDATE SET
          match_score = EXCLUDED.match_score,
          skill_score = EXCLUDED.skill_score,
          experience_score = EXCLUDED.experience_score,
          budget_score = EXCLUDED.budget_score,
          availability_score = EXCLUDED.availability_score,
          completion_score = EXCLUDED.completion_score,
          category_score = EXCLUDED.category_score;
        v_count := v_count + 1;
      ELSE
        DELETE FROM public.ai_matches
        WHERE freelancer_id = p_user_id AND project_id = v_project.id;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_freelancer_project_matches(uuid) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEAM-PROJECT ROLE SUGGESTIONS — full server-side matching
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors the exact weights of the legacy client-side matchFreelancersBySkills
-- so results stay identical: skill-anchored (≥1 overlap), threshold ≥45,
-- top 20. Suggests are cached on team_project_roles.suggested_freelancers.

CREATE INDEX IF NOT EXISTS idx_team_project_roles_status_updated
  ON public.team_project_roles(status, updated_at DESC);

-- ─── 8. Role × freelancer scoring (shared row source) ──────────────────────
CREATE OR REPLACE FUNCTION public.role_match_rows(p_role_id uuid)
RETURNS TABLE (
  freelancer_id uuid,
  name text,
  avatar text,
  verification_status text,
  match_score integer,
  skill_score integer,
  experience_score integer,
  budget_score integer,
  availability_score integer,
  hourly_rate numeric,
  location text,
  bio text,
  rating numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH roleinfo AS (
    SELECT public.matching_text_array(required_skills) AS req_skills,
           COALESCE(budget_range_max, 0) AS budget_max
    FROM public.team_project_roles
    WHERE id = p_role_id
  ),
  f AS (
    SELECT fp.user_id,
           p.name,
           p.avatar,
           p.verification_status,
           public.matching_text_array(fp.skills) AS f_skills,
           COALESCE(fp.experience, 0) AS experience,
           COALESCE(fp.availability, false) AS availability,
           COALESCE(fp.hourly_rate, 0) AS hourly_rate,
           fp.location,
           fp.bio,
           COALESCE(fp.rating, 0) AS rating
    FROM public.freelancer_profiles fp
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE p.role = 'freelancer' AND p.deleted_at IS NULL
  ),
  scored AS (
    SELECT f.user_id, f.name, f.avatar, f.verification_status,
           f.hourly_rate, f.location, f.bio, f.rating,
           f.experience, f.availability,
           r.budget_max,
           cardinality(r.req_skills) AS req_count,
           (SELECT count(*) FROM unnest(r.req_skills) req(s)
             WHERE EXISTS (
               SELECT 1 FROM unnest(f.f_skills) fs
               WHERE lower(btrim(fs)) = lower(btrim(req))
             ))::integer AS matched_skills
    FROM f CROSS JOIN roleinfo r
    WHERE cardinality(r.req_skills) = 0
       OR EXISTS (
         SELECT 1 FROM unnest(r.req_skills) req(s)
         WHERE EXISTS (
           SELECT 1 FROM unnest(f.f_skills) fs
           WHERE lower(btrim(fs)) = lower(btrim(req))
         )
       )
  ),
  final AS (
    SELECT s.user_id, s.name, s.avatar, s.verification_status,
           s.hourly_rate, s.location, s.bio, s.rating,
           (CASE WHEN s.req_count > 0
                 THEN round((s.matched_skills::numeric / s.req_count) * 100)::integer
                 ELSE 50 END) AS skill_score,
           (CASE WHEN s.experience >= 5 THEN 100
                 WHEN s.experience >= 3 THEN 80
                 WHEN s.experience >= 1 THEN 60
                 ELSE 30 END)::integer AS experience_score,
           (CASE WHEN s.hourly_rate > 0 AND s.budget_max > 0 THEN
             CASE WHEN s.hourly_rate <= s.budget_max THEN 100
                  WHEN s.hourly_rate <= s.budget_max * 1.3 THEN 80
                  WHEN s.hourly_rate <= s.budget_max * 1.67 THEN 50
                  ELSE 30 END
           ELSE 50 END)::integer AS budget_score,
           (CASE WHEN s.availability THEN 100 ELSE 20 END)::integer AS availability_score,
           LEAST(100, round(
               ((CASE WHEN s.req_count > 0
                      THEN (s.matched_skills::numeric / s.req_count) * 100
                      ELSE 50 END) * 0.40)
             + ((CASE WHEN s.experience >= 5 THEN 100
                      WHEN s.experience >= 3 THEN 80
                      WHEN s.experience >= 1 THEN 60
                      ELSE 30 END) * 0.20)
             + ((CASE WHEN s.hourly_rate > 0 AND s.budget_max > 0 THEN
                 CASE WHEN s.hourly_rate <= s.budget_max THEN 100
                      WHEN s.hourly_rate <= s.budget_max * 1.3 THEN 80
                      WHEN s.hourly_rate <= s.budget_max * 1.67 THEN 50
                      ELSE 30 END
               ELSE 50 END) * 0.25)
             + ((CASE WHEN s.availability THEN 100 ELSE 20 END) * 0.15)
           )::numeric)::integer AS match_score
    FROM scored s
  )
  SELECT user_id, name, avatar, verification_status,
         match_score, skill_score, experience_score, budget_score,
         availability_score, hourly_rate, location, bio, rating
  FROM final
  WHERE match_score >= 45
  ORDER BY match_score DESC, name ASC
  LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.role_match_rows(uuid) FROM PUBLIC;

-- ─── 9. Write suggestions JSON for ONE open role ───────────────────────────
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
    SELECT row_to_jsonb(t.*) AS suggested, t.match_score, t.name
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

-- ─── 10. Refresh every open role whose skills overlap a freelancer ─────────
-- Called from the freelancer_profiles trigger so the client's team-project
-- page updates in real time when a freelancer adds/changes skills.
CREATE OR REPLACE FUNCTION public.refresh_open_role_suggestions_for_freelancer(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skills text[];
  v_role_id uuid;
  v_count integer := 0;
BEGIN
  SELECT public.matching_text_array(skills) INTO v_skills
  FROM public.freelancer_profiles
  WHERE user_id = p_user_id;

  IF v_skills IS NULL OR cardinality(v_skills) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_role_id IN
    SELECT r.id
    FROM public.team_project_roles r
    JOIN public.team_projects tp ON tp.id = r.team_project_id
    WHERE r.status IN ('open', 'matched')
      AND tp.status IN ('open', 'in_progress')
      AND EXISTS (
        SELECT 1 FROM unnest(public.matching_text_array(r.required_skills)) req
        WHERE EXISTS (
          SELECT 1 FROM unnest(v_skills) fs
          WHERE lower(btrim(fs)) = lower(btrim(req))
        )
      )
    ORDER BY r.updated_at DESC
    LIMIT 50
  LOOP
    PERFORM public.refresh_role_suggestions(v_role_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_open_role_suggestions_for_freelancer(uuid) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Projects → match the moment a project is posted / reopened
CREATE OR REPLACE FUNCTION public.trg_auto_match_projects_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.generate_project_matches(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_auto_match_projects_fn() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_auto_match_projects ON public.projects;
CREATE TRIGGER trg_auto_match_projects
AFTER INSERT OR UPDATE OF status ON public.projects
FOR EACH ROW
WHEN (NEW.status = 'open' AND NEW.category IS NOT NULL AND NEW.category <> '')
EXECUTE FUNCTION public.trg_auto_match_projects_fn();

-- Freelancer profile → re-match projects AND team roles on category/skill
-- changes (categories OR skills — previously skills-only edits never fired).
CREATE OR REPLACE FUNCTION public.trg_auto_match_freelancer_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_freelancer_project_matches(NEW.user_id);
  PERFORM public.refresh_open_role_suggestions_for_freelancer(NEW.user_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_auto_match_freelancer_fn() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_auto_match_freelancer ON public.freelancer_profiles;
CREATE TRIGGER trg_auto_match_freelancer
AFTER INSERT OR UPDATE OF categories, skills ON public.freelancer_profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_match_freelancer_fn();

-- Team role → refresh suggestions when created / skills / budget / status change
CREATE OR REPLACE FUNCTION public.trg_team_role_suggestions_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('open', 'matched')
     AND cardinality(public.matching_text_array(NEW.required_skills)) > 0 THEN
    PERFORM public.refresh_role_suggestions(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_team_role_suggestions_fn() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_team_role_suggestions ON public.team_project_roles;
CREATE TRIGGER trg_team_role_suggestions
AFTER INSERT OR UPDATE OF required_skills, budget_range_min, budget_range_max, status
ON public.team_project_roles
FOR EACH ROW
EXECUTE FUNCTION public.trg_team_role_suggestions_fn();

-- New ai_match → notify the freelancer (deduped per freelancer+project).
-- Recreated here so INSERTs can never abort on a drifted/broken copy.
CREATE OR REPLACE FUNCTION public.notify_new_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.freelancer_id
      AND n.type = 'new_match'
      AND n.metadata->>'project_id' = NEW.project_id::text
  ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      NEW.freelancer_id,
      'new_match',
      'New Project Match!',
      'A new project matches your skills. Check it out!',
      '/dashboard/feed',
      jsonb_build_object('project_id', NEW.project_id, 'match_id', NEW.id, 'match_score', NEW.match_score)
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_new_match() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_new_match() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trigger_new_match ON public.ai_matches;
CREATE TRIGGER trigger_new_match
AFTER INSERT ON public.ai_matches
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_match();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — ai_matches: participants + project owner only (drift healing)
-- ═══════════════════════════════════════════════════════════════════════════

-- Freelancer sees their own match rows (drives the realtime feed)
DROP POLICY IF EXISTS "Freelancers view own matches" ON public.ai_matches;
CREATE POLICY "Freelancers view own matches"
ON public.ai_matches FOR SELECT
TO authenticated
USING (auth.uid() = freelancer_id);

-- Client sees matches for their own projects
DROP POLICY IF EXISTS "Clients view their project matches" ON public.ai_matches;
CREATE POLICY "Clients view their project matches"
ON public.ai_matches FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = ai_matches.project_id AND p.client_id = auth.uid()
  )
);

-- Client-side fallback engine writes matches for their own projects
DROP POLICY IF EXISTS "Clients insert their project matches" ON public.ai_matches;
CREATE POLICY "Clients insert their project matches"
ON public.ai_matches FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = ai_matches.project_id AND p.client_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Clients update their project matches" ON public.ai_matches;
CREATE POLICY "Clients update their project matches"
ON public.ai_matches FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = ai_matches.project_id AND p.client_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Clients delete their project matches" ON public.ai_matches;
CREATE POLICY "Clients delete their project matches"
ON public.ai_matches FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = ai_matches.project_id AND p.client_id = auth.uid()
  )
);

-- ─── Backfill: suggestions for every currently open role ───────────────────
SELECT count(*) AS roles_refreshed FROM (
  SELECT public.refresh_role_suggestions(id)
  FROM public.team_project_roles
  WHERE status IN ('open', 'matched')
) AS backfill;

-- Refresh PostgREST schema cache so new/changed RPCs are exposed
NOTIFY pgrst, 'reload schema';
