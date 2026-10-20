-- Restore drill for db/audit_a7_backup.sql on the STAGING database. One transaction, rolled back: nothing is kept.
-- 1) full restore of a snapshot into an empty copy → must be identical byte for byte
-- 2) damage the live table (remove 10 clock entries, rename 5 stock items, change 2 schedule days), then
--    check → finds exactly the damage; missing → brings back only removed records; all → everything back
-- 3) damaged / foreign files refused; app users cannot call backup or restore
begin;
create temp table _t(n serial, test text, ok boolean, detail text) on commit drop;
create temp table _snap as select public.backup_snapshot() s;
create temp table _res(step text, r jsonb) on commit drop;
create or replace function pg_temp.fp(t text) returns text language plpgsql as $$ declare v text; begin
  execute format('select md5(string_agg(coll||''|''||id||''|''||data::text||''|''||deleted::text, ''~'' order by coll,id)) from %s', t) into v; return v; end $$;
insert into _t(test,ok,detail) select 'snapshot has every record', (s->'meta'->>'records')::int = (select count(*) from public.records), (s->'meta'->>'records')||' / '||(select count(*) from public.records) from _snap;
insert into _t(test,ok,detail) select 'snapshot includes the rules (functions, triggers, policies, tables) to rebuild a new project',
  jsonb_array_length(s->'schema'->'functions')>30 and jsonb_array_length(s->'schema'->'triggers')>5 and jsonb_array_length(s->'schema'->'policies')>3,
  jsonb_array_length(s->'schema'->'functions')||' functions, '||jsonb_array_length(s->'schema'->'triggers')||' triggers, '||jsonb_array_length(s->'schema'->'policies')||' policies, '||jsonb_array_length(s->'schema'->'tables')||' tables' from _snap;
insert into _res select 'drill', public.backup_restore(s,'all','drill') from _snap;
insert into _t(test,ok,detail) select 'restore into an empty copy: identical to the live data, every record byte for byte', pg_temp.fp('drill.records') = pg_temp.fp('public.records'), (select r::text from _res where step='drill');
update public.records set deleted = true where (coll,id) in (select coll,id from public.records where coll='punches' and not deleted order by id limit 10);
update public.records set data = data || '{"name":"DAMAGED"}' where (coll,id) in (select coll,id from public.records where coll='stock' order by id limit 5);
update public.records set data = data || jsonb_build_object('site','t999','rev', coalesce((data->>'rev')::int,0)+1) where (coll,id) in (select coll,id from public.records where coll='sched' and not deleted order by id limit 2);
insert into _res select 'check', public.backup_restore(s,'check') from _snap;
insert into _t(test,ok,detail) select 'check: finds exactly the 17 damaged records and changes nothing', (r->>'differ')::int=17 and (r->>'written')::int=0 and (select count(*) from public.records where data->>'name'='DAMAGED')=5, r::text from _res where step='check';
insert into _res select 'missing', public.backup_restore(s,'missing') from _snap;
insert into _t(test,ok,detail) select 'missing: brings back only the 10 removed clock entries, leaves other (possibly newer) changes alone', (r->>'written')::int=10 and (select count(*) from public.records where data->>'name'='DAMAGED')=5, r::text from _res where step='missing';
insert into _res select 'all', public.backup_restore(s,'all') from _snap;
insert into _t(test,ok,detail) select 'all: every record back as in the backup', (select count(*) from public.records where data->>'name'='DAMAGED')=0 and (select count(*) from public.records where coll='sched' and data->>'site'='t999')=0, r::text from _res where step='all';
insert into _t(test,ok,detail) select 'after the repair the data matches the backup (schedule days get a higher revision so phones accept them)',
  (select count(*) from jsonb_array_elements(s->'records') e join public.records x on x.coll=e.value->>'coll' and x.id=e.value->>'id' where (case when jsonb_typeof(x.data)='object' then x.data - 'rev' else x.data end) is distinct from (case when jsonb_typeof(e.value->'data')='object' then (e.value->'data') - 'rev' else e.value->'data' end) or x.deleted is distinct from (e.value->>'deleted')::boolean)=0, '' from _snap;
insert into _t(test,ok,detail) select 'every restore is written to the change log', (select count(*) from public.records_history where by_who like 'restore:%' and at > now() - interval '5 minutes') >= 17, (select count(*)::text from public.records_history where by_who like 'restore:%' and at > now() - interval '5 minutes');
do $d$ begin
  begin perform public.backup_restore((select jsonb_set(s,'{records}',(s->'records') - 0) from _snap),'all'); insert into _t(test,ok,detail) values ('a cut-off backup (a record missing) is refused',false,'accepted!');
  exception when others then insert into _t(test,ok,detail) values ('a cut-off backup (a record missing) is refused',true,sqlerrm); end;
  begin perform public.backup_restore('{"a":1}'::jsonb,'all'); insert into _t(test,ok,detail) values ('a file that is not an Electrix backup is refused',false,'accepted!');
  exception when others then insert into _t(test,ok,detail) values ('a file that is not an Electrix backup is refused',true,sqlerrm); end;
end $d$;
insert into _t(test,ok,detail) select 'app users cannot take or restore backups', not has_function_privilege('authenticated','public.backup_snapshot()','execute') and not has_function_privilege('authenticated','public.backup_restore(jsonb,text,text)','execute') and not has_function_privilege('anon','public.backup_snapshot()','execute'), '';
select n, case when ok then 'PASS' else 'FAIL' end result, test, left(detail,220) detail from _t order by n;
rollback;
