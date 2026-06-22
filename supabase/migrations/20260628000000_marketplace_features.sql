-- ============================================================
-- Marketplace Features: Saved Searches, Time Tracking,
-- Connects, Skill Certifications, Review Replies
-- ============================================================

-- 1. Saved Searches (job alerts for clients)
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  notify_new_results BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);

-- 2. Time Entries (hourly contract tracking)
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT DEFAULT '',
  hours NUMERIC(8,2) NOT NULL CHECK (hours > 0),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('running', 'submitted', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_contract_id ON time_entries(contract_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_freelancer_id ON time_entries(freelancer_id);

-- 3. Connects Transactions (bidding credits ledger)
CREATE TABLE IF NOT EXISTS connects_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earned', 'spent', 'bonus', 'monthly_grant')),
  description TEXT DEFAULT '',
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connects_transactions_user_id ON connects_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_connects_transactions_user_month ON connects_transactions(user_id, type, created_at);

-- 4. Skill Certifications (verified skill badges)
CREATE TABLE IF NOT EXISTS skill_certifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  passed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  certificate_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_skill_certifications_user_id ON skill_certifications(user_id);

-- 5. Review Replies (two-way review system)
CREATE TABLE IF NOT EXISTS review_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_replies_review_id ON review_replies(review_id);

-- 6. Add seller_level and availability columns to freelancer_profiles if not exists
DO $$ BEGIN
  ALTER TABLE freelancer_profiles ADD COLUMN IF NOT EXISTS seller_level TEXT DEFAULT 'new';
  ALTER TABLE freelancer_profiles ADD COLUMN IF NOT EXISTS availability BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 7. Add rate_type column to contracts for hourly support if not exists
DO $$ BEGIN
  ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'fixed';
  ALTER TABLE contracts ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 8. Row Level Security Policies
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE connects_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_replies ENABLE ROW LEVEL SECURITY;

-- saved_searches: users can manage their own
CREATE POLICY "Users can view own saved searches" ON saved_searches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own saved searches" ON saved_searches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own saved searches" ON saved_searches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved searches" ON saved_searches FOR DELETE USING (auth.uid() = user_id);

-- time_entries: freelancer owns their entries
CREATE POLICY "Freelancers can view own time entries" ON time_entries FOR SELECT USING (auth.uid() = freelancer_id);
CREATE POLICY "Freelancers can create own time entries" ON time_entries FOR INSERT WITH CHECK (auth.uid() = freelancer_id);
CREATE POLICY "Freelancers can update own time entries" ON time_entries FOR UPDATE USING (auth.uid() = freelancer_id);

-- connects_transactions: users can view their own
CREATE POLICY "Users can view own connects" ON connects_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own connects" ON connects_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- skill_certifications: users can view all, manage their own
CREATE POLICY "Anyone can view certifications" ON skill_certifications FOR SELECT USING (true);
CREATE POLICY "Users can manage own certifications" ON skill_certifications FOR ALL USING (auth.uid() = user_id);

-- review_replies: anyone can read, only reviewer can reply
CREATE POLICY "Anyone can view review replies" ON review_replies FOR SELECT USING (true);
CREATE POLICY "Users can create own replies" ON review_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
