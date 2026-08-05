# Archived Migrations (intentionally NOT applied / not pushable)

Files here are **excluded from `supabase db push`** (the Supabase CLI only reads
top-level `supabase/migrations/*.sql`). They were moved here during the migration
drift reconciliation of **2026-08-03**. Do NOT move them back without understanding why.

| File | Why archived |
|---|---|
| `20260801000000_combined_migration.sql` | **TRUNCATEs `skills`, `subcategories`, `categories` CASCADE and re-seeds them** (new UUIDs). The live DB already has the 145-category ecosystem (applied via `20260715000000` / `20260721000000` / `20260725000001`). Re-running would break `freelancer_profiles.category` and `project_categories` references. |
| `20260806000000_restore_auto_confirm_trigger.sql` | Re-creates the `auto_confirm_email` auth trigger. The intended live auth state was set by LATER applied migrations (`20260915000000`, `20260916000000`). Applying this older toggle would flip email-verification behavior backwards. |
| `20260731000000_enable_realtime_admin_tables.sql` | Version-prefix collision: `20260731000000` already exists in remote `schema_migrations` (from `add_interview_time.sql`), so it cannot be pushed as a separate migration. Its realtime-publication additions are low-value. |
| `20260612_internship_applications.sql` | Version/name collision with a bare remote `20260612` row — the CLI can't match `20260612_internship_applications` to it, which kept blocking `db push`. The tables already exist in prod (idempotent apply). If a fresh environment needs them, re-create as a NEW timestamped migration. |
| `20260801000000_newsletter_subscribers.sql` | Version-prefix collision: `20260801000000` already exists in remote `schema_migrations` (from another file), so it can't be recorded. Table already exists in prod. |

## Status (2026-08-03 reconciliation complete)
- The ghost `20260612` row was deleted (dashboard SQL) and the internship file
  archived → **`supabase db push` now reports "Remote database is up to date"**.
- Applied cleanly: `20260831000000_add_categories_to_freelancer_profiles`,
  `20260924000000_fix_usage_logs_schema`,
  `20260925000000_auto_clean_user_data_on_delete` (auto-clean trigger).
