-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: request_account_deletion could never insert a request row
--
-- Found by exercising the flow as a real user (an admin-created auth user calling
-- the RPC with its own token) rather than by reading pg_proc: the call returned
--
--   HTTP 400  code 23502  "Failing row contains (…, pending, null, null, …)"
--
-- user_deletion_requests.confirm_token and confirm_token_expires_at are NOT NULL
-- with no default, and the INSERT only supplied (user_id, reason, status,
-- scheduled_deletion_at). So the function aborted with a not-null violation —
-- which, before 20270119000009, was masked by the earlier `SELECT email FROM
-- profiles` failing first. In other words this path has never worked: users could
-- not start an account deletion at all.
--
-- The same INSERT also wrote `notifications.link`, a column that does not exist
-- (the real one is action_url), which would have failed next.
--
-- The confirm token is generated here rather than left as a placeholder: 64 hex
-- chars of UUID entropy, expiring with the 7-day cooldown. Nothing consumes it yet
-- (no confirm-deletion endpoint exists), so it is returned to the owner in the
-- response for whatever confirm flow is built on top of it.
--
-- IDEMPOTENT: CREATE OR REPLACE + a fail-closed assertion.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_existing_id UUID;
  v_confirm_token TEXT;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  -- Only the account owner may request deletion
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- name is public, email is private (20261221000000 split)
  SELECT p.name, pp.email INTO v_user_name, v_user_email
    FROM public.profiles p
    LEFT JOIN public.profiles_private pp ON pp.id = p.id
   WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT id INTO v_existing_id FROM public.user_deletion_requests
    WHERE user_id = p_user_id AND status IN ('pending', 'confirmed');
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'A deletion request already exists', 'request_id', v_existing_id);
  END IF;

  -- confirm_token / confirm_token_expires_at are NOT NULL with no default.
  v_confirm_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  INSERT INTO public.user_deletion_requests (
    user_id, reason, status, scheduled_deletion_at,
    confirm_token, confirm_token_expires_at
  )
  VALUES (
    p_user_id, p_reason, 'pending', NOW() + INTERVAL '7 days',
    v_confirm_token, NOW() + INTERVAL '7 days'
  )
  RETURNING id INTO v_existing_id;

  -- The request itself is what matters; a notification failure must not undo it.
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (
      p_user_id,
      'account_deletion',
      'Account Deletion Requested',
      'Your account deletion request has been received. It will be processed after 7 days. You can cancel this request anytime from your settings.',
      '/dashboard/settings'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'request_account_deletion: notification failed for %: %', p_user_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_existing_id,
    'confirm_token', v_confirm_token,
    'message', 'Deletion request created. Your account will be deleted after 7 days.',
    'scheduled_deletion_at', (SELECT scheduled_deletion_at FROM public.user_deletion_requests WHERE id = v_existing_id)
  );
END;
$$;

-- Fail closed: the next edit must not silently drop a NOT NULL column again.
DO $assert$
DECLARE
  v_src text;
  v_missing text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'request_account_deletion'
     AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_reason text';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'request_account_deletion(uuid,text) not found after replace';
  END IF;

  SELECT string_agg(c.column_name, ', ') INTO v_missing
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'user_deletion_requests'
     AND c.is_nullable = 'NO'
     AND c.column_default IS NULL
     AND c.column_name <> 'user_id'
     AND position(c.column_name in v_src) = 0;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'request_account_deletion does not supply NOT NULL column(s): %', v_missing;
  END IF;

  -- notifications.action_url, never the non-existent `link`.
  IF position('notifications (user_id, type, title, message, action_url)' in v_src) = 0 THEN
    RAISE EXCEPTION 'request_account_deletion notification insert does not use action_url';
  END IF;
END
$assert$;
