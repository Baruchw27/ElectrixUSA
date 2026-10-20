-- B3 (staging first): nobody but the owner approves their own money or time off.
--  • a manager / Payroll logging their OWN travel gets the same automatic check as everyone (pay worked out from the
--    job's drive time, one per job per day) — before, they could record any amount, already approved
--  • a manager / Payroll cannot approve or deny their OWN time-off request (the owner does)
do $do$ declare d text; a1 text; a2 text; begin
  d := pg_get_functiondef('public.guard_record'::regproc);
  a1 := $x$elsif new.coll = 'travel' and not boss then$x$;
  a2 := $x$elsif new.coll = 'timeoff' and not boss then$x$;
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'guard_record is not the expected version — not changed'; end if;
  d := replace(d, a1, $x$elsif new.coll = 'travel' and (not boss or coalesce(n->>'who', o->>'who') = me->>'id') then$x$);
  d := replace(d, a2, $x$elsif new.coll = 'timeoff' and boss and coalesce(n->>'who', o->>'who') = me->>'id'
        and o is not null and n->>'status' is distinct from o->>'status' and n->>'status' in ('approved','denied') then
    raise exception 'your own time off is approved by the owner' using errcode = '42501';
  elsif new.coll = 'timeoff' and not boss then$x$);
  execute d;
end $do$;
