-- ═══════════════════════════════════════════════════════════════════════════
-- SKILL-FIRST MATCHING (fixes "client posts project but no freelancers show")
--
-- Root cause: project_match_components treated CATEGORY as a hard gate —
-- `IF NOT v_cat_matched THEN RETURN;` — so a freelancer whose categories
-- didn't contain the project's exact category string NEVER got an ai_matches
-- row, even with a 100% skill overlap. The feed's synthetic "Browse" rows
-- masked this (they look like matches), while real ai_matches stayed empty,
-- which kept the client's AI recommendations (and the freelancer's match
-- counter) at zero forever.
--
-- Fix (still 100% merit-based — is_pro/payment has no influence):
--   • Skills are scored FIRST and can qualify a freelancer on their own.
--   • Category is now a score BOOST (35% weight when covered), not a gate.
--   • A freelancer with no category overlap must genuinely overlap the
--     project's required skills (>= 1 skill and >= 40% of them) to qualify.
--   • refresh_freelancer_project_matches no longer wipes rows purely because
--     categories changed — stale rows are removed only for projects that
--     stopped being open or lost their category.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Shared scoring engine — skill-first ────────────────────────────────
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
  v_cat_score integer := 0;
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

  -- ── SKILLS (scored first — a strong skill overlap can qualify on its own) ─
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

  -- ── CATEGORY (boost when covered — NEVER a hard gate) ────────────────────
  v_cat_matched := EXISTS (
    SELECT 1 FROM unnest(v_cats) AS cat(c)
    WHERE lower(btrim(cat.c)) = lower(btrim(v_project.category))
  );
  IF v_cat_matched THEN
    v_cat_score := 100;
  ELSE
    v_cat_score := 0;
    -- No category overlap: qualify ONLY on genuine skill overlap — the
    -- project must list skills and the freelancer must cover a meaningful
    -- share of them (>= 1 skill and >= 40% of the required set).
    IF cardinality(v_required) = 0 OR v_matched_skills = 0 OR v_skill_score < 40 THEN
      RETURN;
    END IF;
  END IF;

  -- ── EXPERIENCE ───────────────────────────────────────────────────────────
  v_exp_years := COALESCE(v_fp.experience, 0);
  v_exp_level := lower(COALESCE(v_project.experience_level, ''));
  IF v_exp_level = 'expert' THEN
    v_exp_score := CASE WHEN v_exp_years >= 7 THEN 100 WHEN v_exp_years >= 4 THEN 80 WHEN v_exp_years >= 2 THEN 50 ELSE 30 END;
  ELSIF v_exp_level = 'intermediate' THEN
    v_exp_score := CASE WHEN v_exp_years >= 3 AND v_exp_years < 7 THEN 100 WHEN v_exp_years >= 1 THEN 80 ELSE 40 END;
  ELSE
    v_exp_score := CASE WHEN v_exp_years <= 1 THEN 100 WHEN v_exp_years <= 3 THEN 80 ELSE 50 END;
  END IF;

  -- ── BUDGET (hourly rate vs implied project hourly budget) ────────────────
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

  -- ── AVAILABILITY + COMPLETION ────────────────────────────────────────────
  v_avail_score := CASE WHEN COALESCE(v_fp.availability, false) IS TRUE THEN 100 ELSE 40 END;
  v_completion := COALESCE(v_fp.completion_rate, 100);
  v_comp_score := GREATEST(0, LEAST(100, v_completion));

  -- ── WEIGHTED OVERALL — STRICTLY merit-based ──────────────────────────────
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

-- ─── 2. Freelancer-scoped refresh — skill edits must NEVER wipe matches ─────
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

  IF (v_cats IS NULL OR cardinality(v_cats) = 0)
     AND (v_skills IS NULL OR cardinality(v_skills) = 0) THEN
    -- Nothing to match on — remove stale rows
    DELETE FROM public.ai_matches WHERE freelancer_id = p_user_id;
    RETURN 0;
  END IF;

  -- Remove matches for projects that are no longer open or lost their
  -- category. (Category-coverage rows are NOT removed here — skill overlap
  -- can qualify under the skill-first engine; project_match_components
  -- decides qualification and the loop below cleans sub-threshold rows.)
  DELETE FROM public.ai_matches m
  USING public.projects p
  WHERE m.freelancer_id = p_user_id
    AND m.project_id = p.id
    AND (p.status IS DISTINCT FROM 'open'
         OR p.category IS NULL OR p.category = '');

  -- Re-score against the most recent open projects (bounded for safety)
  FOR v_project IN
    SELECT id FROM public.projects
    WHERE status = 'open' AND category IS NOT NULL AND category <> ''
    ORDER BY created_at DESC
    LIMIT 300
  LOOP
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

-- ─── 3. Backfill — re-score every open project with the skill-first engine ──
DO $$
DECLARE
  v_project record;
BEGIN
  FOR v_project IN
    SELECT id FROM public.projects
    WHERE status = 'open' AND category IS NOT NULL AND category <> ''
  LOOP
    PERFORM public.generate_project_matches(v_project.id);
  END LOOP;
END $$;
