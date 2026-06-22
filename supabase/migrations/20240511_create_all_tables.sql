-- Growlancer Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES (main user table)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('freelancer', 'client', 'admin')),
  avatar TEXT,
  bio TEXT,
  referral_code TEXT UNIQUE,
  is_pro BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. FREELANCER_PROFILES
CREATE TABLE IF NOT EXISTS freelancer_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  bio TEXT,
  hourly_rate DECIMAL(10,2),
  experience INTEGER DEFAULT 0,
  skills TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{}',
  location TEXT,
  portfolio_url TEXT,
  availability BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CLIENT_PROFILES
CREATE TABLE IF NOT EXISTS client_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT,
  description TEXT,
  industry TEXT,
  size TEXT,
  location TEXT,
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PROJECTS
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget_min DECIMAL(10,2),
  budget_max DECIMAL(10,2),
  duration TEXT,
  experience_level TEXT CHECK (experience_level IN ('entry', 'intermediate', 'expert')),
  category TEXT,
  skills TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'invite_only', 'private')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PROPOSALS
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  cover_letter TEXT NOT NULL,
  bid_amount DECIMAL(10,2) NOT NULL,
  estimated_duration TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, freelancer_id)
);

-- 6. CONTRACTS
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  freelancer_id UUID REFERENCES profiles(id),
  client_id UUID REFERENCES profiles(id),
  amount DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) NOT NULL,
  freelancer_amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled', 'disputed')),
  escrow_funded BOOLEAN DEFAULT false,
  milestones JSONB,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ESCROW
CREATE TABLE IF NOT EXISTS escrow (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'funded', 'released', 'refunded', 'disputed')),
  funded_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('payment', 'withdrawal', 'refund', 'fee', 'bonus')),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. WITHDRAWALS
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('paypal')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  details JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PROJECT_MATCHES
CREATE TABLE IF NOT EXISTS project_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  match_score DECIMAL(5,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'interested', 'not_interested', 'invited')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, freelancer_id)
);

-- 11. INVITES
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES profiles(id),
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(project_id, freelancer_id)
);

-- 12. REFERRALS
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  reward_claimed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. REFERRAL_STATS
CREATE TABLE IF NOT EXISTS referral_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  total_referrals INTEGER DEFAULT 0,
  successful_referrals INTEGER DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'expired')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. SUBSCRIPTION_PLANS
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  features JSONB,
  active BOOLEAN DEFAULT true
);

-- 16. SERVICES (for freelancers offering services)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freelancer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  price DECIMAL(10,2) NOT NULL,
  delivery_days INTEGER,
  revisions INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. CONTRACT_FILES
CREATE TABLE IF NOT EXISTS contract_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. PAYPAL_ORDERS
CREATE TABLE IF NOT EXISTS paypal_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  paypal_order_id TEXT UNIQUE NOT NULL,
  contract_id UUID,
  subscription_id UUID,
  order_type TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'approved', 'captured', 'voided', 'refunded')),
  description TEXT,
  metadata JSONB,
  captured_at TIMESTAMPTZ,
  paypal_payer_id TEXT,
  paypal_payer_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. PAYPAL_TRANSACTIONS
CREATE TABLE IF NOT EXISTS paypal_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paypal_order_id UUID REFERENCES paypal_orders(id) ON DELETE CASCADE,
  paypal_transaction_id TEXT UNIQUE NOT NULL,
  transaction_type TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL,
  payer_email TEXT,
  payer_name TEXT,
  processor_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. USAGE_LOGS
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. SKILLS_REFERENCE
CREATE TABLE IF NOT EXISTS skills_reference (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_freelancer_profiles_user_id ON freelancer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_client_profiles_user_id ON client_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_proposals_project_id ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer_id ON proposals(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_id ON contracts(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_escrow_contract_id ON escrow(contract_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_project_matches_project_id ON project_matches(project_id);
CREATE INDEX IF NOT EXISTS idx_project_matches_freelancer_id ON project_matches(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_invites_project_id ON invites(project_id);
CREATE INDEX IF NOT EXISTS idx_invites_freelancer_id ON invites(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_reviews_contract_id ON reviews(contract_id);
CREATE INDEX IF NOT EXISTS idx_services_freelancer_id ON services(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_paypal_orders_user_id ON paypal_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_paypal_orders_status ON paypal_orders(status);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE freelancer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE paypal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE paypal_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_reference ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES (basic - owner access)
-- Profiles: users can read all, update their own
CREATE POLICY "Users can read all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Freelancer profiles: owner only
CREATE POLICY "Freelancers can read all" ON freelancer_profiles FOR SELECT USING (true);
CREATE POLICY "Freelancers can update own" ON freelancer_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Freelancers can insert own" ON freelancer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Client profiles: owner only
CREATE POLICY "Clients can read all" ON client_profiles FOR SELECT USING (true);
CREATE POLICY "Clients can update own" ON client_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Clients can insert own" ON client_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Projects: clients can CRUD own, freelancers can read open
CREATE POLICY "Clients can manage own projects" ON projects FOR ALL USING (auth.uid() = client_id);
CREATE POLICY "Freelancers can read open projects" ON projects FOR SELECT USING (status = 'open');

-- Proposals: freelancers manage own, clients can read project proposals
CREATE POLICY "Freelancers manage own proposals" ON proposals FOR ALL USING (auth.uid() = freelancer_id);
CREATE POLICY "Clients read proposals for own projects" ON proposals FOR SELECT USING (
  EXISTS (SELECT 1 FROM projects WHERE id = proposal.project_id AND client_id = auth.uid())
);

-- Contracts: participants can view
CREATE POLICY "Contract participants can view" ON contracts FOR SELECT USING (
  auth.uid() = freelancer_id OR auth.uid() = client_id
);

-- Messages: sender/receiver can view
CREATE POLICY "Message participants can view" ON messages FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);
CREATE POLICY "Users can insert messages" ON messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);

-- Notifications: owner only
CREATE POLICY "Users view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- Reviews: contract participants
CREATE POLICY "Contract participants view reviews" ON reviews FOR SELECT USING (
  EXISTS (SELECT 1 FROM contracts WHERE id = contract_id AND (freelancer_id = auth.uid() OR client_id = auth.uid()))
);

-- Default policies for other tables (restrictive)
CREATE POLICY "Authenticated users can read" ON escrow FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can read withdrawals" ON withdrawals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can read matches" ON project_matches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read invites" ON invites FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read referrals" ON referrals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read services" ON services FOR SELECT USING (true);
CREATE POLICY "Freelancers manage own services" ON services FOR ALL USING (auth.uid() = freelancer_id);
CREATE POLICY "Users read own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can read plans" ON subscription_plans FOR SELECT USING (active = true);
CREATE POLICY "Users read own paypal orders" ON paypal_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own paypal transactions" ON paypal_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM paypal_orders WHERE id = paypal_order_id AND user_id = auth.uid())
);
CREATE POLICY "Users read own usage logs" ON usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can read skills" ON skills_reference FOR SELECT USING (true);

-- Insert default subscription plans
INSERT INTO subscription_plans (id, name, description, price, interval, features, active) VALUES
('free', 'Free', 'Basic features for new users', 0, 'month', '{"proposals": 5, "ai_matches": 10, "portfolio_items": 3}', true),
('pro_monthly', 'Pro Monthly', 'Professional plan monthly', 19.99, 'month', '{"proposals": 50, "ai_matches": 100, "portfolio_items": 20, "priority_support": true, "analytics": true}', true),
('pro_yearly', 'Pro Yearly', 'Professional plan yearly', 199.99, 'year', '{"proposals": 50, "ai_matches": 100, "portfolio_items": 20, "priority_support": true, "analytics": true}', true),
('ai_monthly', 'AI Plus Monthly', 'AI assistant powered by GPT-4', 14.99, 'month', '{"unlimited_ai_chat": true, "ai_proposal_review": true, "ai_profile_optimization": true}', true),
('ai_yearly', 'AI Plus Yearly', 'AI assistant powered by GPT-4', 149.99, 'year', '{"unlimited_ai_chat": true, "ai_proposal_review": true, "ai_profile_optimization": true}', true)
ON CONFLICT (id) DO NOTHING;

-- Insert common skills
INSERT INTO skills_reference (name, category) VALUES
('JavaScript', 'Programming'), ('TypeScript', 'Programming'), ('Python', 'Programming'), ('Java', 'Programming'),
('React', 'Frontend'), ('Vue.js', 'Frontend'), ('Angular', 'Frontend'), ('Next.js', 'Frontend'),
('Node.js', 'Backend'), ('Express', 'Backend'), ('Django', 'Backend'), ('Ruby on Rails', 'Backend'),
('PostgreSQL', 'Database'), ('MongoDB', 'Database'), ('MySQL', 'Database'),
('AWS', 'Cloud'), ('GCP', 'Cloud'), ('Azure', 'Cloud'), ('Docker', 'DevOps'), ('Kubernetes', 'DevOps'),
('UI/UX Design', 'Design'), ('Figma', 'Design'), ('Adobe XD', 'Design'), ('Photoshop', 'Design'),
('SEO', 'Marketing'), ('Content Writing', 'Marketing'), ('Social Media', 'Marketing')
ON CONFLICT (name) DO NOTHING;