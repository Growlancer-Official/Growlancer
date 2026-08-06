-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: project posting (category link + match cleanup)
--
-- BUG 1: `project_categories` policy "Clients manage project categories" was
--   created with only a USING expression and a NULL WITH CHECK clause. For
--   INSERT, PostgreSQL evaluates ONLY the WITH CHECK expression — so every
--   category-link insert was rejected by RLS (error 42501), silently breaking
--   category matching after posting a project.
--
-- BUG 2: `ai_matches` had no DELETE policy for the client who owns the project,
--   so the post-flow cleanup (`DELETE FROM ai_matches WHERE project_id = ...`)
--   was also silently rejected.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. project_categories: allow clients to manage links for their own projects ─
DROP POLICY IF EXISTS "Clients manage project categories" ON public.project_categories;

CREATE POLICY "Clients manage project categories"
  ON public.project_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_categories.project_id
        AND p.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_categories.project_id
        AND p.client_id = auth.uid()
    )
  );

-- Keep public read for freelancer discovery.
DROP POLICY IF EXISTS "Anyone can read project categories" ON public.project_categories;
CREATE POLICY "Anyone can read project categories"
  ON public.project_categories
  FOR SELECT
  TO public
  USING (true);

-- ─── 2. ai_matches: project owner (client) may delete matches when re-posting ──
DROP POLICY IF EXISTS "Clients delete their project matches" ON public.ai_matches;

CREATE POLICY "Clients delete their project matches"
  ON public.ai_matches
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = ai_matches.project_id
        AND p.client_id = auth.uid()
    )
  );
