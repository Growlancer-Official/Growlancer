-- ============================================================
-- Profile Views Counter
-- Security-definer RPC so ANY visitor (anon or authenticated) can
-- record a profile view and read the running total without ever
-- exposing usage_logs rows through RLS.
-- ============================================================

create or replace function public.record_profile_view(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if p_user_id is null then
    return 0;
  end if;

  insert into public.usage_logs (user_id, feature, feature_type, usage_count, metadata)
  values (p_user_id, 'profile_view', 'profile_view', 1, jsonb_build_object('viewed_at', now()));

  select count(*)::bigint
    into v_total
    from public.usage_logs
   where user_id = p_user_id
     and feature = 'profile_view';

  return v_total;
end;
$$;

grant execute on function public.record_profile_view(uuid) to anon, authenticated;

-- Read-only counter (no side effects) so repeat visitors can see the real
-- running total without recording an extra view.
create or replace function public.get_profile_views(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
    from public.usage_logs
   where user_id = p_user_id
     and feature = 'profile_view';
$$;

grant execute on function public.get_profile_views(uuid) to anon, authenticated;
