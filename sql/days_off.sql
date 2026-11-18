-- Baruch 11/18: company days off (Settings → Days off; long-press a day on the Schedule). D.daysOff = records coll 'daysOff',
-- id = 'YYYY-MM-DD', data {off:true|false, name}. A day off: no punch-in / pack-up / 6:45 reminders, no Payroll lists, no
-- 8 PM "book tomorrow" message. Only the owner (or all-access) may change them. Yom Tov days are filled in as days off;
-- US holidays are work days until he turns one off.
create or replace function public.guard_daysoff() returns trigger language plpgsql set search_path to 'public' as $f$
declare me jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if coalesce(me->>'role','') = 'owner' or coalesce((me->>'all')::boolean,false) then return new; end if;
  raise exception 'only the owner can change days off' using errcode = '42501';
end $f$;
drop trigger if exists records_guard_daysoff on public.records;
create trigger records_guard_daysoff before insert or update on public.records for each row when (new.coll = 'daysOff') execute function public.guard_daysoff();

create or replace function private.day_off(p_day text) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.records r where r.coll = 'daysOff' and r.id = p_day and not r.deleted and coalesce((r.data->>'off')::boolean,false)) $f$;
revoke all on function private.day_off(text) from public, anon, authenticated;

-- clock_tick: a day off is like Saturday (forgotten punches still close; no reminders, no lists)
do $$
declare d text; old text := $a$if dow = 6 then update server_config$a$;
begin
  d := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('private.day_off(d)' in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'clock_tick: Saturday stop not found'; end if;
  d := replace(d, old, $b$if dow = 6 or private.day_off(d) then update server_config$b$);
  d := replace(d, $b$(case when dow = 0 then 48 else 24 end)$b$, $b$(case when dow = 0 or private.day_off(to_char((p_now at time zone 'America/New_York')::date - 1,'YYYY-MM-DD')) then 48 else 24 end)$b$);
  execute d;
end $$;
-- 6:45 "15 minutes left": not on a day off
do $$
declare d text; old text := $a$if not p_force and coalesce((select v from server_config where k='leave_sent'),'') = td then$a$;
begin
  d := pg_get_functiondef('private.leave_tick(timestamptz,boolean)'::regprocedure);
  if position('private.day_off(td)' in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'leave_tick: sent-today check not found'; end if;
  execute replace(d, old, $b$if not p_force and private.day_off(td) then return jsonb_build_object('skip','day off'); end if;
  $b$ || old);
end $$;

-- Baruch 11/18: 8 PM — if a crew has no job for the next workday, the owner and the site managers get a message.
-- Not on Friday night (Shabbos); Saturday night checks Sunday; not when tomorrow (or today) is a day off.
create or replace function private.book_tomorrow_tick(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare loc timestamp := p_now at time zone 'America/New_York'; td text := to_char(p_now at time zone 'America/New_York','YYYY-MM-DD');
  dow int := extract(dow from (p_now at time zone 'America/New_York'))::int; nk text; lst text; n int := 0; x record; sun boolean;
begin
  if loc::time < time '20:00' or loc::time >= time '20:30' then return jsonb_build_object('skip','not time'); end if;
  if dow = 5 then return jsonb_build_object('skip','Friday night'); end if;
  if private.day_off(td) then return jsonb_build_object('skip','day off today'); end if;
  nk := to_char(loc::date + 1, 'YYYY-MM-DD'); sun := dow = 6;
  if private.day_off(nk) then return jsonb_build_object('skip','tomorrow is a day off'); end if;
  if coalesce((select v from server_config where k = 'book_tomorrow_sent'), '') = td then return jsonb_build_object('skip','sent today'); end if;
  insert into server_config(k,v) values ('book_tomorrow_sent', td) on conflict (k) do update set v = excluded.v;
  select string_agg(c.data->>'name', ', ' order by c.data->>'name') into lst from records c
   where c.coll = 'crews' and not c.deleted
     and exists (select 1 from records e where e.coll = 'emps' and not e.deleted and e.data->>'crew' = c.id and e.data->>'role' = 'worker'
                   and not coalesce((e.data->>'inactive')::boolean,false))
     and not exists (select 1 from records s where s.coll = 'sched' and not s.deleted and s.id = c.id || '|' || nk
                       and not coalesce((s.data->>'cancel')::boolean,false)
                       and (coalesce(s.data->>'site','') <> '' or (jsonb_typeof(s.data->'assignments') = 'array' and jsonb_array_length(s.data->'assignments') > 0)))
     and private.clock_sched_site(c.id, nk) is null;
  if lst is null then return jsonb_build_object('ok','all booked','day',nk); end if;
  for x in select r.id from records r where r.coll = 'emps' and not r.deleted and not coalesce((r.data->>'inactive')::boolean,false)
             and (r.data->>'role' in ('owner','manager') or coalesce((r.data->>'all')::boolean,false)) loop
    perform private.notify_now(x.id, '📅 ' || case when sun then 'Sunday' else 'Tomorrow' end || ': ' || lst || ' — no job yet. Tap to book.',
      '📅 ' || case when sun then 'Domingo' else 'Mañana' end || ': ' || lst || ' — todavía sin trabajo. Toque para reservar.', 'warn', jsonb_build_object('tab','sched','day',nk), null);
    n := n + 1; end loop;
  return jsonb_build_object('sent', n, 'crews', lst, 'day', nk);
end $f$;
revoke all on function private.book_tomorrow_tick(timestamptz) from public, anon, authenticated;
select cron.unschedule('book-tomorrow') where exists (select 1 from cron.job where jobname = 'book-tomorrow');
select cron.schedule('book-tomorrow', '*/10 * * * *', 'select private.book_tomorrow_tick()');

-- Yom Tov days (weekdays) for the next two years — days off
insert into public.records(coll,id,data,deleted,updated_by,updated_at) values
('daysOff','2027-04-22',jsonb_build_object('id','2027-04-22','off',true,'name','Pesach','by','seed'),false,'seed',now()),
('daysOff','2027-04-23',jsonb_build_object('id','2027-04-23','off',true,'name','Pesach','by','seed'),false,'seed',now()),
('daysOff','2027-04-28',jsonb_build_object('id','2027-04-28','off',true,'name','Pesach','by','seed'),false,'seed',now()),
('daysOff','2027-04-29',jsonb_build_object('id','2027-04-29','off',true,'name','Pesach','by','seed'),false,'seed',now()),
('daysOff','2027-06-11',jsonb_build_object('id','2027-06-11','off',true,'name','Shavuos','by','seed'),false,'seed',now()),
('daysOff','2027-10-03',jsonb_build_object('id','2027-10-03','off',true,'name','Rosh Hashanah','by','seed'),false,'seed',now()),
('daysOff','2027-10-11',jsonb_build_object('id','2027-10-11','off',true,'name','Yom Kippur','by','seed'),false,'seed',now()),
('daysOff','2027-10-17',jsonb_build_object('id','2027-10-17','off',true,'name','Sukkos','by','seed'),false,'seed',now()),
('daysOff','2027-10-24',jsonb_build_object('id','2027-10-24','off',true,'name','Simchas Torah','by','seed'),false,'seed',now()),
('daysOff','2028-04-11',jsonb_build_object('id','2028-04-11','off',true,'name','Pesach','by','seed'),false,'seed',now()),
('daysOff','2028-04-12',jsonb_build_object('id','2028-04-12','off',true,'name','Pesach','by','seed'),false,'seed',now()),
('daysOff','2028-04-17',jsonb_build_object('id','2028-04-17','off',true,'name','Pesach','by','seed'),false,'seed',now()),
('daysOff','2028-04-18',jsonb_build_object('id','2028-04-18','off',true,'name','Pesach','by','seed'),false,'seed',now()),
('daysOff','2028-05-31',jsonb_build_object('id','2028-05-31','off',true,'name','Shavuos','by','seed'),false,'seed',now()),
('daysOff','2028-06-01',jsonb_build_object('id','2028-06-01','off',true,'name','Shavuos','by','seed'),false,'seed',now()),
('daysOff','2028-09-21',jsonb_build_object('id','2028-09-21','off',true,'name','Rosh Hashanah','by','seed'),false,'seed',now()),
('daysOff','2028-09-22',jsonb_build_object('id','2028-09-22','off',true,'name','Rosh Hashanah','by','seed'),false,'seed',now()),
('daysOff','2028-10-05',jsonb_build_object('id','2028-10-05','off',true,'name','Sukkos','by','seed'),false,'seed',now()),
('daysOff','2028-10-06',jsonb_build_object('id','2028-10-06','off',true,'name','Sukkos','by','seed'),false,'seed',now()),
('daysOff','2028-10-12',jsonb_build_object('id','2028-10-12','off',true,'name','Shemini Atzeres','by','seed'),false,'seed',now()),
('daysOff','2028-10-13',jsonb_build_object('id','2028-10-13','off',true,'name','Simchas Torah','by','seed'),false,'seed',now())
on conflict (coll,id) do nothing;
