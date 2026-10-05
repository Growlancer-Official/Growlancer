-- ============================================================================
-- Fix the AI-writer daily quota — it was DECORATIVE (limit never fired).
--
-- Root cause (live-verified): rate_limits has UNIQUE (identifier, route,
-- window_start), and the ai-writer edge function upserted `{ count: 1 }` with
-- onConflict — every generation RESET the counter to 1 instead of
-- accumulating. It also counted ROWS in the window (always ≤ 1 because of the
-- unique key), so `used >= limit` could never be true: the Free 5/day and Pro
-- 100/day caps never blocked anyone, and get_ai_writer_usage() (which reads
-- the `count` column) reported "4 of 5 left" all day long.
--
-- Fix: a server-only SECURITY DEFINER RPC that ATOMICALLY accumulates the
-- counter (INSERT ... ON CONFLICT DO UPDATE count = count + 1 RETURNING
-- count). The ai-writer edge function calls this instead of upserting.
--
-- Server-only (same class as the 20270119000012 hardening): quota accounting
-- is written exclusively by edge functions with the service role. Anon/
-- authenticated callers are revoked — a browser must never be able to bump
-- or reset usage counters.
-- ============================================================================

create or replace function public.increment_rate_limit(
  p_identifier text,
  p_route text,
  p_window_start timestamptz
)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.rate_limits (identifier, route, count, window_start)
  values (p_identifier, p_route, 1, p_window_start)
  on conflict (identifier, route, window_start)
  do update set count = public.rate_limits.count + 1
  returning public.rate_limits.count;
$$;

revoke execute on function public.increment_rate_limit(text, text, timestamptz) from public;
revoke execute on function public.increment_rate_limit(text, text, timestamptz) from anon;
revoke execute on function public.increment_rate_limit(text, text, timestamptz) from authenticated;
grant execute on function public.increment_rate_limit(text, text, timestamptz) to service_role;

-- Fail-closed assertions: the RPC must exist with the expected signature,
-- must be executable by service_role, and must NOT be callable by anon.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'increment_rate_limit'
      and pg_get_function_identity_arguments(p.oid)
            = 'p_identifier text, p_route text, p_window_start timestamptz'
  ) then
    raise exception 'increment_rate_limit was not created with the expected signature';
  end if;

  if has_function_privilege(
    'anon',
    'public.increment_rate_limit(text,text,timestamptz)'::regprocedure,
    'execute'
  ) then
    raise exception 'increment_rate_limit must not be anon-callable';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.increment_rate_limit(text,text,timestamptz)'::regprocedure,
    'execute'
  ) then
    raise exception 'increment_rate_limit must be executable by service_role';
  end if;
end;
$$;
