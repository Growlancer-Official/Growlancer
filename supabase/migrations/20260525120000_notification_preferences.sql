-- Growlancer Notification Preferences System
-- Stores per-user notification channel preferences
-- Supports email, in-app, and push notification delivery channels

-- 28. NOTIFICATION_PREFERENCES
-- Stores user's notification preferences as a JSONB blob
-- Each user has one row with all preference categories
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON notification_preferences(user_id);

-- Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users manage own notification preferences" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Function to get notification preferences
-- Returns default preferences if none exist
CREATE OR REPLACE FUNCTION get_notification_preferences(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs JSONB;
  v_default_prefs JSONB := '{
    "proposals": {"email": true, "inApp": true, "push": true},
    "contracts": {"email": true, "inApp": true, "push": true},
    "messages": {"email": true, "inApp": true, "push": true},
    "payments": {"email": true, "inApp": true, "push": true},
    "milestones": {"email": true, "inApp": true, "push": true},
    "marketing": {"email": false, "inApp": true, "push": false},
    "invitations": {"email": true, "inApp": true, "push": true}
  }'::jsonb;
BEGIN
  SELECT preferences INTO v_prefs FROM notification_preferences
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- Auto-create with defaults
    INSERT INTO notification_preferences (user_id, preferences)
    VALUES (p_user_id, v_default_prefs)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN v_default_prefs;
  END IF;

  -- Merge with defaults to ensure all keys exist
  RETURN v_default_prefs || v_prefs;
END;
$$;

-- Function to set notification preferences
-- Merges the provided preferences with existing ones
CREATE OR REPLACE FUNCTION set_notification_preferences(
  p_user_id UUID,
  p_preferences JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing JSONB;
  v_merged JSONB;
BEGIN
  SELECT preferences INTO v_existing FROM notification_preferences
  WHERE user_id = p_user_id;

  -- Merge: new values override existing, but we keep unmentioned keys
  v_merged := COALESCE(v_existing, '{}'::jsonb) || p_preferences;

  INSERT INTO notification_preferences (user_id, preferences, updated_at)
  VALUES (p_user_id, v_merged, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET preferences = v_merged, updated_at = NOW();

  RETURN v_merged;
END;
$$;

-- Trigger to auto-create notification preferences when a user profile is created
CREATE OR REPLACE FUNCTION auto_create_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id, preferences)
  VALUES (
    NEW.id,
    '{
      "proposals": {"email": true, "inApp": true, "push": true},
      "contracts": {"email": true, "inApp": true, "push": true},
      "messages": {"email": true, "inApp": true, "push": true},
      "payments": {"email": true, "inApp": true, "push": true},
      "milestones": {"email": true, "inApp": true, "push": true},
      "marketing": {"email": false, "inApp": true, "push": false},
      "invitations": {"email": true, "inApp": true, "push": true}
    }'::jsonb
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Attach trigger to profiles table
DROP TRIGGER IF EXISTS trg_auto_create_notification_preferences ON profiles;
CREATE TRIGGER trg_auto_create_notification_preferences
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_notification_preferences();