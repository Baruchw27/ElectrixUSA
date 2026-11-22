-- Baruch 11/22 — schedule fixes 1–5 (server only, no screen changes)
-- 1  "15 minutes left" (men not on the app clock) uses each man's real go-home time, like the pack-up message
-- 2  "Every workday" with a go-home time: man_sched_end follows the rule's end (pack-up, auto clock-out, tracker)
-- 3  a cleared day (cancel:["ONG"]) no longer breaks the 8 PM "no job tomorrow" and the 15-minute checks
-- 4  schedule messages say until when ("· till 5:00 PM")
-- 5  a cleared day says "no job booked for your crew"; "Every workday" sends one line, not three

-- ── 2 ── go-home time: his move → the crew's day → the crew's "every workday" rule → normal end
create or replace function private.man_sched_end(p_emp text, p_crew text, p_day text)
 returns integer language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(
    (select max((a->>'end')::numeric)::int from public.records l, jsonb_array_elements(case when jsonb_typeof(l.data->'assignments')='array' then l.data->'assignments' else '[]'::jsonb end) a
      where l.coll='sched' and not l.deleted and l.id = 'L:' || p_emp || '|' || p_day and coalesce(a->>'site','') <> '' and a->>'home' = 'true' and a->>'end' ~ '^[0-9.]+$'),
    (select max((a->>'end')::numeric)::int from public.records r, jsonb_array_elements(case when jsonb_typeof(r.data->'assignments')='array' then r.data->'assignments' else '[]'::jsonb end) a
      where r.coll='sched' and not r.deleted and r.id = p_crew || '|' || p_day and coalesce(a->>'site','') <> '' and a->>'home' = 'true' and a->>'end' ~ '^[0-9.]+$'
        and not exists (select 1 from public.records l where l.coll='sched' and not l.deleted and l.id = 'L:' || p_emp || '|' || p_day)),
    -- Baruch 11/22: the crew's "every workday" rule with its own go-home time (e.g. Mon–Fri till 5:00), on days with no booking of their own
    (select case when public._num(o.data->>'end') is not null and public._num(o.data->>'end')::int <> 1140 then public._num(o.data->>'end')::int end
       from public.records o
      where coalesce(p_crew,'') <> '' and o.coll = 'sched' and not o.deleted and o.id like 'ONG:' || p_crew || ':%'
        and coalesce(o.data->>'from','0000-00-00') <= p_day and (o.data->>'to' is null or o.data->>'to' >= p_day)
        and (jsonb_typeof(o.data->'workdays') <> 'array' or (o.data->'workdays') @> to_jsonb(extract(dow from p_day::date)::int))
        and not exists (select 1 from public.records l where l.coll='sched' and not l.deleted and l.id = 'L:' || p_emp || '|' || p_day)
        and not exists (select 1 from public.records r where r.coll='sched' and not r.deleted and r.id = p_crew || '|' || p_day
                          and (not (r.data ? 'patch' or r.data ? 'cancel' or r.data ? 'replace') or coalesce(r.data->'cancel','[]'::jsonb) @> '["ONG"]'::jsonb or r.data->'replace' ? 'ONG'))
      order by o.data->>'from' desc limit 1),
    case when extract(dow from p_day::date) = 5 then 13*60+15 else 19*60 end) $function$;

-- ── 1 + 3 ── "15 minutes left" for men NOT on the app clock: each man at his own go-home time, once a day
-- who is due now (also used to check it without sending anything)
create or replace function private.leave_due(p_now timestamp with time zone default now(), p_force boolean default false)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare loc timestamp := p_now at time zone 'America/New_York'; td text := to_char(loc,'YYYY-MM-DD');
        hm int := extract(hour from loc)::int*60 + extract(minute from loc)::int; st jsonb; done jsonb := '[]'::jsonb; r record; endm int; v_due jsonb := '[]'::jsonb;
begin
  if not p_force and private.day_off(td) then return v_due; end if;
  select v::jsonb into st from server_config where k = 'leave_state';
  if st is not null and st->>'day' = td then done := coalesce(st->'done','[]'::jsonb); end if;
  for r in select e.id, e.data->>'crew' crew from records e
           where e.coll='emps' and not e.deleted and e.data->>'role'='worker' and not coalesce((e.data->>'inactive')::boolean,false)
             and coalesce(e.data->>'crew','') <> ''
             /* men on the app clock get "Pack up" from clock_tick instead (no double message) */
             and not (coalesce((e.data->>'appClock')::boolean,false) and coalesce(e.data->>'clock','') <> 'false')
             /* told to stay late today → no reminder */
             and not private.kept_late(e.id, td)
             /* Baruch 11/22: booked today — his move, the crew's day or its every-workday rule (a cleared day counts as not booked) */
             and private.man_sched_site(e.id, e.data->>'crew', td) is not null loop
    endm := private.man_sched_end(r.id, r.crew, td);
    if not p_force and (hm < endm - 15 or hm >= endm - 5 or done ? r.id) then continue; end if;
    v_due := v_due || jsonb_build_object('who', r.id, 'end', to_char(time '00:00' + (endm % 1440) * interval '1 minute', 'FMHH12:MI AM'));
  end loop;
  return v_due;
end $function$;

create or replace function private.leave_tick(p_now timestamp with time zone default now(), p_force boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
-- Baruch 11/22: each man gets "15 minutes left" 15 minutes before HIS go-home time (it used to be one fixed time for everyone)
declare td text := to_char(p_now at time zone 'America/New_York','YYYY-MM-DD'); st jsonb; done jsonb; x jsonb; n int := 0;
begin
  select v::jsonb into st from server_config where k = 'leave_state';
  if st is null or st->>'day' is distinct from td then st := jsonb_build_object('day', td, 'done', '[]'::jsonb); end if;
  done := st->'done';
  for x in select jsonb_array_elements(private.leave_due(p_now, p_force)) loop
    perform private.notify_now(x->>'who', '⏰ 15 minutes left — we finish at '||(x->>'end')||'. Clean up and pack the tools.',
                                          '⏰ Quedan 15 minutos — salimos a las '||(x->>'end')||'. Limpien y guarden las herramientas.', 'info', jsonb_build_object('tab','home'), null);
    done := done || to_jsonb(x->>'who'); n := n + 1;
  end loop;
  if not p_force and n > 0 then
    insert into server_config(k,v) values ('leave_state', jsonb_set(st, '{done}', done)::text) on conflict (k) do update set v = excluded.v;
  end if;
  return jsonb_build_object('sent', n, 'day', td);
end $function$;

-- ── 3 ── 8 PM "no job tomorrow": a cleared day (cancel is a list, not true/false) must not stop it
create or replace function private.book_tomorrow_tick(p_now timestamp with time zone default now())
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare loc timestamp := p_now at time zone 'America/New_York'; td text := to_char(p_now at time zone 'America/New_York','YYYY-MM-DD');
  dow int := extract(dow from (p_now at time zone 'America/New_York'))::int; nk text; lst text; n int := 0; x record; sun boolean;
begin
  if loc::time < time '20:00' or loc::time >= time '20:30' then return jsonb_build_object('skip','not time'); end if;
  if dow in (5,6) then return jsonb_build_object('skip','Friday / Saturday night'); end if;
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
                       and not coalesce(case when jsonb_typeof(s.data->'cancel') = 'boolean' then (s.data->>'cancel')::boolean end, false)   -- Baruch 11/22: cancel can be a list
                       and (coalesce(s.data->>'site','') <> '' or (jsonb_typeof(s.data->'assignments') = 'array' and jsonb_array_length(s.data->'assignments') > 0)))
     and private.man_sched_site('', c.id, nk) is null   -- the crew's day, a cleared day, or its every-workday rule
     and not exists (select 1 from records e2 where e2.coll='emps' and not e2.deleted and e2.data->>'crew' = c.id
                       and private.man_sched_site(e2.id, null, nk) is not null);   -- men booked one by one
  if lst is null then return jsonb_build_object('ok','all booked','day',nk); end if;
  for x in select r.id from records r where r.coll = 'emps' and not r.deleted and not coalesce((r.data->>'inactive')::boolean,false)
             and (r.data->>'role' in ('owner','manager') or coalesce((r.data->>'all')::boolean,false)) loop
    perform private.notify_now(x.id, '📅 ' || case when sun then 'Sunday' else 'Tomorrow' end || ': ' || lst || ' — no job yet. Tap to book.',
      '📅 ' || case when sun then 'Domingo' else 'Mañana' end || ': ' || lst || ' — todavía sin trabajo. Toque para reservar.', 'warn', jsonb_build_object('tab','sched','day',nk), null);
    n := n + 1; end loop;
  return jsonb_build_object('sent', n, 'crews', lst, 'day', nk);
end $function$;

-- ── 4 + 5 ── schedule messages: say until when; a cleared day says so; "Every workday" = one line
create or replace function public.notify_assign()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare me jsonb; actor text; aname text; n jsonb := new.data; o jsonb := '{}'::jsonb; who text; e jsonb; site text; d text;
        pri boolean; en text; es text; office boolean; isnew boolean; day date; tdy date := (now() at time zone 'America/New_York')::date;
        crew text; sig_o text; sig_n text; txt text; k text; tl text; endm int; ong text;
begin
  if auth.uid() is null then return null; end if;
  if new.coll = 'sched' and new.deleted then n := '{}'::jsonb;
  elsif new.deleted or jsonb_typeof(n) <> 'object' then return null; end if;
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
          e := private.emp_row(who);
          d := case when coalesce(n->>'descLang', '') = '' or n->>'descLang' = coalesce(e->>'lang', 'en') or coalesce(n->>'descTr', '') = ''
                    then coalesce(n->>'desc', '') else n->>'descTr' end;
          perform private.notify_now(who, 'Taken off your list: ' || case when site <> '' then site || ' — ' else '' end || left(d, 50),
                                          'Quitado de tu lista: ' || case when site <> '' then site || ' — ' else '' end || left(d, 50),
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

    elsif new.coll = 'emps' then
      if not isnew and coalesce(n->>'crew', '') <> '' and n->>'crew' is distinct from o->>'crew' then
        crew := private.crew_name(n->>'crew');
        perform private.notify_now(new.id, '👷 You are now on ' || crew || ' (' || aname || ')', '👷 Ahora estás en ' || crew || ' (' || aname || ')',
                                   'info', jsonb_build_object('tab', 'punch'), actor);
      end if;

    elsif new.coll = 'sched' then
      sig_o := private.sched_sig(o); sig_n := private.sched_sig(n);
      if sig_o = sig_n then return null; end if;
      k := new.id;
      if k ~ '^ONG:' then
        crew := split_part(k, ':', 2);
        if n = '{}'::jsonb then n := o || jsonb_build_object('to', to_char(tdy, 'YYYY-MM-DD')); end if;   -- removed rule = ends today
        if coalesce(n->>'to', '') <> '' and n->>'to' ~ '^\d{4}-\d{2}-\d{2}$' then
          if (n->>'to')::date < tdy then return null; end if;
          -- Baruch 11/22: a new "every workday" job took over in the same save → its own message says it (one line, not three)
          if exists (select 1 from public.records r where r.coll = 'sched' and not r.deleted and r.id like 'ONG:' || crew || ':%' and r.id <> k
                       and r.updated_at > now() - interval '2 minutes' and coalesce(r.data->>'to','') = '') then return null; end if;
          en := '♾ Ongoing job at ' || private.short_site(n->>'site') || ' ends after ' || private.day_label((n->>'to')::date, 'en');
          es := '♾ El trabajo fijo en ' || private.short_site(n->>'site') || ' termina después del ' || private.day_label((n->>'to')::date, 'es');
        else
          day := case when coalesce(n->>'from', '') ~ '^\d{4}-\d{2}-\d{2}$' then greatest((n->>'from')::date, tdy) else tdy end;
          endm := public._num(n->>'end')::int;
          tl := case when endm is not null and endm <> 1140 then private.min_label(endm::text) end;   -- Baruch 11/22: its own go-home time
          en := '♾ Every working day from ' || private.day_label(day, 'en') || ': ' || private.short_site(n->>'site') || ' ' || private.min_label(n->>'start') || coalesce(' · till ' || tl, '');
          es := '♾ Cada día laboral desde ' || private.day_label(day, 'es') || ': ' || private.short_site(n->>'site') || ' ' || private.min_label(n->>'start') || coalesce(' · hasta las ' || tl, '');
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
      if day < tdy or day > tdy + 21 then return null; end if;
      txt := private.sched_text(n);
      -- Baruch 11/22: say until when — the last job's end, else the normal end of that day
      select max(public._num(a->>'end'))::int into endm
        from jsonb_array_elements(case when jsonb_typeof(n->'assignments') = 'array' then n->'assignments' else '[]'::jsonb end) a
       where coalesce(a->>'site','') <> '';
      tl := private.min_label(coalesce(endm, case when extract(dow from day) = 5 then 795 else 1140 end)::text);
      if k ~ '^L:' then
        who := substr(split_part(k, '|', 1), 3);
        en := private.day_label(day, 'en') || ': ' || case when txt <> '' then 'you are moved to ' || txt || ' · till ' || tl else 'your move was cancelled — you are back with your crew' end;
        es := private.day_label(day, 'es') || ': ' || case when txt <> '' then 'te mueven a ' || txt || ' · hasta las ' || tl else 'se canceló tu cambio — vuelves con tu cuadrilla' end;
        if who <> coalesce(actor, '') then
          insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
          values (who, k, actor, en, es, sig_o, sig_n, jsonb_build_object('tab', 'sched'));
        end if;
      else
        crew := split_part(k, '|', 1);
        if n = '{}'::jsonb then
          -- the day's own booking was removed: a new "every workday" job just took over → its message covers it
          if exists (select 1 from public.records r where r.coll = 'sched' and not r.deleted and r.id like 'ONG:' || crew || ':%'
                       and r.updated_at > now() - interval '2 minutes') then return null; end if;
          ong := private.clock_sched_site_ong(crew, day::text);
          if ong is not null then
            en := private.day_label(day, 'en') || ': back to the regular job — ' || private.short_site(ong);
            es := private.day_label(day, 'es') || ': vuelven al trabajo fijo — ' || private.short_site(ong);
          else
            en := private.day_label(day, 'en') || ': no job booked for your crew';
            es := private.day_label(day, 'es') || ': no hay trabajo para tu cuadrilla';
          end if;
        elsif coalesce(n->'cancel','[]'::jsonb) @> '["ONG"]'::jsonb and txt = ''
              and coalesce(n->'replace','{}'::jsonb) in ('{}'::jsonb, 'null'::jsonb) then
          -- a cleared day (✕ on the last job)
          en := private.day_label(day, 'en') || ': no job booked for your crew';
          es := private.day_label(day, 'es') || ': no hay trabajo para tu cuadrilla';
        else
          if coalesce(n->>'cancel','') <> '' or coalesce(n->>'replace','') <> '' or n ? 'patch' then txt := ''; end if;
          en := private.day_label(day, 'en') || ': ' || case when txt <> '' then txt || ' · till ' || tl else 'schedule changed — open the app' end;
          es := private.day_label(day, 'es') || ': ' || case when txt <> '' then txt || ' · hasta las ' || tl else 'el horario cambió — abre la app' end;
          -- chg:1118 name the new job(s) and time
          site := null; d := null;
          select string_agg(private.short_site(x.s) || case when coalesce(private.min_label(x.st),'') <> '' then ' at ' || private.min_label(x.st) else '' end, ' + '
                            order by case when x.st ~ '^[0-9.]+$' then x.st::numeric end nulls last),
                 string_agg(private.short_site(x.s) || case when coalesce(private.min_label(x.st),'') <> '' then ' a las ' || private.min_label(x.st) else '' end, ' + '
                            order by case when x.st ~ '^[0-9.]+$' then x.st::numeric end nulls last)
            into site, d
            from (select a->>'site' s, a->>'start' st
                    from jsonb_array_elements(case when jsonb_typeof(n->'assignments') = 'array' then n->'assignments' else '[]'::jsonb end) a
                   where coalesce(a->>'site','') <> ''
                     and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(o->'assignments') = 'array' then o->'assignments' else '[]'::jsonb end) b
                                      where b->>'site' = a->>'site' and (b->>'start') is not distinct from (a->>'start'))
                  union all
                  select v->>'site', v->>'start'
                    from jsonb_each(case when jsonb_typeof(n->'replace') = 'object' then n->'replace' else '{}'::jsonb end) r(k2, v)
                   where coalesce(v->>'site','') <> '' and (o->'replace'->k2) is distinct from v) x
           where coalesce(private.short_site(x.s),'') <> '';
          if coalesce(site,'') <> '' and en like '%open the app' then
            en := private.day_label(day, 'en') || ': change — go to ' || site;
            es := private.day_label(day, 'es') || ': cambio — vayan a ' || d;
          end if;
        end if;
        for who in select x from private.expand_people(jsonb_build_array(crew)) x loop
          if who <> coalesce(actor, '') then
            insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
            values (who, k, actor, en, es, sig_o, sig_n, jsonb_build_object('tab', 'sched'));
          end if;
        end loop;
      end if;
    end if;
  exception when others then
    raise warning 'notify_assign % %: %', new.coll, new.id, sqlerrm;
  end;
  return null;
end $function$;
