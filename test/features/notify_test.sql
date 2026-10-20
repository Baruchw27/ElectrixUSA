-- Features v1 — notification rules, database tests (local Postgres with the full schema, or staging inside a rolled-back transaction).
-- Prints one line per check: "N<k> <name>|<value>|<expected>".
begin;
set local client_min_messages = warning;
-- people: owner u1, manager u2, Payroll o1 (author of some changes), crew c1: u6 (leader), u7, u8 (inactive)
delete from private.notify_queue;
insert into records(coll,id,data,deleted,updated_by,updated_at) values
 ('emps','zu1','{"id":"zu1","name":"Owner T","role":"owner","authUid":"00000000-0000-0000-0000-00000000aa01"}',false,'t',now()),
 ('emps','zu2','{"id":"zu2","name":"Mgr T","role":"manager","authUid":"00000000-0000-0000-0000-00000000aa02"}',false,'t',now()),
 ('emps','zo1','{"id":"zo1","name":"Pay T","role":"office","title":"Payroll","authUid":"00000000-0000-0000-0000-00000000aa03"}',false,'t',now()),
 ('emps','zu6','{"id":"zu6","name":"Lead T","role":"worker","crew":"zc1","lead":true}',false,'t',now()),
 ('emps','zu7','{"id":"zu7","name":"Work T","role":"worker","crew":"zc1"}',false,'t',now()),
 ('emps','zu8','{"id":"zu8","name":"Gone T","role":"worker","crew":"zc1","inactive":true}',false,'t',now()),
 ('sites','zs1','{"id":"zs1","name":"29 Oxford Dr, Monsey, NY","stage":"upcoming","crew":"zc1"}',false,'t',now()),
 ('sites','zs2','{"id":"zs2","name":"12 Main St, Suffern, NY"}',false,'t',now());
create temp table k(today date, tmr date, later date);
insert into k select (now() at time zone 'America/New_York')::date, (now() at time zone 'America/New_York')::date+1, (now() at time zone 'America/New_York')::date+3;
grant select on k to authenticated;

-- N1 a crew's day today is booked → every active crew member, not the inactive one
insert into records(coll,id,data,deleted,updated_by,updated_at) select 'sched','zc1|'||today,
  jsonb_build_object('site','zs1','time','7:00 AM','assignments',jsonb_build_array(jsonb_build_object('id','a1','site','zs1','start',420,'end',930,'note',''))),false,'t',now() from k;
select 'N1 crew told (today)|'||string_agg(to_emp,',' order by to_emp)||'|zu6,zu7' from private.notify_queue where topic like 'sched:%';
select 'N1 wording|'||(select msg from private.notify_queue where to_emp='zu7' limit 1)||'|📅 Schedule changed for today: 29 Oxford Dr 7:00 AM';
-- N2 a save that changes only bookkeeping (rev/by/at, assignment id) → nothing new
delete from private.notify_queue;
update records set data = data || '{"rev":5,"by":"x","at":1}'::jsonb || jsonb_build_object('assignments',jsonb_build_array(jsonb_build_object('id','zz','site','zs1','start',420,'end',930,'note',''))) where coll='sched' and id=(select 'zc1|'||today from k);
select 'N2 bookkeeping only|'||count(*)||'|0' from private.notify_queue;
-- N3 a day three days ahead → nobody (workers can't see it yet)
insert into records(coll,id,data,deleted,updated_by,updated_at) select 'sched','zc1|'||later,'{"assignments":[{"site":"zs2","start":420}]}',false,'t',now() from k;
select 'N3 later day|'||count(*)||'|0' from private.notify_queue;
-- N4 a person moved to another job tomorrow → that person only
insert into records(coll,id,data,deleted,updated_by,updated_at) select 'sched','L:zu7|'||tmr,'{"emp":"zu7","assignments":[{"site":"zs2","start":720,"end":960}]}',false,'t',now() from k;
select 'N4 moved person|'||string_agg(to_emp||':'||msg,',')||'|zu7:📅 Schedule changed for tomorrow: 12 Main St 12:00 PM' from private.notify_queue;
-- N5 the day is cleared → crew told "no job booked"
delete from private.notify_queue;
update records set deleted = true where coll='sched' and id=(select 'zc1|'||today from k);
select 'N5 cleared day says open the app|'||count(*)||'|2' from private.notify_queue where msg like '%open the app to see it';
-- N5b an exception to the ongoing job (patch row) never lists a guessed job
delete from private.notify_queue;
update records set deleted=false, data='{"patch":true,"cancel":["ONG"],"assignments":[{"site":"zs2","start":600}]}'::jsonb where coll='sched' and id=(select 'zc1|'||today from k);
select 'N5b exception row says open the app|'||count(*) filter (where msg like '%open the app to see it')||'/'||count(*)||'|2/2' from private.notify_queue;
-- N6 ongoing job that applies today → crew; one ending last month → nobody
delete from private.notify_queue;
insert into records(coll,id,data,deleted,updated_by,updated_at) select 'sched','ONG:zc1:r1',jsonb_build_object('site','zs2','from',today-10,'start',420),false,'t',now() from k;
insert into records(coll,id,data,deleted,updated_by,updated_at) select 'sched','ONG:zc1:r0',jsonb_build_object('site','zs2','from',today-60,'to',today-30),false,'t',now() from k;
select 'N6 ongoing|'||count(*)||'|2' from private.notify_queue;
-- N7 a late clock entry waiting for Payroll → owner + Payroll, never the worker
delete from private.notify_queue;
insert into records(coll,id,data,deleted,updated_by,updated_at) values ('punches','zp1',jsonb_build_object('who','zu7','site','zs1','in',(extract(epoch from now())*1000)::bigint-7200000,'pending',true,'lateEntry',true),false,'t',now());
select 'N7 late entry|'||string_agg(to_emp,',' order by to_emp)||'|zo1,zu1' from private.notify_queue;
update records set data = data || '{"note":"x"}' where coll='punches' and id='zp1';
select 'N7 not again on edit|'||count(*)||'|2' from private.notify_queue;
-- N8 new site manager → that manager; stage change → manager + crew leader (not plain workers)
delete from private.notify_queue;
update records set data = data || '{"manager":"zu2"}' where coll='sites' and id='zs1';
select 'N8 new manager|'||string_agg(to_emp||':'||msg,',')||'|zu2:📁 You are now the site manager for 29 Oxford Dr' from private.notify_queue;
delete from private.notify_queue;
update records set data = data || '{"stage":"active"}' where coll='sites' and id='zs1';
select 'N8 stage change|'||string_agg(to_emp,',' order by to_emp)||'|zu2,zu6' from private.notify_queue;
-- N9 the person who made the change is not told (manager changes his own crew's day as a signed-in user)
delete from private.notify_queue;
update records set data = data || '{"crew":"zc1"}' where coll='emps' and id='zu2';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa02';
insert into records(coll,id,data,deleted,updated_by,updated_at) select 'sched','zc1|'||tmr,'{"assignments":[{"site":"zs1","start":420}]}',false,'t',now() from k;
reset request.jwt.claim.sub;
select 'N9 author left out|'||string_agg(to_emp,',' order by to_emp)||'|zu6,zu7' from private.notify_queue;
-- N10 sending: three quick edits → one notice per person with the newest wording; nothing before 30 s
delete from private.notify_queue; delete from records where coll='inbox' and data->>'to' like 'z%';
select private.fv1_queue('zu7','sched:test','📅 first',jsonb_build_object('sched','x')), private.fv1_queue('zu7','sched:test','📅 second',jsonb_build_object('sched','x')), private.fv1_queue('zu7','sched:test','📅 newest',jsonb_build_object('sched','x'));
select 'N10 waits for more edits|'||private.fv1_send_notices()||'|0';
update private.notify_queue set created_at = now() - interval '40 seconds';
select 'N10 sent once|'||private.fv1_send_notices()||'|1';
select 'N10 newest wording|'||(select data->>'msg' from records where coll='inbox' and data->>'to'='zu7')||'|📅 newest';
select 'N10 nothing left|'||count(*)||'|0' from private.notify_queue where not sent;
-- N11 the app already told the person about that item → the server does not repeat it
insert into records(coll,id,data,deleted,updated_by,updated_at) values ('inbox','zn-app',jsonb_build_object('id','zn-app','to','zu6','msg','📁 from app','link',jsonb_build_object('site','zs9'),'from','zu1','ts',1),false,'t',now());
select private.fv1_queue('zu6','site:zs9:stage','🏗 from server',jsonb_build_object('site','zs9'));
update private.notify_queue set created_at = now() - interval '40 seconds';
select 'N11 no repeat|'||private.fv1_send_notices()||'|0';
-- N12 a long run of edits is still sent within 2 minutes
select private.fv1_queue('zu6','sched:long','📅 a',jsonb_build_object('sched','y'));
update private.notify_queue set created_at = now() - interval '3 minutes' where topic='sched:long';
select private.fv1_queue('zu6','sched:long','📅 b',jsonb_build_object('sched','y'));
select 'N12 not held forever|'||private.fv1_send_notices()||'|1';
-- N13 the phone notification carries the alert id and link
delete from net.calls;
insert into server_config values ('functions_url','https://x/functions/v1'),('secret','s') on conflict (k) do update set v=excluded.v;
insert into records(coll,id,data,deleted,updated_by,updated_at) values ('inbox','zn-push',jsonb_build_object('id','zn-push','to','zu7','msg','hi','kind','info','link',jsonb_build_object('job','j1')),false,'t',now());
select 'N13 push has id + link|'||(select (body->>'id')||' '||(body->'link')::text from net.calls where url like '%/notify' order by id desc limit 1)||'|zn-push {"job": "j1"}';
-- N14 a broken record never blocks the save itself
insert into records(coll,id,data,deleted,updated_by,updated_at) values ('sched','zc1|not-a-date','{"site":"zs1"}',false,'t',now());
select 'N14 bad record still saved|'||count(*)||'|1' from records where coll='sched' and id='zc1|not-a-date';
-- N16 Spanish-speaking crew members get Spanish
delete from private.notify_queue;
update records set data = data || '{"lang":"es"}' where coll='emps' and id='zu7';
insert into records(coll,id,data,deleted,updated_by,updated_at) select 'sched','zc1|'||tmr||'x','{}',false,'t',now() from k;
update records set data = '{"assignments":[{"site":"zs2","start":420}]}' where coll='sched' and id=(select 'zc1|'||tmr from k);
select 'N16 Spanish|'||(select msg from private.notify_queue where to_emp='zu7')||'|📅 Cambió el horario de mañana: 12 Main St 7:00 AM';
select 'N16 English stays English|'||(select msg from private.notify_queue where to_emp='zu6')||'|📅 Schedule changed for tomorrow: 12 Main St 7:00 AM';
-- N15 nobody signed in can read or change the queue
set local role authenticated;
select 'N15 queue private|'||(case when has_table_privilege('authenticated','private.notify_queue','select') then 'readable' else 'private' end)||'|private';
reset role;
rollback;
