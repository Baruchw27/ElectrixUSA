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
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','u7@electrixusa.app'); set role authenticated;
select 'T12 worker makes himself owner', count(*) from save_records('[{"coll":"emps","id":"u7","patch":{"role":"owner"},"by":"u7"}]'::jsonb);
select 'T12 worker changes own language', count(*) from save_records('[{"coll":"emps","id":"u7","patch":{"lang":"es"},"by":"u7"}]'::jsonb);
select 'T12 worker adds a fake boss', count(*) from save_records('[{"coll":"emps","id":"evil","full":{"name":"x","role":"owner","authUid":"22222222-2222-2222-2222-222222222222"},"by":"u7"}]'::jsonb);
select 'T12 worker punch for someone else', count(*) from save_records('[{"coll":"punches","id":"pfake","full":{"who":"u9","site":"s1","in":1},"by":"u7"}]'::jsonb);
select 'T12 worker own punch in', count(*) from save_records('[{"coll":"punches","id":"pw","full":{"who":"u7","site":"s1","in":1000,"out":null,"pending":true},"by":"u7"}]'::jsonb);
select 'T12 worker approves own punch', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"pending":false,"approvedBy":"u7"},"by":"u7"}]'::jsonb);
select 'T12 worker moves clock-in', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"in":1},"by":"u7"}]'::jsonb);
select 'T12 worker clocks out', count(*) from save_records('[{"coll":"punches","id":"pw","patch":{"out":5000},"by":"u7"}]'::jsonb);
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
