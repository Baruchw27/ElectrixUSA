-- Baruch 11/17: schedule notes in the men's messages + "time to go" reminder for a job that starts later in the day.
-- 1) the schedule message now carries the note: "Tue Nov 17: 14 Astor Pl 1:00 PM — bring the ladder"
create or replace function private.sched_text(d jsonb) returns text language sql stable as $f$
  select coalesce((select string_agg(nullif(private.short_site(a->>'site'), '') || ' ' || private.min_label(a->>'start')
                            || case when coalesce(btrim(a->>'note'),'') <> '' then ' — ' || left(btrim(a->>'note'), 80) else '' end,
                            ' + ' order by case when a->>'start' ~ '^[0-9.]+$' then (a->>'start')::numeric end nulls last)
                     from jsonb_array_elements(case when jsonb_typeof(d->'assignments') = 'array' then d->'assignments' else '[]'::jsonb end) a
                    where coalesce(a->>'site','') <> ''),
                  nullif(private.short_site(d->>'site') || case when coalesce(d->>'time','') <> '' then ' ' || (d->>'time') else '' end, ''), '') $f$;
-- 2) a changed note counts as a change (the men get the new note)
create or replace function private.sched_sig(d jsonb) returns text language sql stable as $f$
  select case when d is null or jsonb_typeof(d) <> 'object' or d = '{}'::jsonb then ''
    else coalesce((select string_agg(coalesce(a->>'site','') || '@' || coalesce(a->>'start','') || '-' || coalesce(a->>'end','') || '~' || coalesce(a->>'note',''), ',' order by (a->>'start'), a->>'site')
                     from jsonb_array_elements(case when jsonb_typeof(d->'assignments') = 'array' then d->'assignments' else '[]'::jsonb end) a
                    where coalesce(a->>'site','') <> ''), coalesce(d->>'site','') || '@' || coalesce(d->>'time',''))
         || '|' || coalesce(d->>'cancel','') || '|' || coalesce(d->>'replace','')
         || '|' || coalesce(d->>'from','') || '|' || coalesce(d->>'to','') || '|' || coalesce(d->>'start','') || '|' || coalesce(d->>'end','')
         || '|' || coalesce(d->>'workdays','') || '|' || coalesce(d->>'note','') end $f$;
-- 3) "time to go": a job booked from a later time (Send to another job → At a time) reminds the men when that time comes
create table if not exists private.sched_goto_sent (k text primary key, at timestamptz not null default now());
create or replace function private.sched_goto_tick() returns int language plpgsql security definer set search_path to 'public' as $f$
declare loc timestamp := now() at time zone 'America/New_York'; tdy text := to_char(loc::date, 'YYYY-MM-DD');
        nm numeric := extract(hour from loc) * 60 + extract(minute from loc);
        r record; a jsonb; who text; kk text; n int := 0; site text; en text; es text; note text;
begin
  for r in select id, data from public.records where coll = 'sched' and not deleted and split_part(id, '|', 2) = tdy loop
    for a in select x from jsonb_array_elements(case when jsonb_typeof(r.data->'assignments') = 'array' then r.data->'assignments' else '[]'::jsonb end) x loop
      if coalesce((a->>'remind')::boolean, false) and public._num(a->>'start') is not null
         and public._num(a->>'start') <= nm and public._num(a->>'start') > nm - 20 then
        kk := r.id || '#' || coalesce(a->>'id', '') || '@' || (a->>'start') || '>' || coalesce(a->>'site', '');
        if exists (select 1 from private.sched_goto_sent s where s.k = kk) then continue; end if;
        insert into private.sched_goto_sent (k) values (kk);
        site := private.short_site(a->>'site'); note := nullif(btrim(coalesce(a->>'note', '')), '');
        en := '⏰ Time to go — ' || site || coalesce(' · ' || left(note, 80), '');
        es := '⏰ Es hora — vaya a ' || site || coalesce(' · ' || left(note, 80), '');
        if r.id ~ '^L:' then
          perform private.notify_now(substr(split_part(r.id, '|', 1), 3), en, es, 'info', jsonb_build_object('tab', 'sched'), null); n := n + 1;
        else
          for who in select x from private.expand_people(jsonb_build_array(split_part(r.id, '|', 1))) x loop
            -- a man moved somewhere else today is not called to the crew's job
            if exists (select 1 from public.records l where l.coll = 'sched' and not l.deleted and l.id = 'L:' || who || '|' || tdy) then continue; end if;
            perform private.notify_now(who, en, es, 'info', jsonb_build_object('tab', 'sched'), null); n := n + 1;
          end loop;
        end if;
      end if;
    end loop;
  end loop;
  return n;
end $f$;
select cron.unschedule('sched-goto') where exists (select 1 from cron.job where jobname = 'sched-goto');
select cron.schedule('sched-goto', '* * * * *', 'select private.sched_goto_tick()');
