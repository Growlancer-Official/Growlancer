-- Record the applied migration (idempotent)
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260916000000', '{}', 'disable_auto_confirm_enable_email_verification')
ON CONFLICT (version) DO NOTHING;

-- Verify migration records (expect 20260910000000, 20260915000000, 20260916000000)
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version LIKE '2026091%' ORDER BY version;

-- Verify auto-confirm trigger is GONE (expect empty result)
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
