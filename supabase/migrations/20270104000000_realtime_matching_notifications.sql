-- ═══════════════════════════════════════════════════════════════════════════
-- REAL-TIME MATCHING + NOTIFICATIONS PIPELINE — COMPLETE RECONCILIATION
-- Migration 20270104000000
--
-- WHAT WAS BROKEN (verified live, 2026-09-04):
--   1. ZERO notification/match triggers exist on the live DB (all notify_*
--      triggers + trg_auto_match_projects were dropped; only the functions
--      survived). Result: proposals, invites, contracts, escrow events and
--      NEW MATCHES never notify anyone — the in-app notification feed stays
--      silent and the realtime feeds stay empty.
--   2. Matching only ran when a CLIENT opened their matches page — nothing
--      triggered it on project creation or on freelancer profile completion,
--      so freelancers never saw new projects and clients never saw new
--      freelancers.
--   3. notify_new_match() (redefined by 20260908000000) still inserts into
--      the DEAD `link` column — the live notifications table uses
--      `action_url`. Any ai_matches INSERT that fired it would abort.
--
-- THIS MIGRATION:
--   • Recreates the full server-side match engine (drift-tolerant: works on
--     both live jsonb columns and repo text[] columns via anyelement).
--   • Auto-matches on project post AND on freelancer profile completion —
--     realtime feeds update instantly via the existing supabase_realtime
--     publication (ai_matches, notifications, projects, freelancer_profiles).
--   • Restores every notify_* trigger using the live `action_url` schema.
--   • Strictly merit-based: NO is_pro / subscription influence anywhere in
--     scoring (platform promise — pay-to-win is forbidden).
--   • Backfills matches for existing open projects.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. Drift-tolerant array normalizer (jsonb on live, text[] in repo) ────
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

-- ─── 1. Server-side match engine (category-first, merit-only) ──────────────
-- Recreates generate_project_matches() drift-tolerantly (the repo 20261005
-- version assumed text[]; live columns are jsonb). Semantics preserved:
-- deletes stale matches for the project, then writes fresh scored rows.
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
  v_required text[];
  v_fp_skills text[];
BEGIN
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
    -- ── CATEGORY (primary anchor) — case-insensitive, normalized ──────────
    v_category_matched := EXISTS (
      SELECT 1 FROM unnest(public.matching_text_array(v_freelancer.categories)) AS cat(c)
      WHERE lower(btrim(cat.c)) = lower(btrim(v_project.category))
    );
    IF NOT v_category_matched THEN
      CONTINUE; -- freelancer must cover the project's category
    END IF;
    v_category_score := 100;

    -- ── SKILLS (secondary boost, never disqualifies) ─────────────────────
    v_required := public.matching_text_array(v_project.skills_required);
    v_fp_skills := public.matching_text_array(v_freelancer.skills);
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

    -- ── EXPERIENCE (0-100) ────────────────────────────────────────────────
    v_exp_years := COALESCE(v_freelancer.experience, 0);
    v_exp_score := 50;
    IF lower(COALESCE(v_project.experience_level, '')) = 'expert' THEN
      v_exp_score := CASE WHEN v_exp_years >= 7 THEN 100 WHEN v_exp_years >= 4 THEN 80 WHEN v_exp_years >= 2 THEN 50 ELSE 30 END;
    ELSIF lower(COALESCE(v_project.experience_level, '')) = 'intermediate' THEN
      v_exp_score := CASE WHEN v_exp_years >= 3 AND v_exp_years < 7 THEN 100 WHEN v_exp_years >= 1 THEN 80 ELSE 40 END;
    ELSE
      v_exp_score := CASE WHEN v_exp_years <= 1 THEN 100 WHEN v_exp_years <= 3 THEN 80 ELSE 50 END;
    END IF;

    -- ── BUDGET (hourly rate vs implied project hourly budget) ─────────────
    v_hourly := COALESCE(v_freelancer.hourly_rate, 0);
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
    v_avail_score := CASE WHEN v_freelancer.availability IS TRUE THEN 100 ELSE 40 END;

    -- ── COMPLETION ────────────────────────────────────────────────────────
    v_comp_score := GREATEST(0, LEAST(100, COALESCE(v_freelancer.completion_rate, 100)));

    -- ── WEIGHTED OVERALL (category is the anchor; STRICTLY merit-based) ───
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
REVOKE ALL ON FUNCTION public.generate_project_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_project_matches(uuid) TO authenticated, service_role;

-- ─── 2. Non-destructive upsert variant (freelancer-completion path) ────────
-- Same scoring, but never deletes existing rows and never re-notifies:
-- ON CONFLICT DO NOTHING keeps matches stable when any freelancer updates.
CREATE OR REPLACE FUNCTION public.upsert_project_matches(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_count integer := 0;
  v_freelancer record;
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
  v_required text[];
  v_fp_skills text[];
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF v_project.status IS DISTINCT FROM 'open'
     OR v_project.category IS NULL
     OR v_project.category = '' THEN
    RETURN 0;
  END IF;

  FOR v_freelancer IN
    SELECT fp.user_id, fp.categories, fp.skills, fp.experience, fp.availability,
           fp.hourly_rate, fp.completion_rate, p.deleted_at
    FROM public.freelancer_profiles fp
    JOIN public.profiles p ON p.id = fp.user_id
    WHERE p.role = 'freelancer' AND p.deleted_at IS NULL
  LOOP
    v_category_matched := EXISTS (
      SELECT 1 FROM unnest(public.matching_text_array(v_freelancer.categories)) AS cat(c)
      WHERE lower(btrim(cat.c)) = lower(btrim(v_project.category))
    );
    IF NOT v_category_matched THEN
      CONTINUE;
    END IF;
    v_category_score := 100;

    v_required := public.matching_text_array(v_project.skills_required);
    v_fp_skills := public.matching_text_array(v_freelancer.skills);
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

    v_exp_years := COALESCE(v_freelancer.experience, 0);
    v_exp_score := 50;
    IF lower(COALESCE(v_project.experience_level, '')) = 'expert' THEN
      v_exp_score := CASE WHEN v_exp_years >= 7 THEN 100 WHEN v_exp_years >= 4 THEN 80 WHEN v_exp_years >= 2 THEN 50 ELSE 30 END;
    ELSIF lower(COALESCE(v_project.experience_level, '')) = 'intermediate' THEN
      v_exp_score := CASE WHEN v_exp_years >= 3 AND v_exp_years < 7 THEN 100 WHEN v_exp_years >= 1 THEN 80 ELSE 40 END;
    ELSE
      v_exp_score := CASE WHEN v_exp_years <= 1 THEN 100 WHEN v_exp_years <= 3 THEN 80 ELSE 50 END;
    END IF;

    v_hourly := COALESCE(v_freelancer.hourly_rate, 0);
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

    v_avail_score := CASE WHEN v_freelancer.availability IS TRUE THEN 100 ELSE 40 END;
    v_comp_score := GREATEST(0, LEAST(100, COALESCE(v_freelancer.completion_rate, 100)));

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
      )
      ON CONFLICT (project_id, freelancer_id) DO NOTHING;
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_project_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_project_matches(uuid) TO service_role;

-- ─── 3. Triggers: match the moment a project is posted / reopened ──────────
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

-- ─── 4. Trigger: match a freelancer against open projects when their ───────
--     professional profile is created/updated with categories. Idempotent
--     (upsert + ON CONFLICT DO NOTHING) so profile edits never duplicate
--     matches or spam notifications. Bounded to 100 open projects.
CREATE OR REPLACE FUNCTION public.trg_auto_match_freelancer_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project record;
  v_cats text[];
BEGIN
  v_cats := public.matching_text_array(NEW.categories);
  IF cardinality(v_cats) = 0 THEN
    RETURN NEW;
  END IF;
  FOR v_project IN
    SELECT id FROM public.projects
    WHERE status = 'open' AND category IS NOT NULL AND category <> ''
    ORDER BY created_at DESC
    LIMIT 100
  LOOP
    PERFORM public.upsert_project_matches(v_project.id);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_auto_match_freelancer_fn() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_auto_match_freelancer ON public.freelancer_profiles;
CREATE TRIGGER trg_auto_match_freelancer
AFTER INSERT OR UPDATE OF categories ON public.freelancer_profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_match_freelancer_fn();

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATION TRIGGERS (restored — all absent on live)
-- Every function writes the LIVE schema: action_url + metadata.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. New proposal → notify the CLIENT
CREATE OR REPLACE FUNCTION public.notify_new_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_title text;
BEGIN
  SELECT client_id, title INTO v_client_id, v_title
  FROM public.projects WHERE id = NEW.project_id;

  IF v_client_id IS NOT NULL AND v_client_id IS DISTINCT FROM NEW.freelancer_id THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      v_client_id,
      'proposal',
      'New Proposal Received',
      'A freelancer just submitted a proposal for "' || COALESCE(v_title, 'your project') || '".',
      '/client/proposals?project=' || NEW.project_id,
      jsonb_build_object('project_id', NEW.project_id, 'proposal_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_proposal ON public.proposals;
CREATE TRIGGER trigger_new_proposal
AFTER INSERT ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_proposal();

-- 2. Proposal accepted/rejected → notify the FREELANCER
CREATE OR REPLACE FUNCTION public.notify_proposal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      NEW.freelancer_id,
      'proposal',
      CASE
        WHEN NEW.status = 'accepted' THEN 'Proposal Accepted!'
        WHEN NEW.status = 'rejected' THEN 'Proposal Not Selected'
        ELSE 'Proposal Status Updated'
      END,
      CASE
        WHEN NEW.status = 'accepted' THEN 'Your proposal has been accepted. Check your contracts for details.'
        WHEN NEW.status = 'rejected' THEN 'Your proposal was not selected for this project.'
        ELSE 'Your proposal status has been updated.'
      END,
      '/dashboard/proposals',
      jsonb_build_object('project_id', NEW.project_id, 'proposal_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proposal_status ON public.proposals;
CREATE TRIGGER trigger_proposal_status
AFTER UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.notify_proposal_status();

-- 3. New contract → notify BOTH freelancer AND client
CREATE OR REPLACE FUNCTION public.notify_new_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES
    (
      NEW.freelancer_id,
      'contract',
      'New Contract Started!',
      'You have a new contract. View details in your workspace.',
      '/dashboard/contracts',
      jsonb_build_object('contract_id', NEW.id, 'project_id', NEW.project_id)
    ),
    (
      NEW.client_id,
      'contract',
      'Contract Created',
      'A new contract has been created. Fund escrow to get started.',
      '/client/contracts',
      jsonb_build_object('contract_id', NEW.id, 'project_id', NEW.project_id)
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_contract ON public.contracts;
CREATE TRIGGER trigger_new_contract
AFTER INSERT ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_contract();

-- 4. Contract completed → notify BOTH users
CREATE OR REPLACE FUNCTION public.notify_contract_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES
      (
        NEW.freelancer_id,
        'contract',
        'Contract Completed!',
        'Your contract has been completed. Funds have been released.',
        '/dashboard/wallet',
        jsonb_build_object('contract_id', NEW.id)
      ),
      (
        NEW.client_id,
        'contract',
        'Project Completed',
        'The project has been completed successfully.',
        '/client/contracts',
        jsonb_build_object('contract_id', NEW.id)
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_contract_completion ON public.contracts;
CREATE TRIGGER trigger_contract_completion
AFTER UPDATE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.notify_contract_completion();

-- 5. New invite → notify the FREELANCER
CREATE OR REPLACE FUNCTION public.notify_new_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
  v_title text;
BEGIN
  SELECT COALESCE(p.name, 'A client') INTO v_client_name
  FROM public.profiles p WHERE p.id = NEW.client_id;

  SELECT title INTO v_title FROM public.projects WHERE id = NEW.project_id;

  INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
  VALUES (
    NEW.freelancer_id,
    'invite',
    'New Project Invite',
    v_client_name || ' invited you to "' || COALESCE(v_title, 'a project') || '".',
    '/dashboard/invites',
    jsonb_build_object('invite_id', NEW.id, 'project_id', NEW.project_id, 'client_id', NEW.client_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_invite ON public.invites;
CREATE TRIGGER trigger_new_invite
AFTER INSERT ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_invite();

-- 6. Escrow funded → notify the FREELANCER
CREATE OR REPLACE FUNCTION public.notify_escrow_funded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('funded', 'active') THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      NEW.freelancer_id,
      'escrow',
      'Escrow Funded — Start Working!',
      'The client has funded the escrow. You can now start working on the contract.',
      '/dashboard/workspace?contract=' || NEW.contract_id,
      jsonb_build_object('contract_id', NEW.contract_id, 'escrow_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_escrow_funded ON public.escrow;
CREATE TRIGGER trigger_escrow_funded
AFTER UPDATE ON public.escrow
FOR EACH ROW
EXECUTE FUNCTION public.notify_escrow_funded();

-- 7. Milestone released → notify the FREELANCER
CREATE OR REPLACE FUNCTION public.notify_milestone_released()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('released', 'paid', 'completed') THEN
    IF NEW.freelancer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (
        NEW.freelancer_id,
        'escrow',
        'Milestone Released',
        'A milestone payment has been released to your wallet.',
        '/dashboard/wallet',
        jsonb_build_object('escrow_id', NEW.id, 'contract_id', NEW.contract_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_milestone_released ON public.escrow;
CREATE TRIGGER trigger_milestone_released
AFTER UPDATE ON public.escrow
FOR EACH ROW
EXECUTE FUNCTION public.notify_milestone_released();

-- 8. NEW MATCH → notify the FREELANCER
-- FIXED vs 20260908000000: uses action_url + metadata (the `link` column no
-- longer exists) and dedupes per (freelancer, project) so profile-completion
-- upserts never spam the notification feed.
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

DROP TRIGGER IF EXISTS trigger_new_match ON public.ai_matches;
CREATE TRIGGER trigger_new_match
AFTER INSERT ON public.ai_matches
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_match();

-- ─── Grants (RLS-safe: triggers run SECURITY DEFINER, but the fireable ─────
--     roles need EXECUTE like the 20261025 restore) ────────────────────────
GRANT EXECUTE ON FUNCTION public.notify_new_proposal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_proposal_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_new_contract() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_contract_completion() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_new_invite() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_escrow_funded() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_milestone_released() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_new_match() TO authenticated, service_role;

-- ─── Backfill: generate matches for every existing open project ───────────
SELECT count(*) AS backfilled_matches FROM (
  SELECT public.generate_project_matches(id)
  FROM public.projects
  WHERE status = 'open' AND category IS NOT NULL AND category <> ''
) AS backfill;

-- Refresh PostgREST schema cache so the new/changed functions are exposed
NOTIFY pgrst, 'reload schema';