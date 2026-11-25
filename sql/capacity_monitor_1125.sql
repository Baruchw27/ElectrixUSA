-- 2026-11-25  Daily capacity / backup / job-failure monitor (live migration capacity_monitor_1125).
create table if not exists private.capacity_log (
  day date primary key,
  at timestamptz not null default now(),
  db_bytes bigint not null, history_bytes bigint, backup_bytes bigint, cronlog_bytes bigint,
  storage_bytes bigint, records_n int, history_n bigint,
  backup_ok boolean, cron_failures_24h int, days_to_limit numeric, alerted boolean not null default false
);
revoke all on private.capacity_log from public, anon, authenticated;

create or replace function private.capacity_check()
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  db_limit constant bigint := 500 * 1024 * 1024;      -- Supabase free plan database quota
  st_limit constant bigint := 1024 * 1024 * 1024;     -- Supabase free plan storage quota
  warn_pct constant numeric := 0.80; warn_days constant int := 21;
  d date := (now() at time zone 'America/New_York')::date;
  dbb bigint := pg_database_size(current_database()); stb bigint; growth numeric; left_days numeric;
  bok boolean; fails int; why text := ''; o record; nid text; msg text; prev record;
begin
  select coalesce(sum((metadata->>'size')::bigint),0) into stb from storage.objects;
  select exists (select 1 from cron.job_run_details r join cron.job j on j.jobid = r.jobid
                  where j.jobname = 'daily-backup' and r.status = 'succeeded' and r.start_time > now() - interval '26 hours') into bok;
  select count(*) into fails from cron.job_run_details where status <> 'succeeded' and start_time > now() - interval '24 hours';
  select * into prev from private.capacity_log where day <= d - 7 order by day desc limit 1;
  if prev.day is not null then
    growth := (dbb - prev.db_bytes)::numeric / greatest(d - prev.day, 1);
    left_days := case when growth > 0 then round((db_limit - dbb) / growth, 1) end;
  end if;
  insert into private.capacity_log (day, db_bytes, history_bytes, backup_bytes, cronlog_bytes, storage_bytes, records_n, history_n, backup_ok, cron_failures_24h, days_to_limit)
  values (d, dbb, pg_total_relation_size('public.records_history'), pg_total_relation_size('public.records_backup'),
          pg_total_relation_size('cron.job_run_details'), stb, (select count(*) from public.records),
          (select count(*) from public.records_history), bok, fails, left_days)
  on conflict (day) do update set at = now(), db_bytes = excluded.db_bytes, history_bytes = excluded.history_bytes,
     backup_bytes = excluded.backup_bytes, cronlog_bytes = excluded.cronlog_bytes, storage_bytes = excluded.storage_bytes,
     records_n = excluded.records_n, history_n = excluded.history_n, backup_ok = excluded.backup_ok,
     cron_failures_24h = excluded.cron_failures_24h, days_to_limit = excluded.days_to_limit;

  if dbb > db_limit * warn_pct then why := why || ' database ' || pg_size_pretty(dbb) || ' of 500 MB;'; end if;
  if left_days is not null and left_days < warn_days then why := why || ' full in about ' || ceil(left_days) || ' days;'; end if;
  if stb > st_limit * warn_pct then why := why || ' file storage ' || pg_size_pretty(stb) || ' of 1 GB;'; end if;
  if not bok then why := why || ' last night''s backup did not run;'; end if;
  if fails >= 10 then why := why || ' ' || fails || ' scheduled jobs failed in 24 h;'; end if;
  if why = '' then return jsonb_build_object('ok', true, 'db', dbb, 'days_to_limit', left_days); end if;

  for o in select id, data->>'lang' lang from public.records where coll = 'emps' and not deleted and data->>'role' = 'owner'
             and not coalesce((data->>'inactive')::boolean, false) loop
    nid := 'ncap' || to_char(d, 'YYYYMMDD') || o.id;
    if exists (select 1 from public.records where coll = 'inbox' and id = nid) then continue; end if;
    msg := case when o.lang = 'es' then '🛢 Revisión del servidor:' else '🛢 Server check:' end || why;
    insert into public.records (coll, id, data, deleted, updated_by, updated_at)
    values ('inbox', nid, jsonb_build_object('id', nid, 'to', o.id, 'msg', left(msg, 400), 'kind', 'warn',
            'ts', (extract(epoch from now()) * 1000)::bigint, 'read', false, 'link', null, 'auto', true), false, 'server', now());
  end loop;
  update private.capacity_log set alerted = true where day = d;
  return jsonb_build_object('ok', false, 'why', why, 'db', dbb, 'days_to_limit', left_days);
end $function$;
revoke execute on function private.capacity_check() from public, anon, authenticated;
select cron.schedule('capacity-check', '43 12 * * *', $$select private.capacity_check()$$);
