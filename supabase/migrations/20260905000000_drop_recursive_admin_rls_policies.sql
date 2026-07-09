-- Drop the two RLS policies that caused infinite recursion.
-- These policies queried profiles FROM WITHIN the policy definition,
-- which triggered the policy again → infinite recursion → 500 error
-- on every admin login attempt.
--
-- The policy "Anyone can view profiles" (USING true) already allows
-- all authenticated SELECT queries, so these admin policies were redundant
-- AND broken.

DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
