-- Regression for db/audit_t2_trello_mats.sql (staging, everything rolled back). Every row must say PASS.
-- u1 owner, o2 office "Material" (stands in for Menachem, Trello "connected" for this test), u7 worker, u8 worker.
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
create or replace function pg_temp.pt(i text) returns jsonb language sql as $$ select data from public.records where coll='ptask' and id=i and not deleted $$;
delete from server_config where k in ('mat_trello') or k like 'trello\_user\_token:%';
insert into server_config(k,v) values ('trello_user_token:o2','test-not-a-real-code'),
  ('mat_trello','{"emp":"o2","board":"B_job","boardName":"job Name''s"}');
insert into records(coll,id,data,deleted) values
  ('ptask','ptmeta_o2','{"id":"ptmeta_o2","owner":"o2","meta":true,"boards":[{"id":"B_job","name":"job Name''s","lists":[{"id":"L_stock","name":"Stock"},{"id":"L_j1","name":"12 Test Ln, Spring Valley, NY 10977"}]},{"id":"B_day","name":"Daily Delivery check","lists":[{"id":"L_mon","name":"Monday"},{"id":"L_tue","name":"Tuesday"}]},{"id":"B_ord","name":"orders","lists":[{"id":"L_todo","name":"To do"},{"id":"L_pend","name":"Pending"}]},{"id":"B_todo","name":"My to do","lists":[{"id":"L_do","name":"Do"}]}]}',false)
  on conflict (coll,id) do update set data = excluded.data, deleted = false;
insert into records(coll,id,data,deleted) values
  ('sites','zzT2s','{"id":"zzT2s","name":"12 Test Lane Spring Valley","stage":"active"}',false),
  ('sites','zzT2n','{"id":"zzT2n","name":"77 Nowhere Rd, Monsey, NY 10952","stage":"active"}',false),
  ('jobs','zzT2j','{"id":"zzT2j","from":"u1","to":["o2"],"site":"zzT2s","desc":"Call the supplier about the panel\nAsk for Friday delivery","due":"Today","status":"open","ts":1}',false),
  ('jobs','zzT2k','{"id":"zzT2k","from":"u1","to":["u7"],"desc":"Clean the van","due":"Today","status":"open","ts":1}',false);

-- ── 1. a new material request becomes a card ──
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker sends a material request (2 items)', $q$insert into records(coll,id,data,deleted) values ('mats','zzT2r', jsonb_build_object('from','u7','site','zzT2s','items','','when','Tomorrow morning','src','deliver','status','open','ts',1,
   'li_a', jsonb_build_object('t','20A TR receptacle','q','20','u','pc','ord',0,'rev',0),
   'li_b', jsonb_build_object('t','12/2 NM-B Romex — 250 ft coil','q','2','u','coil','ord',1,'rev',0)), false)$q$, 'ok');
select pg_temp.check('… the worker cannot see Menachem''s Trello card (private)', (select count(*)=0 from records where coll='ptask' and id='pt_o2_mat_zzT2r'), null);
reset role;
select pg_temp.check('… a card waits to go to his Trello: job Name''s, in that job''s list (12 Test Ln …)', (select d->>'owner'='o2' and d->>'board'='B_job' and d->>'list'='L_j1' and not (d ? 'newList') and (d->>'push')::boolean and not (d->>'done')::boolean and d->>'mat'='zzT2r' from (select pg_temp.pt('pt_o2_mat_zzT2r') d) x), (select pg_temp.pt('pt_o2_mat_zzT2r')::text));
select pg_temp.check('… title: material, who, when', (select pg_temp.pt('pt_o2_mat_zzT2r')->>'t') like '🧰 Material — % — Tomorrow morning', (select pg_temp.pt('pt_o2_mat_zzT2r')->>'t'));
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('a request for a job that has no list on job Name''s yet', $q$insert into records(coll,id,data,deleted) values ('mats','zzT2x', jsonb_build_object('from','u7','site','zzT2n','items','','when','Today','status','open','ts',1,'li_a',jsonb_build_object('t','Box','q','1','ord',0,'rev',0)), false)$q$, 'ok');
reset role;
select pg_temp.check('… the card asks for a NEW list named after the job', (select d->>'list'='' and d->>'newList'='77 Nowhere Rd, Monsey, NY 10952' and d->>'board'='B_job' from (select pg_temp.pt('pt_o2_mat_zzT2x') d) x), (select pg_temp.pt('pt_o2_mat_zzT2x')::text));
select pg_temp.check('… the card lists every item with quantity, where from and when', (select d like '%• 20 pc — 20A TR receptacle%• 2 coil — 12/2 NM-B Romex — 250 ft coil%' and d like '%Store — deliver to the job%' and d like '%Tomorrow morning%' from (select pg_temp.pt('pt_o2_mat_zzT2r')->>'desc' d) x), (select pg_temp.pt('pt_o2_mat_zzT2r')->>'desc'));
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.check('… Menachem sees it in his Trello list', (select count(*)=1 from records where coll='ptask' and id='pt_o2_mat_zzT2r'), null);
reset role;

-- the sync sent it (simulated): card id given, push done
update records set data = data || '{"push":false,"card":"C_mat1","url":"https://trello.com/c/abc"}' where coll='ptask' and id='pt_o2_mat_zzT2r';

-- ── 2. it follows the request ──
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('worker adds a third item', $q$update records set data = data || jsonb_build_object('li_c', jsonb_build_object('t','Wire nuts (yellow) — bag 100','q','1','u','bag','ord',2,'rev',0)) where coll='mats' and id='zzT2r'$q$, 'ok');
reset role;
select pg_temp.check('… the card text is updated and goes to Trello again (same card)', (select (d->>'push')::boolean and d->>'card'='C_mat1' and d->>'desc' like '%Wire nuts (yellow)%' from (select pg_temp.pt('pt_o2_mat_zzT2r') d) x), (select pg_temp.pt('pt_o2_mat_zzT2r')::text));
update records set data = data || '{"push":false}' where coll='ptask' and id='pt_o2_mat_zzT2r';
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('Menachem ticks an item as prepared in the app', $q$update records set data = data || jsonb_build_object('li_a', data->'li_a' || '{"done":true,"base":0,"rev":1}') where coll='mats' and id='zzT2r'$q$, 'ok');
reset role;
select pg_temp.check('… a tick that does not change the list text does not resend the card', (select not (pg_temp.pt('pt_o2_mat_zzT2r')->>'push')::boolean), (select pg_temp.pt('pt_o2_mat_zzT2r')::text));
-- Menachem writes his own note on the card in Trello (simulated sync)
update records set data = data || '{"desc":"his own note in Trello"}' where coll='ptask' and id='pt_o2_mat_zzT2r';
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('Menachem sets the request to Completed', $q$update records set data = data || '{"stm":"completed"}' where coll='mats' and id='zzT2r'$q$, 'ok');
reset role;
select pg_temp.check('… the card is ticked done in Trello; his note is kept (items unchanged)', (select (d->>'done')::boolean and (d->>'push')::boolean and d->>'desc'='his own note in Trello' from (select pg_temp.pt('pt_o2_mat_zzT2r') d) x), (select pg_temp.pt('pt_o2_mat_zzT2r')::text));
select pg_temp.check('… still one card for the request', (select count(*)=1 from records where coll='ptask' and data->>'mat'='zzT2r'), null);

-- archived in Trello → never brought back
update records set data = data || '{"gone":true,"push":false}' where coll='ptask' and id='pt_o2_mat_zzT2r';
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('a change after the card was archived in Trello', $q$update records set data = data || jsonb_build_object('li_d', jsonb_build_object('t','Extra','q','1','ord',3,'rev',0)) where coll='mats' and id='zzT2r'$q$, 'ok');
reset role;
select pg_temp.check('… the archived card is left alone', (select (d->>'gone')::boolean and not (d->>'push')::boolean from (select pg_temp.pt('pt_o2_mat_zzT2r') d) x), null);

-- not connected → nothing
delete from server_config where k = 'trello_user_token:o2';
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('a request while his Trello is not connected', $q$insert into records(coll,id,data,deleted) values ('mats','zzT2q', jsonb_build_object('from','u7','site','zzT2s','items','5 boxes','when','Today','status','open','ts',1), false)$q$, 'ok');
reset role;
select pg_temp.check('… no card is made (and the request is saved normally)', (select count(*)=0 from records where coll='ptask' and id='pt_o2_mat_zzT2q') and (select count(*)=1 from records where coll='mats' and id='zzT2q'), null);
insert into server_config(k,v) values ('trello_user_token:o2','test-not-a-real-code');
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('a request with only the old free-text list', $q$insert into records(coll,id,data,deleted) values ('mats','zzT2p', jsonb_build_object('from','u7','site','zzT2s','items',E'5 boxes\n2 straps','when','Today','status','open','ts',1), false)$q$, 'ok');
reset role;
select pg_temp.check('… its lines are on the card', (select pg_temp.pt('pt_o2_mat_zzT2p')->>'desc') like '%• 5 boxes%• 2 straps%', (select pg_temp.pt('pt_o2_mat_zzT2p')->>'desc'));

-- ── 3. send a task to his Trello ──
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('a worker cannot send a task to Menachem''s Trello', $q$select public.task_to_trello('zzT2j','o2','L_todo')$q$, 'blocked');
reset role;
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('Menachem cannot send someone else''s task (Clean the van) to his Trello', $q$select public.task_to_trello('zzT2k','o2','L_do')$q$, 'blocked');
reset role;
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('owner: a list that is not on his boards is refused', $q$select public.task_to_trello('zzT2j','o2','L_nope')$q$, 'blocked');
select pg_temp.expect('owner sends "Call the supplier" to Menachem''s Trello (the job''s list)', $q$select public.task_to_trello('zzT2j','o2','')$q$, 'ok');
reset role;
select pg_temp.check('… a card waits on job Name''s → 12 Test Ln (the job''s list)', (select d->>'owner'='o2' and d->>'list'='L_j1' and d->>'board'='B_job' and (d->>'push')::boolean and d->>'job'='zzT2j' and d->>'t'='Call the supplier about the panel' and d->>'desc' like '%Ask for Friday delivery%' from (select pg_temp.pt('pt_o2_job_zzT2j') d) x), (select pg_temp.pt('pt_o2_job_zzT2j')::text));
select pg_temp.check('… the task in the app shows it went to his Trello', (select data->'trello'->>'emp'='o2' and data->'trello'->>'list' like '12 Test Ln%' and data->>'status'='open' from records where coll='jobs' and id='zzT2j'), (select data->>'trello' from records where coll='jobs' and id='zzT2j'));
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.check('… sending it twice makes no second card', (select (public.task_to_trello('zzT2j','o2',''))->>'already'='true'), null);
reset role;
select pg_temp.check('… one card', (select count(*)=1 from records where coll='ptask' and data->>'job'='zzT2j'), null);
update records set data = data || '{"to":["o2"]}' where coll='jobs' and id='zzT2k';
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('a task with no job needs a list picked', $q$select public.task_to_trello('zzT2k','o2','')$q$, 'blocked');
select pg_temp.expect('Menachem sends HIS OWN task to his Trello', $q$select public.task_to_trello('zzT2k','o2','L_pend')$q$, 'ok');
reset role;
select pg_temp.check('… card on orders → Pending', (select d->>'list'='L_pend' and d->>'t'='Clean the van' from (select pg_temp.pt('pt_o2_job_zzT2k') d) x), (select pg_temp.pt('pt_o2_job_zzT2k')::text));

-- ── privacy: only Menachem sees and changes his Trello — not the owner ──
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.check('the owner does NOT see Menachem''s Trello cards', (select count(*)=0 from records where coll='ptask' and data->>'owner'='o2'), null);
select pg_temp.expect('… and cannot change one', $q$update records set data = data || '{"done":true}' where coll='ptask' and id='pt_o2_job_zzT2j'$q$, 'blocked');
select pg_temp.check('… but sees that Menachem is connected (for "Send to Menachem''s Trello")', (select count(*)=1 from public.trello_people() where emp='o2'), null);
reset role;
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.check('Menachem sees his own cards', (select count(*)>0 from records where coll='ptask' and data->>'owner'='o2'), null);
reset role;

-- ── 4. plan a day: a mirror on Daily Delivery check, moved from Monday to Tuesday ──
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('Menachem puts a job card on Monday (a mirror card)', $q$insert into records(coll,id,data,deleted) values ('ptask','zzT2m', jsonb_build_object('owner','o2','t','https://trello.com/c/abc','list','L_mon','listName','Monday','board','B_day','boardName','Daily Delivery check','done',false), false)$q$, 'ok');
reset role;
select pg_temp.check('… it waits to go to Trello on Monday', (select d->>'list'='L_mon' and (d->>'push')::boolean from (select pg_temp.pt('zzT2m') d) x), (select pg_temp.pt('zzT2m')::text));
update records set data = data || '{"push":false,"card":"C_m1"}' where coll='ptask' and id='zzT2m';
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('… he moves it to Tuesday', $q$update records set data = data || '{"list":"L_tue","listName":"Tuesday"}' where coll='ptask' and id='zzT2m'$q$, 'ok');
reset role;
select pg_temp.check('… moved, marked to move in Trello (same card)', (select d->>'list'='L_tue' and d->>'listName'='Tuesday' and (d->>'mv')::boolean and (d->>'push')::boolean and d->>'card'='C_m1' from (select pg_temp.pt('zzT2m') d) x), (select pg_temp.pt('zzT2m')::text));
update records set data = (data - 'mv') || '{"push":false}' where coll='ptask' and id='zzT2m';
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('… a move to a list that is not on any of his boards', $q$update records set data = data || '{"list":"L_fake","listName":"Hacked"}' where coll='ptask' and id='zzT2m'$q$, 'ok');
reset role;
select pg_temp.check('… is not taken (stays on Tuesday)', (select d->>'list'='L_tue' and not coalesce((d->>'push')::boolean,false) from (select pg_temp.pt('zzT2m') d) x), (select pg_temp.pt('zzT2m')::text));
select pg_temp.who('o2'); set local role authenticated;
select pg_temp.expect('… a move to a list on ANOTHER of his boards (orders → To do)', $q$update records set data = data || '{"list":"L_todo","listName":"x"}' where coll='ptask' and id='zzT2m'$q$, 'ok');
reset role;
select pg_temp.check('… is taken: board and list names come from his Trello, same card, goes to Trello', (select d->>'list'='L_todo' and d->>'listName'='To do' and d->>'board'='B_ord' and d->>'boardName'='orders' and (d->>'mv')::boolean and (d->>'push')::boolean and d->>'card'='C_m1' from (select pg_temp.pt('zzT2m') d) x), (select pg_temp.pt('zzT2m')::text));
update records set data = (data - 'mv') || '{"push":false,"list":"L_tue","listName":"Tuesday","board":"B_day","boardName":"Daily Delivery check"}' where coll='ptask' and id='zzT2m';
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('a worker cannot move Menachem''s card', $q$update records set data = data || '{"list":"L_mon"}' where coll='ptask' and id='zzT2m'$q$, 'blocked');
reset role;
select pg_temp.check('… Tuesday still', (select pg_temp.pt('zzT2m')->>'list')='L_tue', null);

delete from server_config where k = 'trello_user_token:o2';
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('not connected → refused with a clear message', $q$select public.task_to_trello('zzT2j','o2','L_do')$q$, 'blocked');
reset role;

do $$ begin raise exception 'RESULTS: % passed, % failed. FAILS: %', (select count(*) from _t where ok), (select count(*) from _t where not ok), coalesce((select string_agg(test||' ['||coalesce(detail,'')||']', ' | ') from _t where not ok),'none'); end $$;
