-- Baruch 11/16: Crew 5 is on an ongoing job (220 Prospect Rd, "until reassigned"), but the server only looked at the
-- day's own schedule record — so no 8:05 "time to punch in" reminder and no 8:30 list for them. Now: the day's record
-- first (a cancelled / replaced day still means no job); with no day record, the crew's ongoing job that covers the day.
create or replace function private.clock_sched_site(p_crew text, p_day text) returns text
language sql stable security definer set search_path = public as $f$
  select coalesce(
    (select case when r.data ? 'cancel' or r.data ? 'replace' or r.data ? 'patch' then null
              else coalesce(nullif(r.data->>'site',''), (select a->>'site' from jsonb_array_elements(case when jsonb_typeof(r.data->'assignments')='array' then r.data->'assignments' else '[]'::jsonb end) a where coalesce(a->>'site','')<>'' limit 1)) end
       from public.records r where r.coll = 'sched' and r.id = p_crew || '|' || p_day and not r.deleted limit 1),
    case when exists (select 1 from public.records r where r.coll = 'sched' and r.id = p_crew || '|' || p_day and not r.deleted) then null else
    (select nullif(o.data->>'site','') from public.records o
      where o.coll = 'sched' and not o.deleted and o.id like 'ONG:' || p_crew || ':%'
        and coalesce(o.data->>'from','0000-00-00') <= p_day and (o.data->>'to' is null or o.data->>'to' >= p_day)
        and (jsonb_typeof(o.data->'workdays') <> 'array' or (o.data->'workdays') @> to_jsonb(extract(dow from p_day::date)::int))
      order by o.data->>'from' desc limit 1) end) $f$;
revoke all on function private.clock_sched_site(text,text) from public, anon, authenticated;
