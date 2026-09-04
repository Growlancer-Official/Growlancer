-- Allow 'new_match' notifications (restored notify_new_match trigger needs it).
-- Widening only — never removes an already-allowed type. Keeps every type
-- from 20261207000000 plus 'new_match' (realtime matching feed) and
-- 'contest' (contest system, allowed by 20260817000000).
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      'proposal', 'invite', 'contract', 'message', 'payment', 'escrow',
      'review', 'system', 'refund', 'dispute', 'reminder', 'admin',
      'verification', 'milestone', 'ticket', 'payout', 'new_match', 'contest'
    ]::text[])
  );

NOTIFY pgrst, 'reload schema';