-- Growlancer Two-Factor Authentication (2FA) System
-- Extends Supabase Auth MFA with recovery codes and user settings

-- 26. USER_MFA_SETTINGS
-- Tracks user MFA configuration and preferences
CREATE TABLE IF NOT EXISTS user_mfa_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_method TEXT DEFAULT 'totp' CHECK (mfa_method IN ('totp')),
  totp_secret TEXT, -- encrypted at rest
  backup_email TEXT,
  trusted_devices JSONB DEFAULT '[]'::jsonb,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 27. RECOVERY_CODES
-- One-time use recovery codes for MFA backup access
CREATE TABLE IF NOT EXISTS recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL, -- stored as SHA-256 hash for security
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mfa_settings_user_id ON user_mfa_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_id ON recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_used ON recovery_codes(user_id, used);

-- Enable RLS
ALTER TABLE user_mfa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users manage own MFA settings" ON user_mfa_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own recovery codes" ON recovery_codes
  FOR ALL USING (auth.uid() = user_id);

-- Function to generate recovery codes for a user
CREATE OR REPLACE FUNCTION generate_recovery_codes(
  p_user_id UUID
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes TEXT[] := '{}';
  v_code TEXT;
  v_i INTEGER;
BEGIN
  -- Delete existing unused codes
  DELETE FROM recovery_codes WHERE user_id = p_user_id AND used = false;

  -- Generate 8 new recovery codes
  FOR v_i IN 1..8 LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
    v_code := substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5);
    
    INSERT INTO recovery_codes (user_id, code_hash)
    VALUES (p_user_id, crypt(v_code, gen_salt('bf')));
    
    v_codes := array_append(v_codes, v_code);
  END LOOP;

  RETURN v_codes;
END;
$$;

-- Function to verify a recovery code
CREATE OR REPLACE FUNCTION verify_recovery_code(
  p_user_id UUID,
  p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id UUID;
  v_valid BOOLEAN := false;
BEGIN
  -- Find and verify the code
  SELECT id INTO v_code_id FROM recovery_codes
    WHERE user_id = p_user_id
    AND used = false
    AND code_hash = crypt(p_code, code_hash)
    LIMIT 1;

  IF FOUND THEN
    -- Mark as used
    UPDATE recovery_codes SET used = true, used_at = NOW()
    WHERE id = v_code_id;
    
    RETURN jsonb_build_object('valid', true);
  ELSE
    RETURN jsonb_build_object('valid', false);
  END IF;
END;
$$;

-- Function to get remaining recovery codes count
CREATE OR REPLACE FUNCTION get_recovery_codes_count(
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM recovery_codes
    WHERE user_id = p_user_id AND used = false;
  RETURN v_count;
END;
$$;

-- Function to enable MFA for a user
CREATE OR REPLACE FUNCTION enable_user_mfa(
  p_user_id UUID,
  p_totp_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mfa_id UUID;
BEGIN
  -- Upsert MFA settings
  INSERT INTO user_mfa_settings (user_id, mfa_enabled, totp_secret, last_verified_at)
  VALUES (p_user_id, true, p_totp_secret, NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET mfa_enabled = true, totp_secret = p_totp_secret, last_verified_at = NOW(), updated_at = NOW()
  RETURNING id INTO v_mfa_id;

  RETURN jsonb_build_object('success', true, 'mfa_id', v_mfa_id);
END;
$$;

-- Function to disable MFA for a user
CREATE OR REPLACE FUNCTION disable_user_mfa(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_mfa_settings
  SET mfa_enabled = false, totp_secret = null, updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Clean up unused recovery codes
  DELETE FROM recovery_codes WHERE user_id = p_user_id AND used = false;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to get MFA status
CREATE OR REPLACE FUNCTION get_mfa_status(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_codes_remaining INTEGER;
BEGIN
  SELECT * INTO v_settings FROM user_mfa_settings WHERE user_id = p_user_id;
  
  SELECT COUNT(*) INTO v_codes_remaining FROM recovery_codes
    WHERE user_id = p_user_id AND used = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'mfa_enabled', false,
      'recovery_codes_remaining', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'mfa_enabled', v_settings.mfa_enabled,
    'mfa_method', v_settings.mfa_method,
    'backup_email', v_settings.backup_email,
    'trusted_devices', v_settings.trusted_devices,
    'last_verified_at', v_settings.last_verified_at,
    'recovery_codes_remaining', v_codes_remaining,
    'created_at', v_settings.created_at
  );
END;
$$;