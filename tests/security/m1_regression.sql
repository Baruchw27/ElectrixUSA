-- Regression for db/audit_m1_monitoring.sql (staging, rolled back). Expected: every row PASS (run 2026-10-20: 6/6).
begin;
create temp table _r(n int, t text, ok boolean) on commit drop; grant all on _r to authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id='u7'),'role','authenticated')::text, true);
set local role authenticated;
insert into _r select 1,'a phone reports 2 problems (stored)', public.log_client_errors('[{"kind":"error","msg":"TypeError: x is undefined (TEST)","src":"index.html:120","n":3},{"kind":"stuck","msg":"changes waiting 7 h (TEST)"}]'::jsonb)=2;
do $$ begin begin perform count(*) from private.client_errors; insert into _r values (2,'a worker can read the error table',false);
  exception when others then insert into _r values (2,'a worker cannot read the error table',true); end; end $$;
insert into _r select 3,'a worker gets nothing from the owner''s error list', (select count(*) from public.recent_client_errors(24))=0;
reset role;
select public.error_digest();
insert into _r select 4,'morning summary: one bell message to the owner, with counts and the top problems',
  exists(select 1 from public.records where coll='inbox' and id like 'nerr%' and data->>'to'='u1'
         and data->>'msg' like '⚠ App problems in the last 24 h: 4 on 1 phone(s) · 1 with changes unsent for hours. TypeError: x is undefined (TEST) (3×)%');
insert into _r select 5,'… only once a day', public.error_digest()=0;
select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id='u1'),'role','authenticated')::text, true);
set local role authenticated;
insert into _r select 6,'the owner can see the details', (select count(*) from public.recent_client_errors(24))>=2;
reset role;
select n, case when ok then 'PASS' else 'FAIL' end r, t from _r order by n;
rollback;
