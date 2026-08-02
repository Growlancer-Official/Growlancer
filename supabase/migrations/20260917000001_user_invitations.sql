-- ═══════════════════════════════════════════════════════════════════
-- user_invitations — Invite User feature (Settings → Account → Invite User)
-- Real invite tracking: pending / accepted / expired / cancelled.
-- RLS: inviter can manage their own invitations; the invited email's
-- signup callback can mark it accepted via an invite token.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  role text not null default 'freelancer' check (role in ('freelancer', 'client')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  invite_token text unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duplicate invitations from the same inviter to the same email are blocked
create unique index if not exists user_invitations_inviter_email_uq
  on public.user_invitations (invited_by, email);

create index if not exists user_invitations_invited_by_idx
  on public.user_invitations (invited_by, status);
create index if not exists user_invitations_token_idx
  on public.user_invitations (invite_token);
create index if not exists user_invitations_email_idx
  on public.user_invitations (email);

-- ── RLS ──
alter table public.user_invitations enable row level security;

-- Inviter can see their own invitations
create policy "user_invitations_select_own"
  on public.user_invitations for select
  using (auth.uid() = invited_by);

-- Inviter creates invitations
create policy "user_invitations_insert_own"
  on public.user_invitations for insert
  with check (auth.uid() = invited_by);

-- Inviter can cancel / resend (update status + token) their own invitations
create policy "user_invitations_update_own"
  on public.user_invitations for update
  using (auth.uid() = invited_by);

-- Anyone who possesses the invite token can mark it accepted (signup callback).
-- The callback only ever sets status='accepted' + accepted_at for a matching
-- pending invitation — it cannot alter other fields or rows without the token.
create policy "user_invitations_accept_by_token"
  on public.user_invitations for update
  using (invite_token is not null)
  with check (
    status = 'accepted'
    and accepted_at is not null
    and updated_at >= created_at
  );

-- Real-time: invitation status changes stream live to the inviter's Settings page
-- (pending → accepted / cancelled / expired updates appear without a refresh).
alter publication supabase_realtime add table public.user_invitations;
