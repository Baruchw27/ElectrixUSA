-- Test of db/prod_stock_security_fix.sql on the STAGING database, with staging made to look exactly like the LIVE
-- database for stock (live apply_stock_txn copied verbatim and checked by md5; staging's own count guard switched off).
-- One transaction, rolled back at the end: nothing is kept. Phase 'live_today' shows today's holes (rows marked HOLE fail);
-- phase 'with_fix' must be all PASS; the fix is run twice to prove a second run is harmless.
begin;
create temp table _t(n serial, phase text, who text, test text, ok boolean, detail text) on commit drop;
grant all on _t to authenticated; grant usage on sequence _t_n_seq to authenticated;
create or replace function public.guard_stock_qty() returns trigger language plpgsql as $$ begin return new; end $$;
CREATE OR REPLACE FUNCTION public.apply_stock_txn(txn jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare txnid text; fp text; existing_fp text; m jsonb; me jsonb; actor text; can_adjust boolean;
        cur numeric; newq numeric; nm text; items jsonb := '[]'::jsonb; out_qtys jsonb; kind text; seqv bigint;
        rsn text;
begin
  txnid := txn->>'id';
  if coalesce(txnid,'') = '' then raise exception 'txn id required' using errcode='22023'; end if;
  me := public.my_emp_data(); actor := me->>'id';
  if coalesce(actor,'') = '' then raise exception 'not allowed' using errcode='42501'; end if;
  can_adjust := (me->>'role' in ('owner','manager','office')) or coalesce((me->>'all')::boolean,false);
  kind := coalesce(txn->>'kind','');
  rsn := nullif(left(trim(coalesce(txn->>'reason','')), 300), '');
  fp := md5(kind || '|' || coalesce((txn->'moves')::text,'[]'));

  insert into public.stock_applied(id, fingerprint) values(txnid, fp) on conflict (id) do nothing;
  if not found then
    select fingerprint into existing_fp from public.stock_applied where id = txnid;
    if existing_fp is distinct from fp then
      raise exception 'txn_reuse_conflict: id % reused with different content', txnid using errcode='23505';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0))), '[]'::jsonb) into out_qtys
      from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
      left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
    return jsonb_build_object('duplicate', true, 'qtys', out_qtys);
  end if;

  perform set_config('app.stock_txn','1', true);
  for m in select * from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) loop
    select (data->>'qty')::numeric, data->>'name' into cur, nm
      from public.records where coll='stock' and id = m->>'id' and not deleted for update;
    if m ? 'set' then
      if not can_adjust then raise exception 'manual stock adjustment is office/owner only' using errcode='42501'; end if;
      if (m ? 'expect') and coalesce(cur,0) <> (m->>'expect')::numeric then
        raise exception 'stock_changed_recount: % now %, you saw %', m->>'id', coalesce(cur,0), m->>'expect' using errcode='40001';
      end if;
      newq := greatest(0, (m->>'set')::numeric);
    else
      newq := coalesce(cur,0) + (m->>'delta')::numeric;
      if newq < 0 then
        raise exception 'insufficient_stock: % available %, requested %', coalesce(nm,m->>'name',m->>'id'), coalesce(cur,0), abs((m->>'delta')::numeric) using errcode='P0001';
      end if;
    end if;
    if cur is null then
      insert into public.records(coll,id,data,deleted,updated_by,updated_at)
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',newq), false, actor, now())
        on conflict (coll,id) do update set data = jsonb_set(public.records.data,'{qty}', to_jsonb(newq)), updated_by=actor, updated_at=now();
    else
      update public.records set data = jsonb_set(data,'{qty}', to_jsonb(newq)), updated_by=actor, updated_at=now()
        where coll='stock' and id = m->>'id';
    end if;
    items := items || jsonb_build_object('id', m->>'id', 'name', coalesce(nm,m->>'name',m->>'id'),
               'before', coalesce(cur,0), 'after', newq,
               'change', case when m ? 'set' then newq - coalesce(cur,0) else (m->>'delta')::numeric end);
  end loop;

  seqv := nextval('public.stock_seq');
  insert into public.records(coll,id,data,deleted,updated_by,updated_at)
    values('stockLog', txnid, jsonb_build_object(
      'kind', kind, 'by', actor, 'approvedBy', case when kind='set' then actor else null end,
      'site', txn->>'site', 'dir', case when kind='in' then 'from' else 'to' end,
      'items', items, 'ts', coalesce((txn->>'ts')::bigint, (extract(epoch from now())*1000)::bigint),
      'serverTs', (extract(epoch from now())*1000)::bigint, 'seq', seqv, 'applied', true, 'auth', true,
      'reason', rsn) - case when rsn is null then array['reason'] else array[]::text[] end,
      false, actor, now())
    on conflict (coll,id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0))), '[]'::jsonb) into out_qtys
    from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
    left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
  return jsonb_build_object('duplicate', false, 'qtys', out_qtys);
end $function$
;
do $c$ begin if md5(pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure)) <> '36d8402e664bd029acf5482fe98f40ae' then raise exception 'live copy differs'; end if; end $c$;
insert into public.records(coll,id,data,deleted) values
 ('stock','zzS1','{"id":"zzS1","name":"Test item","unit":"pc","min":0,"qty":10}',false),
 ('stock','zzS3','{"id":"zzS3","name":"Test item 3","unit":"pc","min":0,"qty":5}',false)
on conflict (coll,id) do update set data=excluded.data, deleted=false;
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub',(select data->>'authUid' from public.records where coll='emps' and id=u),'role','authenticated')::text, true); end $$;
create or replace function pg_temp.qty(i text) returns text language sql as $$ select coalesce(data->>'qty','(none)') from public.records where coll='stock' and id=i $$;
create or replace function pg_temp.t(phase text, who text, test text, q text, want text, after_q text default null, after_want text default null) returns void language plpgsql as $$
declare got text := 'ok'; v text := null;
begin
  perform pg_temp.as_user(who);
  begin execute 'set local role authenticated'; execute q; exception when others then got := 'refused ' || sqlstate || ' ' || left(sqlerrm,50); end;
  execute 'reset role';
  if after_q is not null then execute after_q into v; end if;
  insert into _t(phase, who, test, ok, detail) values (phase, who, test,
     ((want = 'ok') = (got = 'ok')) and (after_want is null or v = after_want), got || coalesce(' -> '||v,''));
end $$;
create or replace function pg_temp.direct(ph text, tag text) returns void language plpgsql as $s$
declare tx text := 'zzT'||left(ph,1)||tag;
begin
  update public.records set data = data || '{"qty":10}' where coll='stock' and id='zzS1';
  perform pg_temp.t(ph,'u7','HOLE: worker sets a count directly (update qty 9999) '||tag, $q$update public.records set data = jsonb_set(data,'{qty}','9999') where coll='stock' and id='zzS1'$q$, 'ok', $q$select pg_temp.qty('zzS1')$q$, '10');
  update public.records set data = data || '{"qty":10}' where coll='stock' and id='zzS1';
  perform pg_temp.t(ph,'u3','HOLE: office saves a whole item with qty 500 through app sync '||tag, $q$select public.save_records(jsonb_build_array(jsonb_build_object('coll','stock','id','zzS1','full',(select data from public.records where coll='stock' and id='zzS1') || '{"qty":500}')))$q$, 'ok', $q$select pg_temp.qty('zzS1')$q$, '10');
  update public.records set data = data || '{"qty":10}' where coll='stock' and id='zzS1';
  perform pg_temp.t(ph,'u7','HOLE: worker adds a new item with qty 500 '||tag, format($q$insert into public.records(coll,id,data,deleted) values('stock','%sS2','{"name":"x","unit":"pc","qty":500}',false)$q$,tx), 'ok', format($q$select pg_temp.qty('%sS2')$q$,tx), '0');
  perform pg_temp.t(ph,'u7','worker cannot write stock history directly '||tag, format($q$insert into public.records(coll,id,data,deleted) values('stockLog','%sLOG','{"kind":"in"}',false)$q$,tx), 'refused');
end $s$;
create or replace function pg_temp.suite(ph text) returns void language plpgsql as $s$
declare tx text := 'zzT'||left(ph,1);
begin
  perform set_config('app.stock_txn','', true);
  perform pg_temp.direct(ph,'(before any stock move)');
  perform pg_temp.t(ph,'u3','office renames an item (app sync, no qty): works, count kept', $q$select public.save_records(jsonb_build_array(jsonb_build_object('coll','stock','id','zzS1','patch',jsonb_build_object('name','Renamed item'))))$q$, 'ok', $q$select (select data->>'name' from public.records where coll='stock' and id='zzS1')||'/'||pg_temp.qty('zzS1')$q$, 'Renamed item/10');
  perform pg_temp.t(ph,'u7','worker pick-up of 2 (normal)', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s1','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta',-2))))$q$,tx), 'ok', $q$select pg_temp.qty('zzS1')$q$, '8');
  perform pg_temp.t(ph,'u7','same pick-up sent again (phone retry): applied once', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s1','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta',-2))))$q$,tx), 'ok', $q$select pg_temp.qty('zzS1')$q$, '8');
  perform pg_temp.t(ph,'u7','worker return of 3 (normal)', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s2','kind','in','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta',3))))$q$,tx), 'ok', $q$select pg_temp.qty('zzS1')$q$, '11');
  perform pg_temp.t(ph,'u7','pick-up of more than there is: refused', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s3','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta',-500))))$q$,tx), 'refused', $q$select pg_temp.qty('zzS1')$q$, '11');
  perform pg_temp.t(ph,'u7','HOLE: "pick-up" of +50 adds stock', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s4','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta',50))))$q$,tx), 'refused', $q$select pg_temp.qty('zzS1')$q$, '11');
  update public.records set data = data || '{"qty":11}' where coll='stock' and id='zzS1';
  perform pg_temp.t(ph,'u7','HOLE: "return" of -5 removes stock', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s5','kind','in','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta',-5))))$q$,tx), 'refused', $q$select pg_temp.qty('zzS1')$q$, '11');
  update public.records set data = data || '{"qty":11}' where coll='stock' and id='zzS1';
  perform pg_temp.t(ph,'u7','HOLE: "count" sent as plain amount +50 skips office rule', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s6','kind','set','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta',50))))$q$,tx), 'refused', $q$select pg_temp.qty('zzS1')$q$, '11');
  update public.records set data = data || '{"qty":11}' where coll='stock' and id='zzS1';
  perform pg_temp.t(ph,'u3','HOLE: office move with no amount wipes the item record', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s7','kind','out','by','u3','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc'))))$q$,tx), 'refused', $q$select coalesce((select data->>'name' from public.records where coll='stock' and id='zzS1'),'(record wiped)')||'/'||pg_temp.qty('zzS1')$q$, 'Renamed item/11');
  update public.records set data = '{"id":"zzS1","name":"Renamed item","unit":"pc","min":0,"qty":11}' where coll='stock' and id='zzS1';
  perform pg_temp.t(ph,'u7','HOLE: amount sent as text "+50"', format($q$select public.apply_stock_txn(jsonb_build_object('id','%sC','kind','in','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta','50'))))$q$,tx), 'refused', $q$select pg_temp.qty('zzS1')$q$, '11');
  update public.records set data = data || '{"qty":11}' where coll='stock' and id='zzS1';
  perform pg_temp.t(ph,'u7','worker real count (set 99): office only', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s8','kind','set','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','set',99,'expect',11))))$q$,tx), 'refused', $q$select pg_temp.qty('zzS1')$q$, '11');
  perform pg_temp.t(ph,'u3','office count (set 40)', format($q$select public.apply_stock_txn(jsonb_build_object('id','%s9','kind','set','by','u3','reason','recount','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','set',40,'expect',11))))$q$,tx), 'ok', $q$select pg_temp.qty('zzS1')$q$, '40');
  perform pg_temp.t(ph,'u3','office count when someone changed it meanwhile: asked to recount', format($q$select public.apply_stock_txn(jsonb_build_object('id','%sD','kind','set','by','u3','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','set',5,'expect',11))))$q$,tx), 'refused', $q$select pg_temp.qty('zzS1')$q$, '40');
  perform pg_temp.t(ph,'u1','owner count (set 25)', format($q$select public.apply_stock_txn(jsonb_build_object('id','%sA','kind','set','by','u1','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','set',25,'expect',40))))$q$,tx), 'ok', $q$select pg_temp.qty('zzS1')$q$, '25');
  perform pg_temp.t(ph,'u7','worker pick-up of two items at once', format($q$select public.apply_stock_txn(jsonb_build_object('id','%sE','kind','out','by','u7','moves',jsonb_build_array(jsonb_build_object('id','zzS1','name','x','unit','pc','delta',-1),jsonb_build_object('id','zzS3','name','y','unit','pc','delta',-2))))$q$,tx), 'ok', $q$select pg_temp.qty('zzS1')||'/'||pg_temp.qty('zzS3')$q$, '24/3');
  perform pg_temp.t(ph,'u7','worker returns a brand-new item (4): created with 4', format($q$select public.apply_stock_txn(jsonb_build_object('id','%sB','kind','in','by','u7','moves',jsonb_build_array(jsonb_build_object('id','%sNEW','name','New thing','unit','pc','delta',4))))$q$,tx,tx), 'ok', format($q$select pg_temp.qty('%sNEW')$q$,tx), '4');
  perform pg_temp.t(ph,'u7','stock history row written for every applied move', $q$select 1$q$, 'ok', format($q$select count(*)::text from public.records where coll='stockLog' and id in ('%1$s1','%1$s2','%1$s9','%1$sA','%1$sB','%1$sE')$q$,tx), '6');
  perform pg_temp.direct(ph,'(right after stock moves in the same request)');
  update public.records set data = data || '{"qty":5}' where coll='stock' and id='zzS3';
end $s$;

select pg_temp.suite('live_today');
-- ===== the fix, exactly as in db/prod_stock_security_fix.sql =====

create or replace function public.guard_stock_qty() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;          -- server jobs / owner tools
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if; -- the stock system itself
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' then
    new.data := (new.data - 'qty')
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qty' then jsonb_build_object('qty', old.data->'qty') else '{}'::jsonb end;
  else
    new.data := (new.data - 'qty') || '{"qty":0}'::jsonb;
  end if;
  return new;
end $$;

create or replace trigger records_guard_stock_qty before insert or update on public.records
  for each row when (new.coll = 'stock') execute function public.guard_stock_qty();

create schema if not exists private;
create table if not exists private.fn_backup(name text, def text, saved_at timestamptz default now());
revoke all on private.fn_backup from public, anon, authenticated;

do $patch$
declare src text; a text; b text;
begin
  src := pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure);
  if md5(src) <> '36d8402e664bd029acf5482fe98f40ae' and position('-- SEC moves' in src) = 0 then
    raise exception 'apply_stock_txn is not the version this fix was tested against (md5 %)', md5(src); end if;
  if position('-- SEC moves' in src) = 0 then
    a := $x$  for m in select * from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) loop
$x$;
    b := $y$  if kind not in ('in','out','set') then raise exception 'bad kind' using errcode = '22023'; end if;
  for m in select * from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) loop
    -- SEC moves: a pick-up only takes out, a return only brings in, a count only sets; amounts must be numbers
    if coalesce(jsonb_typeof(m),'') <> 'object' or coalesce(m->>'id','') = '' then raise exception 'bad move' using errcode = '22023'; end if;
    if (kind = 'set') <> (m ? 'set') then raise exception 'bad move for this kind of change' using errcode = '22023'; end if;
    if kind = 'set' and (coalesce(jsonb_typeof(m->'set'),'') <> 'number' or (m ? 'expect' and coalesce(jsonb_typeof(m->'expect'),'') <> 'number')) then raise exception 'count must be a number' using errcode = '22023'; end if;
    if kind <> 'set' and coalesce(jsonb_typeof(m->'delta'),'') <> 'number' then raise exception 'amount must be a number' using errcode = '22023'; end if;
    if kind = 'out' and (m->>'delta')::numeric >= 0 then raise exception 'a pick-up must take items out' using errcode = '22023'; end if;
    if kind = 'in' and (m->>'delta')::numeric <= 0 then raise exception 'a return must bring items in' using errcode = '22023'; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor not found exactly once'; end if;
    src := replace(src, a, b);
    -- switch the stock system's pass back off as soon as its own writes are done (today it stays on to the end of the
    -- request; harmless now because each request is its own transaction, but no reason to rely on that)
    a := $x$    on conflict (coll,id) do nothing;

  select coalesce$x$;
    b := $y$    on conflict (coll,id) do nothing;
  perform set_config('app.stock_txn','', true);

  select coalesce$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor 2 not found exactly once'; end if;
    insert into private.fn_backup(name, def) values ('apply_stock_txn', pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure));   -- exact copy of today's version, for rollback
    execute replace(src, a, b);
  end if;
end $patch$;

-- ===== and again (must be harmless) =====

create or replace function public.guard_stock_qty() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;          -- server jobs / owner tools
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if; -- the stock system itself
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' then
    new.data := (new.data - 'qty')
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qty' then jsonb_build_object('qty', old.data->'qty') else '{}'::jsonb end;
  else
    new.data := (new.data - 'qty') || '{"qty":0}'::jsonb;
  end if;
  return new;
end $$;

create or replace trigger records_guard_stock_qty before insert or update on public.records
  for each row when (new.coll = 'stock') execute function public.guard_stock_qty();

create schema if not exists private;
create table if not exists private.fn_backup(name text, def text, saved_at timestamptz default now());
revoke all on private.fn_backup from public, anon, authenticated;

do $patch$
declare src text; a text; b text;
begin
  src := pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure);
  if md5(src) <> '36d8402e664bd029acf5482fe98f40ae' and position('-- SEC moves' in src) = 0 then
    raise exception 'apply_stock_txn is not the version this fix was tested against (md5 %)', md5(src); end if;
  if position('-- SEC moves' in src) = 0 then
    a := $x$  for m in select * from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) loop
$x$;
    b := $y$  if kind not in ('in','out','set') then raise exception 'bad kind' using errcode = '22023'; end if;
  for m in select * from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) loop
    -- SEC moves: a pick-up only takes out, a return only brings in, a count only sets; amounts must be numbers
    if coalesce(jsonb_typeof(m),'') <> 'object' or coalesce(m->>'id','') = '' then raise exception 'bad move' using errcode = '22023'; end if;
    if (kind = 'set') <> (m ? 'set') then raise exception 'bad move for this kind of change' using errcode = '22023'; end if;
    if kind = 'set' and (coalesce(jsonb_typeof(m->'set'),'') <> 'number' or (m ? 'expect' and coalesce(jsonb_typeof(m->'expect'),'') <> 'number')) then raise exception 'count must be a number' using errcode = '22023'; end if;
    if kind <> 'set' and coalesce(jsonb_typeof(m->'delta'),'') <> 'number' then raise exception 'amount must be a number' using errcode = '22023'; end if;
    if kind = 'out' and (m->>'delta')::numeric >= 0 then raise exception 'a pick-up must take items out' using errcode = '22023'; end if;
    if kind = 'in' and (m->>'delta')::numeric <= 0 then raise exception 'a return must bring items in' using errcode = '22023'; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor not found exactly once'; end if;
    src := replace(src, a, b);
    -- switch the stock system's pass back off as soon as its own writes are done (today it stays on to the end of the
    -- request; harmless now because each request is its own transaction, but no reason to rely on that)
    a := $x$    on conflict (coll,id) do nothing;

  select coalesce$x$;
    b := $y$    on conflict (coll,id) do nothing;
  perform set_config('app.stock_txn','', true);

  select coalesce$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor 2 not found exactly once'; end if;
    insert into private.fn_backup(name, def) values ('apply_stock_txn', pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure));   -- exact copy of today's version, for rollback
    execute replace(src, a, b);
  end if;
end $patch$;

do $c$ begin if (select count(*) from private.fn_backup where name='apply_stock_txn' and md5(def)='36d8402e664bd029acf5482fe98f40ae') < 1 then raise exception 'rollback copy missing'; end if; end $c$;
select pg_temp.suite('with_fix');
select n, phase, case when ok then 'PASS' else 'FAIL' end result, who, test, detail from _t order by n;
rollback;
