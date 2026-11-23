-- Baruch 11/23: "in the middle of the day, if he switched to a different job but the tracker didn't catch it, only the app —
-- it should punch him in on that job if it was on his schedule". Same rule the tracker already follows (Baruch 11/18 (7)):
-- a job on his schedule today needs no proof.
--   clocked in at job A, his phone's app sees him at job B (on his schedule) → A closes when he left A (the time his phone saw
--     him leave, if within the hour; otherwise now), B starts at that same moment (the drive is paid), he is told
--   his clock was closed because he LEFT A, and the app sees him at job B (on his schedule) the same day, before the workday ends:
--     within 1 hour of leaving → B starts when he left A (the drive is paid); later → B starts when he was seen there (the gap is
--     not paid) and Payroll is told
-- Back at the SAME job is private.back_on_job. Never for a clock waiting for approval. Once per closed clock (backDone).
create or replace function private.app_switch(p_who text, p_site text, p_at bigint) returns text
language plpgsql security definer set search_path to 'public' as $f$
declare c record; nowms bigint := (extract(epoch from now())*1000)::bigint; d text; atm int; endm int; lu bigint; lv bigint; outv bigint; gap bigint;
  sn text; nm text; x text; nid text; to_ids jsonb; crew text; hm_lv text; hm_out text; aw bigint;
begin
  if p_who is null or p_site is null or p_at is null or p_at > nowms + 60000 then return ''; end if;
  d := to_char(to_timestamp(p_at/1000.0) at time zone 'America/New_York','YYYY-MM-DD');
  crew := (select data->>'crew' from records where coll='emps' and id = p_who);
  atm := extract(hour from to_timestamp(p_at/1000.0) at time zone 'America/New_York')::int*60 + extract(minute from to_timestamp(p_at/1000.0) at time zone 'America/New_York')::int;
  endm := private.man_sched_end(p_who, crew, d);
  if private.kept_late(p_who, d) then lu := private.late_until_ms(p_who, d); if lu is not null and p_at >= lu then return ''; end if;
  elsif atm >= endm then return ''; end if;
  select r.id, r.data into c from records r where r.coll='punches' and not r.deleted and r.data->>'who' = p_who and r.data->>'voided' is null
     and coalesce(r.data->>'rejected','') <> 'true' and coalesce(r.data->>'src','') <> 'fingercheck'
     and to_char(to_timestamp(public._num(r.data->>'in')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = d
   order by public._num(r.data->>'in') desc limit 1;
  if not found then return ''; end if;
  if c.data->>'site' = p_site then return ''; end if;                       -- same job: nothing to switch
  if coalesce((c.data->>'pending')::boolean,false) then return ''; end if;   -- waiting for the office's OK
  if public._num(c.data->>'in') >= p_at - 60000 then return ''; end if;
  sn := split_part(coalesce((select data->>'name' from records where coll='sites' and id = p_site), 'the job'), ',', 1);
  nm := coalesce((select data->>'name' from records where coll='emps' and id = p_who), p_who);
  x := 'p' || substr(md5(random()::text || p_who || p_at::text), 1, 14);
  if coalesce(jsonb_typeof(c.data->'out'),'null') <> 'number' then
    -- clocked in at another job → switch
    aw := public._num(c.data->>'away');
    lv := case when aw is not null and aw > public._num(c.data->>'in') and p_at - aw <= 3600000 then aw else p_at end;
    lv := least(p_at, greatest(lv, coalesce(public._num(c.data->>'seen'),0), public._num(c.data->>'in') + 60000));
    update records set data = (data - 'away' - 'awayBy') || jsonb_build_object('out', lv, 'switchedBy', 'his phone'), updated_at = now(), updated_by = 'server'
      where coll='punches' and id = c.id;
    insert into records(coll, id, deleted, data, updated_by, updated_at) values ('punches', x, false,
      jsonb_build_object('id', x, 'who', p_who, 'site', p_site, 'in', lv, 'out', null, 'seen', p_at, 'srvIn', nowms, 'selfie', coalesce(c.data->>'selfie',''),
        'transfer', true, 'auto', 'phone', 'hist', jsonb_build_array(jsonb_build_object('act','created','by','server','at',nowms,'in',lv,'why','his phone saw him at ' || sn || ' (on his schedule)'))), 'server', now());
    hm_lv := to_char(to_timestamp(lv/1000.0) at time zone 'America/New_York','FMHH12:MI AM');
    perform private.notify_now(p_who, '↔ You are at ' || sn || ' — your clock switched there by itself (from ' || hm_lv || ').',
      '↔ Está en ' || sn || ' — su reloj cambió solo a este trabajo (desde las ' || hm_lv || ').', 'info', jsonb_build_object('tab','punch'), null);
    return 'switched from ' || coalesce(c.data->>'site','?') || ' at ' || hm_lv;
  end if;
  -- his clock was closed because he left the other job
  if not (coalesce(c.data->'autoClosed'->>'how','') = 'left' or coalesce((c.data->>'autoOut')::boolean,false)) then return ''; end if;
  if c.data ? 'backDone' then return ''; end if;
  outv := public._num(c.data->>'out'); if p_at <= outv then return ''; end if;
  gap := p_at - outv;
  lv := case when gap <= 3600000 then outv else p_at end;
  update records set data = data || jsonb_build_object('backDone', p_at), updated_at = now(), updated_by = 'server' where coll='punches' and id = c.id;
  insert into records(coll, id, deleted, data, updated_by, updated_at) values ('punches', x, false,
    jsonb_build_object('id', x, 'who', p_who, 'site', p_site, 'in', lv, 'out', null, 'seen', p_at, 'srvIn', nowms, 'selfie', '',
      'transfer', true, 'auto', 'phone', 'backFrom', c.id, 'hist', jsonb_build_array(jsonb_build_object('act','created','by','server','at',nowms,'in',lv,
        'why','his phone saw him at ' || sn || ' (on his schedule) after his clock closed at the other job'))), 'server', now());
  hm_lv := to_char(to_timestamp(lv/1000.0) at time zone 'America/New_York','FMHH12:MI AM');
  hm_out := to_char(to_timestamp(outv/1000.0) at time zone 'America/New_York','FMHH12:MI AM');
  perform private.notify_now(p_who, '↔ You are at ' || sn || ' — your clock started there by itself (from ' || hm_lv || ').',
    '↔ Está en ' || sn || ' — su reloj empezó solo en este trabajo (desde las ' || hm_lv || ').', 'info', jsonb_build_object('tab','punch'), null);
  if gap > 3600000 then
    select coalesce((select v::jsonb from server_config where k = 'clock_check_to'), '["o1"]'::jsonb) into to_ids;
    for nid in select jsonb_array_elements_text(to_ids) loop
      perform private.notify_now(nid,
        '🕒 ' || nm || ' is at ' || sn || ' (on his schedule) since ' || hm_lv || '. His clock closed at ' || hm_out || ' when he left the other job, so ' || hm_out || ' – ' || hm_lv || ' is not paid — check with him.',
        '🕒 ' || nm || ' está en ' || sn || ' (en su horario) desde las ' || hm_lv || '. Su reloj se cerró a las ' || hm_out || ' al salir del otro trabajo; ' || hm_out || ' – ' || hm_lv || ' no se paga — confírmelo con él.',
        'warn', jsonb_build_object('tab','hours'), null);
    end loop;
  end if;
  return 'clock started at ' || sn || ' from ' || hm_lv;
end $f$;
revoke all on function private.app_switch(text,text,bigint) from public, anon, authenticated;

-- the phone now also says whether that job is on his schedule today (p_sched). New name so phones still on the older version
-- (public.app_here) keep working until they update.
create or replace function public.app_here2(p_site text, p_at bigint, p_open boolean default null, p_sched boolean default false) returns text
language plpgsql security definer set search_path to 'public' as $f$
declare me jsonb := public.my_emp_data(); v_who text := me->>'id'; nowms bigint := (extract(epoch from now())*1000)::bigint; h int; r text := '';
begin
  if v_who is null or p_at is null then return ''; end if;
  if p_at > nowms + 60000 or p_at < nowms - 15*60000 then return ''; end if;
  h := extract(hour from to_timestamp(p_at/1000.0) at time zone 'America/New_York')::int;
  if h < 6 or h >= 21 then return ''; end if;
  if p_site is not null and not exists (select 1 from records where coll='sites' and id = p_site and not deleted) then p_site := null; end if;
  insert into private.app_seen(who, site, at, open, updated) values (v_who, p_site, p_at, p_open, now())
    on conflict (who) do update set site = excluded.site, at = excluded.at, open = excluded.open, updated = now()
    where private.app_seen.at <= excluded.at;
  if p_site is not null then
    r := private.back_on_job(v_who, p_site, p_at, 'his phone');
    if coalesce(r,'') = '' and coalesce(p_sched,false) and coalesce((select (data->>'appClock')::boolean from records where coll='emps' and id = v_who),false) then r := private.app_switch(v_who, p_site, p_at); end if;
  end if;
  return coalesce(r, '');
end $f$;
revoke all on function public.app_here2(text,bigint,boolean,boolean) from public, anon;
grant execute on function public.app_here2(text,bigint,boolean,boolean) to authenticated;
