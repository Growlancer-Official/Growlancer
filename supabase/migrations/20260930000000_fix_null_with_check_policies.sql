-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: every ALL/INSERT RLS policy with a NULL WITH CHECK clause.
--
-- PostgreSQL evaluates ONLY the WITH CHECK expression on INSERT. Any ALL policy
-- created with just a USING expression (common in this codebase) silently rejects
-- every INSERT with error 42501 — breaking freelancer skills, project skills,
-- admin category/country/industry management, MFA setup, recovery codes, and
-- dispute notes. This migration recreates each policy WITH a matching WITH CHECK.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── freelancer_skills: freelancers add their own skills ──────────────────────
DROP POLICY IF EXISTS "Freelancers manage own skills" ON public.freelancer_skills;
CREATE POLICY "Freelancers manage own skills"
  ON public.freelancer_skills
  FOR ALL
  TO authenticated
  USING (auth.uid() = freelancer_id)
  WITH CHECK (auth.uid() = freelancer_id);

-- ─── project_skills: clients manage skills for their own projects ─────────────
DROP POLICY IF EXISTS "Clients manage project skills" ON public.project_skills;
CREATE POLICY "Clients manage project skills"
  ON public.project_skills
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_skills.project_id AND projects.client_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_skills.project_id AND projects.client_id = auth.uid())
  );

-- ─── service_categories: freelancers manage categories for their own services ──
DROP POLICY IF EXISTS "Freelancers manage service categories" ON public.service_categories;
CREATE POLICY "Freelancers manage service categories"
  ON public.service_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.services WHERE services.id = service_categories.service_id AND services.freelancer_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.services WHERE services.id = service_categories.service_id AND services.freelancer_id = auth.uid())
  );

-- ─── recovery_codes: users manage their own 2FA recovery codes ────────────────
DROP POLICY IF EXISTS "Users manage own recovery codes" ON public.recovery_codes;
CREATE POLICY "Users manage own recovery codes"
  ON public.recovery_codes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── user_mfa_settings: users manage their own MFA settings ───────────────────
DROP POLICY IF EXISTS "Users manage own MFA settings" ON public.user_mfa_settings;
CREATE POLICY "Users manage own MFA settings"
  ON public.user_mfa_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── dispute_internal_notes: admin-only (admin flag derived from profiles) ─────
DROP POLICY IF EXISTS "Dispute notes admin only" ON public.dispute_internal_notes;
CREATE POLICY "Dispute notes admin only"
  ON public.dispute_internal_notes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ─── paypal_disputes: admins view/manage disputes ─────────────────────────────
DROP POLICY IF EXISTS "Admins can view disputes" ON public.paypal_disputes;
CREATE POLICY "Admins can view disputes"
  ON public.paypal_disputes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ─── Admin-managed dictionary tables: admins insert/update/delete ─────────────
-- categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories"
  ON public.categories
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin');

-- countries
DROP POLICY IF EXISTS "Admins can manage countries" ON public.countries;
CREATE POLICY "Admins can manage countries"
  ON public.countries
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin');

-- industries
DROP POLICY IF EXISTS "Admins can manage industries" ON public.industries;
CREATE POLICY "Admins can manage industries"
  ON public.industries
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin');

-- skills
DROP POLICY IF EXISTS "Admins can manage skills" ON public.skills;
CREATE POLICY "Admins can manage skills"
  ON public.skills
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin');

-- subcategories
DROP POLICY IF EXISTS "Admins can manage subcategories" ON public.subcategories;
CREATE POLICY "Admins can manage subcategories"
  ON public.subcategories
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) = 'admin');

-- ─── projects: the catch-all ALL policy needs a WITH CHECK too ────────────────
-- ("Clients can manage own projects" ALL had only USING; the dedicated INSERT
-- policy covers inserts, but a WITH CHECK keeps the policy self-consistent.)
DROP POLICY IF EXISTS "Clients can manage own projects" ON public.projects;
CREATE POLICY "Clients can manage own projects"
  ON public.projects
  FOR ALL
  TO public
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);
