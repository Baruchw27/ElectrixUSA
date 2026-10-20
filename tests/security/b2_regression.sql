-- Regression for db/audit_b2_review.sql (staging, rolled back). Expected 12/12 PASS (run 2026-10-20: 12/12).
-- private records (injury reports, messages, applications) only for the people involved + office; fixed travel pay
-- office-only; an edit never brings back a record removed on another phone; new records still save.
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
create or replace function pg_temp.sees(u text, c text, i text) returns boolean language plpgsql as $$ declare n int; begin
  perform pg_temp.as_user(u); execute 'set local role authenticated';
  select count(*) into n from public.records where coll=c and id=i; execute 'reset role'; return n>0; end $$;
insert into public.records(coll,id,data,deleted) values ('incidents','zzI1','{"id":"zzI1","who":"u8","site":"s2","what":"cut hand (TEST)"}',false),
  ('msgs','zzG1','{"id":"zzG1","from":"u8","to":"u2","kind":"text","text":"private (TEST)"}',false),
  ('apps','zzA1','{"id":"zzA1","name":"Applicant (TEST)","phone":"555","addr":"home (TEST)"}',false);
do $s$ begin
  insert into _t(who,test,ok,detail) select 'u7','a worker cannot read another worker''s injury report', not pg_temp.sees('u7','incidents','zzI1'), '';
  insert into _t(who,test,ok,detail) select 'u8','… the injured worker can read his own', pg_temp.sees('u8','incidents','zzI1'), '';
  insert into _t(who,test,ok,detail) select 'u2','… a manager can read it', pg_temp.sees('u2','incidents','zzI1'), '';
  insert into _t(who,test,ok,detail) select 'u7','a worker cannot read other people''s private messages', not pg_temp.sees('u7','msgs','zzG1'), '';
  insert into _t(who,test,ok,detail) select 'u2','… the person it was sent to can', pg_temp.sees('u2','msgs','zzG1'), '';
  insert into _t(who,test,ok,detail) select 'u7','a worker cannot read job applications (home address, phone)', not pg_temp.sees('u7','apps','zzA1'), '';
  insert into _t(who,test,ok,detail) select 'u3','… the office can', pg_temp.sees('u3','apps','zzA1'), '';
  perform pg_temp.t('u7','a worker cannot set a job''s fixed travel pay', $q$update public.records set data = data || '{"travelPay":500}' where coll='sites' and id='s1'$q$, 'refused',
    $c$(select data->'travelPay' is null or data->>'travelPay' <> '500' from public.records where coll='sites' and id='s1')$c$);
  perform pg_temp.t('u3','the office can', $q$update public.records set data = data || '{"travelPay":35}' where coll='sites' and id='s1'$q$, 'ok',
    $c$(select data->>'travelPay'='35' from public.records where coll='sites' and id='s1')$c$);
  perform pg_temp.t('u2','manager removes a job', $q$select public.save_records(jsonb_build_array(jsonb_build_object('coll','jobs','id','j2','deleted',true,'full','{}'::jsonb)))$q$, 'ok',
    $c$(select deleted from public.records where coll='jobs' and id='j2')$c$);
  perform pg_temp.t('u8','another phone that still had it edits it: it stays removed (no half-empty job comes back)', $q$select public.save_records(jsonb_build_array(jsonb_build_object('coll','jobs','id','j2','patch','{"status":"prog"}'::jsonb,'unset','[]'::jsonb)))$q$, 'ok',
    $c$(select deleted from public.records where coll='jobs' and id='j2')$c$);
  perform pg_temp.t('u2','a brand-new record still saves normally', $q$select public.save_records(jsonb_build_array(jsonb_build_object('coll','jobs','id','zzJn','full','{"id":"zzJn","to":["u8"],"from":"u2","desc":"x","status":"open"}'::jsonb)))$q$, 'ok',
    $c$(select not deleted and data->>'desc'='x' from public.records where coll='jobs' and id='zzJn')$c$);
end $s$;
select n, case when ok then 'PASS' else 'FAIL' end res, who, test, detail from _t order by n;
rollback;
