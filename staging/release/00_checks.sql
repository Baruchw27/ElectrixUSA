-- Run BEFORE and AFTER each database step (read-only). The "counts" fingerprint must be identical before and after.
select 'counts' as check, count(*) as items, coalesce(sum((data->>'qty')::numeric),0) as total_qty,
       md5(coalesce(string_agg(id||':'||coalesce(data->>'qty',''), ',' order by id),'')) as fingerprint
  from public.records where coll='stock' and not deleted
union all
select 'apply_stock_txn', null, null, md5(pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure))
union all
select 'count guard', (select count(*) from pg_trigger where tgname='records_guard_stock_qty' and tgrelid='public.records'::regclass), null,
       (select case when position('switched off' in pg_get_functiondef(p.oid)) > 0 then 'OFF' else 'ON' end from pg_proc p where p.proname='guard_stock_qty' and p.pronamespace='public'::regnamespace)
union all
select 'stock transactions applied so far', (select count(*) from public.stock_applied), null, null;
-- expected apply_stock_txn md5: before release 36d8402e664bd029acf5482fe98f40ae (production today)
--                               after release  b504913aeadab05b52a8e83154dea373 (same as staging)
