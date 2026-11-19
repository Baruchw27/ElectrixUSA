-- Baruch 11/19 (bug check): the server's "where is this man scheduled today" (punch-in reminder, 8:30 not-in list, 8 PM
-- "no job tomorrow") ignored men booked one by one ("Pick people", L:emp|day) and treated a day that was changed in the
-- Schedule (patch rows: ongoing job + a move) as "no job". One answer for one man: his own booking first, then his crew's.
create or replace function private.clock_sched_site_ong(p_crew text, p_day text) returns text
language sql stable security definer set search_path = public as $f$
  select nullif(o.data->>'site','') from public.records o
   where o.coll = 'sched' and not o.deleted and o.id like 'ONG:' || p_crew || ':%'
     and coalesce(o.data->>'from','0000-00-00') <= p_day and (o.data->>'to' is null or o.data->>'to' >= p_day)
     and (jsonb_typeof(o.data->'workdays') <> 'array' or (o.data->'workdays') @> to_jsonb(extract(dow from p_day::date)::int))
   order by o.data->>'from' desc limit 1 $f$;
create or replace function private.man_sched_site(p_emp text, p_crew text, p_day text) returns text
language sql stable security definer set search_path = public as $f$
  select coalesce(
    -- 1) he alone was booked / moved that day
    (select a->>'site' from public.records l, jsonb_array_elements(case when jsonb_typeof(l.data->'assignments')='array' then l.data->'assignments' else '[]'::jsonb end) a
      where l.coll='sched' and not l.deleted and l.id = 'L:' || p_emp || '|' || p_day and coalesce(a->>'site','') <> ''
      order by case when a->>'start' ~ '^[0-9.]+$' then (a->>'start')::numeric end nulls first limit 1),
    -- 2) a changed day (patch): a replaced ongoing job, else the ongoing job unless cancelled, else the first added job
    (select coalesce(nullif(r.data->'replace'->'ONG'->>'site',''),
              case when coalesce(r.data->'cancel','[]'::jsonb) @> '["ONG"]'::jsonb then null else private.clock_sched_site_ong(p_crew, p_day) end,
              (select a->>'site' from jsonb_array_elements(case when jsonb_typeof(r.data->'assignments')='array' then r.data->'assignments' else '[]'::jsonb end) a
                where coalesce(a->>'site','') <> '' order by case when a->>'start' ~ '^[0-9.]+$' then (a->>'start')::numeric end nulls first limit 1))
       from public.records r where r.coll='sched' and not r.deleted and r.id = p_crew || '|' || p_day and r.data ? 'patch' limit 1),
    -- 3) the crew's day booking / ongoing job (as before)
    case when coalesce(p_crew,'') <> '' then private.clock_sched_site(p_crew, p_day) end) $f$;
revoke all on function private.man_sched_site(text,text,text), private.clock_sched_site_ong(text,text) from public, anon, authenticated;
-- clock_tick: use it for the punch-in reminder and the 8:30 list
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('man_sched_site' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$site := case when coalesce(e.data->>'crew','') <> '' then private.clock_sched_site(e.data->>'crew', d) end;$a$,
                    $b$site := private.man_sched_site(e.id, e.data->>'crew', d);   -- Baruch 11/19: his own booking first$b$);
  d2 := replace(d2, $a$(coalesce(r.data->>'crew','') = '' or private.clock_sched_site(r.data->>'crew', d) is not null)$a$,
                    $b$(coalesce(r.data->>'crew','') = '' or private.man_sched_site(r.id, r.data->>'crew', d) is not null)$b$);
  if position('man_sched_site' in d2) = 0 then raise exception 'clock_tick anchors not found'; end if;
  execute d2;
end $$;
-- 8 PM "no job tomorrow": a crew whose men are booked one by one is booked
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.book_tomorrow_tick(timestamptz)'::regprocedure);
  if position('man_sched_site' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$     and private.clock_sched_site(c.id, nk) is null;$a$,
    $b$     and private.clock_sched_site(c.id, nk) is null
     and not exists (select 1 from records e2 where e2.coll='emps' and not e2.deleted and e2.data->>'crew' = c.id
                       and private.man_sched_site(e2.id, null, nk) is not null);   -- Baruch 11/19: men booked one by one (man_sched_site)$b$);
  if d2 = d0 then raise exception 'book_tomorrow anchor not found'; end if;
  execute d2;
end $$;
