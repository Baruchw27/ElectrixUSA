-- Audit A6 (STAGING) — older clock entries / travel stay reachable after the phone's 130-day window.
-- Phones keep only recent history; everything stays on the server. This lets Hours / Job hours / Travel ask the server
-- for any older period. It runs with the caller's own permissions (row-level security applies exactly as for normal
-- reads), so a worker still only gets their own entries and Payroll gets everyone's.
create or replace function public.history_records(p_coll text, p_from bigint, p_to bigint, p_who text default null,
                                                  p_site text default null, p_limit int default 3000)
returns table(coll text, id text, data jsonb, deleted boolean)
language sql stable security invoker set search_path to 'public' as $$
  select r.coll, r.id, r.data, r.deleted
  from public.records r
  where p_coll in ('punches','travel')
    and r.coll = p_coll and not r.deleted
    and (p_who is null or r.data->>'who' = p_who)
    and (p_site is null or r.data->>'site' = p_site)
    and case when p_coll = 'punches' then public._num(r.data->>'in') >= p_from and public._num(r.data->>'in') < p_to
             else (r.data->>'date') >= to_char(to_timestamp(p_from / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD')
              and (r.data->>'date') <  to_char(to_timestamp(p_to / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD') end
  order by r.id
  limit least(greatest(coalesce(p_limit, 3000), 1), 5000);
$$;
revoke all on function public.history_records(text, bigint, bigint, text, text, int) from public, anon;
grant execute on function public.history_records(text, bigint, bigint, text, text, int) to authenticated;
-- keeps these lookups fast as the years add up
create index if not exists records_punch_in_idx on public.records ((public._num(data->>'in'))) where coll = 'punches';
