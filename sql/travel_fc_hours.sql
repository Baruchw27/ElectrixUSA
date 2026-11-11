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
-- Baruch 11/10 (later): count from Sunday Nov 1 2026 instead (that week was not paid yet). 1793505600000 = 2026-11-01 00:00 New York.
do $m$
declare d text;
begin
  d := pg_get_functiondef('private.travel_rebuild(text,text)'::regprocedure);
  if position('1794114000000' in d) = 0 then raise exception 'travel_rebuild: cutoff not found'; end if;
  execute replace(d, '1794114000000', '1793505600000');
  d := pg_get_functiondef('private.punch_travel()'::regprocedure);
  if position('1794114000000' in d) = 0 then raise exception 'punch_travel: cutoff not found'; end if;
  execute replace(d, '1794114000000', '1793505600000');
end $m$;
-- Baruch 11/10: once a travel leg was sent to Fingercheck, a later change of hours must never wipe the "sent" mark
-- (otherwise it could be sent twice). The new amount is kept next to it so the send screen can flag the difference.
do $m$
declare d text; d2 text;
begin
  d := pg_get_functiondef('private.travel_leg(text,text,text,text,boolean)'::regprocedure);
  d2 := replace(d, $q$on conflict (coll, id) do update set data = excluded.data, deleted = false, updated_by = 'server', updated_at = now()$q$,
                   $q$on conflict (coll, id) do update set data = excluded.data || case when public.records.data ? 'fcSent' then jsonb_build_object('fcSent', public.records.data->'fcSent') else '{}'::jsonb end, deleted = false, updated_by = 'server', updated_at = now()$q$);
  if d2 = d then raise exception 'travel_leg: on conflict not found'; end if;
  execute d2;
end $m$;
