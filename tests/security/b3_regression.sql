-- Regression for db/audit_b3_self.sql (staging, rolled back). Expected 7/7 PASS (run 2026-10-20: 7/7).
begin;
create temp table _t(n serial, who text, test text, ok boolean, detail text) on commit drop;
grant all on _t to authenticated; grant usage on sequence _t_n_seq to authenticated;
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
insert into public.records(coll,id,data,deleted) values ('timeoff','zzT2','{"id":"zzT2","who":"u2","from":"2026-11-02","to":"2026-11-03","status":"pending"}',false),
 ('timeoff','zzT7','{"id":"zzT7","who":"u7","from":"2026-11-02","to":"2026-11-03","status":"pending"}',false);
update public.records set data = data || '{"trip":{"min":50}}' where coll='sites' and id='s2';
do $s$ begin
  perform pg_temp.t('u2','a manager logging his OWN travel at $999 gets the normal automatic amount instead', $q$insert into public.records(coll,id,data,deleted) values('travel','zzV2',jsonb_build_object('who','u2','date',to_char(now() at time zone 'America/New_York','YYYY-MM-DD'),'site','s2','minutes',300,'pay',999,'status','approved'),false)$q$, 'ok',
    $c$(select (data->>'pay')::numeric <> 999 and (data->>'minutes')::numeric = 50 and data->>'auto'='true' from public.records where coll='travel' and id='zzV2')$c$);
  perform pg_temp.t('u4','Payroll logging their own travel on a local job: refused like anyone', $q$insert into public.records(coll,id,data,deleted) values('travel','zzV4',jsonb_build_object('who','u4','date',to_char(now() at time zone 'America/New_York','YYYY-MM-DD'),'site','s1','minutes',300,'pay',999,'status','approved'),false)$q$, 'refused');
  perform pg_temp.t('u4','Payroll can still enter travel for a worker (office adjustment)', $q$insert into public.records(coll,id,data,deleted) values('travel','zzV7',jsonb_build_object('who','u7','date',to_char(now() at time zone 'America/New_York','YYYY-MM-DD'),'site','s1','minutes',40,'pay',20,'status','approved'),false)$q$, 'ok');
  perform pg_temp.t('u2','a manager cannot approve his own time off', $q$update public.records set data = data || '{"status":"approved"}' where coll='timeoff' and id='zzT2'$q$, 'refused');
  perform pg_temp.t('u2','… but approves a worker''s', $q$update public.records set data = data || '{"status":"approved"}' where coll='timeoff' and id='zzT7'$q$, 'ok',
    $c$(select data->>'status'='approved' from public.records where coll='timeoff' and id='zzT7')$c$);
  perform pg_temp.t('u1','the owner approves the manager''s', $q$update public.records set data = data || '{"status":"approved"}' where coll='timeoff' and id='zzT2'$q$, 'ok');
  perform pg_temp.t('u2','a manager can still cancel his own request', $q$update public.records set data = data || '{"status":"cancelled"}' where coll='timeoff' and id='zzT2'$q$, 'ok');
end $s$;
select n, case when ok then 'PASS' else 'FAIL' end res, who, test, detail from _t order by n;
rollback;
