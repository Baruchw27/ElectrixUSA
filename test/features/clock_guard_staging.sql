-- Features v1 — who may change "Time Clock Required" (the existing employee-record rule on the database).
-- Run on the STAGING database (rkkxykdkjgdsgkujanau); everything is rolled back. Staging test people:
-- u1 owner · u2 site manager · u4 Payroll · u5 Bookkeeper · u7 worker.
-- Result on 20 Oct 2026: M1 refused · M2 refused · M3 allowed · M5 refused · M6 allowed · W1 refused · W2 refused · W4 refused
begin;
create temp table r(k text, v text); grant all on r to authenticated;
create or replace function pg_temp.try(label text, uid text, q text) returns void language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
  begin execute q; get diagnostics n = row_count; insert into r values (label, case when n>0 then 'allowed' else 'no row changed' end);
  exception when others then insert into r values (label, 'refused'); end;
  execute 'reset role';
end $f$;
select pg_temp.try('M1 manager sets Payroll person clock', (select data->>'authUid' from records where coll='emps' and id='u2'), $$update records set data=data||'{"clock":false}' where coll='emps' and id='u4'$$);
select pg_temp.try('M2 manager sets own clock',            (select data->>'authUid' from records where coll='emps' and id='u2'), $$update records set data=data||'{"clock":false}' where coll='emps' and id='u2'$$);
select pg_temp.try('W4 worker sets own clock',             (select data->>'authUid' from records where coll='emps' and id='u7'), $$update records set data=data||'{"clock":false}' where coll='emps' and id='u7'$$);
select pg_temp.try('W1 worker sets own role owner',        (select data->>'authUid' from records where coll='emps' and id='u7'), $$update records set data=data||'{"role":"owner"}' where coll='emps' and id='u7'$$);
select pg_temp.try('M5 bookkeeper sets a worker clock',    (select data->>'authUid' from records where coll='emps' and id='u5'), $$update records set data=data||'{"clock":false}' where coll='emps' and id='u7'$$);
select pg_temp.try('M3 manager sets a worker clock',       (select data->>'authUid' from records where coll='emps' and id='u2'), $$update records set data=data||'{"clock":false}' where coll='emps' and id='u7'$$);
select pg_temp.try('M6 owner sets manager clock',          (select data->>'authUid' from records where coll='emps' and id='u1'), $$update records set data=data||'{"clock":false}' where coll='emps' and id='u2'$$);
select k||' = '||v from r order by k;
rollback;
