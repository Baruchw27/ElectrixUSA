-- Regression test for db/audit_a6_history.sql: older entries come back from the server with each person's own access
-- (worker = own only; Payroll / office = everyone); only clock entries and travel can be asked for. Rolled back.
begin;
insert into records(coll,id,data,deleted) values
 ('punches','zzOld7',jsonb_build_object('who','u7','site','s1','in',((extract(epoch from now())-200*86400)*1000)::bigint,'out',((extract(epoch from now())-200*86400+28800)*1000)::bigint),false),
 ('punches','zzOld8',jsonb_build_object('who','u8','site','s1','in',((extract(epoch from now())-200*86400)*1000)::bigint,'out',((extract(epoch from now())-200*86400+28800)*1000)::bigint),false),
 ('travel','zzOldT7',jsonb_build_object('who','u7','site','s2','date',to_char((now()-interval '200 days') at time zone 'America/New_York','YYYY-MM-DD'),'pay',30,'auto',true),false);
create temp table _r(who text, res text) on commit drop; grant all on _r to authenticated;
do $d$ declare u text; f bigint := ((extract(epoch from now())-205*86400)*1000)::bigint; t bigint := ((extract(epoch from now())-195*86400)*1000)::bigint; begin
 foreach u in array array['u7','u4','u3','u8'] loop
  perform set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from records where coll='emps' and id=u),'role','authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _r select u, (select string_agg(id,',' order by id) from public.history_records('punches',f,t)) || ' | travel: ' || coalesce((select string_agg(id,',') from public.history_records('travel',f,t)),'-') || ' | bad coll: ' || coalesce((select string_agg(id,',') from public.history_records('emphr',0,9999999999999)),'none');
  execute 'reset role';
 end loop; end $d$;
-- expected: u7 = zzOld7 | travel: zzOldT7 ; u4 and u3 = zzOld7,zzOld8 | travel: zzOldT7 ; u8 = zzOld8 | travel: - ; bad coll: none for all
select * from _r;
rollback;
