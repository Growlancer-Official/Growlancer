-- ============================================================================
-- FIX REALTIME CHAT + PROJECT VISIBILITY (20261013)
--
-- Root causes fixed:
--   1. CHAT (workspace + inbox not real-time):
--      - Messages were inserted WITHOUT receiver_id, so the OTHER party's
--        SELECT policy (auth.uid() = receiver_id) never matched -> the message
--        row was invisible to the receiver AND realtime (which respects RLS)
--        never delivered the event to them.
--      - Fix: (a) SELECT/INSERT policies now also allow any CONTRACT
--        PARTICIPANT (client or freelancer) to see/post messages on that
--        contract; (b) frontend now sets receiver_id explicitly.
--   2. PROJECT VISIBILITY (Untitled Project / Rs— budget / feed error):
--      - projects SELECT RLS only allowed the client or open+public projects.
--        So a freelancer on an active contract (project now in_progress) got a
--        NULL project embed -> "Untitled Project", "Rs— - Rs—", and feed crashes.
--      - Fix: contract parties, proposal applicants, and AI-matched freelancers
--        can now view the project row.
--   3. DISPUTES (freelancer saw empty list):
--      - disputes SELECT RLS only had an admin policy; participants
--        (client/freelancer) could not read their own disputes.
--      - Fix: participants can view disputes they are part of.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. MESSAGES — allow contract participants to read & post
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Contract participants can view messages" ON public.messages;
CREATE POLICY "Contract participants can view messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = sender_id)
    OR (auth.uid() = receiver_id)
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = messages.contract_id
        AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Contract participants can insert messages" ON public.messages;
CREATE POLICY "Contract participants can insert messages"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = sender_id)
    OR (auth.uid() = receiver_id)
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = messages.contract_id
        AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PROJECTS — participants (contract / proposal / ai_match) can view
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Contract parties and applicants can view project" ON public.projects;
CREATE POLICY "Contract parties and applicants can view project"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.project_id = projects.id
        AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.project_id = projects.id
        AND p.freelancer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.ai_matches m
      WHERE m.project_id = projects.id
        AND m.freelancer_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 3. DISPUTES — participants can view their own disputes
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Dispute participants can view" ON public.disputes;
CREATE POLICY "Dispute participants can view"
  ON public.disputes
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = client_id)
    OR (auth.uid() = freelancer_id)
  );
