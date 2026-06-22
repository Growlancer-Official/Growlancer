-- Fix notification_preferences trigger that was blocking ALL new user signups
-- Root cause: The remote notification_preferences table uses flat boolean columns
-- (proposals_email, messages_push, etc.) instead of a JSONB `preferences` column.
-- The auto_create_notification_preferences trigger was INSERTing with `preferences`
-- column which doesn't exist, causing every new profile insert to fail.

-- 1. Drop the broken trigger first
DROP TRIGGER IF EXISTS trg_auto_create_notification_preferences ON profiles;

-- 2. Replace get_notification_preferences to use flat columns
CREATE OR REPLACE FUNCTION get_notification_preferences(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_result JSONB;
BEGIN
  -- Check if preferences exist
  SELECT * INTO v_row FROM notification_preferences WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- Insert defaults
    INSERT INTO notification_preferences (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Return default JSON
    RETURN '{
      "proposals": {"email": true, "inApp": true, "push": true},
      "contracts": {"email": true, "inApp": true, "push": true},
      "messages": {"email": true, "inApp": true, "push": true},
      "payments": {"email": true, "inApp": true, "push": true},
      "milestones": {"email": true, "inApp": true, "push": true},
      "marketing": {"email": false, "inApp": true, "push": false},
      "invitations": {"email": true, "inApp": true, "push": true}
    }'::jsonb;
  END IF;

  -- Build JSON from flat columns
  v_result := jsonb_build_object(
    'proposals', jsonb_build_object(
      'email', COALESCE(v_row.proposals_email, true),
      'inApp', COALESCE(v_row.proposals_in_app, true),
      'push', COALESCE(v_row.proposals_push, true)
    ),
    'contracts', jsonb_build_object(
      'email', COALESCE(v_row.contracts_email, true),
      'inApp', COALESCE(v_row.contracts_in_app, true),
      'push', COALESCE(v_row.contracts_push, true)
    ),
    'messages', jsonb_build_object(
      'email', COALESCE(v_row.messages_email, true),
      'inApp', COALESCE(v_row.messages_in_app, true),
      'push', COALESCE(v_row.messages_push, true)
    ),
    'payments', jsonb_build_object(
      'email', COALESCE(v_row.payments_email, true),
      'inApp', COALESCE(v_row.payments_in_app, true),
      'push', COALESCE(v_row.payments_push, true)
    ),
    'milestones', jsonb_build_object(
      'email', COALESCE(v_row.milestones_email, true),
      'inApp', COALESCE(v_row.milestones_in_app, true),
      'push', COALESCE(v_row.milestones_push, true)
    ),
    'disputes', jsonb_build_object(
      'email', COALESCE(v_row.disputes_email, true),
      'inApp', COALESCE(v_row.disputes_in_app, true),
      'push', COALESCE(v_row.disputes_push, true)
    ),
    'marketing', jsonb_build_object(
      'email', COALESCE(v_row.marketing_email, false),
      'inApp', COALESCE(v_row.marketing_in_app, true),
      'push', COALESCE(v_row.marketing_push, false)
    )
  );

  RETURN v_result;
END;
$$;

-- 3. Replace set_notification_preferences to use flat columns
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
  v_defaults JSONB := '{
    "proposals": {"email": true, "inApp": true, "push": true},
    "contracts": {"email": true, "inApp": true, "push": true},
    "messages": {"email": true, "inApp": true, "push": true},
    "payments": {"email": true, "inApp": true, "push": true},
    "milestones": {"email": true, "inApp": true, "push": true},
    "disputes": {"email": true, "inApp": true, "push": true},
    "marketing": {"email": false, "inApp": true, "push": false}
  }'::jsonb;
  v_merged JSONB;
BEGIN
  -- Merge incoming prefs with defaults
  v_merged := v_defaults || p_preferences;

  -- Update flat columns from JSON
  UPDATE notification_preferences SET
    proposals_email = COALESCE((v_merged->'proposals'->>'email')::boolean, true),
    proposals_in_app = COALESCE((v_merged->'proposals'->>'inApp')::boolean, true),
    proposals_push = COALESCE((v_merged->'proposals'->>'push')::boolean, true),
    contracts_email = COALESCE((v_merged->'contracts'->>'email')::boolean, true),
    contracts_in_app = COALESCE((v_merged->'contracts'->>'inApp')::boolean, true),
    contracts_push = COALESCE((v_merged->'contracts'->>'push')::boolean, true),
    messages_email = COALESCE((v_merged->'messages'->>'email')::boolean, true),
    messages_in_app = COALESCE((v_merged->'messages'->>'inApp')::boolean, true),
    messages_push = COALESCE((v_merged->'messages'->>'push')::boolean, true),
    payments_email = COALESCE((v_merged->'payments'->>'email')::boolean, true),
    payments_in_app = COALESCE((v_merged->'payments'->>'inApp')::boolean, true),
    payments_push = COALESCE((v_merged->'payments'->>'push')::boolean, true),
    milestones_email = COALESCE((v_merged->'milestones'->>'email')::boolean, true),
    milestones_in_app = COALESCE((v_merged->'milestones'->>'inApp')::boolean, true),
    milestones_push = COALESCE((v_merged->'milestones'->>'push')::boolean, true),
    disputes_email = COALESCE((v_merged->'disputes'->>'email')::boolean, true),
    disputes_in_app = COALESCE((v_merged->'disputes'->>'inApp')::boolean, true),
    disputes_push = COALESCE((v_merged->'disputes'->>'push')::boolean, true),
    marketing_email = COALESCE((v_merged->'marketing'->>'email')::boolean, false),
    marketing_in_app = COALESCE((v_merged->'marketing'->>'inApp')::boolean, true),
    marketing_push = COALESCE((v_merged->'marketing'->>'push')::boolean, false),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- If no row updated, insert with flat column values
  IF NOT FOUND THEN
    INSERT INTO notification_preferences (
      user_id,
      proposals_email, proposals_in_app, proposals_push,
      contracts_email, contracts_in_app, contracts_push,
      messages_email, messages_in_app, messages_push,
      payments_email, payments_in_app, payments_push,
      milestones_email, milestones_in_app, milestones_push,
      disputes_email, disputes_in_app, disputes_push,
      marketing_email, marketing_in_app, marketing_push
    ) VALUES (
      p_user_id,
      COALESCE((v_merged->'proposals'->>'email')::boolean, true),
      COALESCE((v_merged->'proposals'->>'inApp')::boolean, true),
      COALESCE((v_merged->'proposals'->>'push')::boolean, true),
      COALESCE((v_merged->'contracts'->>'email')::boolean, true),
      COALESCE((v_merged->'contracts'->>'inApp')::boolean, true),
      COALESCE((v_merged->'contracts'->>'push')::boolean, true),
      COALESCE((v_merged->'messages'->>'email')::boolean, true),
      COALESCE((v_merged->'messages'->>'inApp')::boolean, true),
      COALESCE((v_merged->'messages'->>'push')::boolean, true),
      COALESCE((v_merged->'payments'->>'email')::boolean, true),
      COALESCE((v_merged->'payments'->>'inApp')::boolean, true),
      COALESCE((v_merged->'payments'->>'push')::boolean, true),
      COALESCE((v_merged->'milestones'->>'email')::boolean, true),
      COALESCE((v_merged->'milestones'->>'inApp')::boolean, true),
      COALESCE((v_merged->'milestones'->>'push')::boolean, true),
      COALESCE((v_merged->'disputes'->>'email')::boolean, true),
      COALESCE((v_merged->'disputes'->>'inApp')::boolean, true),
      COALESCE((v_merged->'disputes'->>'push')::boolean, true),
      COALESCE((v_merged->'marketing'->>'email')::boolean, false),
      COALESCE((v_merged->'marketing'->>'inApp')::boolean, true),
      COALESCE((v_merged->'marketing'->>'push')::boolean, false)
    );
  END IF;

  RETURN get_notification_preferences(p_user_id);
END;
$$;

-- 4. Replace auto_create_notification_preferences function to use flat columns
CREATE OR REPLACE FUNCTION auto_create_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5. Recreate the trigger
CREATE TRIGGER trg_auto_create_notification_preferences
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_notification_preferences();
