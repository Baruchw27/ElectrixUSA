-- B5 (staging first): final review — old group/crew chat messages stay visible as before (only one-to-one messages
-- became private).
do $do$ declare d text; a text; begin
  d := pg_get_functiondef('public.can_see2(text,jsonb,jsonb)'::regprocedure);
  a := $x$when c = 'msgs' then me->>'role' = 'owner' or d->>'from' = me->>'id' or d->>'to' = me->>'id'$x$;
  if position(a in d) = 0 then raise exception 'can_see2 not the expected version'; end if;
  d := replace(d, a, $x$when c = 'msgs' then me->>'role' = 'owner' or d->>'from' = me->>'id' or d->>'to' = me->>'id' or coalesce(d->>'k','') like 'g:%'$x$);
  execute d;
end $do$;
-- (the notification queue keeps its sent rows; a handful a day — clear them in a later maintenance step)
