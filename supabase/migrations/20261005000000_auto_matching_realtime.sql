-- ═══════════════════════════════════════════════════════════════════════════
-- REAL-TIME AUTO-MATCHING
-- Migration 20261005000000
--
-- WHY: ai_matches stayed empty unless a client manually visited their matches
-- page — so the freelancer AI feed and client AI matches showed nothing. This
-- migration makes matching automatic and real-time:
--   1. generate_project_matches() — server-side category-first scoring engine
--      (uses freelancer_profiles.categories + skills, consistent 0-100 scales)
--   2. Trigger on projects INSERT / status→open — matching runs the moment a
--      client posts a project (feeds update live via realtime).
--   3. RLS: allow the project owner to insert/update rows for their own
--      project (client-side fallback path), in addition to existing SELECTs.
--   4. Backfill: generate matches for every existing open project.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Server-side match engine (SECURITY DEFINER — bypasses RLS) ─────────
CREATE OR REPLACE FUNCTION public.generate_project_matches(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_count integer := 0;
  v_freelancer record;
  v_fp record;
  v_category_matched boolean;
  v_category_score integer;
  v_matched_skills integer;
  v_skill_score integer;
  v_exp_score integer;
  v_budget_score integer;
  v_avail_score integer;
  v_comp_score integer;
  v_match_score integer;
  v_budget_max numeric;
  v_implied_hourly numeric;
  v_hourly numeric;
  v_exp_years numeric;
BEGIN
  -- Only operate on open projects that carry a category
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF v_project.status IS DISTINCT FROM 'open'
     OR v_project.category IS NULL
     OR v_project.category = '' THEN
    RETURN 0;
  END IF;

  -- Replace any stale matches for this project
  DELETE FROM public.ai_matches WHERE project_id = p_project_id;

  FOR v_freelancer IN
    SELECT fp.user_id, fp.categories, fp.skills, fp.experience, fp.availability,
           fp.hourly_rate, fp.completion_rate, p.deleted_at
    FROM public.freelancer_profiles fp
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE p.role = 'freelancer' AND p.deleted_at IS NULL
  LOOP
    v_fp := v_freelancer;

    -- ── CATEGORY (primary anchor) — case-insensitive, normalized ──────────
    v_category_matched := EXISTS (
      SELECT 1 FROM unnest(COALESCE(v_fp.categories, ARRAY[]::text[])) AS cat(c)
      WHERE lower(btrim(cat.c)) = lower(btrim(v_project.category))
    );
    IF NOT v_category_matched THEN
      CONTINUE; -- freelancer must cover the project's category
    END IF;
    v_category_score := 100;

    -- ── SKILLS (secondary boost, never disqualifies) ─────────────────────
    SELECT count(*) INTO v_matched_skills
    FROM unnest(COALESCE(v_project.skills_required, ARRAY[]::text[])) AS req(s)
    WHERE EXISTS (
      SELECT 1 FROM unnest(COALESCE(v_fp.skills, ARRAY[]::text[])) AS fs(s2)
      WHERE lower(btrim(fs.s2)) = lower(btrim(req.s))
    );
    v_skill_score := CASE
      WHEN cardinality(COALESCE(v_project.skills_required, ARRAY[]::text[])) > 0
        THEN round((v_matched_skills::numeric / cardinality(COALESCE(v_project.skills_required, ARRAY[]::text[]))) * 100)::integer
      ELSE 50
    END;

    -- ── EXPERIENCE (0-100) ────────────────────────────────────────────────
    v_exp_years := COALESCE(v_fp.experience, 0);
    v_exp_score := 50;
    IF lower(v_project.experience_level) = 'expert' THEN
      v_exp_score := CASE WHEN v_exp_years >= 7 THEN 100 WHEN v_exp_years >= 4 THEN 80 WHEN v_exp_years >= 2 THEN 50 ELSE 30 END;
    ELSIF lower(v_project.experience_level) = 'intermediate' THEN
      v_exp_score := CASE WHEN v_exp_years >= 3 AND v_exp_years < 7 THEN 100 WHEN v_exp_years >= 1 THEN 80 ELSE 40 END;
    ELSE
      v_exp_score := CASE WHEN v_exp_years <= 1 THEN 100 WHEN v_exp_years <= 3 THEN 80 ELSE 50 END;
    END IF;

    -- ── BUDGET (hourly rate vs implied project hourly budget) ─────────────
    v_hourly := COALESCE(v_fp.hourly_rate, 0);
    v_budget_max := COALESCE(v_project.budget_max, 0);
    v_implied_hourly := CASE WHEN v_budget_max > 0 THEN v_budget_max / 80 ELSE 0 END;
    v_budget_score := 50;
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

    -- ── AVAILABILITY ──────────────────────────────────────────────────────
    v_avail_score := CASE WHEN v_fp.availability IS TRUE THEN 100 ELSE 40 END;

    -- ── COMPLETION ────────────────────────────────────────────────────────
    v_comp_score := GREATEST(0, LEAST(100, COALESCE(v_fp.completion_rate, 100)));

    -- ── WEIGHTED OVERALL (category is the anchor) ─────────────────────────
    v_match_score := LEAST(100, round(
      (v_category_score * 0.35) +
      (v_skill_score     * 0.25) +
      (v_exp_score       * 0.15) +
      (v_budget_score    * 0.12) +
      (v_avail_score     * 0.08) +
      (v_comp_score      * 0.05)
    )::numeric)::integer;

    IF v_match_score >= 40 THEN
      INSERT INTO public.ai_matches (
        project_id, freelancer_id, match_score, skill_score, experience_score,
        budget_score, availability_score, completion_score, category_score,
        ai_score, match_reason
      ) VALUES (
        p_project_id, v_freelancer.user_id, v_match_score, v_skill_score,
        v_exp_score, v_budget_score, v_avail_score, v_comp_score,
        v_category_score, NULL, NULL
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Grant: clients trigger generation via the edge function/fallback
REVOKE ALL ON FUNCTION public.generate_project_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_project_matches(uuid) TO authenticated, service_role;

-- ─── 2. Trigger — match the moment a project is posted / reopened ──────────
-- Trigger functions take no arguments; wrap the engine in a trigger fn.
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

DROP TRIGGER IF EXISTS trg_auto_match_projects ON public.projects;
CREATE TRIGGER trg_auto_match_projects
AFTER INSERT OR UPDATE OF status ON public.projects
FOR EACH ROW
WHEN (NEW.status = 'open' AND NEW.category IS NOT NULL AND NEW.category <> '')
EXECUTE FUNCTION public.trg_auto_match_projects_fn();

-- ─── 3. RLS: allow the project owner to write match rows (client fallback) ─
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

-- ─── 4. Backfill — generate matches for all existing open projects ────────
SELECT count(*) FROM (
  SELECT public.generate_project_matches(id)
  FROM public.projects
  WHERE status = 'open' AND category IS NOT NULL AND category <> ''
) AS backfill;
