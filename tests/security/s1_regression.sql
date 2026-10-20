-- Regression for db/audit_s1_uncounted.sql (staging, everything rolled back). Part 1 run 2026-10-20: 11/11 PASS.
-- Signed in as u2 (manager: may pick up, put back and count). Item s_cat1 starts uncounted with 0 in the garage.
begin;
create temp table _r(n int, t text, ok boolean) on commit drop; grant all on _r to authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id='u2'),'role','authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  -- 1. uncounted item: a pick-up of 5 with 0 on the list is recorded, the count stays at 0 (never negative)
  begin r := public.apply_stock_txn('{"id":"zzS1a","kind":"out","site":"t32","moves":[{"id":"s_cat1","delta":-5}]}');
    insert into _r values (1,'uncounted item: pick-up of 5 with 0 on the list is accepted, answer qty 0', (r->'qtys'->0->>'qty')::numeric = 0);
  exception when others then insert into _r values (1,'uncounted pick-up refused: '||sqlerrm,false); end;
end $$;
do $$ declare r jsonb; begin
  -- 2. a count makes the item enforced
  begin r := public.apply_stock_txn('{"id":"zzS1b","kind":"set","moves":[{"id":"s_cat1","set":10}]}');
    insert into _r values (2,'count of 10 saved', (r->'qtys'->0->>'qty')::numeric = 10);
  exception when others then insert into _r values (2,'count refused: '||sqlerrm,false); end;
end $$;
do $$ declare r jsonb; begin
  -- 3. counted item: taking more than there is is refused
  begin r := public.apply_stock_txn('{"id":"zzS1c","kind":"out","site":"t32","moves":[{"id":"s_cat1","delta":-15}]}');
    insert into _r values (3,'counted item: pick-up of 15 with 10 accepted',false);
  exception when others then insert into _r values (3,'counted item: pick-up of 15 with 10 refused ('||left(sqlerrm,50)||')', sqlerrm like 'insufficient_stock%'); end;
  -- 4/5. two pick-ups of 6 one after the other on the 10 counted: the first goes through, the second is refused (never negative)
  begin r := public.apply_stock_txn('{"id":"zzS1d","kind":"out","site":"t32","moves":[{"id":"s_cat1","delta":-6}]}');
    insert into _r values (4,'first pick-up of 6 → 4 left', (r->'qtys'->0->>'qty')::numeric = 4);
  exception when others then insert into _r values (4,'first pick-up refused: '||sqlerrm,false); end;
  begin r := public.apply_stock_txn('{"id":"zzS1e","kind":"out","site":"t32","moves":[{"id":"s_cat1","delta":-6}]}');
    insert into _r values (5,'second pick-up of 6 with 4 left accepted',false);
  exception when others then insert into _r values (5,'second pick-up of 6 with 4 left refused', sqlerrm like 'insufficient_stock%'); end;
end $$;
do $$ begin
  -- 6. a phone re-sending an old copy of the item (without the count stamp) cannot remove it
  update public.records set data = data - 'counted' - 'countedBy' || '{"note":"old copy"}'::jsonb where coll='stock' and id='s_cat1';
end $$;
reset role;
insert into _r select 7, 'history: the uncounted pick-up is marked uncounted, before 0 / after 0 / change −5',
  (select l.data->'items'->0 @> '{"uncounted":true,"before":0,"after":0,"change":-5}'::jsonb from public.records l where coll='stockLog' and id='zzS1a');
insert into _r select 8, 'the count stamped the item counted by u2',
  (select (data ? 'counted') and data->>'countedBy'='u2' from public.records where coll='stock' and id='s_cat1');
insert into _r select 9, 'a phone re-sending an old copy kept the count stamp (and its other edit went through)',
  (select (data ? 'counted') and data->>'note'='old copy' from public.records where coll='stock' and id='s_cat1');
insert into _r select 10, 'the counted pick-up is NOT marked uncounted',
  (select not (l.data->'items'->0 ? 'uncounted') from public.records l where coll='stockLog' and id='zzS1d');
insert into _r select 11, 'refused moves left nothing behind (no history row, count 4)',
  (select not exists(select 1 from public.records where coll='stockLog' and id in ('zzS1c','zzS1e'))
      and (select (data->>'qty')::numeric from public.records where coll='stock' and id='s_cat1') = 4);
insert into _r select 12, 'no stock item anywhere is below 0', not exists(select 1 from public.records where coll='stock' and (data->>'qty')::numeric < 0);
select n, case when ok then 'PASS' else 'FAIL' end r, t from _r order by n;
rollback;

-- Part 2 (run 2026-10-20: 10/10 PASS) — the A2 stock rules still hold, and only a stock transaction can stamp "counted".
begin;
create temp table _t(n serial, test text, ok boolean, detail text) on commit drop;
grant all on _t to authenticated; grant usage on sequence _t_n_seq to authenticated;
create or replace function pg_temp.expect(t text, q text, want text) returns void language plpgsql as $$
declare got text := 'ok';
begin
  begin execute q; exception when others then got := 'blocked ' || sqlstate || ' ' || left(sqlerrm, 60); end;
  insert into _t(test, ok, detail) values (t, (want = 'ok') = (got = 'ok'), got);
end $$;
select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from records where coll='emps' and id='u7'),'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.expect('normal pick-up (take 1 out) works', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s1','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',-1))))$q$, 'ok');
select pg_temp.expect('normal return (bring 1 in) works', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s2','kind','in','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',1))))$q$, 'ok');
select pg_temp.expect('a pick-up that ADDS stock is refused', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s3','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',50))))$q$, 'blocked');
select pg_temp.expect('a return that REMOVES stock is refused', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s4','kind','in','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',-5))))$q$, 'blocked');
select pg_temp.expect('a "count" with a plain amount (skips the office check) is refused', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s5','kind','set','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','delta',50))))$q$, 'blocked');
select pg_temp.expect('worker count (set) is still office-only', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s6','kind','set','by','u7','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','set',99))))$q$, 'blocked');
select pg_temp.expect('worker cannot stamp an item as counted by editing it', $q$update records set data = data || '{"counted":1,"countedBy":"u7"}' where coll='stock' and id='s_3'$q$, 'ok');
reset role;
insert into _t(test, ok, detail) select '… the stamp did not stick', not (data ? 'counted'), data->>'counted' from records where coll='stock' and id='s_3';
select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from records where coll='emps' and id='u4'),'role','authenticated')::text, true);
set local role authenticated;
select pg_temp.expect('Payroll can still count stock', $q$select apply_stock_txn(jsonb_build_object('id','zzA2s7','kind','set','by','u4','moves',jsonb_build_array(jsonb_build_object('id','s_2','name','x','set',20))))$q$, 'ok');
reset role;
insert into _t(test, ok, detail) select '… and that count stamps it counted by u4', data->>'countedBy'='u4', data::text from records where coll='stock' and id='s_2';
select n, case when ok then 'PASS' else 'FAIL' end result, test, detail from _t order by n;
rollback;
