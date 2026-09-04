-- ═══════════════════════════════════════════════════════════════════════════
-- HOTFIX: subscriptions status CHECK must allow 'pending'
--
-- Live-DB drift: the subscriptions.status CHECK constraint on the live DB was
-- narrowed (probably when subscription rows were created directly from the
-- browser with status 'active'/'trial') so that 'pending' — the server-
-- authoritative pre-payment state created by create_user_subscription — is
-- rejected. Found in E2E verification: trial grant works, but the paid path
-- (create_user_subscription → status 'pending') violates
-- subscriptions_status_check and rolls back.
--
-- Restore the full allowed set (union of what the app can produce): pending
-- (pre-payment), trial, active (paid), cancelled, expired, past_due.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'trial', 'active', 'cancelled', 'expired', 'past_due'));
