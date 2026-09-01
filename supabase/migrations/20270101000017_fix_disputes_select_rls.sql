-- Verify disputes SELECT policy is correct for production schema
-- Production disputes table has: client_id, freelancer_id (NOT raised_by/raised_against)

DROP POLICY IF EXISTS "Dispute participants can view disputes" ON disputes;

CREATE POLICY "Dispute participants can view disputes"
  ON disputes
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = client_id
    OR auth.uid() = freelancer_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Verify INSERT policy is correct (users can raise disputes as either party)
DROP POLICY IF EXISTS "Users can raise disputes" ON disputes;
CREATE POLICY "Users can raise disputes"
  ON disputes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = client_id
    OR auth.uid() = freelancer_id
  );

-- Admin update policy
DROP POLICY IF EXISTS "Admins can update disputes" ON disputes;
CREATE POLICY "Admins can update disputes"
  ON disputes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
