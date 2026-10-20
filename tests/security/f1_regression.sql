-- Regression tests for db/audit_f1_features.sql: automatic assignment notifications (in each person's language),
-- schedule-change messages gathered per person, "Paid monthly" switch (Owner/Payroll only), meeting reminders in Spanish.
-- Staging database, one transaction, rolled back: nothing is kept. Every row must say PASS (run 2026-10-20: see evidence).
-- Test people: u1 owner, u2 manager, u3 office, u4 Payroll, u6 crew-1 leader (es), u7 crew-1 (es), u8 crew-2 (en),
-- u9 crew-2 lead (en, no login), u10 crew-1 inactive, u11 crew-1 (en, no login).
begin;
create temp table _t(n serial, who text, test text, ok boolean, detail text) on commit drop;
grant all on _t to authenticated; grant usage on sequence _t_n_seq to authenticated;
create temp table _pre on commit drop as select id from public.records where coll = 'inbox';
grant select on _pre to authenticated;
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id=u),'role','authenticated')::text, true); end $$;
create or replace function pg_temp.t(who text, test text, q text, want text, chk text default null) returns void language plpgsql as $$
declare got text := 'ok'; v boolean := true;
begin
  perform pg_temp.as_user(who);
  begin execute 'set local role authenticated'; execute q; exception when others then got := 'refused ' || left(sqlerrm,70); end;
  execute 'reset role';
  if chk is not null then execute 'select coalesce(('||chk||'),false)' into v; end if;
  insert into _t(who, test, ok, detail) values (who, test, ((want = 'ok') = (got = 'ok')) and v, got || case when v then '' else ' (check failed)' end);
end $$;
-- new bell messages for a person whose text matches a pattern
create or replace function pg_temp.inb(p_to text, pat text) returns int language sql as $$
  select count(*)::int from public.records r where r.coll = 'inbox' and not r.deleted and r.data->>'to' = p_to and r.data->>'msg' like pat
     and r.id not in (select id from _pre) $$;
create or replace function pg_temp.newinb(p_to text) returns int language sql as $$
  select count(*)::int from public.records r where r.coll = 'inbox' and r.data->>'to' = p_to and r.id not in (select id from _pre) $$;
create or replace function pg_temp.check(test text, ok boolean, detail text default '') returns void language sql as $$
  insert into _t(who, test, ok, detail) values ('db', test, coalesce(ok,false), coalesce(detail,'')) $$;
create or replace function pg_temp.age_queue() returns void language sql as $$
  update private.notify_queue set created = created - interval '2 minutes' where sent is null $$;

do $s$ declare d1 text := to_char((now() at time zone 'America/New_York')::date + 2, 'YYYY-MM-DD');
                d2 text := to_char((now() at time zone 'America/New_York')::date + 3, 'YYYY-MM-DD');
                d3 text := to_char((now() at time zone 'America/New_York')::date + 4, 'YYYY-MM-DD');
                dp text := to_char((now() at time zone 'America/New_York')::date - 3, 'YYYY-MM-DD');
                n0 int;
begin
  -- TASKS
  perform pg_temp.t('u2','manager gives a new job to a Spanish-speaking worker: he gets it in Spanish, with the Spanish text of the job',
    $q$insert into public.records(coll,id,data,deleted) values('jobs','zzJ1','{"id":"zzJ1","to":["u7"],"from":"u2","site":"s1","desc":"Pull wire kitchen","descLang":"en","descTr":"Jalar cable cocina","status":"open","pri":false}',false)$q$, 'ok',
    $c$pg_temp.inb('u7','Nuevo trabajo de Mark Manager (TEST): % — Jalar cable cocina')=1 and (select data->'link'->>'job' from public.records where coll='inbox' and data->>'to'='u7' and id not in (select id from _pre) limit 1)='zzJ1'$c$);
  perform pg_temp.t('u2','the person who made the job gets nothing', $q$select 1$q$, 'ok', $c$pg_temp.newinb('u2')=0$c$);
  perform pg_temp.t('u2','job for a whole crew: every active person in it is told, in English',
    $q$insert into public.records(coll,id,data,deleted) values('jobs','zzJ2','{"id":"zzJ2","to":["c2"],"from":"u2","site":"s2","desc":"Trim out unit 4","status":"open"}',false)$q$, 'ok',
    $c$pg_temp.inb('u8','New job from Mark Manager (TEST): % — Trim out unit 4')=1 and pg_temp.inb('u9','New job from %Trim out unit 4')=1$c$);
  perform pg_temp.t('u2','job moved from one worker to another: the new one is told, the old one is told it was taken off',
    $q$update public.records set data = data || '{"to":["u8"]}' where coll='jobs' and id='zzJ1'$q$, 'ok',
    $c$pg_temp.inb('u8','Moved to you by Mark Manager (TEST): %Pull wire kitchen')=1 and pg_temp.inb('u7','Quitado de tu lista: %')=1$c$);
  select pg_temp.newinb('u8') into n0;
  perform pg_temp.t('u2','saving the same job again (no new person) sends nothing',
    $q$update public.records set data = data || '{"due":"Today"}' where coll='jobs' and id='zzJ1'$q$, 'ok', format('pg_temp.newinb(''u8'')=%s', n0));
  perform pg_temp.t('u8','a worker''s own reminder job for himself sends nothing',
    $q$insert into public.records(coll,id,data,deleted) values('jobs','zzJ3','{"id":"zzJ3","to":["u8"],"from":"u8","site":"s2","desc":"buy tape","status":"open"}',false)$q$, 'ok', format('pg_temp.newinb(''u8'')=%s', n0));
  perform pg_temp.t('u1','owner sends a task to the office: it says "New task", not "New job"',
    $q$insert into public.records(coll,id,data,deleted) values('jobs','zzJ4','{"id":"zzJ4","to":["u3"],"from":"u1","desc":"Call the inspector","status":"open"}',false)$q$, 'ok',
    $c$pg_temp.inb('u3','New task from Olivia Owner (TEST): Call the inspector')=1$c$);
  perform pg_temp.t('u1','priority job: marked priority in the bell (and on the phone)',
    $q$insert into public.records(coll,id,data,deleted) values('jobs','zzJ5','{"id":"zzJ5","to":["u6"],"from":"u1","site":"s1","desc":"No power","descLang":"en","status":"open","pri":true}',false)$q$, 'ok',
    $c$pg_temp.inb('u6','🔴 PRIORIDAD — Nuevo trabajo de Olivia Owner (TEST): %No power')=1 and (select data->>'kind' from public.records where coll='inbox' and data->>'to'='u6' and id not in (select id from _pre) limit 1)='pri'$c$);
  perform pg_temp.t('u2','a finished job given to someone sends nothing',
    $q$insert into public.records(coll,id,data,deleted) values('jobs','zzJ6','{"id":"zzJ6","to":["u11"],"from":"u2","desc":"old","status":"done"}',false)$q$, 'ok', $c$pg_temp.newinb('u11')=0$c$);
  -- SERVICE CALLS
  perform pg_temp.t('u1','service call assigned to a worker: he is told',
    $q$insert into public.records(coll,id,data,deleted) values('tickets','zzK1','{"id":"zzK1","to":"u8","addr":"5 Elm St","issue":"GFI tripping","status":"scheduled"}',false)$q$, 'ok',
    $c$pg_temp.inb('u8','🔧 Service call for you: 5 Elm St — GFI tripping')=1$c$);
  -- JOB FOLDERS: crew and site manager
  perform pg_temp.t('u1','job site given to another crew: new crew told, old crew told (Spanish speakers in Spanish), turned-off people not told',
    $q$update public.records set data = data || '{"crew":"c2"}' where coll='sites' and id='s1'$q$, 'ok',
    $c$pg_temp.inb('u8','📁 Your crew now has %')=1 and pg_temp.inb('u7','📁 % pasó a %')=1 and pg_temp.inb('u11','📁 % moved to %')=1 and pg_temp.newinb('u10')=0$c$);
  perform pg_temp.t('u1','new site manager is told', $q$update public.records set data = data || '{"manager":"u3"}' where coll='sites' and id='s3'$q$, 'ok',
    $c$pg_temp.inb('u3','📁 You are the site manager for %')=1$c$);
  -- MOVING SOMEONE TO A CREW
  perform pg_temp.t('u1','worker moved to another crew is told', $q$update public.records set data = data || '{"crew":"c1"}' where coll='emps' and id='u8'$q$, 'ok',
    $c$pg_temp.inb('u8','👷 You are now on % (Olivia Owner (TEST))')=1$c$);
  perform pg_temp.t('u1','(put him back)', $q$update public.records set data = data || '{"crew":"c2"}' where coll='emps' and id='u8'$q$, 'ok');
  -- SCHEDULE
  perform pg_temp.t('u2','crew day scheduled: each person gets ONE message after a minute, in their language',
    format($q$insert into public.records(coll,id,data,deleted) values('sched','c1|%s',jsonb_build_object('site','s1','time','7:00 AM','assignments',jsonb_build_array(jsonb_build_object('id','x1','site','s1','start',420,'end',900,'note',''))),false)
             on conflict (coll,id) do update set data = excluded.data, deleted = false$q$, d1), 'ok',
    $c$(select count(*) from private.notify_queue where sent is null and qkey like 'c1|%' and to_id in ('u6','u7','u11'))=3 and (select count(*) from private.notify_queue where sent is null and to_id='u2')=0$c$);
  perform pg_temp.t('u2','saving the same day again without a change adds nothing',
    format($q$update public.records set data = data || '{"rev":7}' where coll='sched' and id='c1|%s'$q$, d1), 'ok',
    $c$(select count(*) from private.notify_queue where sent is null and qkey like 'c1|%' and to_id='u7')=1$c$);
  perform pg_temp.t('u2','a day in the past sends nothing',
    format($q$insert into public.records(coll,id,data,deleted) values('sched','c2|%s','{"site":"s2","time":"7:00 AM"}',false) on conflict (coll,id) do update set data = excluded.data, deleted = false$q$, dp), 'ok',
    format($c$(select count(*) from private.notify_queue where sent is null and qkey='c2|%s')=0$c$, dp));
  perform pg_temp.t('u1','copy to 3 days for crew 2: gathered into one message per person',
    format($q$insert into public.records(coll,id,data,deleted) values('sched','c2|%s','{"site":"s2","time":"7:00 AM","rev":99}',false),('sched','c2|%s','{"site":"s2","time":"7:00 AM","rev":99}',false),('sched','c2|%s','{"site":"s3","time":"8:00 AM","rev":99}',false)
             on conflict (coll,id) do update set data = excluded.data, deleted = false$q$, d1, d2, d3), 'ok');
  perform pg_temp.t('u2','one person moved to another job for a day: he is told',
    format($q$insert into public.records(coll,id,data,deleted) values('sched','L:u7|%s',jsonb_build_object('emp','u7','assignments',jsonb_build_array(jsonb_build_object('id','l9','site','s2','start',720,'end',960,'note','help'))),false)
             on conflict (coll,id) do update set data = excluded.data, deleted = false$q$, d2), 'ok');
  perform pg_temp.t('u2','ongoing job set for crew 1',
    format($q$insert into public.records(coll,id,data,deleted) values('sched','ONG:c1:zz1',jsonb_build_object('from','%s','to',null,'site','s3','start',420,'end',930,'workdays','[1,2,3,4,5]'::jsonb),false)$q$, d1), 'ok');
  perform pg_temp.age_queue();
  perform public.notify_flush();
  perform pg_temp.check('Spanish crew member gets one schedule message for the two crew changes, in Spanish',
    pg_temp.inb('u7','📅 Tu horario cambió (3): %')=1 and pg_temp.inb('u7','%te mueven a %')=1 and pg_temp.inb('u7','%Cada día laboral desde %')=1,
    (select string_agg(data->>'msg',' || ') from public.records where coll='inbox' and data->>'to'='u7' and data->>'msg' like '📅%' and id not in (select id from _pre)));
  perform pg_temp.check('English crew-2 member: one message listing the 3 days',
    pg_temp.inb('u8','📅 Your schedule changed (3): %')=1 and pg_temp.inb('u8','📅%')=1,
    (select string_agg(data->>'msg',' || ') from public.records where coll='inbox' and data->>'to'='u8' and data->>'msg' like '📅%' and id not in (select id from _pre)));
  perform pg_temp.check('nothing for the person who changed the schedule, nothing left waiting',
    pg_temp.inb('u2','📅%')=0 and (select count(*) from private.notify_queue where sent is null)=0);
  perform pg_temp.check('the message opens the schedule', (select bool_and(data->'link'->>'tab'='sched') from public.records where coll='inbox' and data->>'msg' like '📅%' and id not in (select id from _pre)));
  -- a day changed and changed back within the minute: nothing about it is sent
  perform pg_temp.t('u2','change a crew-1 day to another job…', format($q$update public.records set data = jsonb_build_object('rev',100,'site','s2','time','7:00 AM','assignments',jsonb_build_array(jsonb_build_object('id','x1','site','s2','start',420,'end',900,'note',''))) where coll='sched' and id='c1|%s'$q$, d1), 'ok');
  perform pg_temp.t('u2','…and back again', format($q$update public.records set data = jsonb_build_object('rev',101,'site','s1','time','7:00 AM','assignments',jsonb_build_array(jsonb_build_object('id','x1','site','s1','start',420,'end',900,'note',''))) where coll='sched' and id='c1|%s'$q$, d1), 'ok');
  perform pg_temp.age_queue();
  perform public.notify_flush();
  perform pg_temp.check('changed and changed back: no extra message', pg_temp.inb('u7','📅%')=1 and (select count(*) from private.notify_queue where sent is null)=0);

  -- TIME CLOCK YES/NO (B6): only Owner, all-access or Payroll
  perform pg_temp.t('u2','a manager cannot switch someone''s time clock off (his change is ignored, the rest of his edit saves)',
    $q$update public.records set data = data || '{"clock":false,"phone":"555-7777"}' where coll='emps' and id='u11'$q$, 'ok',
    $c$(select data->'clock' is null and data->>'phone'='555-7777' from public.records where coll='emps' and id='u11')$c$);
  perform pg_temp.t('u3','office (not Payroll) cannot either', $q$update public.records set data = data || '{"clock":false}' where coll='emps' and id='u11'$q$, 'refused',
    $c$(select data->'clock' is null from public.records where coll='emps' and id='u11')$c$);
  perform pg_temp.t('u4','Payroll switches it off (Time clock: NO)', $q$update public.records set data = data || '{"clock":false}' where coll='emps' and id='u11'$q$, 'ok',
    $c$(select data->>'clock'='false' from public.records where coll='emps' and id='u11')$c$);
  perform pg_temp.t('u2','manager saves an older copy without it: it stays NO',
    $q$update public.records set data = (data - 'clock') || '{"phone":"555-8888"}' where coll='emps' and id='u11'$q$, 'ok',
    $c$(select data->>'clock'='false' and data->>'phone'='555-8888' from public.records where coll='emps' and id='u11')$c$);
  perform pg_temp.t('u1','owner switches it back on', $q$update public.records set data = data || '{"clock":true}' where coll='emps' and id='u11'$q$, 'ok',
    $c$(select data->>'clock'='true' from public.records where coll='emps' and id='u11')$c$);
  -- schedule notices never name a guessed job (B6)
  perform pg_temp.t('u2','an exception day (ongoing job changed for one day) says "open the app", no job named',
    format($q$insert into public.records(coll,id,data,deleted) values('sched','c2|%s','{"rev":200,"site":"s2","time":"7:00 AM","replace":{"ONG":{"site":"s3"}}}',false) on conflict (coll,id) do update set data = excluded.data, deleted = false$q$, d3), 'ok');
  perform pg_temp.t('u2','a removed day says "schedule changed", not "no job"',
    format($q$update public.records set deleted = true, data = '{}' where coll='sched' and id='c1|%s'$q$, d1), 'ok');
  perform pg_temp.age_queue();
  perform public.notify_flush();
  perform pg_temp.check('… both messages say the schedule changed and to open the app, never a guessed job',
    pg_temp.inb('u8','%' || 'schedule changed — open the app' || '%')=1 and pg_temp.inb('u7','%el horario cambió — abre la app%')=1
    and pg_temp.inb('u8','%300 Demo Blvd 8:00%')=1,
    (select string_agg(data->>'to'||': '||(data->>'msg'),' || ') from public.records where coll='inbox' and data->>'msg' like '📅%' and id not in (select id from _pre)));
  perform pg_temp.t('u1','meeting in 10 minutes', format($q$insert into public.records(coll,id,data,deleted) values('meets','zzM1',jsonb_build_object('title','Walk','by','u1','with',jsonb_build_array('u7','u8'),'at',%s),false)$q$,
    ((extract(epoch from now())+600)*1000)::bigint), 'ok');
end $s$;
select public.meeting_reminders();
select pg_temp.check('meeting reminder: Spanish speaker reads "en 10 min", English speaker "in 10 min"',
  pg_temp.inb('u7','⏰ % (en 10 min): Walk')=1 and pg_temp.inb('u8','⏰ % (in 10 min): Walk')=1);
select n, case when ok then 'PASS' else 'FAIL' end res, who, test, detail from _t order by n;
rollback;
