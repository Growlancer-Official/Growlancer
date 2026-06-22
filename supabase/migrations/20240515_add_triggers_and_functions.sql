-- Additional Database Functions and Triggers
-- Run this in Supabase SQL Editor after the main migration

-- ==================== AUTOMATIC NOTIFICATION FUNCTIONS ====================

-- Function to create notification when a new proposal is submitted
CREATE OR REPLACE FUNCTION notify_new_proposal()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link)
  SELECT 
    p.client_id,
    'new_proposal',
    'New Proposal Received',
    TG_TABLE_NAME || ': New proposal for "' || p.title || '"',
    '/client/proposals?project=' || NEW.project_id
  FROM projects p
  WHERE p.id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new proposals
DROP TRIGGER IF EXISTS trigger_new_proposal ON proposals;
CREATE TRIGGER trigger_new_proposal
AFTER INSERT ON proposals
FOR EACH ROW
EXECUTE FUNCTION notify_new_proposal();

-- Function to create notification when proposal is accepted/rejected
CREATE OR REPLACE FUNCTION notify_proposal_status()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (
      NEW.freelancer_id,
      CASE 
        WHEN NEW.status = 'accepted' THEN 'proposal_accepted'
        WHEN NEW.status = 'rejected' THEN 'proposal_rejected'
        ELSE 'proposal_updated'
      END,
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
      '/dashboard/proposals'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for proposal status changes
DROP TRIGGER IF EXISTS trigger_proposal_status ON proposals;
CREATE TRIGGER trigger_proposal_status
AFTER UPDATE ON proposals
FOR EACH ROW
EXECUTE FUNCTION notify_proposal_status();

-- Function to notify on new contract
CREATE OR REPLACE FUNCTION notify_new_contract()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    NEW.freelancer_id,
    'new_contract',
    'New Contract Started!',
    'You have a new contract. View details in your workspace.',
    '/dashboard/contracts'
  ),
  (
    NEW.client_id,
    'new_contract',
    'Contract Created',
    'A new contract has been created. Fund escrow to get started.',
    '/client/contracts'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new contracts
DROP TRIGGER IF EXISTS trigger_new_contract ON contracts;
CREATE TRIGGER trigger_new_contract
AFTER INSERT ON contracts
FOR EACH ROW
EXECUTE FUNCTION notify_new_contract();

-- Function to notify on contract completion
CREATE OR REPLACE FUNCTION notify_contract_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (
      NEW.freelancer_id,
      'contract_completed',
      'Contract Completed!',
      'Your contract has been completed. Funds have been released.',
      '/dashboard/wallet'
    ),
    (
      NEW.client_id,
      'contract_completed',
      'Project Completed',
      'The project has been completed successfully.',
      '/client/contracts'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for contract completion
DROP TRIGGER IF EXISTS trigger_contract_completion ON contracts;
CREATE TRIGGER trigger_contract_completion
AFTER UPDATE ON contracts
FOR EACH ROW
EXECUTE FUNCTION notify_contract_completion();

-- Function to notify on new invite
CREATE OR REPLACE FUNCTION notify_new_invite()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    NEW.freelancer_id,
    'new_invite',
    'New Project Invitation',
    'You have been invited to work on a project.',
    '/dashboard/invites'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new invites
DROP TRIGGER IF EXISTS trigger_new_invite ON invites;
CREATE TRIGGER trigger_new_invite
AFTER INSERT ON invites
FOR EACH ROW
EXECUTE FUNCTION notify_new_invite();

-- Function to notify on new match
CREATE OR REPLACE FUNCTION notify_new_match()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link)
  SELECT 
    freelancer_id,
    'new_match',
    'New Project Match!',
    'A new project matches your skills. Check it out!',
    '/dashboard/feed'
  FROM ai_matches
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new matches
DROP TRIGGER IF EXISTS trigger_new_match ON ai_matches;
CREATE TRIGGER trigger_new_match
AFTER INSERT ON ai_matches
FOR EACH ROW
EXECUTE FUNCTION notify_new_match();

-- ==================== HELPER FUNCTIONS ====================

-- Function to get user's dashboard stats
CREATE OR REPLACE FUNCTION get_freelancer_stats(user_id UUID)
RETURNS TABLE (
  active_contracts INTEGER,
  pending_proposals INTEGER,
  total_earnings NUMERIC,
  profile_views INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM contracts WHERE freelancer_id = user_id AND status IN ('active', 'pending')) as active_contracts,
    (SELECT COUNT(*)::INTEGER FROM proposals WHERE freelancer_id = user_id AND status = 'pending') as pending_proposals,
    (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions WHERE user_id = user_id AND type = 'credit' AND status = 'completed') as total_earnings,
    (SELECT COALESCE(COUNT(*), 0)::INTEGER FROM usage_logs WHERE user_id = user_id AND feature = 'profile_view') as profile_views;
END;
$$ LANGUAGE plpgsql;

-- Function to get client's dashboard stats
CREATE OR REPLACE FUNCTION get_client_stats(user_id UUID)
RETURNS TABLE (
  active_projects INTEGER,
  active_contracts INTEGER,
  total_spent NUMERIC,
  freelancers_hired INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM projects WHERE client_id = user_id AND status = 'open') as active_projects,
    (SELECT COUNT(*)::INTEGER FROM contracts WHERE client_id = user_id AND status IN ('active', 'pending')) as active_contracts,
    (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions WHERE user_id = user_id AND type = 'debit' AND status = 'completed') as total_spent,
    (SELECT COUNT(DISTINCT freelancer_id)::INTEGER FROM contracts WHERE client_id = user_id) as freelancers_hired;
END;
$$ LANGUAGE plpgsql;

-- ==================== VIEW FOR DASHBOARD ====================

-- Combined view for project feed with client info
CREATE OR REPLACE VIEW projects_with_clients AS
SELECT 
  p.*,
  c.name as client_name,
  c.avatar as client_avatar,
  c.is_pro as client_is_pro
FROM projects p
LEFT JOIN profiles c ON p.client_id = c.id
WHERE p.status = 'open';

-- View for proposals with freelancer details
CREATE OR REPLACE VIEW proposals_with_freelancers AS
SELECT 
  pr.*,
  f.name as freelancer_name,
  f.avatar as freelancer_avatar,
  f.email as freelancer_email,
  fp.bio as freelancer_bio,
  fp.hourly_rate as freelancer_rate,
  fp.skills as freelancer_skills,
  fp.completion_rate as freelancer_completion
FROM proposals pr
LEFT JOIN profiles f ON pr.freelancer_id = f.id
LEFT JOIN freelancer_profiles fp ON f.id = fp.user_id;

-- ==================== UPDATE EXISTING TABLES FOR MISSING COLUMNS ====================

-- Add missing columns if they don't exist
ALTER TABLE projects ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS skills_required TEXT[] DEFAULT '{}';

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS estimated_duration INTEGER;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS escrow_funded BOOLEAN DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS milestones JSONB;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Create ai_matches table if it doesn't exist
CREATE TABLE IF NOT EXISTS ai_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  match_score DECIMAL(5,2),
  skill_score DECIMAL(5,2),
  experience_score DECIMAL(5,2),
  budget_score DECIMAL(5,2),
  availability_score DECIMAL(5,2),
  completion_score DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, freelancer_id)
);

-- Create usage_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contract_files table if it doesn't exist  
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

-- Enable RLS on new tables
ALTER TABLE ai_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for new tables
CREATE POLICY "Freelancers view own matches" ON ai_matches FOR SELECT USING (auth.uid() = freelancer_id);
CREATE POLICY "Users view own usage" ON usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Contract participants view files" ON contract_files FOR SELECT USING (
  auth.uid() IN (SELECT freelancer_id FROM contracts WHERE id = contract_id)
  OR auth.uid() IN (SELECT client_id FROM contracts WHERE id = contract_id)
);

CREATE POLICY "Users insert own usage" ON usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users upload contract files" ON contract_files FOR INSERT WITH CHECK (
  auth.uid() = uploader_id OR 
  auth.uid() IN (SELECT freelancer_id FROM contracts WHERE id = contract_id) OR
  auth.uid() IN (SELECT client_id FROM contracts WHERE id = contract_id)
);

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_ai_matches_freelancer ON ai_matches(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_ai_matches_project ON ai_matches(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_matches_score ON ai_matches(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_feature ON usage_logs(user_id, feature);
CREATE INDEX IF NOT EXISTS idx_contract_files_contract ON contract_files(contract_id);

-- Insert some sample data for testing
INSERT INTO skills_reference (name, category) VALUES
('JavaScript', 'Programming'), ('TypeScript', 'Programming'), ('Python', 'Programming'),
('React', 'Frontend'), ('Next.js', 'Frontend'), ('Node.js', 'Backend'),
('PostgreSQL', 'Database'), ('MongoDB', 'Database'), ('AWS', 'Cloud'),
('UI/UX Design', 'Design'), ('Figma', 'Design'), ('SEO', 'Marketing')
ON CONFLICT (name) DO NOTHING;