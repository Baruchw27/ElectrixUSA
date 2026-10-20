-- Regression for db/audit_l2_lists.sql (staging, everything rolled back). Every row must say PASS.
-- People: u1 owner (Olivia), u7 worker (Alex, Spanish), u8 worker (Bruno), u6 crew leader (Leo, not on the list),
-- u3 made "Material" office for this test (like Menachem).
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
update records set data = data || '{"title":"Material"}' where coll='emps' and id='u3';
insert into records(coll,id,data,deleted) values ('keep','zzL2n', jsonb_build_object('owner','u1','type','text','title','Kitchen','body',E'Line 1\n  indented line\n\nLine 3','collab','[]'::jsonb), false);

-- ── punch list ──
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('owner turns the note into a punch list (3 items, 2 assigned)', $q$insert into records(coll,id,data,deleted) values ('keep','zzL2p', jsonb_build_object('owner','u1','type','punch','title','Kitchen','src','zzL2n','collab','[]'::jsonb,
   'li_a', jsonb_build_object('t','Line 1','to','u7','done',false,'ord',0,'rev',0),
   'li_b', jsonb_build_object('t','  indented line','to','u8','done',false,'ord',1,'rev',0),
   'li_c', jsonb_build_object('t','Line 3','done',false,'ord',2,'rev',0)), false)$q$, 'ok');
select pg_temp.expect('… the original note gets the link back', $q$update records set data = data || '{"punch":"zzL2p"}' where coll='keep' and id='zzL2n'$q$, 'ok');
reset role;
select pg_temp.check('server stamps every item (rev 1, by u1) and keeps the text exactly (leading spaces kept)', (select (data->'li_a'->>'rev')='1' and data->'li_b'->>'by'='u1' and data->'li_b'->>'t'='  indented line' from records where coll='keep' and id='zzL2p'), null);
select pg_temp.check('server keeps the list of assignees (u7, u8)', (select data->'assign' @> '["u7","u8"]' and jsonb_array_length(data->'assign')=2 from records where coll='keep' and id='zzL2p'), (select data->>'assign' from records where coll='keep' and id='zzL2p'));
select pg_temp.check('… the original note is kept as it was (body unchanged) and links to the punch list', (select data->>'body'=E'Line 1\n  indented line\n\nLine 3' and data->>'punch'='zzL2p' from records where coll='keep' and id='zzL2n'), null);

select pg_temp.who('u7'); set local role authenticated;
select pg_temp.check('assigned worker can see the punch list', (select count(*)=1 from records where coll='keep' and id='zzL2p'), null);
select pg_temp.check('… but not the original private note', (select count(*)=0 from records where coll='keep' and id='zzL2n'), null);
select pg_temp.expect('assigned worker marks his own item complete', $q$update records set data = data || jsonb_build_object('li_a', data->'li_a' || '{"done":true,"doneBy":"u7","doneAt":1,"base":1,"rev":2}') where coll='keep' and id='zzL2p'$q$, 'ok');
select pg_temp.expect('assigned worker cannot tick someone else''s item', $q$update records set data = data || jsonb_build_object('li_b', data->'li_b' || '{"done":true,"base":1,"rev":2}') where coll='keep' and id='zzL2p'$q$, 'blocked');
select pg_temp.expect('assigned worker cannot change an item''s text', $q$update records set data = data || jsonb_build_object('li_a', data->'li_a' || '{"t":"changed","base":2,"rev":3}') where coll='keep' and id='zzL2p'$q$, 'blocked');
select pg_temp.expect('assigned worker cannot rename the list', $q$update records set data = data || '{"title":"x"}' where coll='keep' and id='zzL2p'$q$, 'blocked');
select pg_temp.expect('assigned worker cannot add items', $q$update records set data = data || '{"li_z":{"t":"new"}}' where coll='keep' and id='zzL2p'$q$, 'blocked');
select pg_temp.expect('assigned worker can add a comment', $q$update records set data = data || '{"lc_1":{"text":"Done, see photo","by":"u1"}}' where coll='keep' and id='zzL2p'$q$, 'ok');
reset role;
select pg_temp.check('… the comment is signed by the real person (u7), not who the phone claimed', (select data->'lc_1'->>'by'='u7' from records where coll='keep' and id='zzL2p'), (select data->>'lc_1' from records where coll='keep' and id='zzL2p'));

select pg_temp.who('u6'); set local role authenticated;
select pg_temp.check('a crew leader who is not on the list cannot see it', (select count(*)=0 from records where coll='keep' and id='zzL2p'), null);
select pg_temp.expect('… nor change it', $q$update records set data = data || '{"title":"x"}' where coll='keep' and id='zzL2p'$q$, 'blocked');
select pg_temp.check('… nor read its history', (select count(*)=0 from public.list_history('keep','zzL2p')), null);
reset role;

-- same item changed on two phones: phone A saw rev 1 and saved (→ rev 2); phone B also saw rev 1 and saves later
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('phone A changes item 3', $q$select public.save_records('[{"coll":"keep","id":"zzL2p","patch":{"li_c":{"t":"Line 3 — outlets","done":false,"ord":2,"rev":2,"base":1}}}]'::jsonb)$q$, 'ok');
select pg_temp.expect('phone B changes item 3 from the old version, and item 2 (independent)', $q$select public.save_records('[{"coll":"keep","id":"zzL2p","patch":{"li_c":{"t":"Line 3 — switches","done":false,"ord":2,"rev":2,"base":1},"li_b":{"t":"  indented line (2nd floor)","to":"u8","done":false,"ord":1,"rev":2,"base":1}}}]'::jsonb)$q$, 'ok');
select pg_temp.expect('a phone re-sends an old copy without the version it started from', $q$select public.save_records('[{"coll":"keep","id":"zzL2p","patch":{"li_b":{"t":"OLD","to":"u8","rev":1}}}]'::jsonb)$q$, 'ok');
select pg_temp.expect('a phone sends a whole old copy that lacks item 1', $q$update records set data = data - 'li_a' where coll='keep' and id='zzL2p'$q$, 'ok');
reset role;
select pg_temp.check('same item: the first save stays …', (select data->'li_c'->>'t'='Line 3 — outlets' from records where coll='keep' and id='zzL2p'), (select data->>'li_c' from records where coll='keep' and id='zzL2p'));
select pg_temp.check('… and the other phone''s version is kept next to it, flagged as a conflict', (select data->'li_c~u1~1'->>'t'='Line 3 — switches' and (data->'li_c~u1~1'->>'conflict')::boolean from records where coll='keep' and id='zzL2p'), null);
select pg_temp.check('different item from phone B merged normally (rev 2)', (select data->'li_b'->>'t'='  indented line (2nd floor)' and data->'li_b'->>'rev'='2' from records where coll='keep' and id='zzL2p'), (select data->>'li_b' from records where coll='keep' and id='zzL2p'));
select pg_temp.check('an old copy sent again never overwrites the newer item', (select data->'li_b'->>'t'<>'OLD' from records where coll='keep' and id='zzL2p'), null);
select pg_temp.check('an item missing from a whole old copy is put back (nothing deleted)', (select (data->'li_a'->>'done')::boolean from records where coll='keep' and id='zzL2p'), null);

-- notifications for the punch list
select pg_temp.check('u7 ticking his item tells the owner and u8 — not u7 himself', (select count(*) filter (where to_id='u1')>=1 and count(*) filter (where to_id='u8')>=1 and count(*) filter (where to_id='u7' and actor='u7')=0 from private.notify_queue where qkey='LIST:keep:zzL2p' and en like '%✓ Line 1%'), null);
select pg_temp.check('nobody is ever told about their own change', not exists(select 1 from private.notify_queue where qkey like 'LIST:%zzL2%' and to_id = actor), null);
select pg_temp.check('the conflict is announced', exists(select 1 from private.notify_queue where qkey='LIST:keep:zzL2p' and en like '%two phones%'), null);
update private.notify_queue set created = created - interval '2 minutes' where qkey like 'LIST:%zzL2%';
select pg_temp.check('the minute job sends them', (select public.notify_flush()) >= 1, null);
select pg_temp.check('… one message per person per list (u8 gets exactly one)', (select count(*)=1 from records where coll='inbox' and data->>'to'='u8' and data->'link'->>'keep'='zzL2p'), null);
select pg_temp.check('… saying who changed what on which list, and tapping opens the list', (select data->>'msg' like '📋 Kitchen: %' and data->>'msg' like '%Alex: ✓ Line 1%' from records where coll='inbox' and data->>'to'='u8' and data->'link'->>'keep'='zzL2p'), (select data->>'msg' from records where coll='inbox' and data->>'to'='u8' and data->'link'->>'keep'='zzL2p'));
select pg_temp.check('… in Spanish for Spanish speakers (u7 is told about u1''s edits)', (select data->>'msg' like '%cambiado en dos teléfonos%' from records where coll='inbox' and data->>'to'='u7' and data->'link'->>'keep'='zzL2p'), (select data->>'msg' from records where coll='inbox' and data->>'to'='u7' and data->'link'->>'keep'='zzL2p'));
select pg_temp.check('… the schedule messages are not mixed in (no list rows left unsent)', not exists(select 1 from private.notify_queue where qkey like 'LIST:%zzL2%' and sent is null), null);

select pg_temp.who('u7'); set local role authenticated;
select pg_temp.check('the assigned worker can read the list''s history (every version)', (select count(*)>=5 from public.list_history('keep','zzL2p')), (select count(*)::text from public.list_history('keep','zzL2p')));
reset role;

-- ── material list ──
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker sends a material list (2 items)', $q$insert into records(coll,id,data,deleted) values ('mats','zzL2m', jsonb_build_object('from','u7','site','s1','items',E'10x 3-way switches\n5x GFCI','status','open','when','Tomorrow',
   'li_1', jsonb_build_object('t','3-way switches','q','10','ord',0,'rev',0), 'li_2', jsonb_build_object('t','GFCI','q','5','ord',1,'rev',0)), false)$q$, 'ok');
reset role;
select pg_temp.check('a new request does not double-notify (the app already tells the material office)', not exists(select 1 from private.notify_queue where qkey='LIST:mats:zzL2m'), null);
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('owner sends it to the material office (u3) and changes a quantity after sending', $q$select public.save_records('[{"coll":"mats","id":"zzL2m","patch":{"to":"u3","li_1":{"t":"3-way switches","q":"25","ord":0,"rev":2,"base":1}}}]'::jsonb)$q$, 'ok');
reset role;
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('the material office adds an item after it was sent', $q$select public.save_records('[{"coll":"mats","id":"zzL2m","patch":{"li_3":{"t":"Wall plates 1-gang","q":"20","ord":2,"rev":0}}}]'::jsonb)$q$, 'ok');
select pg_temp.expect('… and marks the request ordered (old way still works)', $q$update records set data = data || '{"status":"ordered"}' where coll='mats' and id='zzL2m'$q$, 'ok');
reset role;
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('the worker who sent it changes a quantity again', $q$select public.save_records('[{"coll":"mats","id":"zzL2m","patch":{"li_2":{"t":"GFCI","q":"8","ord":1,"rev":2,"base":1}}}]'::jsonb)$q$, 'ok');
reset role;
select pg_temp.who('u8'); set local role authenticated;
select pg_temp.expect('a worker who is not on the list cannot change it', $q$update records set data = data || jsonb_build_object('li_2', data->'li_2' || '{"q":"99","base":2,"rev":3}') where coll='mats' and id='zzL2m'$q$, 'blocked');
select pg_temp.expect('… nor comment on it', $q$update records set data = data || '{"lc_9":{"text":"hi"}}' where coll='mats' and id='zzL2m'$q$, 'blocked');
select pg_temp.expect('… nor send it to someone else', $q$update records set data = data || '{"to":"u8"}' where coll='mats' and id='zzL2m'$q$, 'blocked');
reset role;
select pg_temp.check('the list has all 3 items with the latest quantities (25, 8, 20)', (select data->'li_1'->>'q'='25' and data->'li_2'->>'q'='8' and data->'li_3'->>'q'='20' and data->>'status'='ordered' from records where coll='mats' and id='zzL2m'), null);
select pg_temp.check('the text as sent is kept unchanged', (select data->>'items'=E'10x 3-way switches\n5x GFCI' from records where coll='mats' and id='zzL2m'), null);
select pg_temp.check('owner''s change tells the worker and the material office — not the owner', (select count(*) filter (where to_id='u7')>=1 and count(*) filter (where to_id='u3')>=1 and count(*) filter (where to_id='u1')=0 from private.notify_queue where qkey='LIST:mats:zzL2m' and actor='u1'), null);
select pg_temp.check('… saying the quantity change', exists(select 1 from private.notify_queue where qkey='LIST:mats:zzL2m' and actor='u1' and en like '%qty 10 → 25%'), null);
select pg_temp.check('the office''s new item tells the worker who sent it (the owner is not on this list)', (select bool_and(to_id in ('u7')) from private.notify_queue where qkey='LIST:mats:zzL2m' and actor='u3'), (select string_agg(to_id,',') from private.notify_queue where qkey='LIST:mats:zzL2m' and actor='u3'));
select pg_temp.check('the worker''s change tells the material office (u3)', exists(select 1 from private.notify_queue where qkey='LIST:mats:zzL2m' and actor='u7' and to_id='u3'), null);
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.check('the material office can read the material list''s history', (select count(*)>=3 from public.list_history('mats','zzL2m')), null);
reset role;
select pg_temp.who('u8'); set local role authenticated;
select pg_temp.check('… a worker not on it cannot', (select count(*)=0 from public.list_history('mats','zzL2m')), null);
reset role;

-- ordinary notes and requests are untouched
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('a normal note still saves as before', $q$update records set data = data || '{"body":"just text"}' where coll='keep' and id='zzL2n'$q$, 'ok');
reset role;
select pg_temp.check('… with nothing added to it', (select not (data ? 'assign') from records where coll='keep' and id='zzL2n'), null);

select n, case when ok then 'PASS' else 'FAIL' end result, test, detail from _t order by n;
rollback;
