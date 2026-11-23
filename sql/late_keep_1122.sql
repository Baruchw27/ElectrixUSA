-- Baruch 11/22: kept late till a time → at 15 min before it the server sends "pack up" but must NOT write a
-- "sent home" note: that note hid the stay-late and every screen jumped back to the normal end (5:00).
create or replace function private.late_until_ms(p_who text, p_day text) returns bigint
language sql stable security definer set search_path to 'public' as $f$
  select case when g.data->>'kind' = 'late' and public._num(g.data->>'until') is not null
    then (extract(epoch from ((p_day::date + make_interval(mins => public._num(g.data->>'until')::int))::timestamp at time zone 'America/New_York'))*1000)::bigint end
  from public.records g where g.coll = 'goHomeLog' and not g.deleted and g.data->>'who' = p_who
    and to_char(to_timestamp(public._num(g.data->>'ts')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = p_day
  order by public._num(g.data->>'ts') desc limit 1 $f$;
revoke all on function private.late_until_ms(text,text) from public, anon, authenticated;

do $d$
declare s text := pg_get_functiondef('private.clock_tick'::regproc); a text; b text;
begin
  a := E'      x := ''g'' || substr(md5(random()::text || e.id), 1, 14);\n      insert into records(coll, id, deleted, data, updated_by, updated_at)\n        values (''goHomeLog'', x, false, jsonb_build_object(''id'', x, ''who'', e.id, ''by'', ''server'', ''ts'', nowms, ''kind'', ''home'', ''auto'', true), ''server'', now());\n';
  if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'pack-up insert not found once'; end if;
  s := replace(s, a, E'      -- Baruch 11/22: no "sent home" note here — it hid the stay-late (screens went back to 5:00); he stays late till the time\n');
  b := 'endms := (extract(epoch from (pend at time zone ''America/New_York''))*1000)::bigint;';
  if (length(s) - length(replace(s, b, ''))) / length(b) <> 1 then raise exception 'endms not found once'; end if;
  s := replace(s, b, 'endms := greatest((extract(epoch from (pend at time zone ''America/New_York''))*1000)::bigint, coalesce(private.late_until_ms(p.data->>''who'', to_char(pin,''YYYY-MM-DD'')), 0));  /* Baruch 11/22: kept late till X → a forgotten punch closes at X, not 5:00 */');
  execute s;
end $d$;
