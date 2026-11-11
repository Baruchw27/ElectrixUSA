-- Baruch 11/11: app punch clock helpers, run every 5 minutes (cron 'clock-tick'). Only people with emps.data.appClock=true
-- get reminders (the crews still clock in on Fingercheck); the automatic close applies to any open APP punch of the last 2 days.
--  (3) 8:05 AM "time to punch in" (workdays; to people scheduled today, or with no crew); end of day +5 min "still punched in"
--  (6) a forgotten app punch closes by itself 2 h after the day's end (7 PM, Fri 1:15 PM) at the last time the app saw him on site
--      (data.seen), else at the day's end; "Still working" (data.keepOpen) holds it; marked data.autoClosed for Payroll
--  (8) Payroll list (server_config clock_check_to, default Shia o1): 8:30 AM not punched in · 8:55 PM still punched in ·
--      7 AM closed automatically yesterday
create or replace function private.clock_sched_site(p_crew text, p_day text) returns text
language sql stable security definer set search_path = public as $f$
  select case when r.data ? 'cancel' or r.data ? 'replace' or r.data ? 'patch' then null
              else coalesce(nullif(r.data->>'site',''), (select a->>'site' from jsonb_array_elements(case when jsonb_typeof(r.data->'assignments')='array' then r.data->'assignments' else '[]'::jsonb end) a where coalesce(a->>'site','')<>'' limit 1)) end
  from public.records r where r.coll = 'sched' and r.id = p_crew || '|' || p_day and not r.deleted limit 1 $f$;

create or replace function private.clock_tick(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare loc timestamp := p_now at time zone 'America/New_York'; d text := to_char(p_now at time zone 'America/New_York','YYYY-MM-DD');
  dow int := extract(dow from (p_now at time zone 'America/New_York'))::int; hm int; endm int; nowms bigint := (extract(epoch from p_now)*1000)::bigint;
  st jsonb; done jsonb; e record; p record; site text; sn text; to_ids jsonb; lst text; n int := 0; closed int := 0;
  pin timestamp; pend timestamp; due timestamptz; endms bigint; seen bigint; cl bigint; how text; x text;
begin
  hm := extract(hour from loc)::int * 60 + extract(minute from loc)::int; endm := case when dow = 5 then 13*60+15 else 19*60 end;
  select v::jsonb into st from server_config where k = 'clock_state';
  if st is null or st->>'day' is distinct from d then st := jsonb_build_object('day', d, 'done', '[]'::jsonb); end if;
  done := st->'done';
  select coalesce((select v::jsonb from server_config where k = 'clock_check_to'), '["o1"]'::jsonb) into to_ids;

  -- (6) close forgotten app punches (last 2 days) 2 h after that day's end
  for p in select r.id, r.data from records r where r.coll = 'punches' and not r.deleted and coalesce(r.data->>'src','') <> 'fingercheck'
      and coalesce(r.data->'out','null'::jsonb) = 'null'::jsonb and r.data->>'voided' is null and not coalesce(r.data->'pending' = 'true'::jsonb, false)
      and public._num(r.data->>'in') >= nowms - 48*3600000 loop
    pin := to_timestamp(public._num(p.data->>'in')/1000.0) at time zone 'America/New_York';
    pend := date_trunc('day', pin) + case when extract(dow from pin) = 5 then interval '13 hours 15 minutes' else interval '19 hours' end;
    due := (pend + interval '2 hours') at time zone 'America/New_York'; endms := (extract(epoch from (pend at time zone 'America/New_York'))*1000)::bigint;
    if p_now < due or coalesce(public._num(p.data->>'keepOpen'), 0) > nowms then continue; end if;
    seen := public._num(p.data->>'seen');
    if seen is not null and seen > public._num(p.data->>'in') then cl := least(seen, nowms); how := 'seen';
    elsif endms > public._num(p.data->>'in') then cl := endms; how := 'end';
    else cl := public._num(p.data->>'in'); how := 'start'; end if;
    update records set data = (data - 'away') || jsonb_build_object('out', cl, 'autoClosed', jsonb_build_object('at', nowms, 'how', how)),
      updated_at = now(), updated_by = 'server' where coll = 'punches' and id = p.id;
    perform private.notify_now(p.data->>'who',
      '🕒 You forgot to punch out — your clock was closed at ' || to_char(to_timestamp(cl/1000.0) at time zone 'America/New_York','HH12:MI AM') || '. Tell the office if that is wrong.',
      '🕒 Se olvidó de marcar salida — su reloj se cerró a las ' || to_char(to_timestamp(cl/1000.0) at time zone 'America/New_York','HH12:MI AM') || '. Avise a la oficina si está mal.',
      'warn', jsonb_build_object('tab','punch'), null);
    closed := closed + 1;
  end loop;

  if dow = 6 then update server_config set v = st::text where k = 'clock_state'; if not found then insert into server_config(k,v) values ('clock_state', st::text); end if; return jsonb_build_object('closed', closed); end if;

  -- (3) reminders to people who punch in the app
  for e in select r.id, r.data from records r where r.coll = 'emps' and not r.deleted and coalesce((r.data->>'appClock')::boolean,false)
      and not coalesce((r.data->>'inactive')::boolean,false) and coalesce(r.data->>'clock','') <> 'false' loop
    site := case when coalesce(e.data->>'crew','') <> '' then private.clock_sched_site(e.data->>'crew', d) end;
    sn := (select data->>'name' from records where coll = 'sites' and id = site);
    if hm >= 8*60+5 and hm < 11*60 and not done ? ('in:'||e.id) and (site is not null or coalesce(e.data->>'crew','') = '')
       and not exists (select 1 from records q where q.coll='punches' and not q.deleted and q.data->>'who' = e.id
                       and to_char(to_timestamp(public._num(q.data->>'in')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = d) then
      perform private.notify_now(e.id, '⏰ Time to punch in' || coalesce(' — you are scheduled at ' || sn, '') || '. Open the app and tap the big button.',
        '⏰ Hora de marcar entrada' || coalesce(' — está programado en ' || sn, '') || '. Abra la app y toque el botón grande.', 'info', jsonb_build_object('tab','punch'), null);
      done := done || to_jsonb('in:'||e.id); n := n + 1; end if;
    if hm >= endm + 5 and hm < endm + 120 and not done ? ('out:'||e.id) then
      select r.id, r.data into p from records r where r.coll='punches' and not r.deleted and r.data->>'who' = e.id and coalesce(r.data->'out','null'::jsonb) = 'null'::jsonb
        and r.data->>'voided' is null and to_char(to_timestamp(public._num(r.data->>'in')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = d
        and coalesce(public._num(r.data->>'keepOpen'),0) < nowms limit 1;
      if found then
        perform private.notify_now(e.id, '🏠 Still punched in — if you are done, open the app and punch out. Still working? Tap "Still working".',
          '🏠 Sigue marcando — si terminó, abra la app y marque salida. ¿Sigue trabajando? Toque "Sigo trabajando".', 'info', jsonb_build_object('tab','punch'), null);
        done := done || to_jsonb('out:'||e.id); n := n + 1; end if;
    end if;
  end loop;

  -- (8) lists for Payroll
  if hm >= 8*60+30 and hm < 11*60 and not done ? 'chk_am' then
    select string_agg(r.data->>'name', ', ' order by r.data->>'name') into lst from records r where r.coll='emps' and not r.deleted and coalesce((r.data->>'appClock')::boolean,false)
      and not coalesce((r.data->>'inactive')::boolean,false) and (coalesce(r.data->>'crew','') = '' or private.clock_sched_site(r.data->>'crew', d) is not null)
      and not exists (select 1 from records q where q.coll='punches' and not q.deleted and q.data->>'who' = r.id
                      and to_char(to_timestamp(public._num(q.data->>'in')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = d);
    if lst is not null then for x in select jsonb_array_elements_text(to_ids) loop
      perform private.notify_now(x, '⏰ 8:30 — not punched in yet: ' || lst, '⏰ 8:30 — todavía no marcaron entrada: ' || lst, 'info', jsonb_build_object('tab','hours'), null); end loop; end if;
    done := done || '"chk_am"'::jsonb; end if;
  if hm >= 20*60+55 and not done ? 'chk_pm' then
    select string_agg((select data->>'name' from records where coll='emps' and id = r.data->>'who') || ' (' || to_char(to_timestamp(public._num(r.data->>'in')/1000.0) at time zone 'America/New_York','HH12:MI AM') || ')', ', ') into lst
      from records r where r.coll='punches' and not r.deleted and coalesce(r.data->>'src','') <> 'fingercheck' and coalesce(r.data->'out','null'::jsonb) = 'null'::jsonb
      and r.data->>'voided' is null and public._num(r.data->>'in') >= nowms - 24*3600000;
    if lst is not null then for x in select jsonb_array_elements_text(to_ids) loop
      perform private.notify_now(x, '🌙 Still punched in: ' || lst, '🌙 Siguen marcando: ' || lst, 'info', jsonb_build_object('tab','hours'), null); end loop; end if;
    done := done || '"chk_pm"'::jsonb; end if;
  if hm >= 7*60 and hm < 11*60 and not done ? 'chk_morning' then
    select string_agg((select data->>'name' from records where coll='emps' and id = r.data->>'who') || ' ' || to_char(to_timestamp(public._num(r.data->>'out')/1000.0) at time zone 'America/New_York','Dy HH12:MI AM')
        || case r.data->'autoClosed'->>'how' when 'seen' then ' (last seen on site)' when 'end' then ' (end of day)' else ' (at punch-in — no time seen)' end, ', ') into lst
      from records r where r.coll='punches' and not r.deleted and r.data ? 'autoClosed' and public._num(r.data->'autoClosed'->>'at') >= nowms - (case when dow = 0 then 48 else 24 end)*3600000;
    if lst is not null then for x in select jsonb_array_elements_text(to_ids) loop
      perform private.notify_now(x, '☀️ Closed automatically (forgot to punch out) — please check: ' || lst, '☀️ Cerrados automáticamente (olvidaron marcar salida) — revise: ' || lst, 'warn', jsonb_build_object('tab','hours'), null); end loop; end if;
    done := done || '"chk_morning"'::jsonb; end if;

  st := jsonb_set(st, '{done}', done);
  update server_config set v = st::text where k = 'clock_state'; if not found then insert into server_config(k,v) values ('clock_state', st::text); end if;
  return jsonb_build_object('reminders', n, 'closed', closed);
end $f$;
revoke all on function private.clock_tick(timestamptz), private.clock_sched_site(text,text) from public, anon, authenticated;
