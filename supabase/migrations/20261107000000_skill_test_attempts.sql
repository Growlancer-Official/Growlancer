-- =============================================================================
-- Skill Test Attempts — anti-cheat & cooldown enforcement
-- -----------------------------------------------------------------------------
-- Tracks every certification test attempt per user so the platform can enforce:
--   • Failed test      → retry allowed after 24 hours
--   • Cheating (copy/paste or tab-switch) → 7-day ban per violation threshold
--   • Repeated cheating → permanent ban
-- =============================================================================

create table if not exists public.skill_test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'passed', 'failed', 'cheating')),
  violations integer not null default 0,
  blocked_until timestamptz,
  permanently_blocked boolean not null default false,
  cheating_count integer not null default 0,   -- cumulative cheating bans (2+ = permanent)
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, test_id)
);

create index if not exists idx_skill_test_attempts_user on public.skill_test_attempts (user_id);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.skill_test_attempts enable row level security;

create policy "users view own test attempts" on public.skill_test_attempts
  for select to authenticated using (auth.uid() = user_id);

create policy "users create own test attempts" on public.skill_test_attempts
  for insert to authenticated with check (auth.uid() = user_id);

create policy "users update own test attempts" on public.skill_test_attempts
  for update to authenticated using (auth.uid() = user_id);

grant all on public.skill_test_attempts to authenticated;
grant all on public.skill_test_attempts to service_role;

-- ── Realtime ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'skill_test_attempts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_test_attempts;
  END IF;
END $$;
