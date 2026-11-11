-- Baruch 11/10: travel is also counted for hours that come in from Fingercheck, from Sunday Nov 8 2026 on.
-- Older Fingercheck hours stay without app travel (their travel was already paid in Fingercheck — "leave paid weeks as is").
-- 1794114000000 = 2026-11-08 00:00 New York time.
do $m$
declare d text; d2 text;
begin
  d := pg_get_functiondef('private.travel_rebuild(text,text)'::regprocedure);
  d2 := replace(d, $q$coalesce(x.data->>'src','') <> 'fingercheck'$q$,
                   $q$(coalesce(x.data->>'src','') <> 'fingercheck' or public._num(x.data->>'in') >= 1794114000000)$q$);
  if d2 = d then raise exception 'travel_rebuild: src filter not found'; end if;
  execute d2;
end $m$;
-- the trigger also skipped Fingercheck hours: keep skipping only the ones before Nov 8 2026
do $m$
declare d text; d2 text;
begin
  d := pg_get_functiondef('private.punch_travel()'::regprocedure);
  d2 := replace(d, $q$and new.data->>'src' = 'fingercheck' then return null; end if;$q$,
                   $q$and new.data->>'src' = 'fingercheck' and coalesce(public._num(new.data->>'in'), 0) < 1794114000000 then return null; end if;$q$);
  if d2 = d then raise exception 'punch_travel: fingercheck skip not found'; end if;
  execute d2;
end $m$;
