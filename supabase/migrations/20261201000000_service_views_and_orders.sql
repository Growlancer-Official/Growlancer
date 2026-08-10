-- ============================================================
-- Service Views Counter
-- Security-definer RPC so ANY visitor (anon or authenticated) can
-- record a service view and read the running total. The counter
-- lives directly on services.views so the freelancer's dashboard
-- (ServicesPage) and analytics pick it up in real time.
-- ============================================================

create or replace function public.record_service_view(p_service_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if p_service_id is null then
    return 0;
  end if;

  update public.services
     set views = coalesce(views, 0) + 1
   where id = p_service_id;

  select views::bigint
    into v_total
    from public.services
   where id = p_service_id;

  return coalesce(v_total, 0);
end;
$$;

grant execute on function public.record_service_view(uuid) to anon, authenticated;

-- Read-only counter (no side effects) so repeat visitors can see the real
-- running total without recording an extra view.
create or replace function public.get_service_views(p_service_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(views, 0)::bigint
    from public.services
   where id = p_service_id;
$$;

grant execute on function public.get_service_views(uuid) to anon, authenticated;

-- ============================================================
-- Service Orders Counter
-- Idempotent increment of services.orders — called by the razorpay
-- edge function + webhook exactly once per captured service_purchase
-- payment (both already guard duplicates before calling this RPC).
-- ============================================================

create or replace function public.increment_service_orders(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_service_id is null then
    return;
  end if;

  update public.services
     set orders = coalesce(orders, 0) + 1
   where id = p_service_id;
end;
$$;

grant execute on function public.increment_service_orders(uuid) to anon, authenticated, service_role;
