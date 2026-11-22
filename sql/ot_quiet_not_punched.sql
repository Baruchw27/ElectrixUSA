-- Baruch 11/21 (#2): the "OwnTracks has not sent your location for 1 hour" message also goes to a man who is BOOKED today but
-- NOT punched in (11/20: Luis Guillen's punch was stuck on his phone and his OwnTracks died at 7:07 — nobody heard anything
-- until 11:11). Counted from his booked start: no reading for 1 hour after it → the same message, once per quiet spell.
-- Office people / the owner are left out. Patched into private.ot_nudge_tick.
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.ot_nudge_tick(timestamptz)'::regprocedure);
  if position('quiet_not_in' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$    if inms is null then continue; end if;$a$,
$b$    if inms is null then   -- quiet_not_in: booked today but not punched in → from his booked start
      if private.man_sched_site(r.id, r.crew, d) is null
         or coalesce((select e2.data->>'role' from records e2 where e2.coll = 'emps' and e2.id = r.id), '') in ('office','owner') then continue; end if;
      inms := (extract(epoch from ((d::date + make_interval(mins => sm)) at time zone 'America/New_York')) * 1000)::bigint;
    end if;$b$);
  if position('quiet_not_in' in d2) = 0 then raise exception 'ot_nudge anchor not found'; end if;
  execute d2;
end $$;
