-- Verify the auto-confirm trigger is GONE (expect empty result)
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
