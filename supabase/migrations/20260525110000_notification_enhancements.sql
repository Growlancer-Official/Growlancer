-- Growlancer Notification Enhancements
-- Adds: archived column, metadata column, push_tokens table, archive/restore RPCs, category filtering
-- Phase 5: Notification Center Enhancement

-- ============================================================
-- 1. Add columns to existing notifications table
-- ============================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 2. Create push_tokens table for push notification support
-- ============================================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  device_name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token)
);

-- ============================================================
-- 3. Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notifications_archived ON notifications(archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(active) WHERE active = true;

-- ============================================================
-- 4. Enable Row Level Security on push_tokens
-- ============================================================
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view their own push tokens
CREATE POLICY "Users can view own push tokens"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own push tokens
CREATE POLICY "Users can insert own push tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own push tokens
CREATE POLICY "Users can update own push tokens"
  ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own push tokens
CREATE POLICY "Users can delete own push tokens"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. RPC Functions
-- ============================================================

-- 5a. Archive a single notification
CREATE OR REPLACE FUNCTION archive_notification(
  p_notification_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE notifications
  SET archived = true, updated_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id;
  
  IF FOUND THEN
    v_result := jsonb_build_object('success', true);
  ELSE
    v_result := jsonb_build_object('success', false, 'error', 'Notification not found');
  END IF;
  
  RETURN v_result;
END;
$$;

-- 5b. Restore a notification from archive
CREATE OR REPLACE FUNCTION restore_notification(
  p_notification_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE notifications
  SET archived = false, updated_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id;
  
  IF FOUND THEN
    v_result := jsonb_build_object('success', true);
  ELSE
    v_result := jsonb_build_object('success', false, 'error', 'Notification not found');
  END IF;
  
  RETURN v_result;
END;
$$;

-- 5c. Archive all read notifications for a user
CREATE OR REPLACE FUNCTION archive_all_read_notifications(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_result JSONB;
BEGIN
  UPDATE notifications
  SET archived = true, updated_at = NOW()
  WHERE user_id = p_user_id AND read = true AND archived = false;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  v_result := jsonb_build_object('success', true, 'archived_count', v_count);
  RETURN v_result;
END;
$$;

-- 5d. Get notifications by category (type) with filters
CREATE OR REPLACE FUNCTION get_notifications_by_category(
  p_user_id UUID,
  p_type TEXT DEFAULT NULL,
  p_archived BOOLEAN DEFAULT false,
  p_unread_only BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_unread_count INTEGER;
BEGIN
  WITH filtered AS (
    SELECT *
    FROM notifications
    WHERE user_id = p_user_id
      AND archived = p_archived
      AND (p_type IS NULL OR type = p_type)
      AND (NOT p_unread_only OR read = false)
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'notifications', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'user_id', f.user_id,
          'type', f.type,
          'title', f.title,
          'message', f.message,
          'link', f.link,
          'read', f.read,
          'archived', f.archived,
          'metadata', f.metadata,
          'created_at', f.created_at,
          'updated_at', f.updated_at
        ) ORDER BY f.created_at DESC
      ) FROM filtered f),
      '[]'::jsonb
    ),
    'unread_count', (SELECT COUNT(*) FROM notifications WHERE user_id = p_user_id AND read = false AND archived = false)
  )
  INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 5e. Register a push token
CREATE OR REPLACE FUNCTION register_push_token(
  p_user_id UUID,
  p_token TEXT,
  p_platform TEXT,
  p_device_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  INSERT INTO push_tokens (user_id, token, platform, device_name)
  VALUES (p_user_id, p_token, p_platform, p_device_name)
  ON CONFLICT (token) DO UPDATE
  SET active = true, device_name = COALESCE(p_device_name, push_tokens.device_name), updated_at = NOW();
  
  v_result := jsonb_build_object('success', true);
  RETURN v_result;
END;
$$;

-- 5f. Unregister a push token
CREATE OR REPLACE FUNCTION unregister_push_token(
  p_user_id UUID,
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE push_tokens
  SET active = false, updated_at = NOW()
  WHERE user_id = p_user_id AND token = p_token;
  
  IF FOUND THEN
    v_result := jsonb_build_object('success', true);
  ELSE
    v_result := jsonb_build_object('success', false, 'error', 'Token not found');
  END IF;
  
  RETURN v_result;
END;
$$;

-- 5g. Get user's active push tokens
CREATE OR REPLACE FUNCTION get_user_push_tokens(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pt.id,
      'platform', pt.platform,
      'device_name', pt.device_name,
      'created_at', pt.created_at
    )
  )
  INTO v_result
  FROM push_tokens pt
  WHERE pt.user_id = p_user_id AND pt.active = true;
  
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;