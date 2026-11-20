-- Baruch 11/20: "Go home at" (Send to another job → Until? → Go home at 3:00 PM). A booking the boss gave a go-home time
-- (assignment.home = true) moves the end of that man's day: the 🏠 pack-up message 15 minutes before it, the "still punched in"
-- reminder and the automatic close after it, and the 1-hour OwnTracks check until it. Every other booking keeps the normal
-- end (7:00 PM, Friday 1:15 PM) — old bookings carry leftover end times from the old crew hours, so only home = true counts.
create or replace function private.man_sched_end(p_emp text, p_crew text, p_day text) returns int
language sql stable security definer set search_path = public as $f$
  select coalesce(
    (select max((a->>'end')::numeric)::int from public.records l, jsonb_array_elements(case when jsonb_typeof(l.data->'assignments')='array' then l.data->'assignments' else '[]'::jsonb end) a
      where l.coll='sched' and not l.deleted and l.id = 'L:' || p_emp || '|' || p_day and coalesce(a->>'site','') <> '' and a->>'home' = 'true' and a->>'end' ~ '^[0-9.]+$'),
    (select max((a->>'end')::numeric)::int from public.records r, jsonb_array_elements(case when jsonb_typeof(r.data->'assignments')='array' then r.data->'assignments' else '[]'::jsonb end) a
      where r.coll='sched' and not r.deleted and r.id = p_crew || '|' || p_day and coalesce(a->>'site','') <> '' and a->>'home' = 'true' and a->>'end' ~ '^[0-9.]+$'
        and not exists (select 1 from public.records l where l.coll='sched' and not l.deleted and l.id = 'L:' || p_emp || '|' || p_day)),
    case when extract(dow from p_day::date) = 5 then 13*60+15 else 19*60 end) $f$;
revoke all on function private.man_sched_end(text,text,text) from public, anon, authenticated;

-- clock_tick: each man's own end for the pack-up / still-punched-in reminders, and for the automatic close
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('man_sched_end' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$    site := private.man_sched_site(e.id, e.data->>'crew', d);$a$,
                    $b$    site := private.man_sched_site(e.id, e.data->>'crew', d);
    endm := private.man_sched_end(e.id, e.data->>'crew', d);   -- Baruch 11/20: "Go home at"$b$);
  d2 := replace(d2, $a$pend := date_trunc('day', pin) + case when extract(dow from pin) = 5 then interval '13 hours 15 minutes' else interval '19 hours' end;$a$,
                    $b$pend := date_trunc('day', pin) + interval '1 minute' * private.man_sched_end(p.data->>'who', (select data->>'crew' from records where coll = 'emps' and id = p.data->>'who'), to_char(pin,'YYYY-MM-DD'));$b$);
  if position('endm := private.man_sched_end' in d2) = 0 or position('* private.man_sched_end' in d2) = 0 then raise exception 'clock_tick anchors not found'; end if;
  execute d2;
end $$;

-- ot_nudge_tick: the 1-hour "OwnTracks quiet" check runs until his own end
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.ot_nudge_tick(timestamptz)'::regprocedure);
  if position('man_sched_end' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$    sm := private.man_sched_start(r.id, r.crew, d);$a$,
                    $b$    sm := private.man_sched_start(r.id, r.crew, d); endm := private.man_sched_end(r.id, r.crew, d);$b$);
  if position('endm := private.man_sched_end' in d2) = 0 then raise exception 'ot_nudge anchor not found'; end if;
  execute d2;
end $$;
