-- F1 (staging first): new features that need the database
--   1. automatic assignment notifications — bell + phone push, in EACH person's own language, made by the server so
--      they also happen when the change was saved offline, from an old phone, or from any screen
--      (tasks, service calls, job crew / site manager, moving someone to a crew, schedule days, individual moves,
--       ongoing jobs). Schedule changes are gathered for ~1 minute so "copy week" sends one message, not seven.
--   2. "Paid monthly — no clock-in": only the Owner or Payroll can turn it on or off.
--   3. Meeting reminders in the person's language.
-- Safe to run more than once. A notification problem never blocks the save itself (errors are only logged).
create schema if not exists private;

create table if not exists private.notify_queue(
  id bigserial primary key,
  to_id text not null, qkey text not null, actor text,
  en text not null, es text not null, sig_before text, sig_after text,
  link jsonb, created timestamptz not null default now(), sent timestamptz);
create index if not exists notify_queue_open on private.notify_queue(created) where sent is null;
revoke all on private.notify_queue from public, anon, authenticated;

create or replace function private.emp_row(p_id text) returns jsonb language sql stable set search_path = public as $$
  select data from public.records where coll = 'emps' and id = p_id and not deleted limit 1 $$;
create or replace function private.short_site(p_id text) returns text language sql stable set search_path = public as $$
  select coalesce(split_part((select data->>'name' from public.records where coll = 'sites' and id = p_id and not deleted limit 1), ',', 1), '') $$;
create or replace function private.crew_name(p_id text) returns text language sql stable set search_path = public as $$
  select coalesce((select data->>'name' from public.records where coll = 'crews' and id = p_id and not deleted limit 1), '') $$;
-- people (or whole crews) → the active people behind them
create or replace function private.expand_people(p jsonb) returns setof text language sql stable set search_path = public as $$
  with ids as (select jsonb_array_elements_text(case jsonb_typeof(p) when 'array' then p when 'string' then jsonb_build_array(p) else '[]'::jsonb end) x)
  select distinct e.id from public.records e join ids on (e.id = ids.x or e.data->>'crew' = ids.x)
   where e.coll = 'emps' and not e.deleted and not coalesce((e.data->>'inactive')::boolean, false) $$;
create or replace function private.min_label(m text) returns text language sql immutable as $$
  select case when m ~ '^[0-9]+$' then to_char(time '00:00' + (m::int % 1440) * interval '1 minute', 'FMHH12:MI AM') else coalesce(m, '') end $$;
create or replace function private.day_label(d date, l text) returns text language sql immutable as $$
  select case when l = 'es'
    then (array['dom','lun','mar','mié','jue','vie','sáb'])[extract(dow from d)::int + 1] || ' ' || extract(day from d)::int || ' '
         || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from d)::int]
    else to_char(d, 'Dy Mon FMDD') end $$;

-- one bell message to one person, in their language; never to the person who made the change
create or replace function private.notify_now(p_to text, p_en text, p_es text, p_kind text, p_link jsonb, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare e jsonb; nid text; msg text; nowms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_to is null or p_to = '' or p_to = coalesce(p_actor, '') then return; end if;
  e := private.emp_row(p_to);
  if e is null or coalesce((e->>'inactive')::boolean, false) then return; end if;
  msg := case when e->>'lang' = 'es' then p_es else p_en end;
  if msg is null or msg = '' then return; end if;
  -- the same message to the same person within 2 minutes (a phone sending the same change twice) → once
  if exists (select 1 from public.records where coll = 'inbox' and not deleted and data->>'to' = p_to and data->>'msg' = msg
              and updated_at > now() - interval '2 minutes') then return; end if;
  nid := 'n' || replace(gen_random_uuid()::text, '-', '');
  insert into public.records (coll, id, data, deleted, updated_by, updated_at)
  values ('inbox', nid, jsonb_build_object('id', nid, 'to', p_to, 'msg', msg, 'kind', coalesce(p_kind, 'info'), 'ts', nowms,
          'read', false, 'link', p_link, 'auto', true), false, 'server', now());
end $$;

-- what a schedule row says (sites + times), to tell a real change from a re-save
create or replace function private.sched_sig(d jsonb) returns text language sql immutable as $$
  select case when d is null or jsonb_typeof(d) <> 'object' or d = '{}'::jsonb then ''
    else coalesce((select string_agg(coalesce(a->>'site','') || '@' || coalesce(a->>'start','') || '-' || coalesce(a->>'end',''), ',' order by (a->>'start'), a->>'site')
                     from jsonb_array_elements(case when jsonb_typeof(d->'assignments') = 'array' then d->'assignments' else '[]'::jsonb end) a
                    where coalesce(a->>'site','') <> ''), coalesce(d->>'site','') || '@' || coalesce(d->>'time',''))
         || '|' || coalesce(d->>'cancel','') || '|' || coalesce(d->>'replace','')
         || '|' || coalesce(d->>'from','') || '|' || coalesce(d->>'to','') || '|' || coalesce(d->>'start','') || '|' || coalesce(d->>'end','')
         || '|' || coalesce(d->>'workdays','') end $$;
-- the jobs of a schedule day, readable: "Oak St 7:00 AM + Pine Rd 12:00 PM"
create or replace function private.sched_text(d jsonb) returns text language sql stable set search_path = public as $$
  select coalesce((select string_agg(nullif(private.short_site(a->>'site'), '') || ' ' || private.min_label(a->>'start'), ' + ' order by case when a->>'start' ~ '^[0-9.]+$' then (a->>'start')::numeric end nulls last)
                     from jsonb_array_elements(case when jsonb_typeof(d->'assignments') = 'array' then d->'assignments' else '[]'::jsonb end) a
                    where coalesce(a->>'site','') <> ''),
                  nullif(private.short_site(d->>'site') || case when coalesce(d->>'time','') <> '' then ' ' || (d->>'time') else '' end, ''), '') $$;

create or replace function public.notify_assign() returns trigger language plpgsql security definer set search_path = public as $$
declare me jsonb; actor text; aname text; n jsonb := new.data; o jsonb := '{}'::jsonb; who text; e jsonb; site text; d text;
        pri boolean; en text; es text; office boolean; isnew boolean; day date; tdy date := (now() at time zone 'America/New_York')::date;
        crew text; sig_o text; sig_n text; txt text; k text;
begin
  if auth.uid() is null then return null; end if;                -- only changes made by people (not restores or the server)
  if new.deleted or jsonb_typeof(n) <> 'object' then return null; end if;
  if tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then o := old.data; end if;
  isnew := o = '{}'::jsonb;
  begin
    me := public.my_emp_data(); actor := me->>'id'; aname := coalesce(nullif(private.emp_row(actor)->>'name', ''), 'Office');

    if new.coll = 'jobs' then
      if coalesce(n->>'status', '') = 'done' then return null; end if;
      pri := coalesce((n->>'pri')::boolean, false); site := private.short_site(n->>'site');
      for who in select x from private.expand_people(n->'to') x except select y from private.expand_people(o->'to') y loop
        e := private.emp_row(who); office := e->>'role' = 'office';
        d := case when coalesce(n->>'descLang', '') = '' or n->>'descLang' = coalesce(e->>'lang', 'en') or coalesce(n->>'descTr', '') = ''
                  then coalesce(n->>'desc', '') else n->>'descTr' end;
        en := case when pri then '🔴 PRIORITY — ' else '' end
              || case when isnew then case when office then 'New task from ' else 'New job from ' end else 'Moved to you by ' end
              || aname || ': ' || case when site <> '' then site || ' — ' else '' end || left(d, 60);
        es := case when pri then '🔴 PRIORIDAD — ' else '' end
              || case when isnew then case when office then 'Nueva tarea de ' else 'Nuevo trabajo de ' end else 'Te lo pasó ' end
              || aname || ': ' || case when site <> '' then site || ' — ' else '' end || left(d, 60);
        perform private.notify_now(who, en, es, case when pri then 'pri' else 'info' end, jsonb_build_object('job', new.id), actor);
      end loop;
      if not isnew then
        for who in select y from private.expand_people(o->'to') y except select x from private.expand_people(n->'to') x loop
          perform private.notify_now(who, 'Taken off your list: ' || case when site <> '' then site || ' — ' else '' end || left(coalesce(n->>'desc', ''), 50),
                                          'Quitado de tu lista: ' || case when site <> '' then site || ' — ' else '' end || left(coalesce(n->>'descTr', n->>'desc', ''), 50),
                                          'info', jsonb_build_object('tab', 'jobs'), actor);
        end loop;
      end if;

    elsif new.coll = 'tickets' then
      if coalesce(n->>'to', '') <> '' and n->>'to' is distinct from o->>'to' and coalesce(n->>'status', '') <> 'done' then
        site := coalesce(nullif(private.short_site(n->>'site'), ''), n->>'addr', '');
        pri := coalesce((n->>'pri')::boolean, false);
        perform private.notify_now(n->>'to',
          case when pri then '🔴 ' else '' end || '🔧 Service call for you: ' || site || ' — ' || left(coalesce(n->>'issue', ''), 50),
          case when pri then '🔴 ' else '' end || '🔧 Llamada de servicio para ti: ' || site || ' — ' || left(coalesce(n->>'issue', ''), 50),
          case when pri then 'pri' else 'info' end, jsonb_build_object('svc', new.id), actor);
      end if;

    elsif new.coll = 'sites' then
      site := split_part(coalesce(n->>'name', ''), ',', 1);
      if coalesce(n->>'crew', '') <> '' and n->>'crew' is distinct from o->>'crew' then
        for who in select x from private.expand_people(jsonb_build_array(n->>'crew')) x loop
          perform private.notify_now(who, '📁 Your crew now has ' || site || ' — plans and files are in the job folder',
                                          '📁 Tu cuadrilla ahora tiene ' || site || ' — los planos y archivos están en la carpeta del trabajo',
                                          'info', jsonb_build_object('site', new.id), actor);
        end loop;
      end if;
      if coalesce(o->>'crew', '') <> '' and n->>'crew' is distinct from o->>'crew' then
        crew := private.crew_name(n->>'crew');
        for who in select x from private.expand_people(jsonb_build_array(o->>'crew')) x except select y from private.expand_people(jsonb_build_array(n->>'crew')) y loop
          perform private.notify_now(who,
            '📁 ' || site || case when crew <> '' then ' moved to ' || crew else ' is no longer with your crew' end,
            '📁 ' || site || case when crew <> '' then ' pasó a ' || crew else ' ya no está con tu cuadrilla' end,
            'info', jsonb_build_object('tab', 'sites'), actor);
        end loop;
      end if;
      if coalesce(n->>'manager', '') <> '' and n->>'manager' is distinct from o->>'manager' then
        perform private.notify_now(n->>'manager', '📁 You are the site manager for ' || site, '📁 Eres el encargado de ' || site,
                                   'info', jsonb_build_object('site', new.id), actor);
      end if;

    elsif new.coll = 'emps' then
      if not isnew and coalesce(n->>'crew', '') <> '' and n->>'crew' is distinct from o->>'crew' then
        crew := private.crew_name(n->>'crew');
        perform private.notify_now(new.id, '👷 You are now on ' || crew || ' (' || aname || ')', '👷 Ahora estás en ' || crew || ' (' || aname || ')',
                                   'info', jsonb_build_object('tab', 'punch'), actor);
      end if;

    elsif new.coll = 'sched' then
      sig_o := private.sched_sig(o); sig_n := private.sched_sig(n);
      if sig_o = sig_n then return null; end if;                      -- re-save / revision bump only
      k := new.id;
      if k ~ '^ONG:' then                                               -- ongoing job: ONG:<crew>:<rule>
        crew := split_part(k, ':', 2);
        if coalesce(n->>'to', '') <> '' and n->>'to' ~ '^\d{4}-\d{2}-\d{2}$' then
          if (n->>'to')::date < tdy then return null; end if;
          en := '♾ Ongoing job at ' || private.short_site(n->>'site') || ' ends after ' || private.day_label((n->>'to')::date, 'en');
          es := '♾ El trabajo fijo en ' || private.short_site(n->>'site') || ' termina después del ' || private.day_label((n->>'to')::date, 'es');
        else
          day := case when coalesce(n->>'from', '') ~ '^\d{4}-\d{2}-\d{2}$' then greatest((n->>'from')::date, tdy) else tdy end;
          en := '♾ Every working day from ' || private.day_label(day, 'en') || ': ' || private.short_site(n->>'site') || ' ' || private.min_label(n->>'start');
          es := '♾ Cada día laboral desde ' || private.day_label(day, 'es') || ': ' || private.short_site(n->>'site') || ' ' || private.min_label(n->>'start');
        end if;
        for who in select x from private.expand_people(jsonb_build_array(crew)) x loop
          if who <> coalesce(actor, '') then
            insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
            values (who, k, actor, en, es, sig_o, sig_n, jsonb_build_object('tab', 'sched'));
          end if;
        end loop;
        return null;
      end if;
      if split_part(k, '|', 2) !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
      day := split_part(k, '|', 2)::date;
      if day < tdy or day > tdy + 21 then return null; end if;          -- past days and far future: no message
      txt := private.sched_text(n);
      if k ~ '^L:' then                                                 -- one person moved for a day: L:<person>|<day>
        who := substr(split_part(k, '|', 1), 3);
        en := private.day_label(day, 'en') || ': ' || case when txt <> '' then 'you are moved to ' || txt else 'your move was cancelled — you are back with your crew' end;
        es := private.day_label(day, 'es') || ': ' || case when txt <> '' then 'te mueven a ' || txt else 'se canceló tu cambio — vuelves con tu cuadrilla' end;
        if who <> coalesce(actor, '') then
          insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
          values (who, k, actor, en, es, sig_o, sig_n, jsonb_build_object('tab', 'sched'));
        end if;
      else                                                              -- a crew's day: <crew>|<day>
        crew := split_part(k, '|', 1);
        en := private.day_label(day, 'en') || ': ' || case when txt <> '' then txt
                when coalesce(n->>'cancel', '') <> '' or coalesce(n->>'replace', '') <> '' then 'changed — open the schedule'
                else 'no job scheduled for your crew' end;
        es := private.day_label(day, 'es') || ': ' || case when txt <> '' then txt
                when coalesce(n->>'cancel', '') <> '' or coalesce(n->>'replace', '') <> '' then 'cambió — abre el horario'
                else 'sin trabajo programado para tu cuadrilla' end;
        for who in select x from private.expand_people(jsonb_build_array(crew)) x loop
          if who <> coalesce(actor, '') then
            insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
            values (who, k, actor, en, es, sig_o, sig_n, jsonb_build_object('tab', 'sched'));
          end if;
        end loop;
      end if;
    end if;
  exception when others then
    raise warning 'notify_assign % %: %', new.coll, new.id, sqlerrm;      -- the save itself always goes through
  end;
  return null;
end $$;

create or replace trigger records_zz_notify_assign after insert or update on public.records
  for each row when (new.coll in ('jobs', 'tickets', 'sites', 'emps', 'sched')) execute function public.notify_assign();

-- every minute: schedule changes that have been quiet for 40 s go out, one message per person
create or replace function public.notify_flush() returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; parts_en text; parts_es text; cnt int; ids bigint[];
begin
  for r in
    select to_id from private.notify_queue where sent is null group by to_id having max(created) < now() - interval '40 seconds'
  loop
    with q as (select * from private.notify_queue where sent is null and to_id = r.to_id),
         firsts as (select distinct on (qkey) qkey, sig_before from q order by qkey, created, id),
         lasts as (select distinct on (qkey) qkey, en, es, sig_after, created from q order by qkey, created desc, id desc),
         chg as (select l.* from lasts l join firsts f using (qkey) where coalesce(f.sig_before, '') is distinct from coalesce(l.sig_after, ''))
    select count(*), string_agg(en, ' · ' order by qkey), string_agg(es, ' · ' order by qkey), (select array_agg(id) from q)
      into cnt, parts_en, parts_es, ids from chg;
    if ids is null then select array_agg(id) into ids from private.notify_queue where sent is null and to_id = r.to_id; end if;
    if cnt = 1 then
      perform private.notify_now(r.to_id, '📅 Schedule · ' || parts_en, '📅 Horario · ' || parts_es, 'info', jsonb_build_object('tab', 'sched'), null);
      n := n + 1;
    elsif cnt > 1 then
      perform private.notify_now(r.to_id, left('📅 Your schedule changed (' || cnt || '): ' || parts_en, 400),
                                          left('📅 Tu horario cambió (' || cnt || '): ' || parts_es, 400), 'info', jsonb_build_object('tab', 'sched'), null);
      n := n + 1;
    end if;
    update private.notify_queue set sent = now() where id = any(ids);
  end loop;
  return n;
end $$;
revoke all on function public.notify_flush() from public, anon, authenticated;
revoke all on function public.notify_assign() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'assign-notify') then perform cron.unschedule('assign-notify'); end if;
  perform cron.schedule('assign-notify', '* * * * *', 'select public.notify_flush()');
end $$;

-- 2. "Paid monthly — no clock-in": only the Owner or Payroll can change it. Anyone else's save keeps the old value
--    (so a manager editing a phone number from an older copy never turns it off by accident).
create or replace function public.guard_emp_pay() returns trigger language plpgsql set search_path = public as $$
declare me jsonb; oldv jsonb;
begin
  if current_user not in ('authenticated', 'anon') or auth.uid() is null then return new; end if;
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  oldv := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data->'payMonthly' end;
  if coalesce(new.data->'payMonthly', 'false'::jsonb) = coalesce(oldv, 'false'::jsonb) then return new; end if;
  me := public.my_emp_data();
  if me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll') then return new; end if;
  new.data := (new.data - 'payMonthly') || case when oldv is not null then jsonb_build_object('payMonthly', oldv) else '{}'::jsonb end;
  return new;
end $$;
create or replace trigger records_guard_emppay before insert or update on public.records
  for each row when (new.coll = 'emps') execute function public.guard_emp_pay();

-- 3. meeting reminders in each person's language
create or replace function public.meeting_reminders()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare m record; who text; n int := 0; nowms bigint := (extract(epoch from now())*1000)::bigint; tm text; mins int; msg text; nid text;
begin
  for m in
    select r.id, r.data, s.data->>'name' as site
    from records r left join records s on s.coll='sites' and s.id = r.data->>'site' and not s.deleted
    where r.coll='meets' and not r.deleted
      and (r.data->>'at') ~ '^[0-9]+$'
      and (r.data->>'at')::bigint > nowms
      and (r.data->>'at')::bigint <= nowms + 15*60*1000
      and coalesce(r.data->>'ping15','') <> (r.data->>'at')
  loop
    tm := to_char(to_timestamp((m.data->>'at')::bigint/1000) at time zone 'America/New_York', 'FMHH12:MI AM');
    mins := greatest(1, round(((m.data->>'at')::bigint - nowms)/60000.0))::int;
    for who in
      select distinct x from (
        select m.data->>'by' as x
        union select jsonb_array_elements_text(m.data->'with') where jsonb_typeof(m.data->'with') = 'array'
        union select id from records where not (m.data ? 'with') and coll='emps' and not deleted and data->>'role'='owner' and coalesce((data->>'inactive')::boolean,false)=false
      ) q where x is not null and x <> ''
    loop
      msg := '⏰ ' || tm || case when coalesce(private.emp_row(who)->>'lang','') = 'es' then ' (en ' || mins || ' min): ' || coalesce(m.data->>'title','Reunión')
                                  else ' (in ' || mins || ' min): ' || coalesce(m.data->>'title','Meeting') end || coalesce(' — ' || m.site, '');
      nid := 'n' || replace(gen_random_uuid()::text,'-','');
      insert into records (coll,id,data,deleted,updated_by,updated_at)
      values ('inbox', nid, jsonb_build_object('id',nid,'to',who,'msg',msg,'kind','info','ts',nowms,'read',false,'link',jsonb_build_object('tab','cal')), false, 'server', now());
      n := n + 1;
    end loop;
    update records set data = data || jsonb_build_object('ping15', m.data->>'at'), updated_at = now() where coll='meets' and id = m.id;
  end loop;
  return n;
end $function$;
