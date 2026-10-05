-- ============================================================================
-- Align record_profile_view with the REAL usage_logs schema.
--
-- Drift found while auditing the AI quota: the repo's 20261020000000 body
-- inserts into a `count` column that does not exist in usage_logs (live
-- columns verified via information_schema: feature_type NOT NULL +
-- usage_count + feature). A fresh environment running that migration would
-- get a counter that throws 42703 at runtime. The live DB was repaired
-- out-of-band to the working body — this migration makes the REPO the source
-- of truth again by replacing the function with that working body.
--
-- Semantics preserved (documented public-by-design in the surface audit):
-- every call inserts exactly one view row and returns the running total.
-- Live re-replace is a no-op; fresh environments get a WORKING counter.
-- ============================================================================

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

  select coalesce(sum(usage_count), 0)::bigint
    into v_total
    from public.usage_logs
   where user_id = p_user_id
     and feature = 'profile_view';

  return v_total;
end;
$$;

grant execute on function public.record_profile_view(uuid) to anon, authenticated;

-- Fail-closed assertions: the function must exist and must stay anon-callable
-- (public vanity counter by design — see surface audit §21.10).
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_profile_view'
  ) then
    raise exception 'record_profile_view was not created';
  end if;

  if not has_function_privilege(
    'anon',
    'public.record_profile_view(uuid)'::regprocedure,
    'execute'
  ) then
    raise exception 'record_profile_view must stay anon-callable (public counter by design)';
  end if;
end;
$$;
