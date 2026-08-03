# Archived Migrations (intentionally NOT applied / not pushable)

Files here are **excluded from `supabase db push`** (the Supabase CLI only reads
top-level `supabase/migrations/*.sql`). They were moved here during the migration
drift reconciliation of **2026-08-03**. Do NOT move them back without understanding why.

| File | Why archived |
|---|---|
| `20260801000000_combined_migration.sql` | **TRUNCATEs `skills`, `subcategories`, `categories` CASCADE and re-seeds them** (new UUIDs). The live DB already has the 145-category ecosystem (applied via `20260715000000` / `20260721000000` / `20260725000001`). Re-running would break `freelancer_profiles.category` and `project_categories` references. |
| `20260806000000_restore_auto_confirm_trigger.sql` | Re-creates the `auto_confirm_email` auth trigger. The intended live auth state was set by LATER applied migrations (`20260915000000`, `20260916000000`). Applying this older toggle would flip email-verification behavior backwards. |
| `20260731000000_enable_realtime_admin_tables.sql` | Version-prefix collision: `20260731000000` already exists in remote `schema_migrations` (from `add_interview_time.sql`), so it cannot be pushed as a separate migration. Its realtime-publication additions are low-value. |

## Reopened / pending (do NOT confuse with the above)
- `20260612_internship_applications.sql` and `20260801000000_newsletter_subscribers.sql`
  were **temporarily moved here during reconciliation, then restored** to
  `supabase/migrations/` (they are real feature migrations; the newsletter one was
  made idempotent). They are pending.

## ⚠️ One-time blocker to unblock `db push` (drift ghost)
The remote `supabase_migrations.schema_migrations` has a **bare `20260612` row** with
no matching local file (a ghost), which makes `supabase db push` fail with
"Remote migration versions not found in local migrations directory".
`migration repair` does not clear it. Fix in the Supabase dashboard →
SQL Editor (one line):

```sql
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260612';
```

After that: `npx supabase db push --include-all` applies the pending safe migrations
(`20260612_internship_applications`, `20260801000000_newsletter_subscribers`,
`20260831000000_add_categories_to_freelancer_profiles`,
`20260924000000_fix_usage_logs_schema`).
