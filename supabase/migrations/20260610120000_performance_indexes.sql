-- Performance optimization: Add missing composite indexes for common query patterns
-- These indexes accelerate the most frequent query patterns identified in Phase 10 J-4 audit.

-- ==================== NOTIFICATIONS ====================
-- Queried by user_id, filtered by read, ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications(user_id, read, created_at DESC)
  WHERE read = false;

-- ==================== MESSAGES ====================
-- Queried by conversation_id for thread view, ordered by created_at
-- Ensure conversation_id column exists (may be missing if table was created without it)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);

-- Queried by sender_id and receiver_id for inbox, ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_messages_sender_created
  ON messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_receiver_created
  ON messages(receiver_id, created_at DESC);

-- ==================== CONTRACTS ====================
-- Queried by freelancer_id with status filter for dashboard lists
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_status
  ON contracts(freelancer_id, status);

-- Queried by client_id with status filter
CREATE INDEX IF NOT EXISTS idx_contracts_client_status
  ON contracts(client_id, status);

-- Queried by both participants for workspace
CREATE INDEX IF NOT EXISTS idx_contracts_participant_status
  ON contracts(freelancer_id, client_id, status);

-- ==================== PROJECTS ====================
-- Queried by status + created_at DESC for browsing open projects
CREATE INDEX IF NOT EXISTS idx_projects_status_created
  ON projects(status, created_at DESC);

-- Queried by client_id + status for client dashboard
CREATE INDEX IF NOT EXISTS idx_projects_client_status
  ON projects(client_id, status);

-- Queried by category + status + created_at for category browsing
CREATE INDEX IF NOT EXISTS idx_projects_category_status_created
  ON projects(category, status, created_at DESC)
  WHERE status = 'open' AND visibility = 'public';

-- ==================== PROPOSALS ====================
-- Queried by project_id + status for client review
CREATE INDEX IF NOT EXISTS idx_proposals_project_status
  ON proposals(project_id, status);

-- Queried by freelancer_id + status for freelancer dashboard
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer_status
  ON proposals(freelancer_id, status);

-- ==================== SERVICES ====================
-- Queried by category + active for browsing (replaces the existing partial index)
DROP INDEX IF EXISTS idx_services_category;
CREATE INDEX IF NOT EXISTS idx_services_category_active
  ON services(category, created_at DESC)
  WHERE active = true;

-- Queried by freelancer_id + active for dashboard
CREATE INDEX IF NOT EXISTS idx_services_freelancer_active
  ON services(freelancer_id, active);

-- ==================== CONTRACT_FILES ====================
-- Queried by contract_id for workspace file list
CREATE INDEX IF NOT EXISTS idx_contract_files_contract
  ON contract_files(contract_id, created_at DESC);

-- ==================== ESCROW ====================
-- Queried by contract_id for payment status
CREATE INDEX IF NOT EXISTS idx_escrow_contract_status
  ON escrow(contract_id, status);

-- ==================== PROJECT_MATCHES ====================
-- Queried by freelancer_id + score for best matches
CREATE INDEX IF NOT EXISTS idx_project_matches_freelancer_score
  ON project_matches(freelancer_id, match_score DESC);

-- Queried by project_id + score for project matches
CREATE INDEX IF NOT EXISTS idx_project_matches_project_score
  ON project_matches(project_id, match_score DESC);

-- ==================== REVIEWS ====================
-- Queried by reviewee_id for rating aggregation
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_rating
  ON reviews(reviewee_id, rating);

-- ==================== INVITES ====================
-- Queried by freelancer_id + status for invite list
CREATE INDEX IF NOT EXISTS idx_invites_freelancer_status
  ON invites(freelancer_id, status);

-- Queried by project_id + status for client invite management
CREATE INDEX IF NOT EXISTS idx_invites_project_status
  ON invites(project_id, status);

-- ==================== USAGE_LOGS ====================
-- Queried by user_id + feature for rate limiting
-- Ensure feature column exists (original table may have been created without it)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS feature TEXT;
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_feature
  ON usage_logs(user_id, feature, created_at DESC);

-- ==================== WALLETS ====================
-- Added by 20260525_wallets.sql — ensure index exists
CREATE INDEX IF NOT EXISTS idx_wallets_user_id
  ON wallets(user_id);

-- ==================== WORKSPACE_NOTES ====================
-- Added by 20260609_workspace_tasks_notes.sql
CREATE INDEX IF NOT EXISTS idx_workspace_notes_contract
  ON workspace_notes(contract_id);

CREATE INDEX IF NOT EXISTS idx_workspace_tasks_contract
  ON workspace_tasks(contract_id, status);