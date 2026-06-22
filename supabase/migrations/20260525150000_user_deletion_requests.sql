-- Growlancer Account Deletion Workflow
-- Run this in Supabase SQL Editor after the main schema

-- 25. USER_DELETION_REQUESTS
-- Tracks account deletion requests with a 7-day cooldown before actual deletion
CREATE TABLE IF NOT EXISTS user_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled')),
  confirm_token TEXT,
  confirmed_at TIMESTAMPTZ,
  scheduled_deletion_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  cancelled_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user_id ON user_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON user_deletion_requests(status);

-- Enable RLS
ALTER TABLE user_deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own deletion requests" ON user_deletion_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own deletion requests" ON user_deletion_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deletion requests" ON user_deletion_requests
  FOR UPDATE USING (auth.uid() = user_id);

-- Function to request account deletion
CREATE OR REPLACE FUNCTION request_account_deletion(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_result JSONB;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  -- Check if user exists
  SELECT email, name INTO v_user_email, v_user_name FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Check for existing pending deletion request
  SELECT id INTO v_existing_id FROM user_deletion_requests
    WHERE user_id = p_user_id AND status IN ('pending', 'confirmed');
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'A deletion request already exists', 'request_id', v_existing_id);
  END IF;

  -- Create the deletion request with 7-day cooldown
  INSERT INTO user_deletion_requests (user_id, reason, status, scheduled_deletion_at)
  VALUES (p_user_id, p_reason, 'pending', NOW() + INTERVAL '7 days')
  RETURNING id INTO v_existing_id;

  -- Create notification for the user
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    p_user_id,
    'account_deletion',
    'Account Deletion Requested',
    'Your account deletion request has been received. It will be processed after 7 days. You can cancel this request anytime from your settings.',
    '/dashboard/settings'
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_existing_id,
    'message', 'Deletion request created. Your account will be deleted after 7 days.',
    'scheduled_deletion_at', (SELECT scheduled_deletion_at FROM user_deletion_requests WHERE id = v_existing_id)
  );
END;
$$;

-- Function to cancel account deletion request
CREATE OR REPLACE FUNCTION cancel_account_deletion(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  SELECT id INTO v_request_id FROM user_deletion_requests
    WHERE user_id = p_user_id AND status IN ('pending', 'confirmed');
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active deletion request found');
  END IF;

  UPDATE user_deletion_requests
  SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
  WHERE id = v_request_id;

  -- Cancel notification
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    p_user_id,
    'account_deletion',
    'Account Deletion Cancelled',
    'Your account deletion request has been cancelled. Your account is safe.',
    '/dashboard/settings'
  );

  RETURN jsonb_build_object('success', true, 'message', 'Deletion request cancelled successfully');
END;
$$;

-- Function to process account deletion (called by edge function or scheduled job)
CREATE OR REPLACE FUNCTION process_account_deletion(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  -- Get the request details
  SELECT user_id INTO v_user_id FROM user_deletion_requests
    WHERE id = p_request_id AND status = 'confirmed' AND scheduled_deletion_at <= NOW();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No confirmed and ready deletion request found');
  END IF;

  -- Mark as processing
  UPDATE user_deletion_requests SET status = 'processing', updated_at = NOW() WHERE id = p_request_id;

  -- Get user email for audit
  SELECT email INTO v_user_email FROM profiles WHERE id = v_user_id;

  -- Delete user data (CASCADE should handle most related records)
  -- Profiles table has ON DELETE CASCADE on most foreign keys
  DELETE FROM profiles WHERE id = v_user_id;

  -- Mark as completed
  UPDATE user_deletion_requests SET status = 'completed', processed_at = NOW(), updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Account deleted successfully',
    'user_email', v_user_email
  );
END;
$$;

-- Function to check deletion request status
CREATE OR REPLACE FUNCTION check_deletion_status(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM user_deletion_requests
    WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_request', false);
  END IF;

  RETURN jsonb_build_object(
    'has_request', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'reason', v_request.reason,
    'created_at', v_request.created_at,
    'scheduled_deletion_at', v_request.scheduled_deletion_at,
    'confirmed_at', v_request.confirmed_at,
    'cancelled_at', v_request.cancelled_at
  );
END;
$$;