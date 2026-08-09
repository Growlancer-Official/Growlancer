-- ═══════════════════════════════════════════════════════════════════
-- client_errors — DB-backed UI telemetry
-- Every ErrorBoundary ERR-<ts>-<rand> reference gets persisted here so
-- support/reference codes are traceable in real time instead of being
-- lost to the browser console.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,          -- ERR-MSLKEMK4-HFSW style reference
  user_id uuid references auth.users(id) on delete set null,
  message text not null default '',
  stack text,
  component_stack text,
  url text,
  user_agent text,
  role text,
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);
create index if not exists client_errors_event_id_idx on public.client_errors (event_id);
create index if not exists client_errors_user_id_idx on public.client_errors (user_id);

-- RLS: anyone (anon + authenticated) may INSERT (error capture), only
-- authenticated users may read their own rows, admins may read all.
alter table public.client_errors enable row level security;

drop policy if exists "client_errors_insert_any" on public.client_errors;
-- Authenticated users may only log errors for themselves; guests log with
-- user_id NULL. Prevents user_id spoofing (same pattern as user_reports).
create policy "client_errors_insert_any"
  on public.client_errors for insert
  with check (
    (auth.uid() is not null and user_id = auth.uid())
    or
    (auth.uid() is null and user_id is null)
  );

drop policy if exists "client_errors_select_own" on public.client_errors;
create policy "client_errors_select_own"
  on public.client_errors for select
  using (auth.uid() = user_id);

drop policy if exists "client_errors_select_admin" on public.client_errors;
create policy "client_errors_select_admin"
  on public.client_errors for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Realtime so the admin/error-monitor UI can stream new errors live.
alter publication supabase_realtime add table public.client_errors;

-- Table-level grants (SQL-created tables don't get default anon/authenticated grants)
grant all on public.client_errors to anon, authenticated, service_role;
