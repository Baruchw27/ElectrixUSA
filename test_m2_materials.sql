-- Regression for db/audit_m2_materials.sql (staging, everything rolled back). Every row must say PASS.
-- People: u1 owner, u2 manager (catalog manager for this test), u3 office made "Material" (like Menachem),
-- u4 Payroll office (not a catalog manager), u6 crew leader, u7 worker (asks for material), u8 worker (not on the list).
begin;
create temp table _t(n serial, test text, ok boolean, detail text) on commit drop;
grant all on _t to authenticated; grant usage on sequence _t_n_seq to authenticated;
create or replace function pg_temp.expect(t text, q text, want text) returns void language plpgsql as $$
declare got text := 'ok'; c int;
begin
  begin execute q; get diagnostics c = row_count; if c = 0 and q ilike 'update%' then got := 'no row changed'; end if;
  exception when others then got := 'blocked ' || sqlstate || ' ' || left(sqlerrm, 70); end;
  insert into _t(test, ok, detail) values (t, (want = 'ok') = (got = 'ok'), got);
end $$;
create or replace function pg_temp.check(t text, cond boolean, detail text) returns void language plpgsql as $$
begin insert into _t(test, ok, detail) values (t, coalesce(cond,false), detail); end $$;
create or replace function pg_temp.who(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id=u),'role','authenticated')::text, true) $$;
create or replace function pg_temp.st(i text) returns jsonb language sql as $$ select data from public.records where coll='stock' and id=i $$;
create or replace function pg_temp.mt(i text) returns jsonb language sql as $$ select data from public.records where coll='mats' and id=i $$;
update records set data = data || '{"title":"Material"}' where coll='emps' and id='u3';
update server_config set v = '["u2"]' where k = 'catalog_managers';
insert into records(coll,id,data,deleted) values
  ('stock','zzM2a', '{"id":"zzM2a","name":"ZZ 12/2 NM-B test coil","unit":"coil","cat":"Romex (NM-B)","sec":"res","qty":50,"qv":3,"counted":1,"countedBy":"u3","crev":1}', false),
  ('stock','zzM2b', '{"id":"zzM2b","name":"ZZ 20A TR receptacle test","unit":"pc","cat":"Receptacles","sec":"res","qty":200,"qv":1,"counted":1,"crev":1}', false),
  ('stock','zzM2d', '{"id":"zzM2d","name":"ZZ 12/2 Romex 250 dup","unit":"box","cat":"Wire","qty":5,"qv":1,"counted":1,"crev":1}', false);

-- ── catalog: who may change what a material is ──
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker cannot add a material to the catalog', $q$insert into records(coll,id,data,deleted) values ('stock','zzM2w','{"name":"ZZ worker item","unit":"pc"}',false)$q$, 'blocked');
select pg_temp.expect('worker renaming a material: the save goes through …', $q$update records set data = data || '{"name":"ZZ renamed by worker","cat":"Junk"}' where coll='stock' and id='zzM2a'$q$, 'ok');
select pg_temp.expect('worker scanning a barcode onto a material', $q$update records set data = data || '{"codes":["0123456789012"]}' where coll='stock' and id='zzM2a'$q$, 'ok');
reset role;
select pg_temp.check('… but the name and category stay as they were', (select data->>'name'='ZZ 12/2 NM-B test coil' and data->>'cat'='Romex (NM-B)' from records where coll='stock' and id='zzM2a'), (select data->>'name' from records where coll='stock' and id='zzM2a'));
select pg_temp.check('… while the barcode is saved', (select data->'codes' = '["0123456789012"]' from records where coll='stock' and id='zzM2a'), null);
select pg_temp.who('u4'); set local role authenticated;
select pg_temp.expect('Payroll office (not a catalog manager) changes the unit', $q$update records set data = data || '{"unit":"ft","fav":true}' where coll='stock' and id='zzM2a'$q$, 'ok');
reset role;
select pg_temp.check('… unit and favorite unchanged (only catalog managers)', (select data->>'unit'='coil' and not (data ? 'fav') from records where coll='stock' and id='zzM2a'), null);
select pg_temp.who('u2'); set local role authenticated;
select pg_temp.expect('catalog manager renames (from the current version)', $q$update records set data = data || '{"name":"ZZ 12/2 NM-B Romex — 250 ft coil","fav":true,"pkg":"250 ft coil","ft":250,"crev":1}' where coll='stock' and id='zzM2a'$q$, 'ok');
reset role;
select pg_temp.check('… renamed, favorite, package saved; version 2; old name remembered', (select data->>'name'='ZZ 12/2 NM-B Romex — 250 ft coil' and (data->>'fav')::boolean and data->>'crev'='2' and data->'aka' ? 'ZZ 12/2 NM-B test coil' and data->>'cedBy'='u2' from records where coll='stock' and id='zzM2a'), (select data::text from records where coll='stock' and id='zzM2a'));
select pg_temp.check('… garage count untouched by the catalog edit (50)', (select data->>'qty'='50' and data->>'qv'='3' from records where coll='stock' and id='zzM2a'), null);
select pg_temp.who('u2'); set local role authenticated;
select pg_temp.expect('a phone with an OLD copy (version 1) of that material saves it', $q$update records set data = data || '{"name":"ZZ 12/2 NM-B test coil","crev":1,"codes":["0123456789012","999"]}' where coll='stock' and id='zzM2a'$q$, 'ok');
reset role;
select pg_temp.check('… the newer name stays; the barcode still saved', (select data->>'name'='ZZ 12/2 NM-B Romex — 250 ft coil' and data->>'crev'='2' and data->'codes' ? '999' from records where coll='stock' and id='zzM2a'), (select data::text from records where coll='stock' and id='zzM2a'));
select pg_temp.who('u2'); set local role authenticated;
select pg_temp.expect('catalog manager adds a new material', $q$insert into records(coll,id,data,deleted) values ('stock','zzM2n','{"name":"ZZ 14/2 NM-B Romex — 1000 ft reel","unit":"reel","sec":"res","cat":"Romex (NM-B)"}',false)$q$, 'ok');
select pg_temp.expect('… a material with a name that already exists is refused (no duplicates)', $q$insert into records(coll,id,data,deleted) values ('stock','zzM2n2','{"name":"zz 20a tr receptacle TEST","unit":"pc"}',false)$q$, 'blocked');
select pg_temp.expect('… an OLD name of a renamed material is refused too (old app copies)', $q$insert into records(coll,id,data,deleted) values ('stock','zzM2n3','{"name":"ZZ 12/2 NM-B test coil","unit":"coil"}',false)$q$, 'blocked');
select pg_temp.expect('… renaming to another material''s name is refused', $q$update records set data = data || '{"name":"ZZ 20A TR receptacle test","crev":1}' where coll='stock' and id='zzM2n'$q$, 'blocked');
select pg_temp.expect('catalog manager hides a material', $q$update records set data = data || '{"hidden":true,"crev":1}' where coll='stock' and id='zzM2b'$q$, 'ok');
reset role;
select pg_temp.check('new material stamped (version 1, by u2), garage count 0', (select data->>'crev'='1' and data->>'cedBy'='u2' and data->>'qty'='0' from records where coll='stock' and id='zzM2n'), (select data::text from records where coll='stock' and id='zzM2n'));
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker un-hides it', $q$update records set data = data || '{"hidden":false,"crev":2}' where coll='stock' and id='zzM2b'$q$, 'ok');
select pg_temp.expect('worker cannot merge materials', $q$select public.catalog_merge('zzM2d','zzM2a')$q$, 'blocked');
select pg_temp.expect('worker cannot remove a material', $q$update records set deleted = true where coll='stock' and id='zzM2b'$q$, 'blocked');
reset role;
select pg_temp.who('u4'); set local role authenticated;
select pg_temp.expect('Payroll office (not a catalog manager) cannot remove a material either', $q$update records set deleted = true where coll='stock' and id='zzM2b'$q$, 'blocked');
reset role;
select pg_temp.check('… still hidden', (select (data->>'hidden')::boolean from records where coll='stock' and id='zzM2b'), null);
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('owner (always a catalog manager) restores it', $q$update records set data = data || '{"hidden":false,"crev":2}' where coll='stock' and id='zzM2b'$q$, 'ok');
reset role;
select pg_temp.check('… restored', (select not (data->>'hidden')::boolean from records where coll='stock' and id='zzM2b'), null);
select pg_temp.who('u2'); set local role authenticated;
select pg_temp.expect('catalog manager merges a duplicate (5 in the garage) into the one that stays (50)', $q$select public.catalog_merge('zzM2d','zzM2a')$q$, 'ok');
select pg_temp.expect('… merging it again does nothing', $q$select public.catalog_merge('zzM2d','zzM2a')$q$, 'ok');
reset role;
select pg_temp.check('… the count moved over once (55 / 0), duplicate hidden + points to the one that stays', (select (pg_temp.st('zzM2a')->>'qty')::numeric=55 and (pg_temp.st('zzM2d')->>'qty')::numeric=0 and (pg_temp.st('zzM2d')->>'hidden')::boolean and pg_temp.st('zzM2d')->>'mergedInto'='zzM2a'), (pg_temp.st('zzM2a')->>'qty')||' / '||(pg_temp.st('zzM2d')->>'qty'));
select pg_temp.check('… written to the garage history', (select count(*)=1 from records where coll='stockLog' and id like 'merge_zzM2d_%' and data->>'reason' like 'Merged duplicate%'), null);
select pg_temp.check('… the duplicate''s name is remembered on the one that stays', (select pg_temp.st('zzM2a')->'aka' ? 'ZZ 12/2 Romex 250 dup'), null);
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker cannot make a template', $q$insert into records(coll,id,data,deleted) values ('mtpl','zzM2t','{"name":"x","items":[]}',false)$q$, 'blocked');
select pg_temp.check('catalog_managers(): the app learns who manages (u2 + the owner)', (select public.catalog_managers() @> '["u2","u1"]'), (select public.catalog_managers()::text));
reset role;
select pg_temp.who('u2'); set local role authenticated;
select pg_temp.expect('catalog manager makes a template', $q$insert into records(coll,id,data,deleted) values ('mtpl','zzM2t','{"name":"Rough-in","items":[{"sid":"zzM2a","q":2}]}',false)$q$, 'ok');
reset role;

-- ── a material request: worker u7 asks; u3 (Material) prepares ──
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker sends a request (3 items, one custom) and tries to mark things ready himself', $q$insert into records(coll,id,data,deleted) values ('mats','zzM2r', jsonb_build_object('from','u7','site','','items','20 outlets','when','Today','status','open','ts',1,
   'li_a', jsonb_build_object('t','ZZ 20A TR receptacle test','sid','zzM2b','q','20','u','pc','ord',0,'rev',0,'done',true,'pq',20,'pk',5),
   'li_b', jsonb_build_object('t','ZZ 12/2 NM-B Romex — 250 ft coil','sid','zzM2a','q','2','u','coil','ord',1,'rev',0),
   'li_c', jsonb_build_object('t','Special trim ring','q','4','u','pc','cu',true,'desc','brass, round','ord',2,'rev',0)), false)$q$, 'ok');
reset role;
select pg_temp.check('… nothing is marked ready or picked up (only the preparer / a real pickup can)', (select not (d->'li_a'->>'done')::boolean and not (d->'li_a' ? 'pq') and not (d->'li_a' ? 'pk') from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')->>'li_a'));
select pg_temp.check('… status Requested (old app sees "open")', (select d->>'st'='requested' and d->>'status'='open' from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')->>'st'));
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker ticks an item as prepared', $q$update records set data = data || jsonb_build_object('li_c', data->'li_c' || '{"done":true,"pq":4,"base":1,"rev":2}') where coll='mats' and id='zzM2r'$q$, 'ok');
select pg_temp.expect('worker sets the status to Completed', $q$update records set data = data || '{"stm":"completed"}' where coll='mats' and id='zzM2r'$q$, 'ok');
reset role;
select pg_temp.check('… neither sticks (preparer only)', (select not (d->'li_c'->>'done')::boolean and d->>'st'='requested' and d->'li_c'->>'rev'='1' from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')->>'li_c'));
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Menachem prepares 15 of the 20 outlets', $q$update records set data = data || jsonb_build_object('li_a', data->'li_a' || '{"pq":15,"base":1,"rev":2}') where coll='mats' and id='zzM2r'$q$, 'ok');
reset role;
select pg_temp.check('… 15 of 20 ready, NOT done; status Partially Ready', (select (d->'li_a'->>'pq')::numeric=15 and not (d->'li_a'->>'done')::boolean and d->>'st'='partial' and d->>'status'='ordered' from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')->>'li_a'));
select pg_temp.check('… the requester is told (◐ 15 of 20 …)', (select count(*)>0 from private.notify_queue where to_id='u7' and qkey='LIST:mats:zzM2r' and en like '%15 of 20%' and sent is null), (select string_agg(en,' | ') from private.notify_queue where qkey='LIST:mats:zzM2r'));
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Menachem ticks the box (all 20)', $q$update records set data = data || jsonb_build_object('li_a', data->'li_a' || '{"done":true,"base":2,"rev":3}') where coll='mats' and id='zzM2r'$q$, 'ok');
reset role;
select pg_temp.check('… ticking = the full quantity prepared (20), done, by u3', (select (d->'li_a'->>'pq')::numeric=20 and (d->'li_a'->>'done')::boolean and d->'li_a'->>'doneBy'='u3' from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')->>'li_a'));
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker changes the quantity after it was prepared (20 → 25)', $q$update records set data = data || jsonb_build_object('li_a', data->'li_a' || '{"q":"25","base":3,"rev":4}') where coll='mats' and id='zzM2r'$q$, 'ok');
reset role;
select pg_temp.check('… flagged for rechecking and no longer done (20 of 25)', (select (d->'li_a'->>'rck')::boolean and not (d->'li_a'->>'done')::boolean and (d->'li_a'->>'pq')::numeric=20 from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')->>'li_a'));
select pg_temp.check('… Menachem is told to recheck', (select count(*)>0 from private.notify_queue where to_id<>'u7' and qkey='LIST:mats:zzM2r' and en like '%recheck%'), (select string_agg(to_id||':'||en,' | ') from private.notify_queue where qkey='LIST:mats:zzM2r'));
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Menachem prepares 25', $q$update records set data = data || jsonb_build_object('li_a', data->'li_a' || '{"pq":25,"base":4,"rev":5}') where coll='mats' and id='zzM2r'$q$, 'ok');
select pg_temp.expect('… and ticks the other two', $q$update records set data = data || jsonb_build_object('li_b', data->'li_b' || '{"done":true,"base":1,"rev":2}', 'li_c', data->'li_c' || '{"done":true,"base":1,"rev":2}') where coll='mats' and id='zzM2r'$q$, 'ok');
reset role;
select pg_temp.check('… recheck cleared; everything ready → status Ready', (select not coalesce((d->'li_a'->>'rck')::boolean,false) and (d->'li_a'->>'done')::boolean and d->>'st'='ready' and d ? 'readyAt' from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')::text));
select pg_temp.check('… "Your material order is ready." sent to the worker who asked', (select count(*)=1 from records where coll='inbox' and data->>'to'='u7' and (data->>'msg' like '📦 Your material order is ready.%' or data->>'msg' like '📦 Tu pedido de material está listo.%') and data->'link'->>'mat'='zzM2r'), (select string_agg(data->>'msg',' | ') from records where coll='inbox' and data->>'to'='u7' and updated_at > now() - interval '1 minute'));
select pg_temp.check('… checking boxes did NOT take anything out of the garage (55 / 200)', (select (pg_temp.st('zzM2a')->>'qty')::numeric=55 and (pg_temp.st('zzM2b')->>'qty')::numeric=200), null);

-- ── pickup: through apply_stock_txn ──
select pg_temp.who('u8'); set local role authenticated;
select pg_temp.expect('someone not on the list cannot confirm a pickup', $q$select public.mat_pickup('zzM2r','mp_zzM2r_x1','[{"k":"li_a","n":10,"g":true}]')$q$, 'blocked');
reset role;
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker tries to write a picked-up quantity directly', $q$update records set data = data || jsonb_build_object('li_b', data->'li_b' || '{"pk":2,"base":2,"rev":3}') where coll='mats' and id='zzM2r'$q$, 'ok');
reset role;
select pg_temp.check('… ignored (only a confirmed pickup counts)', (select not (pg_temp.mt('zzM2r')->'li_b' ? 'pk')), (select pg_temp.mt('zzM2r')->>'li_b'));
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker confirms picking up 10 outlets (from the garage) + 1 coil', $q$select public.mat_pickup('zzM2r','mp_zzM2r_p1','[{"k":"li_a","n":10,"g":true},{"k":"li_b","n":1,"g":true}]')$q$, 'ok');
select pg_temp.expect('… the same pickup sent again (phone retry)', $q$select public.mat_pickup('zzM2r','mp_zzM2r_p1','[{"k":"li_a","n":10,"g":true},{"k":"li_b","n":1,"g":true}]')$q$, 'ok');
reset role;
select pg_temp.check('… garage counts went down ONCE (200 → 190, 55 → 54)', (select (pg_temp.st('zzM2b')->>'qty')::numeric=190 and (pg_temp.st('zzM2a')->>'qty')::numeric=54), (pg_temp.st('zzM2b')->>'qty')||' / '||(pg_temp.st('zzM2a')->>'qty'));
select pg_temp.check('… picked up 10 / 1 recorded once; status Partially Picked Up', (select (d->'li_a'->>'pk')::numeric=10 and (d->'li_b'->>'pk')::numeric=1 and d->>'st'='partpicked' and d ? 'pu_mp_zzM2r_p1' from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')->>'st'));
select pg_temp.check('… in the garage history as one pickup for the job list', (select count(*)=1 from records where coll='stockLog' and id='mp_zzM2r_p1' and data->>'kind'='out' and data->>'src'='mat:zzM2r'), null);
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('a pickup of more than the garage has is refused', $q$select public.mat_pickup('zzM2r','mp_zzM2r_p2','[{"k":"li_a","n":500,"g":true}]')$q$, 'blocked');
reset role;
select pg_temp.check('… nothing changed (190, picked 10)', (select (pg_temp.st('zzM2b')->>'qty')::numeric=190 and (pg_temp.mt('zzM2r')->'li_a'->>'pk')::numeric=10), null);
select pg_temp.who('u6'); set local role authenticated;
select pg_temp.expect('crew leader confirms the rest (custom item bought, not from the garage)', $q$select public.mat_pickup('zzM2r','mp_zzM2r_p3','[{"k":"li_a","n":15,"g":true},{"k":"li_b","n":1,"g":true},{"k":"li_c","n":4,"g":false}]')$q$, 'ok');
reset role;
select pg_temp.check('… all picked up → Completed (old app: delivered); garage 175 / 53', (select d->>'st'='completed' and d->>'status'='delivered' and (pg_temp.st('zzM2b')->>'qty')::numeric=175 and (pg_temp.st('zzM2a')->>'qty')::numeric=53 from (select pg_temp.mt('zzM2r') d) x), (select pg_temp.mt('zzM2r')->>'st'));
select pg_temp.check('… the requester is told about the pickups', (select count(*)>0 from private.notify_queue where to_id='u7' and qkey='LIST:mats:zzM2r' and en like '%picked up%'), null);

-- ── an older app marks a request delivered / the preparer picks a status ──
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker sends a second request', $q$insert into records(coll,id,data,deleted) values ('mats','zzM2r2', jsonb_build_object('from','u7','site','','items','x','when','Today','status','open','ts',1,'li_x', jsonb_build_object('t','Wire nuts','q','1','u','box','ord',0,'rev',0)), false)$q$, 'ok');
reset role;
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Menachem sets Ordered', $q$update records set data = data || '{"stm":"ordered"}' where coll='mats' and id='zzM2r2'$q$, 'ok');
reset role;
select pg_temp.check('… status Ordered and the requester is told', (select pg_temp.mt('zzM2r2')->>'st'='ordered' and exists (select 1 from private.notify_queue where to_id='u7' and qkey='LIST:mats:zzM2r2' and en like '%Status: Ordered%')), (select pg_temp.mt('zzM2r2')->>'st'));
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('an old app marks it delivered', $q$update records set data = data || '{"status":"delivered","by":"u3"}' where coll='mats' and id='zzM2r2'$q$, 'ok');
reset role;
select pg_temp.check('… Completed', (select pg_temp.mt('zzM2r2')->>'st'='completed'), (select pg_temp.mt('zzM2r2')->>'st'));
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('the requester still edits his list after sending (adds an item)', $q$update records set data = data || '{"li_y":{"t":"Tape","q":"3","u":"pc","ord":1,"rev":0}}' where coll='mats' and id='zzM2r2'$q$, 'ok');
reset role;
select pg_temp.check('… added', (select pg_temp.mt('zzM2r2') ? 'li_y'), null);
select pg_temp.who('u8'); set local role authenticated;
select pg_temp.expect('someone else (not on it) cannot edit it', $q$update records set data = data || '{"li_z":{"t":"x","q":"1"}}' where coll='mats' and id='zzM2r2'$q$, 'blocked');
select pg_temp.expect('… nor change who it is sent to', $q$update records set data = data || '{"to":"u8"}' where coll='mats' and id='zzM2r2'$q$, 'blocked');
reset role;

do $$ begin raise exception 'RESULTS: % passed, % failed. FAILS: %', (select count(*) from _t where ok), (select count(*) from _t where not ok), coalesce((select string_agg(test||' ['||coalesce(detail,'')||']', ' | ') from _t where not ok),'none'); end $$;
