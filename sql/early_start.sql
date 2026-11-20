-- Baruch 11/19: a day booked to start before 8:00 (e.g. crew 5 at 6:30 AM). The man's earliest booked start that day
-- (his own L: booking, else his crew's day booking, else the crew's ongoing job; 8:00 when nothing earlier is booked).
create or replace function private.man_sched_start(p_emp text, p_crew text, p_day text) returns int
language sql stable security definer set search_path = public as $f$
  select least(480, coalesce(
    (select min((a->>'start')::numeric)::int from public.records l, jsonb_array_elements(case when jsonb_typeof(l.data->'assignments')='array' then l.data->'assignments' else '[]'::jsonb end) a
      where l.coll='sched' and not l.deleted and l.id = 'L:' || p_emp || '|' || p_day and coalesce(a->>'site','') <> '' and a->>'start' ~ '^[0-9.]+$'),
    (select min((a->>'start')::numeric)::int from public.records r, jsonb_array_elements(case when jsonb_typeof(r.data->'assignments')='array' then r.data->'assignments' else '[]'::jsonb end) a
      where r.coll='sched' and not r.deleted and r.id = p_crew || '|' || p_day and coalesce(a->>'site','') <> '' and a->>'start' ~ '^[0-9.]+$'),
    480)) $f$;
revoke all on function private.man_sched_start(text,text,text) from public, anon, authenticated;
-- punch-in reminder: 5 minutes after his booked start when that is before 8:00 (was always 8:05)
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('man_sched_start' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$if hm >= 8*60+5 and hm < 11*60 and not done ? ('in:'||e.id)$a$,
                    $b$if hm >= private.man_sched_start(e.id, e.data->>'crew', d)+5 and hm < 11*60 and not done ? ('in:'||e.id)$b$);
  if d2 = d0 then raise exception 'clock_tick in-reminder anchor not found'; end if;
  execute d2;
end $$;
-- OwnTracks reminders: the morning one at his booked start (8:00 or earlier); the 1-hour check from his booked start
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.ot_nudge_tick(timestamptz)'::regprocedure);
  if position('man_sched_start' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$if hm >= 8*60 and hm < 8*60+30 and not done ? r.id$a$,
                    $b$sm := private.man_sched_start(r.id, r.crew, d);
    if hm >= sm and hm < sm+30 and not done ? r.id$b$);
  d2 := replace(d2, $a$if not ((hm >= 8*60 and hm < endm) or late) then continue; end if;$a$, $b$if not ((hm >= sm and hm < endm) or late) then continue; end if;$b$);
  d2 := replace(d2, $a$newest bigint; inms bigint; late boolean;$a$, $b$newest bigint; inms bigint; late boolean; sm int;$b$);
  if position('sm := private.man_sched_start' in d2) = 0 or position('hm >= sm and hm < endm' in d2) = 0 then raise exception 'ot_nudge anchors not found'; end if;
  execute d2;
end $$;
