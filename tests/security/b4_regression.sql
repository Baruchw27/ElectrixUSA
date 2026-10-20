-- Regression for db/audit_b4_stock_input.sql (staging, rolled back). Expected 4/4 PASS (run 2026-10-20: 4/4).
begin;
create temp table _r(n int, t text, ok boolean) on commit drop; grant all on _r to authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id='u2'),'role','authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  begin r := public.apply_stock_txn('{"id":"zzB4a","kind":"set","moves":[{"id":"s_1","set":"NaN"}]}'); insert into _r values (1,'count "NaN" accepted',false);
  exception when others then insert into _r values (1,'count "NaN" refused: '||sqlerrm, sqlerrm like 'count must be a number%'); end;
  begin r := public.apply_stock_txn('{"id":"zzB4b","kind":"in","moves":[{"id":"s_1","delta":"lots"}]}'); insert into _r values (2,'amount "lots" accepted',false);
  exception when others then insert into _r values (2,'amount "lots" refused: '||sqlerrm, sqlerrm like 'amount must be a number%'); end;
  begin r := public.apply_stock_txn('{"id":"zzB4c","kind":"in","moves":[{"delta":2}]}'); insert into _r values (3,'move without id accepted',false);
  exception when others then insert into _r values (3,'move without id refused: '||sqlerrm, sqlerrm like 'bad move%'); end;
  begin r := public.apply_stock_txn('{"id":"zzB4d","kind":"in","moves":[{"id":"s_1","delta":2.5}]}'); insert into _r values (4,'normal put-back of 2.5 saved', (r->'qtys'->0->>'qty') is not null);
  exception when others then insert into _r values (4,'normal put-back refused: '||sqlerrm,false); end;
end $$;
reset role;
select n, case when ok then 'PASS' else 'FAIL' end r, t from _r order by n;
rollback;
