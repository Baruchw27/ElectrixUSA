-- M1 (staging first): automatic error monitoring.
-- Phones send their app errors (crashes, refused saves, saves stuck for hours, stock moves set aside) to a private
-- table nobody can read from the app. Every morning the owner gets ONE bell + phone message if anything went wrong
-- in the last 24 hours (and nothing when all is well). Old entries are cleared after 60 days.
create schema if not exists private;
create table if not exists private.client_errors(
  id bigserial primary key, at timestamptz not null default now(), who text, ver text, ua text,
  kind text not null, msg text not null, src text, n int not null default 1);
create index if not exists client_errors_at on private.client_errors(at);
revoke all on private.client_errors from public, anon, authenticated;

-- called by the phones (signed-in team members only); at most 20 entries per call and 300 per person per day
create or replace function public.log_client_errors(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare me jsonb := public.my_emp_data(); r jsonb; k int := 0; used int;
begin
  if me = '{}'::jsonb or jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  select coalesce(sum(n),0) into used from private.client_errors where who = me->>'id' and at > now() - interval '1 day';
  if used >= 300 then return 0; end if;
  for r in select value from jsonb_array_elements(p_rows) limit 20 loop
    if jsonb_typeof(r) <> 'object' then continue; end if;
    insert into private.client_errors(who, ver, ua, kind, msg, src, n)
    values (me->>'id', left(coalesce(r->>'ver',''),40), left(coalesce(r->>'ua',''),120), left(coalesce(nullif(r->>'kind',''),'error'),20),
            left(coalesce(r->>'msg',''),500), left(coalesce(r->>'src',''),200), least(greatest(coalesce(public._num(r->>'n')::int,1),1),1000));
    k := k + 1;
  end loop;
  return k;
end $$;
revoke all on function public.log_client_errors(jsonb) from public, anon;
grant execute on function public.log_client_errors(jsonb) to authenticated;

-- the morning summary for the owner (only when something happened)
create or replace function public.error_digest() returns integer
language plpgsql security definer set search_path = public as $$
declare tot int; ppl int; stuck int; refused int; crash int; top text; o record; nid text; msg text; n int := 0;
        nowms bigint := (extract(epoch from now()) * 1000)::bigint; day text := to_char(now() at time zone 'America/New_York', 'YYYYMMDD');
begin
  select coalesce(sum(e.n),0), count(distinct e.who),
         coalesce(sum(e.n) filter (where e.kind = 'stuck'),0), coalesce(sum(e.n) filter (where e.kind in ('refused','stock')),0),
         coalesce(sum(e.n) filter (where e.kind = 'error'),0)
    into tot, ppl, stuck, refused, crash
    from private.client_errors e where e.at > now() - interval '24 hours';
  if tot = 0 then return 0; end if;
  select string_agg(x, ' · ') into top from (
    select left(e.msg, 60) || ' (' || sum(e.n) || '×)' x from private.client_errors e
     where e.at > now() - interval '24 hours' group by left(e.msg, 60) order by sum(e.n) desc limit 3) q;
  for o in select id, data->>'lang' lang from public.records where coll = 'emps' and not deleted and data->>'role' = 'owner'
             and not coalesce((data->>'inactive')::boolean, false) loop
    nid := 'nerr' || day || o.id;
    if exists (select 1 from public.records where coll = 'inbox' and id = nid) then continue; end if;
    msg := case when o.lang = 'es'
      then '⚠ Problemas en la app (últimas 24 h): ' || tot || ' en ' || ppl || ' teléfono(s)'
           || case when stuck > 0 then ' · ' || stuck || ' con cambios sin enviar por horas' else '' end
           || case when refused > 0 then ' · ' || refused || ' cambios rechazados' else '' end || '. ' || coalesce(top, '')
      else '⚠ App problems in the last 24 h: ' || tot || ' on ' || ppl || ' phone(s)'
           || case when stuck > 0 then ' · ' || stuck || ' with changes unsent for hours' else '' end
           || case when refused > 0 then ' · ' || refused || ' refused changes' else '' end || '. ' || coalesce(top, '') end;
    insert into public.records (coll, id, data, deleted, updated_by, updated_at)
    values ('inbox', nid, jsonb_build_object('id', nid, 'to', o.id, 'msg', left(msg, 400), 'kind', 'warn', 'ts', nowms, 'read', false,
            'link', null, 'auto', true), false, 'server', now());
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.error_digest() from public, anon, authenticated;

-- the owner can look at the details when he asks (Claude reads them for him); nobody else
create or replace function public.recent_client_errors(p_hours int default 24) returns table(at timestamptz, who text, kind text, msg text, src text, n int, ver text, ua text)
language sql security definer set search_path = public as $$
  select e.at, e.who, e.kind, e.msg, e.src, e.n, e.ver, e.ua from private.client_errors e
   where e.at > now() - make_interval(hours => least(greatest(coalesce(p_hours,24),1),24*60))
     and (public.my_emp_data()->>'role') = 'owner'
   order by e.at desc limit 500 $$;
revoke all on function public.recent_client_errors(int) from public, anon;
grant execute on function public.recent_client_errors(int) to authenticated;

create or replace function private.tidy_client_errors() returns void language sql security definer set search_path = public as $$
  delete from private.client_errors where at < now() - interval '60 days' $$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'error-digest') then perform cron.unschedule('error-digest'); end if;
  perform cron.schedule('error-digest', '37 11 * * *', 'select public.error_digest()');            -- 7:37 AM New York (summer), 6:37 winter
  if exists (select 1 from cron.job where jobname = 'error-log-tidy') then perform cron.unschedule('error-log-tidy'); end if;
  perform cron.schedule('error-log-tidy', '41 3 * * 0', 'select private.tidy_client_errors()');     -- Sundays: keep 60 days
end $$;
