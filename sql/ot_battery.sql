-- Baruch 11/22: phone battery from the tracker (OwnTracks batt / bs) for the payroll Today page.
alter table private.ot_tokens add column if not exists batt int, add column if not exists bs int, add column if not exists batt_at timestamptz;

create or replace function public.ot_batt(p_who text, p_batt int, p_bs int, p_at bigint)
returns void language plpgsql security definer set search_path to 'public','private' as $$
begin
  update private.ot_tokens set batt = greatest(0, least(100, p_batt)), bs = p_bs, batt_at = to_timestamp(p_at/1000.0)
   where who = p_who and (batt_at is null or batt_at <= to_timestamp(p_at/1000.0));
end $$;
revoke all on function public.ot_batt(text,int,int,bigint) from public, anon, authenticated;
grant execute on function public.ot_batt(text,int,int,bigint) to service_role;

create or replace function public.ot_report(p_day text)
 returns jsonb language plpgsql security definer set search_path to 'public','private' as $function$
declare me jsonb := public.my_emp_data();
begin
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then raise exception 'only the owner or Payroll'; end if;
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('who', who, 'last', last_at, 'accepted', accepted_at, 'batt', batt, 'bs', bs, 'batt_at', batt_at)) from private.ot_tokens), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('who', who, 'at', (extract(epoch from at)*1000)::bigint, 'kind', kind, 'site', site, 'note', note) order by at)
      from private.ot_events where to_char(at at time zone 'America/New_York','YYYY-MM-DD') = p_day), '[]'::jsonb));
end $function$;
