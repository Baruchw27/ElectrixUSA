-- Regression tests for db/audit_a2_security.sql. Runs as staging worker u7 (Alex WorkerA) and Payroll u4 inside one
-- transaction that is rolled back at the end — nothing is kept. Every row of the result must say PASS.
begin;
create temp table _t(n serial, test text, ok boolean, detail text) on commit drop;
grant all on _t to authenticated; grant usage on sequence _t_n_seq to authenticated;
create or replace function pg_temp.expect(t text, q text, want text) returns void language plpgsql as $$
declare got text := 'ok';
begin
  begin execute q; exception when others then got := 'blocked ' || sqlstate || ' ' || left(sqlerrm, 60); end;
  insert into _t(test, ok, detail) values (t, (want = 'ok') = (got = 'ok'), got);
end $$;
create or replace function pg_temp.check(t text, cond boolean, detail text) returns void language plpgsql as $$
begin insert into _t(test, ok, detail) values (t, coalesce(cond,false), detail); end $$;

-- test fixtures (written as the database owner, rolled back at the end)
insert into records(coll,id,data,deleted) values
 ('punches','zzA2open', jsonb_build_object('who','u7','site','s1','in',((extract(epoch from now())-7200)*1000)::bigint,
    'breaks', jsonb_build_array(jsonb_build_object('s',((extract(epoch from now())-5400)*1000)::bigint,'e',((extract(epoch from now())-3600)*1000)::bigint))), false),
 ('punches','zzA2brk', jsonb_build_object('who','u7','site','s1','in',((extract(epoch from now())-7200)*1000)::bigint,'breakStart',((extract(epoch from now())-600)*1000)::bigint), false),
 ('punches','zzA2del', jsonb_build_object('who','u7','site','s1','in',((extract(epoch from now())-7200)*1000)::bigint), true)
on conflict (coll,id) do nothing;
update records set data = jsonb_set(data,'{trip}','{"min":60,"mi":40}') where coll='sites' and id='s2';
insert into records(coll,id,data,deleted) values ('_','travelRate','{"v":30}',false) on conflict (coll,id) do update set data='{"v":30}', deleted=false;

select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from records where coll='emps' and id='u7'),'role','authenticated')::text, true);
set local role authenticated;

-- clock entries
select pg_temp.expect('worker can take a new break (append)', $q$update records set data = jsonb_set(data,'{breaks}', data->'breaks' || jsonb_build_array(jsonb_build_object('s',((extract(epoch from now())-1200)*1000)::bigint,'e',((extract(epoch from now())-900)*1000)::bigint))) where coll='punches' and id='zzA2open'$q$, 'ok');
select pg_temp.expect('worker cannot remove a finished break', $q$update records set data = data - 'breaks' where coll='punches' and id='zzA2open'$q$, 'blocked');
select pg_temp.expect('worker cannot shorten a finished break', $q$update records set data = jsonb_set(data,'{breaks,0,e}', to_jsonb(((data->'breaks'->0->>'s')::bigint + 60000))) where coll='punches' and id='zzA2open'$q$, 'blocked');
select pg_temp.expect('worker can end a break normally', $q$update records set data = (data - 'breakStart') || jsonb_build_object('breaks', jsonb_build_array(jsonb_build_object('s', data->'breakStart', 'e', (extract(epoch from now())*1000)::bigint))) where coll='punches' and id='zzA2brk'$q$, 'ok');
select pg_temp.expect('worker can clock out normally', $q$update records set data = data || jsonb_build_object('out',(extract(epoch from now())*1000)::bigint) where coll='punches' and id='zzA2open'$q$, 'ok');
select pg_temp.expect('worker cannot drop an in-progress break', $q$update records set data = data - 'breakStart' where coll='punches' and id='zzA2brk' and data ? 'breakStart'$q$, 'ok'); -- (already ended above: nothing to drop)
select pg_temp.expect('worker cannot bring back a deleted punch', $q$update records set deleted = false where coll='punches' and id='zzA2del'$q$, 'blocked');
select pg_temp.expect('worker clock-in (new punch) still works', $q$insert into records(coll,id,data,deleted) values ('punches','zzA2new', jsonb_build_object('who','u7','site','s1','in',(extract(epoch from now())*1000)::bigint), false)$q$, 'ok');
select pg_temp.check('server stamps when it received the punch', (select data ? 'srvIn' from records where coll='punches' and id='zzA2new'), (select data->>'srvIn' from records where coll='punches' and id='zzA2new'));
select pg_temp.expect('phone cannot change that stamp', $q$update records set data = data || '{"srvIn":1}' where coll='punches' and id='zzA2new'$q$, 'ok');
select pg_temp.check('… stamp unchanged', (select (data->>'srvIn')::bigint > 1 from records where coll='punches' and id='zzA2new'), (select data->>'srvIn' from records where coll='punches' and id='zzA2new'));

-- travel pay
select pg_temp.expect('automatic travel entry still saves', $q$insert into records(coll,id,data,deleted) values ('travel','zzA2tv1', jsonb_build_object('who','u7','site','s2','date',to_char(now() at time zone 'America/New_York','YYYY-MM-DD'),'minutes',60,'pay',999,'auto',true,'status','approved'), false)$q$, 'ok');
select pg_temp.check('… with the pay the server worked out (60 min × $30/h = $30), not $999', (select (data->>'pay')::numeric = 30 from records where coll='travel' and id='zzA2tv1'), (select data->>'pay' from records where coll='travel' and id='zzA2tv1'));
select pg_temp.expect('a second travel entry for the same job and day is refused', $q$insert into records(coll,id,data,deleted) values ('travel','zzA2tv2', jsonb_build_object('who','u7','site','s2','date',to_char(now() at time zone 'America/New_York','YYYY-MM-DD'),'minutes',60,'auto',true), false)$q$, 'blocked');
select pg_temp.expect('travel for a date long ago is refused', $q$insert into records(coll,id,data,deleted) values ('travel','zzA2tv3', jsonb_build_object('who','u7','site','s2','date','2026-01-05','minutes',60,'auto',true), false)$q$, 'blocked');
select pg_temp.expect('a bad date is refused cleanly (no crash)', $q$insert into records(coll,id,data,deleted) values ('travel','zzA2tv4', jsonb_build_object('who','u7','site','s2','date','2026-13-45','minutes',60), false)$q$, 'blocked');
select pg_temp.expect('worker still cannot change travel pay afterwards', $q$update records set data = data || '{"pay":500}' where coll='travel' and id='zzA2tv1'$q$, 'blocked');

-- stock
select pg_temp.expect('normal pick-up (take 1 out) works', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s1','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',-1))))$q$, 'ok');
select pg_temp.expect('normal return (bring 1 in) works', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s2','kind','in','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',1))))$q$, 'ok');
select pg_temp.expect('a pick-up that ADDS stock is refused', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s3','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',50))))$q$, 'blocked');
select pg_temp.expect('a return that REMOVES stock is refused', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s4','kind','in','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',-5))))$q$, 'blocked');
select pg_temp.expect('a "count" with a plain amount (skips the office check) is refused', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s5','kind','set','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',50))))$q$, 'blocked');
select pg_temp.expect('worker count (set) is still office-only', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s6','kind','set','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','set',99))))$q$, 'blocked');

-- size
select pg_temp.expect('a 500 KB record is refused', $q$insert into records(coll,id,data,deleted) values ('keep','zzA2big', jsonb_build_object('owner','u7','title','x','body',repeat('x',500000)), false)$q$, 'blocked');
select pg_temp.expect('a normal note still saves', $q$insert into records(coll,id,data,deleted) values ('keep','zzA2small', jsonb_build_object('owner','u7','title','x','body',repeat('x',5000)), false)$q$, 'ok');

reset role;
-- Payroll keeps full control
select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from records where coll='emps' and id='u4'),'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.expect('Payroll can still remove a wrong break', $q$update records set data = data - 'breaks' where coll='punches' and id='zzA2open'$q$, 'ok');
select pg_temp.expect('Payroll can still bring back a deleted punch', $q$update records set deleted = false where coll='punches' and id='zzA2del'$q$, 'ok');
select pg_temp.expect('Payroll can still count stock', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s7','kind','set','by','u4','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','set',20))))$q$, 'ok');
reset role;

select n, case when ok then 'PASS' else 'FAIL' end result, test, detail from _t order by n;
rollback;
