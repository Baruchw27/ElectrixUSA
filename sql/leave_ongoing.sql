-- Baruch 11/17: the 6:45 "15 minutes left" message skipped crew 1 — it only looked for a day booking, and crew 1 is on
-- an ongoing job ("until reassigned"), which has no day booking. Now a crew also counts as working today when its
-- ongoing job covers today (same rule as the 8:05 punch-in reminder: private.clock_sched_site).
do $$
declare d text; d2 text;
  anchor text := $a$and (coalesce(s.data->>'site','') <> '' or jsonb_typeof(s.data->'assignments')='array'))$a$;
begin
  d := pg_get_functiondef('private.leave_tick(timestamptz,boolean)'::regprocedure);
  if position('clock_sched_site' in d) > 0 then return; end if;
  if position(anchor in d) = 0 then raise exception 'leave_tick: day-booking check not found'; end if;
  d2 := replace(d, anchor, anchor || $b$
                  or private.clock_sched_site(e.data->>'crew', td) is not null$b$);
  -- the original "and exists (...)" must become "and (exists (...) or ongoing)"
  d2 := replace(d2, $c$and exists (select 1 from records s where s.coll='sched'$c$, $c$and (exists (select 1 from records s where s.coll='sched'$c$);
  d2 := replace(d2, $b$
                  or private.clock_sched_site(e.data->>'crew', td) is not null$b$, $b$
                  or private.clock_sched_site(e.data->>'crew', td) is not null)$b$);
  execute d2;
end $$;
-- and men on the app clock get the "Pack up" message from clock_tick instead (no double message at 6:45)
do $$
declare d text; d2 text; anchor text := $a$and coalesce(e.data->>'crew','') <> ''$a$;
begin
  d := pg_get_functiondef('private.leave_tick(timestamptz,boolean)'::regprocedure);
  if position('appClock' in d) > 0 then return; end if;
  if position(anchor in d) = 0 then raise exception 'leave_tick: crew check not found'; end if;
  d2 := replace(d, anchor, anchor || $b$
             /* Baruch 11/17: men on the app clock get the "Pack up" message from clock_tick instead (no double message) */
             and not (coalesce((e.data->>'appClock')::boolean,false) and coalesce(e.data->>'clock','') <> 'false')$b$);
  execute d2;
end $$;
