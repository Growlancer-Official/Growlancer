-- =============================================================================
-- User Reports & Feedback — production-ready, industry-standard
-- Users can report bugs, request features, share feedback. Admins triage via
-- the admin panel; the submit-report edge function emails the company inbox.
-- =============================================================================

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null default '',
  email text,
  report_type text not null check (report_type in ('bug', 'feature', 'feedback', 'security', 'other')),
  category text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 5000),
  page_url text,
  browser_info text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'wontfix')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_reports_created_at_idx on public.user_reports (created_at desc);
create index if not exists user_reports_status_idx on public.user_reports (status);
create index if not exists user_reports_user_id_idx on public.user_reports (user_id);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.user_reports enable row level security;

-- Anyone (authenticated or guest) may submit a report. When authenticated, the
-- user_id is forced to the caller so reports can never be spoofed as another user.
create policy "user_reports_insert_anyone" on public.user_reports
  for insert to authenticated, anon
  with check (
    (auth.uid() is not null and user_id = auth.uid())
    or
    (auth.uid() is null and user_id is null)
  );

-- Users can read their own reports (track status over time).
create policy "user_reports_select_own" on public.user_reports
  for select to authenticated
  using (user_id = auth.uid());

-- Admins can read and update all reports (admin-data edge function uses
-- service_role and bypasses RLS, but keep a direct path for the dashboard).
create policy "user_reports_admin_all" on public.user_reports
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- No public update/delete — status changes happen through the admin panel only.

-- ── Realtime ───────────────────────────────────────────────────────────────────
-- Keep the admin User Reports page live: new reports appear instantly without a refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_reports;
  END IF;
END $$;
