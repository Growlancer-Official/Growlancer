-- Growlancer Workspace Tasks & Shared Notes Tables
-- These replace the non-existent contract_shared_tasks and contract_shared_notes
-- that the frontend was referencing via "as any" casts.
-- Run this migration to create the actual backing tables.

-- ============================================================
-- 1. WORKSPACE TASKS
-- Shared task list within a contract workspace (kanban-style)
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'todo', 'in_progress', 'completed')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_tasks_contract_id ON workspace_tasks(contract_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tasks_status ON workspace_tasks(status);

-- ============================================================
-- 2. WORKSPACE NOTES
-- Shared collaborative notes within a contract workspace
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_notes_contract_id ON workspace_notes(contract_id);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE workspace_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — workspace_tasks
-- Contract participants (freelancer + client) can CRUD tasks
-- ============================================================
CREATE POLICY "Contract participants can read workspace tasks" ON workspace_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = workspace_tasks.contract_id
        AND (contracts.freelancer_id = auth.uid() OR contracts.client_id = auth.uid())
    )
  );

CREATE POLICY "Contract participants can insert workspace tasks" ON workspace_tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = workspace_tasks.contract_id
        AND (contracts.freelancer_id = auth.uid() OR contracts.client_id = auth.uid())
    )
  );

CREATE POLICY "Contract participants can update workspace tasks" ON workspace_tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = workspace_tasks.contract_id
        AND (contracts.freelancer_id = auth.uid() OR contracts.client_id = auth.uid())
    )
  );

CREATE POLICY "Contract participants can delete workspace tasks" ON workspace_tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = workspace_tasks.contract_id
        AND (contracts.freelancer_id = auth.uid() OR contracts.client_id = auth.uid())
    )
  );

-- ============================================================
-- RLS POLICIES — workspace_notes
-- Contract participants can CRUD notes
-- ============================================================
CREATE POLICY "Contract participants can read workspace notes" ON workspace_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = workspace_notes.contract_id
        AND (contracts.freelancer_id = auth.uid() OR contracts.client_id = auth.uid())
    )
  );

CREATE POLICY "Contract participants can insert workspace notes" ON workspace_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = workspace_notes.contract_id
        AND (contracts.freelancer_id = auth.uid() OR contracts.client_id = auth.uid())
    )
  );

CREATE POLICY "Contract participants can update workspace notes" ON workspace_notes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = workspace_notes.contract_id
        AND (contracts.freelancer_id = auth.uid() OR contracts.client_id = auth.uid())
    )
  );

CREATE POLICY "Contract participants can delete workspace notes" ON workspace_notes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = workspace_notes.contract_id
        AND (contracts.freelancer_id = auth.uid() OR contracts.client_id = auth.uid())
    )
  );

-- ============================================================
-- ENABLE REAL-TIME REPLICATION
-- ============================================================
-- These tables need realtime so workspace participants see live updates
-- Check if the publication exists before altering
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_tasks;
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_notes;
  END IF;
END
$$;

-- ============================================================
-- TRIGGER: auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_workspace_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_workspace_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_workspace_tasks_updated_at ON workspace_tasks;
CREATE TRIGGER update_workspace_tasks_updated_at
  BEFORE UPDATE ON workspace_tasks
  FOR EACH ROW EXECUTE FUNCTION update_workspace_tasks_updated_at();

DROP TRIGGER IF EXISTS update_workspace_notes_updated_at ON workspace_notes;
CREATE TRIGGER update_workspace_notes_updated_at
  BEFORE UPDATE ON workspace_notes
  FOR EACH ROW EXECUTE FUNCTION update_workspace_notes_updated_at();