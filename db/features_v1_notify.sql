-- Electrix USA — Features v1, server side of notifications (STAGING first; production only after Baruch approves).
-- Safe to run more than once. Adds, never removes: no existing rule, record or job is changed except on_record_change,
-- which keeps doing exactly what it did and additionally passes the alert id + link to the phone notification.
--
-- What it adds
--  1. Phone notifications carry the alert id and its link, so tapping one opens the exact task / job / note / day.
--  2. Server-side notices for things that used to send nothing:
--       • a crew's schedule for today or tomorrow changed (crew members; people moved to another crew: that person)
--       • a crew's ongoing ("until reassigned") job changed while it applies to today or tomorrow
--       • a late clock entry is waiting for Payroll (Owner + Payroll)
--       • someone became the site manager of a job, or a job moved to another stage (site manager + crew leaders)
--     The person who made the change is never notified about their own change.
--  3. Several quick edits to the same thing become ONE notice (it waits ~30 s for more edits, never longer than 2 min),
--     and a notice the app already sent for the same item is not repeated. Nothing is silently dropped otherwise.
--  Workers only see today + tomorrow of the schedule, so schedule notices are only for those two days (same rule).

create table if not exists private.notify_queue(
  id bigserial primary key,
  to_emp text not null,
  topic text not null,
  msg text not null,
  link jsonb,
  kind text not null default 'info',
  created_at timestamptz not null default now(),
  sent boolean not null default false);
create index if not exists notify_queue_open on private.notify_queue (sent, to_emp, topic);
revoke all on private.notify_queue from public, anon, authenticated;

-- a schedule row's meaning (jobs, times, notes, exceptions) without the save bookkeeping (rev / by / at / ids)
create or replace function private.fv1_sched_sig(d jsonb) returns text language sql immutable as $$
  select case when d is null then '' else
    coalesce((select string_agg(concat_ws('|',a->>'site',a->>'start',a->>'end',a->>'note'),';' order by a->>'start',a->>'site')
              from jsonb_array_elements(case when jsonb_typeof(d->'assignments')='array' then d->'assignments' else '[]'::jsonb end) a where coalesce(a->>'site','')<>''),'')
    || '#' || concat_ws('|', case when jsonb_typeof(d->'assignments')='array' then null else d->>'site' end, case when jsonb_typeof(d->'assignments')='array' then null else d->>'time' end,
                        d->>'from', d->>'to', d->>'workdays', d->>'start', d->>'end', d->>'cancel', d->>'replace', d->>'patch', d->>'emp')
  end $$;

-- "29 Oxford Dr 7:00 AM, 12 Main St" for a schedule row
create or replace function private.fv1_site_list(d jsonb) returns text language sql stable set search_path = public as $$
  select coalesce(string_agg(split_part(coalesce(s.data->>'name','?'),',',1)
           || case when (x->>'start') ~ '^[0-9]+$' then ' ' || to_char(time '00:00' + ((x->>'start')::int || ' minutes')::interval, 'FMHH12:MI AM') else '' end, ', '),'')
  from jsonb_array_elements(case when d is null then '[]'::jsonb
                                 when jsonb_typeof(d->'assignments')='array' then d->'assignments'
                                 when coalesce(d->>'site','')<>'' then jsonb_build_array(jsonb_build_object('site',d->>'site','start',d->>'start'))
                                 else '[]'::jsonb end) x
  left join records s on s.coll='sites' and s.id = x->>'site' and not s.deleted
  where coalesce(x->>'site','')<>'' $$;

-- does an ongoing rule apply to today or tomorrow?
create or replace function private.fv1_rule_near(d jsonb, today date) returns boolean language sql immutable as $$
  select d is not null and coalesce(d->>'site','')<>''
     and coalesce(nullif(d->>'from','')::date, today) <= today + 1
     and coalesce(nullif(d->>'to','')::date, today + 1) >= today $$;

create or replace function private.fv1_queue(to_emp text, topic text, msg text, link jsonb, kind text default 'info')
returns void language sql security definer set search_path = private, public as $$
  insert into private.notify_queue(to_emp, topic, msg, link, kind) select to_emp, topic, msg, link, coalesce(kind,'info') where coalesce(to_emp,'')<>'' $$;
revoke all on function private.fv1_queue(text,text,text,jsonb,text) from public, anon, authenticated;

create or replace function public.fv1_queue_notices() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare author text; o jsonb; n jsonb; k text; crew text; emp text; d date; today date := (now() at time zone 'America/New_York')::date;
        msg text; msg_es text; who text; wlang text; stg text; stg_es text; nm text; sname text; jobs text;
begin
  if new.coll not in ('sched','punches','sites') then return null; end if;
  begin author := public.my_emp(); exception when others then author := null; end;
  o := case when tg_op = 'UPDATE' and not old.deleted then old.data else null end;
  n := case when new.deleted then null else new.data end;

  if new.coll = 'sched' then
    if private.fv1_sched_sig(o) = private.fv1_sched_sig(n) then return null; end if;   -- only bookkeeping changed
    k := new.id;
    if k like 'ONG:%' then
      crew := split_part(k, ':', 2);
      if not (private.fv1_rule_near(o, today) or private.fv1_rule_near(n, today)) then return null; end if;
      d := null;
    elsif k like 'L:%' then
      emp := split_part(substr(k, 3), '|', 1); d := nullif(split_part(k, '|', 2), '')::date;
    else
      crew := split_part(k, '|', 1); d := nullif(split_part(k, '|', 2), '')::date;
    end if;
    if d is not null and (d < today or d > today + 1) then return null; end if;
    -- list the jobs only when this row IS the whole day; an exception to an ongoing job, or a removed day (the ongoing
    -- job may still apply), says "open the app" instead of guessing — a wrong job in a notice is worse than none
    jobs := case when n is null or n ? 'patch' or n ? 'cancel' or n ? 'replace' then null else nullif(private.fv1_site_list(n), '') end;
    msg := '📅 ' || case when d is null then 'Your crew''s ongoing job changed' when d = today then 'Schedule changed for today' else 'Schedule changed for tomorrow' end
           || coalesce(': ' || jobs, ' — open the app to see it');
    msg_es := '📅 ' || case when d is null then 'Cambió el trabajo fijo de tu cuadrilla' when d = today then 'Cambió el horario de hoy' else 'Cambió el horario de mañana' end
           || coalesce(': ' || jobs, ' — abre la app para verlo');
    for who, wlang in
      select r.id, r.data->>'lang' from records r where r.coll = 'emps' and not r.deleted and coalesce((r.data->>'inactive')::boolean, false) = false
        and ((emp is not null and r.id = emp) or (crew is not null and r.data->>'crew' = crew))
    loop
      if who is distinct from author then
        perform private.fv1_queue(who, 'sched:' || coalesce(d::text, 'ong') || ':' || coalesce(crew, emp), case when wlang = 'es' then msg_es else msg end,
                                  jsonb_build_object('sched', coalesce(d, today)::text, 'crew', crew));
      end if;
    end loop;

  elsif new.coll = 'punches' then
    if n is null or not coalesce((n->>'pending')::boolean, false) or not coalesce((n->>'lateEntry')::boolean, false) then return null; end if;
    if o is not null and coalesce((o->>'pending')::boolean, false) and coalesce((o->>'lateEntry')::boolean, false) then return null; end if;
    select data->>'name' into nm from records where coll = 'emps' and id = n->>'who';
    msg := '⏰ Late clock entry from ' || coalesce(nm, 'someone')
           || case when (n->>'in') ~ '^[0-9]+$' then ' (' || to_char(to_timestamp((n->>'in')::bigint / 1000) at time zone 'America/New_York', 'Dy Mon FMDD, FMHH12:MI AM') || ')' else '' end
           || ' — waiting for Payroll approval';
    msg_es := replace(replace(msg, 'Late clock entry from', 'Marca tardía de'), 'waiting for Payroll approval', 'esperando aprobación de nómina');
    for who, wlang in
      select r.id, r.data->>'lang' from records r where r.coll = 'emps' and not r.deleted and coalesce((r.data->>'inactive')::boolean, false) = false
        and (r.data->>'role' = 'owner' or (r.data->>'role' = 'office' and r.data->>'title' = 'Payroll'))
    loop
      if who is distinct from (n->>'who') and who is distinct from author then
        perform private.fv1_queue(who, 'late:' || new.id, case when wlang = 'es' then msg_es else msg end, jsonb_build_object('tab', 'hours'), 'warn');
      end if;
    end loop;

  elsif new.coll = 'sites' then
    if n is null or o is null then return null; end if;
    sname := split_part(coalesce(n->>'name', 'a job'), ',', 1);
    if coalesce(n->>'manager', '') <> '' and n->>'manager' is distinct from o->>'manager' and n->>'manager' is distinct from author then
      select data->>'lang' into wlang from records where coll = 'emps' and id = n->>'manager';
      perform private.fv1_queue(n->>'manager', 'site:' || new.id || ':mgr',
        case when wlang = 'es' then '📁 Ahora eres el encargado de ' else '📁 You are now the site manager for ' end || sname, jsonb_build_object('site', new.id));
    end if;
    if coalesce(n->>'stage', '') is distinct from coalesce(o->>'stage', '') then
      stg := case coalesce(n->>'stage', 'active') when 'upcoming' then 'Upcoming' when 'priced' then 'Upcoming' when 'ready' then 'Confirmed jobs'
                  when 'active' then 'Roughing' when 'inspection' then 'Finishing' when 'done' then 'Complete' else n->>'stage' end;
      stg_es := case stg when 'Upcoming' then 'Próximo' when 'Confirmed jobs' then 'Confirmado' when 'Roughing' then 'Rough' when 'Finishing' then 'Terminación'
                         when 'Complete' then 'Terminado' else stg end;
      for who, wlang in
        select q.x, e.data->>'lang' from (select n->>'manager' as x
                       union select r.id from records r where r.coll = 'emps' and not r.deleted and coalesce(n->>'crew', '') <> ''
                              and r.data->>'crew' = n->>'crew' and coalesce((r.data->>'lead')::boolean, false)
                              and coalesce((r.data->>'inactive')::boolean, false) = false) q
        left join records e on e.coll = 'emps' and e.id = q.x
        where coalesce(q.x, '') <> ''
      loop
        if who is distinct from author then
          perform private.fv1_queue(who, 'site:' || new.id || ':stage',
            '🏗 ' || sname || case when wlang = 'es' then ' — pasó a ' || stg_es else ' — moved to ' || stg end, jsonb_build_object('site', new.id));
        end if;
      end loop;
    end if;
  end if;
  return null;
exception when others then
  raise warning 'fv1_queue_notices: %', sqlerrm;  -- a notice problem must never block saving the change itself
  return null;
end $$;
revoke all on function public.fv1_queue_notices() from public, anon, authenticated;

drop trigger if exists records_fv1_notices on public.records;
create trigger records_fv1_notices after insert or update on public.records
for each row when (new.coll in ('sched','punches','sites'))
execute function public.fv1_queue_notices();

-- sends what is queued: one notice per person per topic (newest wording), after ~30 s without further edits
create or replace function private.fv1_send_notices() returns integer
language plpgsql security definer set search_path = public, private as $$
declare g record; q record; n int := 0; nid text; nowms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  for g in
    select to_emp, topic, max(id) as maxid from private.notify_queue where not sent
    group by to_emp, topic having max(created_at) < now() - interval '30 seconds' or min(created_at) < now() - interval '2 minutes'
  loop
    select * into q from private.notify_queue where id = g.maxid;
    -- the app already told this person about this very item a moment ago → don't say it twice
    if not exists (select 1 from records r where r.coll = 'inbox' and not r.deleted and r.data->>'to' = g.to_emp
                     and r.data->'link' = q.link and coalesce(r.data->>'from', '') <> 'server' and r.updated_at > now() - interval '3 minutes') then
      nid := 'n' || replace(gen_random_uuid()::text, '-', '');
      insert into records (coll, id, data, deleted, updated_by, updated_at)
      values ('inbox', nid, jsonb_build_object('id', nid, 'to', g.to_emp, 'msg', q.msg, 'kind', q.kind, 'ts', nowms, 'read', false, 'link', q.link, 'from', 'server'),
              false, 'server', now());
      n := n + 1;
    end if;
    update private.notify_queue set sent = true where to_emp = g.to_emp and topic = g.topic and id <= g.maxid and not sent;
  end loop;
  delete from private.notify_queue where sent and created_at < now() - interval '7 days';
  return n;
end $$;
revoke all on function private.fv1_send_notices() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'fv1-notices';
select cron.schedule('fv1-notices', '20 seconds', 'select private.fv1_send_notices()');

-- phone notification: same as before, plus the alert id, its link and kind (the phone opens the exact item on tap)
create or replace function public.on_record_change()
 returns trigger language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare base text; secret text;
begin
  if new.deleted or new.coll not in ('inbox','sites') then return new; end if;
  if new.coll = 'inbox' and tg_op <> 'INSERT' then return new; end if;
  if new.coll = 'sites' and (tg_op <> 'UPDATE' or coalesce(new.data->>'stage','') = coalesce(old.data->>'stage','') or coalesce(new.data->>'trello','') = '') then return new; end if;
  select v into base from public.server_config where k = 'functions_url';
  select v into secret from public.server_config where k = 'secret';
  if base is null or secret is null then return new; end if;
  if new.coll = 'inbox' then
    perform net.http_post(url := base || '/notify',
      body := jsonb_build_object('to', new.data->>'to', 'msg', new.data->>'msg', 'id', new.id, 'link', new.data->'link', 'kind', new.data->>'kind'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  else
    perform net.http_post(url := base || '/trello',
      body := jsonb_build_object('card', new.data->>'trello', 'stage', new.data->>'stage', 'phase', new.data->>'phase'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  return new;
end $function$;
