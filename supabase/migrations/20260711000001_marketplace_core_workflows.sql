-- Growlancer marketplace core workflows: deterministic matching, fair distribution,
-- invite/proposal-to-contract automation, collaboration, escrow, referrals, and cleanup.

create extension if not exists pgcrypto;

alter table if exists public.projects add column if not exists subcategory text;
alter table if exists public.projects add column if not exists required_skills text[] default '{}';
alter table if exists public.projects add column if not exists active_contract_id uuid;

alter table if exists public.freelancer_profiles add column if not exists category text;
alter table if exists public.freelancer_profiles add column if not exists subcategories text[] default '{}';
alter table if exists public.freelancer_profiles add column if not exists verification_status text default 'unverified';
alter table if exists public.freelancer_profiles add column if not exists response_time_minutes integer default 1440;
alter table if exists public.freelancer_profiles add column if not exists profile_quality_score numeric default 50;
alter table if exists public.freelancer_profiles add column if not exists recent_activity_at timestamptz default now();

create table if not exists public.ai_matches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  match_score integer not null default 0,
  skill_score integer not null default 0,
  experience_score integer not null default 0,
  budget_score integer not null default 0,
  availability_score integer not null default 0,
  completion_score integer not null default 0,
  category_score integer not null default 0,
  fairness_score integer not null default 0,
  verification_score integer not null default 0,
  response_score integer not null default 0,
  workload_penalty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, freelancer_id)
);

alter table if exists public.ai_matches add column if not exists fairness_score integer default 0;
alter table if exists public.ai_matches add column if not exists verification_score integer default 0;
alter table if exists public.ai_matches add column if not exists response_score integer default 0;
alter table if exists public.ai_matches add column if not exists workload_penalty integer default 0;
alter table if exists public.ai_matches add column if not exists updated_at timestamptz default now();

create table if not exists public.opportunity_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('impression','application','invite','hire')),
  source text not null default 'marketplace',
  created_at timestamptz not null default now()
);

create index if not exists idx_opportunity_events_freelancer_recent on public.opportunity_events(freelancer_id, created_at desc);
create index if not exists idx_ai_matches_project_score on public.ai_matches(project_id, match_score desc);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid unique references public.contracts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  lead_freelancer_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('client','lead','contributor','reviewer')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('lead','contributor','reviewer')),
  status text not null default 'sent' check (status in ('sent','accepted','declined','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique(project_id, freelancer_id)
);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  amount numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','funded','submitted','approved','released','disputed')),
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.fraud_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  severity text not null default 'medium',
  reason text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table if exists public.invites add column if not exists updated_at timestamptz default now();

-- Safely add/replace status column with full constraint
-- Drop old constraint first to avoid migration errors
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invites' and column_name = 'status'
  ) then
    -- Just rename to avoid conflict, we'll set the column properly below
    alter table public.invites drop constraint if exists invites_status_check;
  end if;
end $$;

alter table if exists public.invites add column if not exists status text default 'pending';
alter table if exists public.invites add column if not exists status_check text default 'pending';
alter table if exists public.contracts add column if not exists milestones jsonb default '[]';
alter table if exists public.contracts add column if not exists start_date date default current_date;
alter table if exists public.contracts add column if not exists end_date date;
alter table if exists public.contracts add column if not exists proposal_id uuid;
alter table if exists public.contracts add column if not exists platform_fee numeric default 0;
alter table if exists public.contracts add column if not exists freelancer_amount numeric default 0;

-- Normalize previous invite status — keep 'pending' to match existing constraint
update public.invites set status = 'pending' where status is null;
delete from public.invites i using public.profiles p where i.freelancer_id = p.id and p.deleted_at is not null;
delete from public.invites i using public.profiles p where i.client_id = p.id and p.deleted_at is not null;
delete from public.proposals pr using public.profiles p where pr.freelancer_id = p.id and p.deleted_at is not null;
delete from public.ai_matches m using public.profiles p where m.freelancer_id = p.id and p.deleted_at is not null;

-- Remove duplicate invites before creating unique index
delete from public.invites i using (
  select project_id, freelancer_id, min(created_at) as keep_from
  from public.invites
  where status in ('pending','accepted')
  group by project_id, freelancer_id
  having count(*) > 1
) dup
where i.project_id = dup.project_id
  and i.freelancer_id = dup.freelancer_id
  and (i.created_at IS DISTINCT FROM dup.keep_from OR i.created_at IS NULL);

create unique index if not exists idx_invites_unique_live
  on public.invites(project_id, freelancer_id)
  where status in ('pending','accepted');

create unique index if not exists idx_proposals_unique_project_freelancer
  on public.proposals(project_id, freelancer_id);

-- Drop first to allow signature changes
drop function if exists public.generate_project_matches(uuid);

create or replace function public.generate_project_matches(p_project_id uuid)
returns setof public.ai_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
begin
  select * into v_project from public.projects where id = p_project_id and status in ('open','active');
  if not found then
    return;
  end if;

  delete from public.ai_matches where project_id = p_project_id;

  insert into public.ai_matches (
    project_id, freelancer_id, match_score, skill_score, experience_score, budget_score,
    availability_score, completion_score, category_score, fairness_score,
    verification_score, response_score, workload_penalty, updated_at
  )
  with project_requirements as (
    select
      coalesce(v_project.skills_required, v_project.required_skills, '{}')::text[] as req_skills,
      lower(coalesce(v_project.category, '')) as category,
      lower(coalesce(v_project.subcategory, '')) as subcategory,
      lower(coalesce(v_project.experience_level, 'intermediate')) as exp_level,
      coalesce(v_project.budget_min, 0)::numeric as budget_min,
      coalesce(v_project.budget_max, 999999)::numeric as budget_max
  ), eligible as (
    select
      p.id as freelancer_id,
      coalesce(fp.skills, '{}')::text[] as skills,
      coalesce(fp.experience, 0)::numeric as experience,
      coalesce(fp.rating, 0)::numeric as rating,
      coalesce(fp.availability, false) as availability,
      coalesce(fp.hourly_rate, 0)::numeric as hourly_rate,
      lower(coalesce(fp.category, '')) as category,
      lower(coalesce(fp.verification_status, 'unverified')) as verification_status,
      coalesce(fp.response_time_minutes, 1440) as response_time_minutes,
      coalesce(fp.profile_quality_score, 50)::numeric as profile_quality_score,
      coalesce(fp.recent_activity_at, p.updated_at, p.created_at, now()) as recent_activity_at
    from public.profiles p
    join public.freelancer_profiles fp on fp.user_id = p.id
    where p.role = 'freelancer'
      and p.deleted_at is null
      and coalesce(fp.availability, false) = true
  ), scored as (
    select
      e.*,
      case when array_length(pr.req_skills, 1) is null or array_length(pr.req_skills, 1) = 0 then 70
        else least(100, round(100.0 * (
          select count(*) from unnest(pr.req_skills) rs where lower(rs) = any(select lower(s) from unnest(e.skills) s)
        ) / greatest(array_length(pr.req_skills, 1), 1))) end as skill_score,
      case pr.exp_level
        when 'expert' then case when e.experience >= 7 then 100 when e.experience >= 4 then 75 else 35 end
        when 'intermediate' then case when e.experience >= 3 then 100 when e.experience >= 1 then 75 else 45 end
        else case when e.experience <= 2 then 100 when e.experience <= 4 then 80 else 60 end
      end as experience_score,
      case when e.hourly_rate between pr.budget_min and pr.budget_max then 100
        when e.hourly_rate < pr.budget_min then 90
        else greatest(20, 100 - round(((e.hourly_rate - pr.budget_max) / greatest(pr.budget_max, 1)) * 100)) end as budget_score,
      case when e.availability then 100 else 0 end as availability_score,
      least(100, round(e.rating * 20)) as completion_score,
      case when pr.category = '' or e.category = pr.category then 100 else 0 end as category_score,
      case when e.verification_status in ('verified','approved') then 100 else 20 end as verification_score,
      case when e.response_time_minutes <= 60 then 100 when e.response_time_minutes <= 360 then 80 when e.response_time_minutes <= 1440 then 55 else 25 end as response_score,
      least(35, coalesce((select count(*) * 6 from public.contracts c where c.freelancer_id = e.freelancer_id and c.status in ('pending','active')), 0)
        + coalesce((select count(*) * 3 from public.opportunity_events oe where oe.freelancer_id = e.freelancer_id and oe.event_type = 'invite' and oe.created_at > now() - interval '14 days'), 0)) as workload_penalty,
      greatest(0, 20 - coalesce((select count(*) * 2 from public.opportunity_events oe where oe.freelancer_id = e.freelancer_id and oe.created_at > now() - interval '14 days'), 0)) as fairness_score
    from eligible e cross join project_requirements pr
  ), ranked as (
    select *, greatest(0, least(100, round(
      skill_score * 0.30 + experience_score * 0.15 + budget_score * 0.10 + availability_score * 0.10 +
      completion_score * 0.10 + category_score * 0.10 + verification_score * 0.07 + response_score * 0.05 +
      profile_quality_score * 0.03 + fairness_score - workload_penalty
    )))::integer as final_score
    from scored
    where skill_score > 0 and category_score > 0 and verification_score >= 20
  )
  select p_project_id, freelancer_id, final_score, skill_score, experience_score, budget_score,
         availability_score, completion_score, category_score, fairness_score,
         verification_score, response_score, workload_penalty, now()
  from ranked
  where final_score >= 45
  order by final_score desc, fairness_score desc
  limit 30;

  insert into public.opportunity_events(project_id, freelancer_id, client_id, event_type, source)
  select m.project_id, m.freelancer_id, v_project.client_id, 'impression', 'ai_matching'
  from public.ai_matches m where m.project_id = p_project_id
  on conflict do nothing;

  return query select * from public.ai_matches where project_id = p_project_id order by match_score desc;
end;
$$;

-- Drop first to allow signature changes
drop function if exists public.create_contract_workspace_from_invite(uuid);

create or replace function public.create_contract_workspace_from_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_contract_id uuid;
  v_workspace_id uuid;
  v_amount numeric;
begin
  select i.*, p.budget_max, p.budget_min into v_invite
  from public.invites i join public.projects p on p.id = i.project_id
  where i.id = p_invite_id and i.status = 'accepted';

  if not found then
    raise exception 'Accepted invite not found';
  end if;

  v_amount := coalesce(v_invite.budget_max, v_invite.budget_min, 0);

  select id into v_contract_id from public.contracts
  where project_id = v_invite.project_id and freelancer_id = v_invite.freelancer_id
  order by created_at desc limit 1;

  if v_contract_id is null then
    insert into public.contracts(project_id, client_id, freelancer_id, amount, platform_fee, freelancer_amount, status, milestones, start_date)
    values (v_invite.project_id, v_invite.client_id, v_invite.freelancer_id, v_amount, round(v_amount * 0.05, 2), v_amount - round(v_amount * 0.05, 2), 'pending', '[]'::jsonb, current_date)
    returning id into v_contract_id;
  end if;

  insert into public.workspaces(contract_id, project_id, client_id, lead_freelancer_id, status)
  values (v_contract_id, v_invite.project_id, v_invite.client_id, v_invite.freelancer_id, 'active')
  on conflict (contract_id) do update set status = 'active', updated_at = now()
  returning id into v_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role) values
    (v_workspace_id, v_invite.client_id, 'client'),
    (v_workspace_id, v_invite.freelancer_id, 'lead')
  on conflict (workspace_id, user_id) do nothing;

  update public.projects set status = 'active', active_contract_id = v_contract_id, updated_at = now() where id = v_invite.project_id;
  insert into public.opportunity_events(project_id, freelancer_id, client_id, event_type, source)
  values (v_invite.project_id, v_invite.freelancer_id, v_invite.client_id, 'hire', 'invite') on conflict do nothing;

  return v_contract_id;
end;
$$;

-- Drop first to allow signature changes
drop function if exists public.after_invite_accept_contract();

create or replace function public.after_invite_accept_contract()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.create_contract_workspace_from_invite(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_invite_accept_contract on public.invites;
create trigger trg_after_invite_accept_contract after update of status on public.invites
for each row execute function public.after_invite_accept_contract();

-- Drop first to allow signature changes
drop function if exists public.create_contract_with_escrow(uuid, uuid, uuid, numeric, uuid);

create or replace function public.create_contract_with_escrow(
  p_project_id uuid, p_freelancer_id uuid, p_proposal_id uuid, p_amount numeric, p_client_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_contract_id uuid;
  v_workspace_id uuid;
begin
  insert into public.contracts(project_id, proposal_id, freelancer_id, client_id, amount, platform_fee, freelancer_amount, status, milestones, start_date)
  values (p_project_id, p_proposal_id, p_freelancer_id, p_client_id, p_amount, round(p_amount * 0.05, 2), p_amount - round(p_amount * 0.05, 2), 'pending', '[]'::jsonb, current_date)
  on conflict do nothing
  returning id into v_contract_id;

  if v_contract_id is null then
    select id into v_contract_id from public.contracts where project_id = p_project_id and freelancer_id = p_freelancer_id order by created_at desc limit 1;
  end if;

  update public.proposals set status = 'accepted', updated_at = now() where id = p_proposal_id;
  update public.proposals set status = 'rejected', updated_at = now() where project_id = p_project_id and id <> p_proposal_id and status = 'pending';
  update public.projects set status = 'active', active_contract_id = v_contract_id, updated_at = now() where id = p_project_id;

  insert into public.workspaces(contract_id, project_id, client_id, lead_freelancer_id, status)
  values (v_contract_id, p_project_id, p_client_id, p_freelancer_id, 'active')
  on conflict (contract_id) do update set status = 'active', updated_at = now()
  returning id into v_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role) values
    (v_workspace_id, p_client_id, 'client'),
    (v_workspace_id, p_freelancer_id, 'lead')
  on conflict (workspace_id, user_id) do nothing;

  insert into public.opportunity_events(project_id, freelancer_id, client_id, event_type, source)
  values (p_project_id, p_freelancer_id, p_client_id, 'hire', 'proposal') on conflict do nothing;

  return jsonb_build_object('contract_id', v_contract_id, 'workspace_id', v_workspace_id);
end;
$$;

create or replace view public.referral_leaderboard as
select p.id as user_id, p.name, p.avatar,
       count(r.id)::integer as total_referrals,
       count(*) filter (where r.status in ('converted','paid','completed'))::integer as successful_conversions,
       coalesce(sum(case when r.bonus_claimed then 1 else 0 end), 0)::numeric as referral_earnings
from public.referrals r
join public.profiles p on p.id = r.referrer_id and p.deleted_at is null
group by p.id, p.name, p.avatar
having count(*) filter (where r.status in ('converted','paid','completed')) > 0
order by successful_conversions desc, referral_earnings desc, total_referrals desc;

create or replace view public.distribution_analytics as
select freelancer_id,
       count(*) filter (where event_type = 'impression')::integer as impressions,
       count(*) filter (where event_type = 'application')::integer as applications,
       count(*) filter (where event_type = 'invite')::integer as invites,
       count(*) filter (where event_type = 'hire')::integer as hires,
       max(created_at) as last_event_at
from public.opportunity_events
group by freelancer_id;

-- Add tables to publication if not already members
do $$
declare
  tbl text;
begin
  foreach tbl in array array['ai_matches','opportunity_events','workspaces','workspace_members','team_invitations','workspace_activity_logs']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end;
$$;
