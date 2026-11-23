-- Baruch 11/23 (Luis Guala): "If it sees them back on a job, whatever way, it should catch it up." The tracker, his phone's
-- GPS in the app and the fences all feed ONE rule here:
--   the server closed his clock because he LEFT (autoClosed.how='left', or the phone's own 1-hour close autoOut=true), and
--   any source later sees him back at that SAME job that same day, before the workday ends (or while kept late):
--     back within 1 hour      → the same clock opens again; the time away counts as a trip (as before)
--     back after more than 1h → a NEW clock starts from the time he was seen back; the time away is NOT paid;
--                               he and Payroll are told
--   Once per closed clock (backDone). He already punched in again → nothing to do.
create or replace function private.back_on_job(p_who text, p_site text, p_at bigint, p_src text) returns text
language plpgsql security definer set search_path to 'public' as $f$
declare c record; nowms bigint := (extract(epoch from now())*1000)::bigint; outv bigint; gap bigint; d text; atm int; endm int; lu bigint;
  sn text; nm text; x text; nid text; to_ids jsonb; hm_at text; hm_out text; crew text;
begin
  if p_who is null or p_site is null or p_at is null or p_at > nowms + 60000 then return ''; end if;
  d := to_char(to_timestamp(p_at/1000.0) at time zone 'America/New_York','YYYY-MM-DD');
  -- his latest clock that day (app clock only)
  select r.id, r.data into c from records r where r.coll='punches' and not r.deleted and r.data->>'who' = p_who and r.data->>'voided' is null
     and coalesce(r.data->>'rejected','') <> 'true' and coalesce(r.data->>'src','') <> 'fingercheck'
     and to_char(to_timestamp(public._num(r.data->>'in')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = d
   order by public._num(r.data->>'in') desc limit 1;
  if not found then return ''; end if;
  if coalesce(jsonb_typeof(c.data->'out'),'null') <> 'number' then return ''; end if;          -- still open (or a newer clock exists)
  if c.data->>'site' is distinct from p_site then return ''; end if;                            -- a different job: the normal switch rules apply
  if not (coalesce(c.data->'autoClosed'->>'how','') = 'left' or coalesce((c.data->>'autoOut')::boolean,false)) then return ''; end if;  -- he punched out himself
  if c.data ? 'backDone' then return ''; end if;
  outv := public._num(c.data->>'out');
  if p_at <= outv + 60000 then return ''; end if;
  -- not after the workday (7 PM, Fri 1:15 PM, "Go home at"), unless kept late (then until the stay-late time, or the whole evening)
  crew := (select data->>'crew' from records where coll='emps' and id = p_who);
  atm := extract(hour from to_timestamp(p_at/1000.0) at time zone 'America/New_York')::int*60 + extract(minute from to_timestamp(p_at/1000.0) at time zone 'America/New_York')::int;
  endm := private.man_sched_end(p_who, crew, d);
  if private.kept_late(p_who, d) then
    lu := private.late_until_ms(p_who, d);
    if lu is not null and p_at >= lu then return ''; end if;
  elsif atm >= endm then return ''; end if;
  gap := p_at - outv;
  sn := split_part(coalesce((select data->>'name' from records where coll='sites' and id = p_site), 'the job'), ',', 1);
  nm := coalesce((select data->>'name' from records where coll='emps' and id = p_who), p_who);
  hm_at := to_char(to_timestamp(p_at/1000.0) at time zone 'America/New_York','FMHH12:MI AM');
  hm_out := to_char(to_timestamp(outv/1000.0) at time zone 'America/New_York','FMHH12:MI AM');
  if gap <= 3600000 then
    update records set data = (data - 'autoClosed' - 'autoOut' - 'awayAsked' - 'away' - 'awayBy')
        || jsonb_build_object('out', null, 'seen', greatest(p_at, coalesce(public._num(data->>'seen'),0)),
             'trips', coalesce(data->'trips','[]'::jsonb) || jsonb_build_array(jsonb_build_object('left', outv, 'back', p_at)),
             'reopened', jsonb_build_object('at', nowms, 'by', 'server', 'src', p_src, 'why', 'back at the job at ' || hm_at || ' (' || p_src || ')',
                                            'closedWas', coalesce(data->'autoClosed', jsonb_build_object('how','phone'))),
             'backDone', p_at),
        updated_at = now(), updated_by = 'server' where coll='punches' and id = c.id;
    perform private.notify_now(p_who, '✅ You were back at ' || sn || ' at ' || hm_at || ' — your clock is open again.',
      '✅ Volvió a ' || sn || ' a las ' || hm_at || ' — su reloj está abierto otra vez.', 'info', jsonb_build_object('tab','punch'), null);
    return 'reopened — back at ' || hm_at || ' (' || round(gap/60000.0) || ' min after he left, ' || p_src || ')';
  end if;
  -- away more than 1 hour: a new clock from the moment he was seen back
  update records set data = data || jsonb_build_object('backDone', p_at), updated_at = now(), updated_by = 'server' where coll='punches' and id = c.id;
  x := 'p' || substr(md5(random()::text || p_who || p_at::text), 1, 14);
  insert into records(coll, id, deleted, data, updated_by, updated_at) values ('punches', x, false,
    jsonb_build_object('id', x, 'who', p_who, 'site', p_site, 'in', p_at, 'out', null, 'seen', p_at, 'srvIn', nowms, 'selfie', '',
      'auto', 'back', 'backFrom', c.id, 'backSrc', p_src,
      'hist', jsonb_build_array(jsonb_build_object('act','created','by','server','at',nowms,'in',p_at,
               'why','back at ' || sn || ' at ' || hm_at || ' (' || p_src || '), away since ' || hm_out)) ), 'server', now());
  perform private.notify_now(p_who,
    '✅ You are back at ' || sn || ' — a new clock started from ' || hm_at || '. The time away (' || hm_out || ' – ' || hm_at || ') is not counted; tell the office if you were working.',
    '✅ Está de vuelta en ' || sn || ' — un nuevo reloj empezó a las ' || hm_at || '. El tiempo fuera (' || hm_out || ' – ' || hm_at || ') no cuenta; avise a la oficina si estaba trabajando.',
    'info', jsonb_build_object('tab','punch'), null);
  select coalesce((select v::jsonb from server_config where k = 'clock_check_to'), '["o1"]'::jsonb) into to_ids;
  for nid in select jsonb_array_elements_text(to_ids) loop
    perform private.notify_now(nid,
      '🕒 ' || nm || ' was back at ' || sn || ' at ' || hm_at || ' after being away since ' || hm_out || ' (' || floor(gap/3600000) || ' h ' || lpad(((gap/60000) % 60)::text,2,'0') || ' min). A new clock started at ' || hm_at || '; the time away is not paid — check with him.',
      '🕒 ' || nm || ' volvió a ' || sn || ' a las ' || hm_at || ' después de estar fuera desde las ' || hm_out || '. Un nuevo reloj empezó a las ' || hm_at || '; el tiempo fuera no se paga — confírmelo con él.',
      'warn', jsonb_build_object('tab','hours'), null);
  end loop;
  return 'new clock from ' || hm_at || ' (away ' || round(gap/60000.0) || ' min, ' || p_src || ')';
end $f$;
revoke all on function private.back_on_job(text,text,bigint,text) from public, anon, authenticated;

-- the tracker (owntracks function, service role) calls this one
create or replace function public.ot_back(p_who text, p_site text, p_at bigint) returns text
language sql security definer set search_path to 'public' as $f$ select private.back_on_job(p_who, p_site, p_at, 'tracker') $f$;
revoke all on function public.ot_back(text,text,bigint) from public, anon, authenticated;
grant execute on function public.ot_back(text,text,bigint) to service_role;

-- the phone's GPS in the app: it writes "seen" (still thought the clock was open) or "backSeen" (knew it was closed) on that
-- clock; the server picks it up every 5 minutes (clock_tick)
create or replace function private.back_sweep(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path to 'public' as $f$
declare r record; n int := 0; s text; nowms bigint := (extract(epoch from p_now)*1000)::bigint; t bigint;
begin
  for r in select q.id, q.data from records q where q.coll='punches' and not q.deleted and q.data->>'voided' is null
      and coalesce(q.data->>'src','') <> 'fingercheck' and jsonb_typeof(q.data->'out') = 'number' and not (q.data ? 'backDone')
      and (coalesce(q.data->'autoClosed'->>'how','') = 'left' or coalesce((q.data->>'autoOut')::boolean,false))
      and public._num(q.data->>'in') >= nowms - 20*3600000 loop
    t := greatest(coalesce(public._num(r.data->>'seen'),0), coalesce(public._num(r.data->>'backSeen'),0));
    if t > public._num(r.data->>'out') + 120000 then
      s := private.back_on_job(r.data->>'who', r.data->>'site', t, 'his phone');
      if s <> '' then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $f$;
revoke all on function private.back_sweep(timestamptz) from public, anon, authenticated;

-- every 5 minutes (clock_tick): pick up "seen back" reports from phones
do $d$
declare s text := pg_get_functiondef('private.clock_tick'::regproc); a text;
begin
  a := E'begin\n  hm := extract(hour from loc)::int * 60';
  if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'clock_tick start not found once'; end if;
  if position('back_sweep' in s) > 0 then return; end if;
  s := replace(s, a, E'begin\n  perform private.back_sweep(p_now);   -- Baruch 11/23: seen back at the job after the server closed his clock\n  hm := extract(hour from loc)::int * 60');
  execute s;
end $d$;
