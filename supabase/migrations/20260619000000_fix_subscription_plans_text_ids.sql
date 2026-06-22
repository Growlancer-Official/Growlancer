-- Fix subscription_plans: change from UUID to TEXT IDs for frontend compatibility
-- Frontend plans reference IDs like 'free', 'pro_monthly', 'pro_yearly' etc.

-- Drop old policies first
DROP POLICY IF EXISTS "Anyone can view active subscription plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Admins can manage subscription plans" ON public.subscription_plans;

-- Drop and recreate table with TEXT IDs
DROP TABLE IF EXISTS public.subscription_plans CASCADE;

CREATE TABLE public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  role TEXT NOT NULL DEFAULT 'freelancer' CHECK (role IN ('freelancer', 'client')),
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  ai_messages_limit INTEGER NOT NULL DEFAULT 10,
  ai_priority BOOLEAN NOT NULL DEFAULT false,
  trial_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Recreate policies
CREATE POLICY "Anyone can view active subscription plans"
  ON public.subscription_plans FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage subscription plans"
  ON public.subscription_plans FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Enable realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'subscription_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_plans;
  END IF;
END;
$$;

-- Seed data - Freelancer plans
INSERT INTO public.subscription_plans (id, name, description, price, interval, role, features, is_active, ai_messages_limit, ai_priority, trial_days) VALUES
  ('free', 'Free', 'Essential AI tools to get started', 0, 'month', 'freelancer', '["10 AI messages per month","AI-powered project matching","Personalized AI assistant","Standard support"]'::jsonb, true, 10, false, 0),
  ('pro_starter_monthly', 'Pro Starter', 'Unlock priority matching and unlimited AI messages', 10, 'month', 'freelancer', '["Unlimited AI messages","Priority AI project matching","Featured profile placement","Priority AI responses","Advanced analytics dashboard","24/7 priority support","Up to $10,000/month withdrawal limit","Early access to new features"]'::jsonb, true, 1000, true, 14),
  ('pro_starter_yearly', 'Pro Starter', 'Best value with 2 months free', 100, 'year', 'freelancer', '["Unlimited AI messages","Priority AI project matching","Featured profile placement","Priority AI responses","Advanced analytics dashboard","24/7 priority support","Up to $10,000/month withdrawal limit","Early access to new features","Annual billing discount"]'::jsonb, true, 1000, true, 14),
  ('pro_monthly', 'Pro Monthly', 'Unlimited AI access and priority matching', 19.99, 'month', 'freelancer', '["Unlimited AI messages","Priority AI responses","Priority project matching","Advanced analytics","Priority support","Early access to features"]'::jsonb, true, 1000, true, 14),
  ('pro_yearly', 'Pro Yearly', 'Best value with 2 months free', 199.99, 'year', 'freelancer', '["Unlimited AI messages","Priority AI responses","Priority project matching","Advanced analytics","Priority support","Early access to features","Annual billing discount"]'::jsonb, true, 1000, true, 14)
ON CONFLICT (id) DO NOTHING;

-- Seed data - Client plans
INSERT INTO public.subscription_plans (id, name, description, price, interval, role, features, is_active, ai_messages_limit, ai_priority, trial_days) VALUES
  ('client_free', 'Free', 'Essential AI tools to get started', 0, 'month', 'client', '["10 AI messages per month","AI-powered freelancer matching","Personalized AI assistant","Standard support"]'::jsonb, true, 10, false, 0),
  ('client_pro_monthly', 'Pro Monthly', 'Unlimited AI access and priority matching', 19.99, 'month', 'client', '["Unlimited AI messages","Priority AI responses","Priority freelancer matching","Advanced analytics","Priority support","Early access to features"]'::jsonb, true, 1000, true, 7),
  ('client_pro_yearly', 'Pro Yearly', 'Best value with 2 months free', 199.99, 'year', 'client', '["Unlimited AI messages","Priority AI responses","Priority freelancer matching","Advanced analytics","Priority support","Early access to features","Annual billing discount"]'::jsonb, true, 1000, true, 7)
ON CONFLICT (id) DO NOTHING;
