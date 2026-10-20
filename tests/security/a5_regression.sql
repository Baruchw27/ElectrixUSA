-- Regression tests for db/audit_a5_payroll.sql (late entries, who may change clock times, reasons, history).
-- Staging database, one transaction, rolled back: nothing is kept. Every row must say PASS.
begin;
create temp table _t(n serial, who text, test text, ok boolean, detail text) on commit drop;
grant all on _t to authenticated; grant usage on sequence _t_n_seq to authenticated;
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id=u),'role','authenticated')::text, true); end $$;
create or replace function pg_temp.p(i text) returns jsonb language sql as $$ select data from public.records where coll='punches' and id=i $$;
create or replace function pg_temp.t(who text, test text, q text, want text, chk text default null) returns void language plpgsql as $$
declare got text := 'ok'; v boolean := true;
begin
  perform pg_temp.as_user(who);
  begin execute 'set local role authenticated'; execute q; exception when others then got := 'refused ' || left(sqlerrm,70); end;
  execute 'reset role';
  if chk is not null then execute 'select coalesce(('||chk||'),false)' into v; end if;
  insert into _t(who, test, ok, detail) values (who, test, ((want = 'ok') = (got = 'ok')) and v, got || case when v then '' else ' (check failed)' end);
end $$;
create or replace function pg_temp.ms(min_ago int) returns bigint language sql as $$ select ((extract(epoch from now()) - min_ago*60) * 1000)::bigint $$;
-- u5 becomes an "all-access" user for this test only
update public.records set data = data || '{"all":true}' where coll='emps' and id='u5';

do $s$ begin
  -- normal clock-ins keep working and are not held
  perform pg_temp.t('u7','worker clocks in now: saved, counts normally', format($q$insert into public.records(coll,id,data,deleted) values('punches','zzP1',jsonb_build_object('who','u7','site','s1','in',%s),false)$q$, pg_temp.ms(0)), 'ok',
    $c$(select not coalesce((data->'pending')='true'::jsonb,false) and data->'hist'->0->>'act'='created' from public.records where coll='punches' and id='zzP1')$c$);
  perform pg_temp.t('u7','worker takes a break and ends it', $q$update public.records set data = data || jsonb_build_object('breaks', jsonb_build_array(jsonb_build_object('s',(data->>'in')::bigint+60000,'e',(data->>'in')::bigint+120000))) where coll='punches' and id='zzP1'$q$, 'ok');
  perform pg_temp.t('u7','worker clocks out', format($q$update public.records set data = data || jsonb_build_object('out',%s) where coll='punches' and id='zzP1'$q$, pg_temp.ms(0)), 'ok');
  -- late entries
  perform pg_temp.t('u7','worker enters a clock-in from 2 hours ago (e.g. sent late from no signal): saved but WAITING for Payroll', format($q$insert into public.records(coll,id,data,deleted) values('punches','zzL1',jsonb_build_object('who','u7','site','s1','in',%s),false)$q$, pg_temp.ms(120)), 'ok',
    $c$(select (data->'pending')='true'::jsonb and data ? 'lateEntry' and (data->'lateEntry'->>'in')::bigint=(data->>'in')::bigint and data->'hist'->0->>'act'='late' from public.records where coll='punches' and id='zzL1')$c$);
  perform pg_temp.t('u7','worker cannot mark it approved', $q$update public.records set data = data || '{"pending":false}' where coll='punches' and id='zzL1'$q$, 'refused');
  perform pg_temp.t('u7','worker cannot change the original that was received', $q$update public.records set data = data || '{"lateEntry":{"in":1}}' where coll='punches' and id='zzL1'$q$, 'ok',
    $c$(select (data->'lateEntry'->>'in')::bigint=(data->>'in')::bigint from public.records where coll='punches' and id='zzL1')$c$);
  perform pg_temp.t('u7','worker cannot erase the history', $q$update public.records set data = data || '{"hist":[]}' where coll='punches' and id='zzL1'$q$, 'ok',
    $c$(select jsonb_array_length(data->'hist')=1 from public.records where coll='punches' and id='zzL1')$c$);
  perform pg_temp.t('u7','worker can still clock out of it (still waiting)', format($q$update public.records set data = data || jsonb_build_object('out',%s) where coll='punches' and id='zzL1'$q$, pg_temp.ms(5)), 'ok',
    $c$(select (data->'pending')='true'::jsonb from public.records where coll='punches' and id='zzL1')$c$);
  perform pg_temp.t('u2','a manager cannot approve a late entry (Payroll only)', $q$update public.records set data = data || jsonb_build_object('pending',false,'approvedBy','u2') where coll='punches' and id='zzL1'$q$, 'refused');
  perform pg_temp.t('u3','office staff who are not Payroll cannot approve it', $q$update public.records set data = data || jsonb_build_object('pending',false,'approvedBy','u3') where coll='punches' and id='zzL1'$q$, 'refused');
  perform pg_temp.t('u5','an all-access user cannot approve it', $q$update public.records set data = data || jsonb_build_object('pending',false,'approvedBy','u5') where coll='punches' and id='zzL1'$q$, 'refused');
  perform pg_temp.t('u4','Payroll approves it: it now counts, approval recorded', $q$update public.records set data = data || jsonb_build_object('pending',false,'approvedBy','u4') where coll='punches' and id='zzL1'$q$, 'ok',
    $c$(select not ((data->'pending')='true'::jsonb) and data->'hist'->-1->>'act'='approved' and data->'hist'->-1->>'by'='u4' and data ? 'lateEntry' from public.records where coll='punches' and id='zzL1')$c$);
  perform pg_temp.t('u7','second late entry (yesterday)', format($q$insert into public.records(coll,id,data,deleted) values('punches','zzL2',jsonb_build_object('who','u7','site','s1','in',%s,'out',%s),false)$q$, pg_temp.ms(26*60), pg_temp.ms(17*60)), 'ok',
    $c$(select (data->'pending')='true'::jsonb from public.records where coll='punches' and id='zzL2')$c$);
  perform pg_temp.t('u4','Payroll rejecting without a reason is refused', $q$update public.records set data = data || jsonb_build_object('pending',false,'rejected',true) where coll='punches' and id='zzL2'$q$, 'refused');
  perform pg_temp.t('u4','Payroll rejects with a reason: kept, not counted, recorded', $q$update public.records set data = data || jsonb_build_object('pending',false,'rejected',true,'rejectWhy','was not on site that day') where coll='punches' and id='zzL2'$q$, 'ok',
    $c$(select data->'hist'->-1->>'act'='rejected' and data->'hist'->-1->>'why'='was not on site that day' from public.records where coll='punches' and id='zzL2')$c$);
  -- who may change clock times, and reasons
  perform pg_temp.t('u4','Payroll changing a clock-in WITHOUT a reason is refused', format($q$update public.records set data = data || jsonb_build_object('in',%s) where coll='punches' and id='zzP1'$q$, pg_temp.ms(30)), 'refused');
  perform pg_temp.t('u4','Payroll changes the clock-in with a reason: saved, before/after recorded', format($q$update public.records set data = data || jsonb_build_object('in',%s,'edits',jsonb_build_array(jsonb_build_object('by','u4','at',%s,'why','forgot to clock in at 7'))) where coll='punches' and id='zzP1'$q$, pg_temp.ms(30), pg_temp.ms(0)), 'ok',
    $c$(select data->'hist'->-1->>'act'='edited' and data->'hist'->-1->>'why'='forgot to clock in at 7' and data->'hist'->-1->'from' ? 'in' from public.records where coll='punches' and id='zzP1')$c$);
  perform pg_temp.t('u4','Payroll cannot rewrite earlier reasons', $q$update public.records set data = data || jsonb_build_object('edits',jsonb_build_array(jsonb_build_object('by','u4','at',1,'why','something else'))) where coll='punches' and id='zzP1'$q$, 'refused');
  perform pg_temp.t('u5','an all-access user cannot change clock times (even with a reason)', format($q$update public.records set data = data || jsonb_build_object('in',%s,'edits',(data->'edits') || jsonb_build_array(jsonb_build_object('by','u5','at',1,'why','because'))) where coll='punches' and id='zzP1'$q$, pg_temp.ms(40)), 'refused');
  perform pg_temp.t('u5','an all-access user cannot add a clock entry for someone else', format($q$insert into public.records(coll,id,data,deleted) values('punches','zzA1',jsonb_build_object('who','u7','site','s1','in',%s,'edits',jsonb_build_array(jsonb_build_object('by','u5','at',1,'why','missed punch'))),false)$q$, pg_temp.ms(0)), 'refused');
  perform pg_temp.t('u5','an all-access user cannot remove a clock entry', $q$update public.records set deleted = true where coll='punches' and id='zzP1'$q$, 'refused');
  perform pg_temp.t('u2','a manager cannot change clock times', format($q$update public.records set data = data || jsonb_build_object('in',%s,'edits',(data->'edits') || jsonb_build_array(jsonb_build_object('by','u2','at',1,'why','because'))) where coll='punches' and id='zzP1'$q$, pg_temp.ms(40)), 'refused');
  perform pg_temp.t('u1','Owner changing clock times without a reason is refused', format($q$update public.records set data = data || jsonb_build_object('in',%s) where coll='punches' and id='zzP1'$q$, pg_temp.ms(45)), 'refused');
  perform pg_temp.t('u1','Owner changes them with a reason', format($q$update public.records set data = data || jsonb_build_object('in',%s,'edits',(data->'edits') || jsonb_build_array(jsonb_build_object('by','u1','at',2,'why','checked with foreman'))) where coll='punches' and id='zzP1'$q$, pg_temp.ms(45)), 'ok',
    $c$(select jsonb_array_length(data->'edits')=2 and data->'hist'->-1->>'by'='u1' from public.records where coll='punches' and id='zzP1')$c$);
  perform pg_temp.t('u4','Payroll adding a missed punch WITHOUT a reason is refused', format($q$insert into public.records(coll,id,data,deleted) values('punches','zzM1',jsonb_build_object('who','u8','site','s1','in',%s,'out',%s),false)$q$, pg_temp.ms(600), pg_temp.ms(120)), 'refused');
  perform pg_temp.t('u4','Payroll adds a missed punch with a reason: counts right away, recorded', format($q$insert into public.records(coll,id,data,deleted) values('punches','zzM1',jsonb_build_object('who','u8','site','s1','in',%s,'out',%s,'edits',jsonb_build_array(jsonb_build_object('by','u4','at',1,'why','paper timesheet from foreman'))),false)$q$, pg_temp.ms(600), pg_temp.ms(120)), 'ok',
    $c$(select not coalesce((data->'pending')='true'::jsonb,false) and data->'hist'->0->>'act'='added' from public.records where coll='punches' and id='zzM1')$c$);
  perform pg_temp.t('u4','Payroll removes (voids) an entry with a reason: kept, recorded', $q$update public.records set data = data || jsonb_build_object('voided',jsonb_build_object('by','u4','at',1,'why','duplicate'),'edits',coalesce(data->'edits','[]'::jsonb) || jsonb_build_array(jsonb_build_object('by','u4','at',3,'why','duplicate'))) where coll='punches' and id='zzM1'$q$, 'ok',
    $c$(select data->'hist'->-1->>'act'='voided' from public.records where coll='punches' and id='zzM1')$c$);
  perform pg_temp.t('u7','worker cannot remove a clock entry', $q$update public.records set deleted = true where coll='punches' and id='zzP1'$q$, 'refused');
  perform pg_temp.t('u4','Payroll deleting (older app): the original data is kept in the record', $q$select public.save_records(jsonb_build_array(jsonb_build_object('coll','punches','id','zzP1','deleted',true,'full','{}'::jsonb)))$q$, 'ok',
    $c$(select deleted and data->>'who'='u7' and data ? 'in' and data->'hist'->-1->>'act'='deleted' from public.records where coll='punches' and id='zzP1')$c$);
  -- Payroll's own late entry needs someone else
  perform pg_temp.t('u4','Payroll''s own late clock-in also waits', format($q$insert into public.records(coll,id,data,deleted) values('punches','zzL3',jsonb_build_object('who','u4','site','s1','in',%s),false)$q$, pg_temp.ms(90)), 'ok',
    $c$(select (data->'pending')='true'::jsonb from public.records where coll='punches' and id='zzL3')$c$);
  perform pg_temp.t('u4','Payroll cannot approve their own late entry', $q$update public.records set data = data || jsonb_build_object('pending',false,'approvedBy','u4') where coll='punches' and id='zzL3'$q$, 'refused');
  perform pg_temp.t('u1','Owner approves it', $q$update public.records set data = data || jsonb_build_object('pending',false,'approvedBy','u1') where coll='punches' and id='zzL3'$q$, 'ok',
    $c$(select data->'hist'->-1->>'act'='approved' and data->'hist'->-1->>'by'='u1' from public.records where coll='punches' and id='zzL3')$c$);
  -- existing "ask the office to clock me in" (not late) still approved by a manager
  perform pg_temp.t('u7','worker asks the office to clock them in (outside the fence, now)', format($q$insert into public.records(coll,id,data,deleted) values('punches','zzS1',jsonb_build_object('who','u7','site','s1','in',%s,'pending',true,'semi',true),false)$q$, pg_temp.ms(0)), 'ok');
  perform pg_temp.t('u2','manager approves that request (unchanged behaviour), recorded', $q$update public.records set data = data || jsonb_build_object('pending',false,'approvedBy','u2') where coll='punches' and id='zzS1'$q$, 'ok',
    $c$(select data->'hist'->-1->>'act'='approved' from public.records where coll='punches' and id='zzS1')$c$);
  -- material run (left the site, back within the hour) and automatic punch-out still work for a worker
  perform pg_temp.t('u7','worker leaves the site, comes back (material run recorded)', $q$update public.records set data = (data || jsonb_build_object('trips', jsonb_build_array(jsonb_build_object('left',(data->>'in')::bigint+60000,'back',(data->>'in')::bigint+90000)))) - 'away' where coll='punches' and id='zzS1'$q$, 'ok');
end $s$;
select n, case when ok then 'PASS' else 'FAIL' end result, who, test, detail from _t order by n;
rollback;
