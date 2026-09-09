-- ═════════════════════════════════════════════════════════════════════════════
-- Admin RLS policies for support_tickets + ticket_messages
--
-- Found in live admin playtest (2026-09-09): the admin Support Tickets page
-- always showed "No tickets found" even with real tickets in the table, and
-- admins could not reply or update ticket status. 20260712000000 created
-- owner-only policies (user_id = auth.uid()) but NEVER added admin policies —
-- so with RLS enabled, admins were locked out of every row (the edge functions
-- that email notifications use service_role and were unaffected, masking this).
--
-- Admin check mirrors the codebase pattern (profiles_private.is_admin is the
-- authoritative admin flag since migration 20261221000000 / verified by
-- admin-data's verifyAdminSession). Owner policies remain untouched.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- support_tickets: admins read all, update status/assignment, and may
  -- technically insert (e.g. seeding) — scoped to is_admin = true.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'support_tickets'
      AND policyname = 'Admins manage all support tickets'
  ) THEN
    CREATE POLICY "Admins manage all support tickets"
      ON support_tickets
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles_private
          WHERE profiles_private.id = auth.uid() AND is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles_private
          WHERE profiles_private.id = auth.uid() AND is_admin = true
        )
      );
  END IF;

  -- ticket_messages: admins read all messages (including internal notes) and
  -- can post replies as themselves.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ticket_messages'
      AND policyname = 'Admins manage all ticket messages'
  ) THEN
    CREATE POLICY "Admins manage all ticket messages"
      ON ticket_messages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles_private
          WHERE profiles_private.id = auth.uid() AND is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles_private
          WHERE profiles_private.id = auth.uid() AND is_admin = true
        )
      );
  END IF;
END
$$;
