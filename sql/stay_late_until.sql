-- Baruch 11/20: Stay late → "Till when?" → a time (the goHomeLog 'late' record carries until = minutes). 15 minutes before that
-- time the server does what the boss's "Send home" does: the 🏠 "Pack up — go home in 15 minutes" message, a goHomeLog 'home'
-- record (so the tracker and the automatic close count from then) and goHome on his open punch. "I'll send them home" = no until,
-- nothing automatic (as before). A manual Send home first, or a new Stay late, wins (only the LAST record of the day counts).
do $$ declare d0 text; d2 text;
  anchor text := $a$    if hm >= endm - 15 and hm < endm + 5 and not done ? ('pack:'||e.id)$a$;
begin
  d0 := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('lateuntil:' in d0) > 0 then return; end if;
  if position(anchor in d0) = 0 then raise exception 'clock_tick pack-up anchor not found'; end if;
  d2 := replace(d0, anchor,
$b$    -- Baruch 11/20: kept late until a time → send him home by itself 15 minutes before it
    select public._num(g.data->>'until')::int into aw from records g where g.coll = 'goHomeLog' and not g.deleted and g.data->>'who' = e.id
      and to_char(to_timestamp(public._num(g.data->>'ts')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = d
      order by public._num(g.data->>'ts') desc limit 1;
    if aw is not null and private.kept_late(e.id, d) and hm >= aw - 15 and not done ? ('lateuntil:'||e.id||':'||aw) then
      x := 'g' || substr(md5(random()::text || e.id), 1, 14);
      insert into records(coll, id, deleted, data, updated_by, updated_at)
        values ('goHomeLog', x, false, jsonb_build_object('id', x, 'who', e.id, 'by', 'server', 'ts', nowms, 'kind', 'home', 'auto', true), 'server', now());
      update records set data = data || jsonb_build_object('goHome', nowms), updated_at = now(), updated_by = 'server'
        where coll = 'punches' and not deleted and data->>'who' = e.id and coalesce(data->'out','null'::jsonb) = 'null'::jsonb and data->>'voided' is null;
      perform private.notify_now(e.id, '🏠 Pack up — go home in 15 minutes. Punch out when you leave.',
        '🏠 Recoge — a casa en 15 minutos. Marca salida al irte.', 'info', jsonb_build_object('tab','punch'), null);
      done := done || to_jsonb('lateuntil:'||e.id||':'||aw) || to_jsonb('out:'||e.id); n := n + 1;   -- no "still punched in" right after it
    end if;
    aw := null;
$b$ || anchor);
  execute d2;
end $$;
