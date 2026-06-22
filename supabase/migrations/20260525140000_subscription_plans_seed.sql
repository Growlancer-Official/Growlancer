-- Seed default subscription plans for the platform
-- This adds Free, Pro Monthly, and Pro Yearly plans if they don't already exist

-- Add missing columns to subscription_plans table (created in 20240511 without these fields)
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'freelancer' CHECK (role IN ('freelancer', 'client'));
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS ai_messages_limit INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS ai_priority BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 0;

-- Seed data is handled by 20260618000000_fix_subscription_plans_schema.sql

-- Ensure RLS is enabled for subscription_plans (already exists, but ensure it's readable)
ALTER TABLE IF EXISTS public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read subscription plans
DROP POLICY IF EXISTS "Anyone can view active subscription plans" ON public.subscription_plans;
CREATE POLICY "Anyone can view active subscription plans"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only admins can insert/update/delete subscription plans
DROP POLICY IF EXISTS "Admins can manage subscription plans" ON public.subscription_plans;
CREATE POLICY "Admins can manage subscription plans"
  ON public.subscription_plans
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Enable realtime for subscription_plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'subscription_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_plans;
  END IF;
END;
$$;