-- Regression for db/audit_b1_stock_deleted.sql + db/audit_b1_stock_src.sql (staging, rolled back). Expected: every row PASS.
begin;
create temp table _r(n int, t text, ok boolean) on commit drop;
grant all on _r to authenticated;
create temp table _id on commit drop as select id from public.records where coll='stock' and not deleted order by id limit 1;
grant select on _id to authenticated;
update public.records set deleted = true where coll='stock' and id = (select id from _id);
select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id='u7'),'role','authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; i text := (select id from _id); begin
  begin r := public.apply_stock_txn(jsonb_build_object('id','zzB1o','kind','out','moves',jsonb_build_array(jsonb_build_object('id',i,'delta',-1))));
    insert into _r values (1,'worker takes out a removed item: should be refused, was saved '||r::text,false);
  exception when others then insert into _r values (1,'worker takes out a removed item: refused ('||left(sqlerrm,40)||')', sqlerrm like 'insufficient_stock%'); end;
  begin r := public.apply_stock_txn(jsonb_build_object('id','zzB1i','kind','in','src','Cooper Electric inv 4471','moves',jsonb_build_array(jsonb_build_object('id',i,'delta',3))));
    insert into _r values (2,'worker puts back 3 of a removed item: saved, count 3', (r->'qtys'->0->>'qty')::numeric = 3);
  exception when others then insert into _r values (2,'put-back refused: '||left(sqlerrm,90),false); end;
end $$;
reset role;
insert into _r select 3, 'the item is back on the garage list with 3', (select not deleted and (data->>'qty')::numeric=3 from public.records where coll='stock' and id=(select id from _id));
insert into _r select 4, 'history row keeps where it came from', (select data->>'src'='Cooper Electric inv 4471' from public.records where coll='stockLog' and id='zzB1i');
select n, case when ok then 'PASS' else 'FAIL' end, t from _r order by n;
rollback;
