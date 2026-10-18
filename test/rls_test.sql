\set ON_ERROR_STOP 0
-- users
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','u1@electrixusa.app'),('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'),('33333333-3333-3333-3333-333333333333','hacker@x.com'),('44444444-4444-4444-4444-444444444444','u2@electrixusa.app');
create or replace function pg_temp.as_user(uid text, em text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub',uid,false); perform set_config('request.jwt.claim.email',em,false); end $$;
-- 1) first run: empty → owner can seed
select pg_temp.as_user('11111111-1111-1111-1111-111111111111','u1@electrixusa.app'); set role authenticated;
insert into records(coll,id,data) values ('emps','u1','{"name":"Baruch","role":"owner","authEmail":"u1@electrixusa.app","authUid":"11111111-1111-1111-1111-111111111111"}'),
 ('emps','u7','{"name":"Carlos","role":"worker","authEmail":"u7@electrixusa.app","authUid":"22222222-2222-2222-2222-222222222222","phone":"845-555-0107"}'),
 ('emps','u2','{"name":"Yossi","role":"manager","authEmail":"u2@electrixusa.app","authUid":"44444444-4444-4444-4444-444444444444"}'),
 ('sites','s1','{"name":"177 Bates Dr","stage":"active","phase":"rough","trello":"https://trello.com/c/AbC123/x"}');
select 'T1 owner sees', count(*) from records;
reset role;
-- 2) worker can read and write
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T2 worker sees', count(*) from records;
insert into records(coll,id,data) values ('punches','p1','{"who":"u7","site":"s1"}');
select 'T2 worker wrote', count(*) from records where coll='punches';
select 'T2 worker reset pw (should fail)'; select admin_set_password('u1@electrixusa.app','hacked1');
reset role;
-- 3) stranger
select pg_temp.as_user('33333333-3333-3333-3333-333333333333','hacker@x.com'); set role authenticated;
select 'T3 stranger sees', count(*) from records;
select 'T3 stranger insert (should fail)'; insert into records(coll,id,data) values ('jobs','evil','{}');
select 'T3 stranger update', count(*) from (update records set data='{}' where coll='sites' returning 1) x;
reset role;
-- 4) login lookup works for anyone
set role anon; select 'T4 resolve', resolve_login('carlos'), resolve_login('845 555 0107'), resolve_login('nobody'); reset role;
-- 5) boss resets a password
select pg_temp.as_user('44444444-4444-4444-4444-444444444444','u2@electrixusa.app'); set role authenticated;
select 'T5 boss reset', admin_set_password('u7@electrixusa.app','newpass1') is not null; reset role;
select 'T5 hash set', encrypted_password like '$2%' from auth.users where email='u7@electrixusa.app';
-- 6) deactivated worker loses access
update records set data=data||'{"inactive":true}' where coll='emps' and id='u7';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T6 inactive sees', count(*) from records; reset role;
-- 7) triggers → server calls
insert into server_config values ('functions_url','https://x.supabase.co/functions/v1'),('secret','s3cret');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111','u1@electrixusa.app'); set role authenticated;
insert into records(coll,id,data) values ('inbox','n1','{"to":"u2","msg":"Carlos is waiting to be clocked in"}');
update records set data=data||'{"read":true}' where coll='inbox' and id='n1';
update records set data=data||'{"stage":"inspection"}' where coll='sites' and id='s1';
update records set data=data||'{"note":"x"}' where coll='sites' and id='s1';
select 'T7 config hidden from app', count(*) from server_config;
reset role;
select 'T7 calls', url, body from net.calls order by id;
-- 8) private notes
reset role; update records set data=data-'inactive' where coll='emps' and id='u7';
select pg_temp.as_user('11111111-1111-1111-1111-111111111111','u1@electrixusa.app'); set role authenticated;
insert into records(coll,id,data) values ('keep','k1','{"owner":"u1","title":"Team passwords","collab":[]}'),('keep','k2','{"owner":"u1","title":"Shared w Carlos","collab":["u7"]}');
select 'T8 owner sees notes', count(*) from records where coll='keep';
reset role; select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T8 Carlos sees notes', string_agg(data->>'title',',') from records where coll='keep';
select 'T8 Carlos fakes owner note (should fail)'; insert into records(coll,id,data) values ('keep','k3','{"owner":"u1","title":"fake"}');
insert into records(coll,id,data) values ('keep','k4','{"owner":"u7","title":"mine"}');
select 'T8 Carlos own note ok', count(*) from records where coll='keep' and id='k4';
reset role; select pg_temp.as_user('44444444-4444-4444-4444-444444444444','u2@electrixusa.app'); set role authenticated;
select 'T8 Yossi sees notes', count(*) from records where coll='keep';
reset role;
-- 9) field-level save
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select save_records('[{"coll":"jobs","id":"j9","full":{"desc":"Hang lights","status":"open"}}]');
select save_records('[{"coll":"jobs","id":"j9","patch":{"status":"prog"},"unset":[]}]');
reset role; select pg_temp.as_user('44444444-4444-4444-4444-444444444444','u2@electrixusa.app'); set role authenticated;
select save_records('[{"coll":"jobs","id":"j9","patch":{"pri":true},"unset":["desc"]}]');
select 'T9 merged', data::text from records where coll='jobs' and id='j9';
select save_records('[{"coll":"jobs","id":"j9","deleted":true,"full":{}}]');
select 'T9 deleted', deleted from records where coll='jobs' and id='j9';
reset role; select pg_temp.as_user('33333333-3333-3333-3333-333333333333','hacker@x.com'); set role authenticated;
select 'T9 stranger save (should fail)'; select save_records('[{"coll":"jobs","id":"x1","full":{}}]');
reset role;
-- 10) creating sign-ins
reset role; set role anon; select 'T10 setup when team exists (should fail)'; select setup_owner('x@electrixusa.app','secret12'); reset role;
select pg_temp.as_user('44444444-4444-4444-4444-444444444444','u2@electrixusa.app'); set role authenticated;
select 'T10 boss creates', admin_create_user('u99@electrixusa.app','secret12') is not null;
reset role; select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T10 worker creates (should fail)'; select admin_create_user('u98@electrixusa.app','secret12');
reset role;
select 'T10 user row', email_confirmed_at is not null and encrypted_password like '$2%', (select count(*) from auth.identities i where i.user_id=u.id) from auth.users u where email='u99@electrixusa.app';
-- 11) privacy between employees
reset role;
insert into records(coll,id,data) values
 ('emps','u8','{"name":"Jon","role":"worker","lead":true,"crew":"c1","authUid":"55555555-5555-5555-5555-555555555555"}'),
 ('emps','u9','{"name":"Pedro","role":"worker","crew":"c1"}'),
 ('emps','u10','{"name":"Menachem","role":"office","title":"Material","authUid":"66666666-6666-6666-6666-666666666666"}'),
 ('punches','pj','{"who":"u9","site":"s1"}'),('punches','po','{"who":"u2","site":"s1"}'),
 ('exps','e1','{"who":"u2","amt":40}'),('exps','e7','{"who":"u7","amt":12}'),
 ('inbox','n1','{"to":"u2","msg":"for Yossi"}'),('inbox','n7','{"to":"u7","msg":"for Carlos"}'),
 ('meets','m1','{"by":"u2","with":["u1"],"title":"Yossi+Baruch"}'),('meets','m2','{"by":"u2","with":["u7"],"title":"Yossi+Carlos"}'),
 ('push','pu1','{"who":"u2","sub":{"endpoint":"x"}}') on conflict (coll,id) do update set data=excluded.data, deleted=false;
insert into auth.users(id,email) values ('55555555-5555-5555-5555-555555555555','u8@electrixusa.app'),('66666666-6666-6666-6666-666666666666','u10@electrixusa.app') on conflict do nothing;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T11 worker punches', string_agg(id,',' order by id) from records where coll='punches';
select 'T11 worker exps', string_agg(id,',' order by id) from records where coll='exps';
select 'T11 worker inbox', string_agg(id,',' order by id) from records where coll='inbox';
select 'T11 worker meets', string_agg(id,',' order by id) from records where coll='meets';
select 'T11 worker push', count(*) from records where coll='push';
select 'T11 worker sees jobs list', count(*) from records where coll='sites';
select 'T11 worker alerts the manager', count(*) from save_records('[{"coll":"inbox","id":"n99","full":{"to":"u2","msg":"Carlos is waiting"},"by":"u7"}]'::jsonb);
select 'T11 worker re-sends same alert', count(*) from save_records('[{"coll":"inbox","id":"n99","full":{"to":"u2","msg":"Carlos is waiting"},"by":"u7"}]'::jsonb);
with x as (update records set data='{"who":"u9","site":"hacked"}' where coll='punches' and id='pj' returning 1) select 'T11 worker cannot change others punch', count(*) from x;
select 'T11 worker saves own punch', count(*) from save_records('[{"coll":"punches","id":"p7","full":{"who":"u7","site":"s1"},"by":"u7"}]'::jsonb);
reset role;
select 'T11 alert stored once', count(*) from records where coll='inbox' and id='n99' and data->>'to'='u2';
select 'T11 pj untouched', data->>'site' from records where coll='punches' and id='pj';
select pg_temp.as_user('55555555-5555-5555-5555-555555555555','u8@electrixusa.app'); set role authenticated;
select 'T11 lead punches', string_agg(id,',' order by id) from records where coll='punches';
reset role;
select pg_temp.as_user('66666666-6666-6666-6666-666666666666','u10@electrixusa.app'); set role authenticated;
select 'T11 office punches', count(*) from records where coll='punches';
select 'T11 office (Material) exps', string_agg(id,',' order by id) from records where coll='exps';
reset role;
select pg_temp.as_user('44444444-4444-4444-4444-444444444444','u2@electrixusa.app'); set role authenticated;
select 'T11 manager exps', count(*) from records where coll='exps';
select 'T11 manager inbox', string_agg(id,',' order by id) from records where coll='inbox';
select 'T11 manager meets', string_agg(id,',' order by id) from records where coll='meets';
reset role;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111','u1@electrixusa.app'); set role authenticated;
select 'T11 owner meets', string_agg(id,',' order by id) from records where coll='meets';
select 'T11 owner punches', count(*) from records where coll='punches';
reset role;
-- 12) no self-promotion / self-approval
\set t0 `echo $(( $(date +%s) * 1000 - 7200000 ))`
\set t1 `echo $(( $(date +%s) * 1000 - 600000 ))`
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T12 worker makes himself owner', count(*) from save_records('[{"coll":"emps","id":"u7","patch":{"role":"owner"},"by":"u7"}]'::jsonb);
select 'T12 worker changes own language', count(*) from save_records('[{"coll":"emps","id":"u7","patch":{"lang":"es"},"by":"u7"}]'::jsonb);
select 'T12 worker adds a fake boss', count(*) from save_records('[{"coll":"emps","id":"evil","full":{"name":"x","role":"owner","authUid":"22222222-2222-2222-2222-222222222222"},"by":"u7"}]'::jsonb);
select 'T12 worker punch for someone else', count(*) from save_records('[{"coll":"punches","id":"pfake","full":{"who":"u9","site":"s1","in":1},"by":"u7"}]'::jsonb);
select 'T12 worker own punch in', count(*) from save_records(format('[{"coll":"punches","id":"pw","full":{"who":"u7","site":"s1","in":%s,"out":null,"pending":true},"by":"u7"}]', :t0)::jsonb);
select 'T12 worker approves own punch', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"pending":false,"approvedBy":"u7"},"by":"u7"}]'::jsonb);
select 'T12 worker moves clock-in', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"in":1},"by":"u7"}]'::jsonb);
select 'T12 worker clocks out', count(*) from save_records(format('[{"coll":"punches","id":"pw","patch":{"out":%s},"by":"u7"}]', :t1)::jsonb);
select 'T12 worker changes clock-out later', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"out":99999},"by":"u7"}]'::jsonb);
select 'T12 worker time off', count(*) from save_records('[{"coll":"timeoff","id":"tw","full":{"who":"u7","status":"pending"},"by":"u7"}]'::jsonb);
select 'T12 worker approves own time off', count(*) from save_records('[{"coll":"timeoff","id":"tw","patch":{"status":"approved"},"by":"u7"}]'::jsonb);
select 'T12 worker receipt', count(*) from save_records('[{"coll":"exps","id":"xw","full":{"who":"u7","amt":20,"paid":false},"by":"u7"}]'::jsonb);
select 'T12 worker marks own receipt paid', count(*) from save_records('[{"coll":"exps","id":"xw","patch":{"paid":true},"by":"u7"}]'::jsonb);
reset role;
select 'T12 result emps u7', data->>'role', data->>'lang' from records where coll='emps' and id='u7';
select 'T12 result evil exists', count(*) from records where coll='emps' and id='evil';
select 'T12 result pfake exists', count(*) from records where id='pfake';
select 'T12 result punch', data->>'in', data->>'out', data->>'pending', data->>'approvedBy' from records where id='pw';
select 'T12 result timeoff', data->>'status' from records where id='tw';
select 'T12 result receipt paid', data->>'paid' from records where id='xw';
select pg_temp.as_user('44444444-4444-4444-4444-444444444444','u2@electrixusa.app'); set role authenticated;
select 'T12 manager approves', count(*) from save_records('[{"coll":"timeoff","id":"tw","patch":{"status":"approved"},"by":"u2"},{"coll":"punches","id":"pw","patch":{"pending":false,"approvedBy":"u2"},"by":"u2"}]'::jsonb);
reset role;
select 'T12 manager result', (select data->>'status' from records where id='tw'), (select data->>'approvedBy' from records where id='pw');
select pg_temp.as_user('66666666-6666-6666-6666-666666666666','u10@electrixusa.app'); set role authenticated;
select 'T12 office approves out-of-fence punch', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"pending":false,"approvedBy":"u10"},"by":"u10"}]'::jsonb);
reset role;
-- 13) hardening: owner-only privileges, stamped authorship, history, files, ids
reset role;
insert into records(coll,id,data) values ('emps','u11','{"name":"Shia","role":"office","title":"Payroll","authUid":"77777777-7777-7777-7777-777777777777","authEmail":"u11@electrixusa.app"}') on conflict (coll,id) do update set data=excluded.data;
insert into auth.users(id,email) values ('77777777-7777-7777-7777-777777777777','u11@electrixusa.app') on conflict do nothing;
update records set data = data || '{"authEmail":"u1@electrixusa.app"}' where coll='emps' and id='u1';
-- manager (Yossi, u2) tries to take over
select pg_temp.as_user('44444444-4444-4444-4444-444444444444','u2@electrixusa.app'); set role authenticated;
select 'T13 manager makes himself owner', count(*) from save_records('[{"coll":"emps","id":"u2","patch":{"role":"owner"},"by":"u2"}]'::jsonb);
select 'T13 manager makes a worker a manager', count(*) from save_records('[{"coll":"emps","id":"u7","patch":{"role":"manager"},"by":"u2"}]'::jsonb);
select 'T13 manager gives a worker everyone-access', count(*) from save_records('[{"coll":"emps","id":"u7","patch":{"all":true},"by":"u2"}]'::jsonb);
select 'T13 manager moves a worker to crew c2 (allowed)', count(*) from save_records('[{"coll":"emps","id":"u7","patch":{"crew":"c2"},"by":"u2"}]'::jsonb);
select 'T13 manager deactivates the owner', count(*) from save_records('[{"coll":"emps","id":"u1","patch":{"inactive":true},"by":"u2"}]'::jsonb);
select 'T13 manager resets owner password (must fail)'; select admin_set_password('u1@electrixusa.app','takeover99');
select 'T13 manager re-creates owner sign-in (must fail)'; select admin_create_user('u1@electrixusa.app','takeover99');
select 'T13 manager resets a worker password', admin_set_password('u7@electrixusa.app','worker2026x') is not null;
select 'T13 manager adds a worker (allowed)', count(*) from save_records('[{"coll":"emps","id":"u12","full":{"name":"New Guy","role":"worker","crew":"c1"},"by":"u2"}]'::jsonb);
select 'T13 manager adds a fake owner (must fail)', count(*) from save_records('[{"coll":"emps","id":"u13","full":{"name":"Fake","role":"owner"},"by":"u2"}]'::jsonb);
select 'T13 manager edits Carlos clock-in (Payroll only)', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"in":7},"by":"u2"}]'::jsonb);
reset role;
select 'T13 result u2 role', data->>'role' from records where coll='emps' and id='u2';
select 'T13 result u7', data->>'role', data->>'all', data->>'crew' from records where coll='emps' and id='u7';
select 'T13 result owner active', coalesce(data->>'inactive','false') from records where coll='emps' and id='u1';
select 'T13 result fake owner exists', count(*) from records where coll='emps' and id='u13';
select 'T13 result punch in', data->>'in' from records where id='pw';
-- Payroll (Shia) edits hours and pays a receipt; can't touch the owner
select pg_temp.as_user('77777777-7777-7777-7777-777777777777','u11@electrixusa.app'); set role authenticated;
select 'T13 payroll fixes a clock-in', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"in":900,"edits":[{"by":"u11","why":"forgot"}]},"by":"u11"}]'::jsonb);
select 'T13 payroll pays a receipt', count(*) from save_records('[{"coll":"exps","id":"xw","patch":{"paid":true,"paidBy":"u11"},"by":"u11"}]'::jsonb);
select 'T13 payroll makes herself owner', count(*) from save_records('[{"coll":"emps","id":"u11","patch":{"role":"owner"},"by":"u11"}]'::jsonb);
select 'T13 payroll resets owner password (must fail)'; select admin_set_password('u1@electrixusa.app','takeover99');
reset role;
select 'T13 result punch after payroll', data->>'in' from records where id='pw';
select 'T13 result receipt paid', data->>'paid' from records where id='xw';
select 'T13 result u11 role', data->>'role' from records where coll='emps' and id='u11';
-- worker: forged authorship, forged task sender, forged chat, edit paid receipt, bad id
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T13 worker claims to be the owner in by', count(*) from save_records('[{"coll":"jobs","id":"j1","full":{"desc":"hi","from":"u7","to":["u2"]},"by":"u1"}]'::jsonb);
select 'T13 worker sends a task as the owner', count(*) from save_records('[{"coll":"jobs","id":"j2","full":{"desc":"Give Carlos a raise","from":"u1","to":["u11"]},"by":"u7"}]'::jsonb);
select 'T13 worker writes chat as the owner', count(*) from save_records('[{"coll":"jobs","id":"j1","patch":{"m_x1":{"by":"u1","text":"approved","ts":1}},"by":"u7"}]'::jsonb);
select 'T13 worker writes own chat', count(*) from save_records('[{"coll":"jobs","id":"j1","patch":{"m_x2":{"by":"u7","text":"done","ts":2}},"by":"u7"}]'::jsonb);
select 'T13 worker changes paid receipt amount', count(*) from save_records('[{"coll":"exps","id":"xw","patch":{"amt":999},"by":"u7"}]'::jsonb);
select 'T13 worker bad id (must fail)'; select count(*) from save_records('[{"coll":"jobs","id":"x\"><img src=x onerror=alert(1)>","full":{"desc":"x"},"by":"u7"}]'::jsonb);
select 'T13 worker deletes own punch', count(*) from save_records('[{"coll":"punches","id":"pw","deleted":true,"full":{},"by":"u7"}]'::jsonb);
select 'T13 worker meeting as someone else', count(*) from save_records('[{"coll":"meets","id":"mz","full":{"by":"u1","with":["u7"],"title":"x"},"by":"u7"}]'::jsonb);
select 'T13 direct delete'; delete from records where coll='jobs' and id='j1';
select 'T13 direct truncate'; truncate records;
select 'T13 read history'; select count(*) from records_history;
select 'T13 read backups'; select count(*) from records_backup;
select 'T13 read server secrets'; select count(*) from server_config;
reset role;
select 'T13 result j1 by', updated_by, data->>'from' from records where coll='jobs' and id='j1';
select 'T13 result forged task exists', count(*) from records where coll='jobs' and id='j2';
select 'T13 result chat', (data ? 'm_x1')::text, (data ? 'm_x2')::text from records where coll='jobs' and id='j1';
select 'T13 result receipt amt', data->>'amt' from records where id='xw';
select 'T13 result punch still there', deleted::text from records where id='pw';
select 'T13 result fake meeting', count(*) from records where id='mz';
select 'T13 history rows for pw', count(*) from records_history where id='pw';
select 'T13 history shows payroll edit', count(*) from records_history where id='pw' and by_who='u11' and old_data->>'in'=:'t0' and new_data->>'in'='900';
select 'T13 backup rows', public.backup_records() > 0;
-- anon gets nothing
set role anon;
select 'T13 anon reads records'; select count(*) from records;
select 'T13 anon my_emp_data'; select public.my_emp_data();
reset role;
-- files: receipt photo of Yossi is invisible to Carlos, other photos visible; Carlos can't replace Yossi's file
insert into storage.objects(bucket_id,name,owner_id) values ('files','exps/e1/rec.jpg','44444444-4444-4444-4444-444444444444'),('files','stockLog/s9/p.jpg','44444444-4444-4444-4444-444444444444'),('files','exps/xw/rec.jpg','22222222-2222-2222-2222-222222222222'),('files','exps/notyet/rec.jpg','22222222-2222-2222-2222-222222222222'),('files','exps/notyet2/rec.jpg','44444444-4444-4444-4444-444444444444');
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T13 worker sees files', string_agg(name, ',' order by name) from storage.objects;
with u as (update storage.objects set name=name where name='stockLog/s9/p.jpg' returning 1) select 'T13 worker overwrites others file', count(*) from u;
with u as (update storage.objects set name=name where name='exps/xw/rec.jpg' returning 1) select 'T13 worker replaces own file', count(*) from u;
reset role;
-- 14) restore after a mistake, from the daily copy
reset role;
select public.backup_records();
update records set data = data || '{"name":"OOPS"}' where coll='sites';
select 'T14 after mistake', count(*) from records where coll='sites' and data->>'name'='OOPS';
update records r set data = b.data, deleted = b.deleted from records_backup b
  where b.slot = (current_date - date '2026-01-01') % 14 and b.coll = r.coll and b.id = r.id and r.coll = 'sites';
select 'T14 after restore', count(*) from records where coll='sites' and data->>'name'='OOPS';
select 'T14 history kept the mistake and the fix', count(*) >= 2 from records_history where coll='sites';
-- 15) ids and id-fields can't carry code
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T15 site id with a quote', count(*) from save_records($j$[{"coll":"jobs","id":"zq1","full":{"desc":"x","site":"s1');alert(1);('","from":"u7"},"by":"u7"}]$j$::jsonb);
select 'T15 reply-to with markup', count(*) from save_records($j$[{"coll":"jobs","id":"j1","patch":{"m_zz":{"by":"u7","re":"x\"><img src=x onerror=alert(1)>","text":"hi"}},"by":"u7"}]$j$::jsonb);
select 'T15 normal text with quotes is fine', count(*) from save_records($j$[{"coll":"jobs","id":"zq2","full":{"desc":"Install 7\" can lights, Joe's job <rough>","from":"u7"},"by":"u7"}]$j$::jsonb);
reset role;
select 'T15 results', (select count(*) from records where id='zq1'), (select (data ? 'm_zz')::text from records where id='j1'), (select count(*) from records where id='zq2');
-- 16) after the independent check: push sign-ups, alert sender, taking over records, settings, fences, notes, decoy sign-in, time ranges
\set tn `echo $(( $(date +%s) * 1000 ))`
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T16 worker registers his phone for the owner''s alerts', count(*) from save_records('[{"coll":"push","id":"pz1","full":{"who":"u1","sub":{"endpoint":"x"}},"by":"u7"}]'::jsonb);
select 'T16 worker registers his own phone (normal)', count(*) from save_records('[{"coll":"push","id":"pz2","full":{"who":"u7","sub":{"endpoint":"x"}},"by":"u7"}]'::jsonb);
select 'T16 worker sends the manager an alert (normal)', count(*) from save_records('[{"coll":"inbox","id":"nz1","full":{"to":"u2","msg":"Carlos needs material","from":"u1"},"by":"u7"}]'::jsonb);
select 'T16 worker takes over the manager''s receipt'; select count(*) from save_records('[{"coll":"exps","id":"e1","patch":{"who":"u7"},"by":"u7"}]'::jsonb);
select 'T16 worker moves the office location', count(*) from save_records('[{"coll":"base","id":"lat","full":1,"by":"u7"}]'::jsonb);
select 'T16 worker deletes a job site', count(*) from save_records('[{"coll":"sites","id":"s1","deleted":true,"full":{},"by":"u7"}]'::jsonb);
select 'T16 worker widens a job fence', count(*) from save_records('[{"coll":"sites","id":"s1","patch":{"rad":99999},"by":"u7"}]'::jsonb);
select 'T16 worker adds a note to a job (normal)', count(*) from save_records('[{"coll":"sites","id":"s1","patch":{"note":"door code 1234"},"by":"u7"}]'::jsonb);
select 'T16 worker backdates a new clock-in 10 days', count(*) from save_records(format('[{"coll":"punches","id":"pz3","full":{"who":"u7","site":"s1","in":%s,"out":null},"by":"u7"}]', :tn - 864000000)::jsonb);
select 'T16 worker clock-in in the future', count(*) from save_records(format('[{"coll":"punches","id":"pz4","full":{"who":"u7","site":"s1","in":%s,"out":null},"by":"u7"}]', :tn + 7200000)::jsonb);
select 'T16 worker normal clock-in now', count(*) from save_records(format('[{"coll":"punches","id":"pz5","full":{"who":"u7","site":"s1","in":%s,"out":null},"by":"u7"}]', :tn - 60000)::jsonb);
select 'T16 worker first clock-out in the future', count(*) from save_records(format('[{"coll":"punches","id":"pz5","patch":{"out":%s},"by":"u7"}]', :tn + 7200000)::jsonb);
select 'T16 worker changes dates of approved time off', count(*) from save_records('[{"coll":"timeoff","id":"tw","patch":{"to":"2027-12-31"},"by":"u7"}]'::jsonb);
reset role;
select 'T16 results push', (select count(*) from records where id='pz1'), (select count(*) from records where id='pz2');
select 'T16 results alert sender stamped', data->>'from' from records where id='nz1';
select 'T16 results receipt owner', data->>'who' from records where id='e1';
select 'T16 results office lat is still a number', jsonb_typeof(data) from records where coll='base' and id='lat';
select 'T16 results site s1', deleted::text, coalesce(data->>'rad','-'), coalesce(data->>'note','-') from records where coll='sites' and id='s1';
select 'T16 results punches', (select count(*) from records where id='pz3'), (select count(*) from records where id='pz4'), (select count(*) from records where id='pz5'), (select coalesce(data->>'out','none') from records where id='pz5');
select 'T16 results time off to', data->>'to' from records where id='tw';
-- manager: office staff are owner-only; decoy record with the owner's email can't unlock a password reset
select pg_temp.as_user('44444444-4444-4444-4444-444444444444','u2@electrixusa.app'); set role authenticated;
select 'T16 manager creates an office person', count(*) from save_records('[{"coll":"emps","id":"u30","full":{"name":"New office","role":"office","title":"Inspections"},"by":"u2"}]'::jsonb);
select 'T16 manager creates a decoy with the owner''s email', count(*) from save_records('[{"coll":"emps","id":"u31","full":{"name":"Decoy","role":"worker","authEmail":"u1@electrixusa.app"},"by":"u2"}]'::jsonb);
select 'T16 manager resets owner password via decoy (must fail)'; select admin_set_password('u1@electrixusa.app','takeover99');
reset role;
select 'T16 results office person / decoy exist', (select count(*) from records where id='u30'), (select count(*) from records where id='u31');
-- note collaborator can't take the note
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T16 collaborator takes over a note', count(*) from save_records((select jsonb_build_array(jsonb_build_object('coll','keep','id',id,'patch',jsonb_build_object('owner','u7'),'by','u7')) from records where coll='keep' and data->>'owner'<>'u7' and data->'collab' ? 'u7' limit 1));
reset role;
select 'T16 results note owners still', string_agg(distinct data->>'owner', ',') from records where coll='keep' and data->'collab' ? 'u7';
