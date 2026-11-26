-- 2026-11-26  Fix #1 (Baruch 11/25): ONLY the server decides when a clock closes because the man left the job.
-- The phone used to close the clock itself (1-hour timer, on return, before a new punch) with its own older rule.
-- On 11/25 that closed Carlos's clock at 4:48 PM from one reading just past the fence edge, although the server
-- (away_confirmed: needs a reading surely outside the job ≥1 h after leaving) had kept it open.
-- The phone now asks this function instead. Same rule as private.clock_tick:
--   • away less than 1 hour ago           → nothing to decide yet (clock open)
--   • he is back at that job (p_back) and leaving was NOT confirmed → clock stays open, the gap counts (a "trip")
--   • leaving confirmed                    → clock closes at the time he left (as before)
--   • not confirmed and not back           → clock stays open; clock_tick closes it at the end of the day if never confirmed
-- Manual punch-out while away (Baruch's rule: he gets the time he left) is not touched.
create or replace function public.punch_settle(p_id text, p_back boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare me jsonb := public.my_emp_data(); r record; d jsonb; aw bigint; nowms bigint := (extract(epoch from now())*1000)::bigint; conf boolean;
begin
  if coalesce(me->>'id','') = '' then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.records where coll = 'punches' and id = p_id and not deleted for update;
  if not found then return jsonb_build_object('state','missing'); end if;
  d := r.data;
  if d->>'who' is distinct from me->>'id' then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(d->'out') = 'number' then return jsonb_build_object('state','closed','out',d->'out'); end if;
  aw := public._num(d->>'away');
  if aw is null then return jsonb_build_object('state','open'); end if;
  if nowms < aw + 3600000 then return jsonb_build_object('state','open','away',aw); end if;
  conf := private.away_confirmed(d->>'who', d->>'site', aw);
  if conf then
    update public.records set data = (data - 'away') || jsonb_build_object('out', aw,
           'autoClosed', jsonb_build_object('how','left','at',nowms,'by','server')),
           updated_by = 'server', updated_at = now() where coll = 'punches' and id = p_id;
    return jsonb_build_object('state','closed','out',aw,'confirmed',true);
  end if;
  if p_back then
    update public.records set data = (data - 'away') || jsonb_build_object('seen', nowms,
           'trips', coalesce(data->'trips','[]'::jsonb) || jsonb_build_array(jsonb_build_object('left',aw,'back',nowms,'src','phone'))),
           updated_by = 'server', updated_at = now() where coll = 'punches' and id = p_id;
    return jsonb_build_object('state','open','kept',true,'gapMin',round((nowms-aw)/60000.0));
  end if;
  return jsonb_build_object('state','open','away',aw,'waiting',true);
end $function$;
revoke execute on function public.punch_settle(text, boolean) from public, anon;
grant execute on function public.punch_settle(text, boolean) to authenticated;
