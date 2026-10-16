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
