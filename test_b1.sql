-- Regression for db/audit_b1_board.sql (staging, everything rolled back). Every row must say PASS.
-- u1 owner, u2 site manager, u3 office, u6 crew leader (c1), u7 worker (c1), u8 worker (c2).
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
create or replace function pg_temp.sees(u text, i text) returns boolean language plpgsql as $$
declare c int;
begin perform pg_temp.who(u); set local role authenticated; select count(*) into c from public.records where coll='jobs' and id=i; reset role; return c = 1; end $$;
create or replace function pg_temp.jb(i text) returns jsonb language sql as $$ select data from public.records where coll='jobs' and id=i $$;
create or replace function pg_temp.inbox(u text, pat text) returns int language sql as $$
  select count(*)::int from public.records where coll='inbox' and not deleted and data->>'to'=u and data->>'msg' like pat and updated_at > now() - interval '1 minute' $$;

-- ── 1. a task is seen only by whoever holds it ──
select pg_temp.who('u2'); set local role authenticated;
select pg_temp.expect('Mark (manager) sends a task to Olga (office)', $q$insert into records(coll,id,data,deleted) values ('jobs','zzB1a','{"id":"zzB1a","from":"u2","to":["u3"],"desc":"ZZ order the 200A panel","due":"Today","status":"open","ts":1}',false)$q$, 'ok');
reset role;
select pg_temp.check('… it left Mark''s board (he does not see it)', not pg_temp.sees('u2','zzB1a'), null);
select pg_temp.check('… it is on Olga''s board', pg_temp.sees('u3','zzB1a'), null);
select pg_temp.check('… a worker does not see it', not pg_temp.sees('u7','zzB1a'), null);
select pg_temp.check('… the owner can look at it (read-only view)', pg_temp.sees('u1','zzB1a'), null);
select pg_temp.check('… the server remembers Mark sent it', (select pg_temp.jb('zzB1a')->'sentBy' = '["u2"]'::jsonb), (select pg_temp.jb('zzB1a')->>'sentBy'));

select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Olga cannot rewrite who sent it', $q$update records set data = data || '{"sentBy":[]}' where coll='jobs' and id='zzB1a'$q$, 'ok');
reset role;
select pg_temp.check('… sentBy unchanged', (select pg_temp.jb('zzB1a')->'sentBy' = '["u2"]'::jsonb), (select pg_temp.jb('zzB1a')->>'sentBy'));

select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Olga sends it on to the owner', $q$update records set data = data || '{"to":["u1"]}' where coll='jobs' and id='zzB1a'$q$, 'ok');
reset role;
select pg_temp.check('… it left Olga''s board', not pg_temp.sees('u3','zzB1a'), null);
select pg_temp.check('… it is the owner''s now; Mark and Olga both remembered as senders', pg_temp.sees('u1','zzB1a') and (select pg_temp.jb('zzB1a')->'sentBy' = '["u2","u3"]'::jsonb), (select pg_temp.jb('zzB1a')->>'sentBy'));

select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Olga (no longer holding it) tries to change it', $q$update records set data = data || '{"desc":"hacked"}' where coll='jobs' and id='zzB1a'$q$, 'blocked');
reset role;
select pg_temp.check('… nothing changed', (select pg_temp.jb('zzB1a')->>'desc' = 'ZZ order the 200A panel'), null);

-- ── 2. done → everyone who sent it along hears ──
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('the owner marks it done', $q$update records set data = data || '{"status":"done","doneBy":"u1"}' where coll='jobs' and id='zzB1a'$q$, 'ok');
reset role;
select pg_temp.check('… Mark gets "✓ Done by …"', pg_temp.inbox('u2','✓ Done by %ZZ order the 200A panel%') = 1, null);
select pg_temp.check('… Olga gets it too', pg_temp.inbox('u3','✓ Done by %ZZ order the 200A panel%') = 1, null);
select pg_temp.check('… the owner (who did it) gets nothing', pg_temp.inbox('u1','✓ Done by %ZZ order%') = 0, null);
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.expect('saving it again as done', $q$update records set data = data || '{"note":"x"}' where coll='jobs' and id='zzB1a'$q$, 'ok');
reset role;
select pg_temp.check('… no second message', pg_temp.inbox('u2','✓ Done by %ZZ order the 200A panel%') = 1, null);

-- ── 3. my own task stays mine; a crew task is on every crew member''s board ──
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Olga adds a task for herself', $q$insert into records(coll,id,data,deleted) values ('jobs','zzB1b','{"id":"zzB1b","from":"u3","to":["u3"],"desc":"ZZ call supplier","due":"Today","status":"open","ts":1}',false)$q$, 'ok');
reset role;
select pg_temp.check('… it is on her board, nobody "sent" it', pg_temp.sees('u3','zzB1b') and (select pg_temp.jb('zzB1b')->'sentBy' = '[]'::jsonb), (select pg_temp.jb('zzB1b')->>'sentBy'));
select pg_temp.check('… Mark does not see it', not pg_temp.sees('u2','zzB1b'), null);
select pg_temp.who('u2'); set local role authenticated;
select pg_temp.expect('Mark sends a task to Crew 1', $q$insert into records(coll,id,data,deleted) values ('jobs','zzB1c','{"id":"zzB1c","from":"u2","to":["c1"],"desc":"ZZ crew task","due":"Today","status":"open","ts":1}',false)$q$, 'ok');
reset role;
select pg_temp.check('… Alex (Crew 1) sees it', pg_temp.sees('u7','zzB1c'), null);
select pg_temp.check('… Bruno (Crew 2) does not', not pg_temp.sees('u8','zzB1c'), null);
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.expect('Alex puts it in his "Today" column', $q$update records set data = data || '{"col_u7":"today"}' where coll='jobs' and id='zzB1c'$q$, 'ok');
reset role;
select pg_temp.check('… saved', (select pg_temp.jb('zzB1c')->>'col_u7' = 'today'), null);

-- ── 4. board columns: only the person himself ──
select pg_temp.who('u3'); set local role authenticated;
select pg_temp.expect('Olga saves her columns', $q$insert into records(coll,id,data,deleted) values ('bcol','bcol_u3','{"owner":"u3","cols":[{"id":"todo","name":"To do"},{"id":"x1","name":"Quotes"}]}',false) on conflict (coll,id) do update set data=excluded.data$q$, 'ok');
select pg_temp.expect('… she cannot save Mark''s columns', $q$insert into records(coll,id,data,deleted) values ('bcol','bcol_u2','{"owner":"u2","cols":[]}',false)$q$, 'blocked');
reset role;
select pg_temp.who('u7'); set local role authenticated;
select pg_temp.check('a worker cannot see Olga''s columns', (select count(*)=0 from records where coll='bcol' and id='bcol_u3'), null);
reset role;
select pg_temp.who('u1'); set local role authenticated;
select pg_temp.check('the owner can look at them', (select count(*)=1 from records where coll='bcol' and id='bcol_u3'), null);
select pg_temp.expect('… but cannot change them', $q$update records set data = data || '{"cols":[]}' where coll='bcol' and id='bcol_u3'$q$, 'blocked');
reset role;

do $$ begin raise exception 'RESULTS: % passed, % failed. FAILS: %', (select count(*) from _t where ok), (select count(*) from _t where not ok), coalesce((select string_agg(test||' ['||coalesce(detail,'')||']', ' | ') from _t where not ok),'none'); end $$;
