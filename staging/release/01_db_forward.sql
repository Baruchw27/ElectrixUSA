-- PRODUCTION RELEASE — step 1 of 3: database protections (run BEFORE the new app files go live).
-- Tested on staging Oct 19–20 2026 (staging/release/TEST_LOG.md). Changes exactly two things:
--   1) guard_stock_qty + trigger: a stock count can only change inside apply_stock_txn. Any other write
--      (old app sync, a direct edit by a staff login) keeps the stored count. Server/admin maintenance is not affected.
--   2) apply_stock_txn: same rules as today + a count version (qv) that only goes up, items locked in id order,
--      new items created safely when several phones count them at once, the stock-change flag cleared afterwards.
-- Existing counts are not touched by this script. Rollback: 09_db_rollback.sql.
begin;

create or replace function public.guard_stock_qty() returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if;
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' then
    new.data := (new.data - 'qty' - 'qv')
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qty' then jsonb_build_object('qty', old.data->'qty') else '{}'::jsonb end
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qv' then jsonb_build_object('qv', old.data->'qv') else '{}'::jsonb end;
  else
    new.data := (new.data - 'qty' - 'qv') || '{"qty":0}'::jsonb;
  end if;
  return new;
end $function$;

create or replace trigger records_guard_stock_qty before insert or update on public.records
  for each row when (new.coll = 'stock') execute function public.guard_stock_qty();

create or replace function public.apply_stock_txn(txn jsonb) returns jsonb language plpgsql set search_path to 'public' as $function$
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
  if kind not in ('in','out','set') then raise exception 'bad kind' using errcode='22023'; end if;
  rsn := nullif(left(trim(coalesce(txn->>'reason','')), 300), '');
  fp := md5(kind || '|' || coalesce((txn->'moves')::text,'[]'));

  insert into public.stock_applied(id, fingerprint) values(txnid, fp) on conflict (id) do nothing;
  if not found then
    select fingerprint into existing_fp from public.stock_applied where id = txnid;
    if existing_fp is distinct from fp then
      raise exception 'txn_reuse_conflict: id % reused with different content', txnid using errcode='23505';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0), 'qv', coalesce((r.data->>'qv')::bigint,0))), '[]'::jsonb) into out_qtys
      from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
      left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
    return jsonb_build_object('duplicate', true, 'qtys', out_qtys);
  end if;

  perform set_config('app.stock_txn','1', true);
  for m in select value from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) order by value->>'id' loop
    if (m ? 'delta') and not (m ? 'set') and (m->>'delta')::numeric > 0 then
      insert into public.records(coll,id,data,deleted,updated_by,updated_at)
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',0,'qv',0), false, actor, now())
        on conflict (coll,id) do nothing;
    end if;
    select (data->>'qty')::numeric, data->>'name' into cur, nm
      from public.records where coll='stock' and id = m->>'id' and not deleted for update;
    if m ? 'set' then
      if not can_adjust then raise exception 'manual stock adjustment is office/owner only' using errcode='42501'; end if;
      if (m ? 'expect') and coalesce(cur,0) <> (m->>'expect')::numeric then
        raise exception 'stock_changed_recount: % now %, you saw %', m->>'id', coalesce(cur,0), m->>'expect' using errcode='40001';
      end if;
      newq := greatest(0, (m->>'set')::numeric);
    else
      if (m->>'delta') is null then raise exception 'move needs delta or set' using errcode='22023'; end if;
      newq := coalesce(cur,0) + (m->>'delta')::numeric;
      if newq < 0 then
        raise exception 'insufficient_stock: % available %, requested %', coalesce(nm,m->>'name',m->>'id'), coalesce(cur,0), abs((m->>'delta')::numeric) using errcode='P0001';
      end if;
    end if;
    if cur is null then
      insert into public.records(coll,id,data,deleted,updated_by,updated_at)
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',newq,'qv',1), false, actor, now())
        on conflict (coll,id) do update set data = public.records.data || jsonb_build_object('qty', newq, 'qv', coalesce((public.records.data->>'qv')::bigint,0)+1), updated_by=actor, updated_at=now();
    else
      update public.records set data = data || jsonb_build_object('qty', newq, 'qv', coalesce((data->>'qv')::bigint,0)+1), updated_by=actor, updated_at=now()
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
  perform set_config('app.stock_txn','', true);

  select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0), 'qv', coalesce((r.data->>'qv')::bigint,0))), '[]'::jsonb) into out_qtys
    from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
    left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
  return jsonb_build_object('duplicate', false, 'qtys', out_qtys);
end $function$;

commit;
