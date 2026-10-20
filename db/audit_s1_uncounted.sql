-- S1 (staging first): Baruch 2026-10-20 — "Only enforce stock restrictions for items whose opening counts have been verified."
-- apply_stock_txn: a pick-up of an item that has NOT been counted yet (no data.counted) is no longer refused for a shortage:
--   the garage count goes to greatest(0, before + delta) and the history line is marked "uncounted": true (change = what was
--   asked for). Counted items still refuse a shortage (insufficient_stock). Negative stock is never stored. A count ('set')
--   stamps counted = now (ms) and countedBy = the person, so from then on the item is enforced. A removed/unknown item is
--   still refused. Everything else unchanged (B4 input checks, id order, duplicates, qv).
-- guard_stock_qty: like qty/qv, the counted / countedBy stamps can only be set by a stock transaction — a phone re-sending
--   an older copy of the item (or anyone editing it) can neither remove nor fake them.

CREATE OR REPLACE FUNCTION public.apply_stock_txn(txn jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare txnid text; fp text; existing_fp text; m jsonb; me jsonb; actor text; can_adjust boolean;
        cur numeric; newq numeric; nm text; items jsonb := '[]'::jsonb; out_qtys jsonb; kind text; seqv bigint;
        rsn text; ex boolean; cnt boolean; unc boolean; nowms bigint := (extract(epoch from now())*1000)::bigint;
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
    -- B4 input checks (as in production's security fix)
    if jsonb_typeof(m) <> 'object' or coalesce(m->>'id','') = '' then raise exception 'bad move' using errcode = '22023'; end if;
    if (m ? 'set' and public._num(m->>'set') is null) or (m ? 'expect' and public._num(m->>'expect') is null) then
      raise exception 'count must be a number' using errcode = '22023'; end if;
    if (m ? 'delta') and public._num(m->>'delta') is null then raise exception 'amount must be a number' using errcode = '22023'; end if;
    -- A2 signs: a pick-up only takes out, a return only brings in, a count only sets
    if (kind = 'set') <> (m ? 'set') then raise exception 'bad move for this kind of change' using errcode = '22023'; end if;
    if kind = 'out' and coalesce(public._num(m->>'delta'), 0) >= 0 then raise exception 'a pick-up must take items out' using errcode = '22023'; end if;
    if kind = 'in' and coalesce(public._num(m->>'delta'), 0) <= 0 then raise exception 'a return must bring items in' using errcode = '22023'; end if;
    if (m ? 'delta') and not (m ? 'set') and (m->>'delta')::numeric > 0 then
      insert into public.records(coll,id,data,deleted,updated_by,updated_at)
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',0,'qv',0), false, actor, now())
        on conflict (coll,id) do update set deleted = false, data = public.records.data || jsonb_build_object('qty', 0), updated_by = actor, updated_at = now()
          where public.records.deleted;   -- B1: an item removed from the list comes back when it is put back
    end if;
    cur := null; nm := null; cnt := false; unc := false;
    select (data->>'qty')::numeric, data->>'name', (jsonb_typeof(data) = 'object' and data ? 'counted') into cur, nm, cnt
      from public.records where coll='stock' and id = m->>'id' and not deleted for update;
    ex := found;
    if m ? 'set' then
      if not can_adjust then raise exception 'manual stock adjustment is office/owner only' using errcode='42501'; end if;
      if (m ? 'expect') and coalesce(cur,0) <> (m->>'expect')::numeric then
        raise exception 'stock_changed_recount: % now %, you saw %', m->>'id', coalesce(cur,0), m->>'expect' using errcode='40001';
      end if;
      newq := greatest(0, (m->>'set')::numeric);
    else
      if (m->>'delta') is null then raise exception 'move needs delta or set' using errcode='22023'; end if;
      newq := coalesce(cur,0) + (m->>'delta')::numeric;
      if newq < 0 and kind = 'out' and ex and not cnt then
        -- S1: this item's opening count is not verified yet — the pick-up is recorded, the garage count stays at 0
        unc := true; newq := 0;
      elsif newq < 0 then
        raise exception 'insufficient_stock: % available %, requested %', coalesce(nm,m->>'name',m->>'id'), coalesce(cur,0), abs((m->>'delta')::numeric) using errcode='P0001';
      end if;
    end if;
    if cur is null then
      insert into public.records(coll,id,data,deleted,updated_by,updated_at)
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',newq,'qv',1)
               || case when m ? 'set' then jsonb_build_object('counted', nowms, 'countedBy', actor) else '{}'::jsonb end, false, actor, now())
        on conflict (coll,id) do update set deleted = false, data = public.records.data || jsonb_build_object('qty', newq, 'qv', coalesce((public.records.data->>'qv')::bigint,0)+1)
               || case when m ? 'set' then jsonb_build_object('counted', nowms, 'countedBy', actor) else '{}'::jsonb end, updated_by=actor, updated_at=now();
    else
      update public.records set data = data || jsonb_build_object('qty', newq, 'qv', coalesce((data->>'qv')::bigint,0)+1)
               || case when m ? 'set' then jsonb_build_object('counted', nowms, 'countedBy', actor) else '{}'::jsonb end, updated_by=actor, updated_at=now()
        where coll='stock' and id = m->>'id';
    end if;
    items := items || (jsonb_build_object('id', m->>'id', 'name', coalesce(nm,m->>'name',m->>'id'),
               'before', coalesce(cur,0), 'after', newq,
               'change', case when m ? 'set' then newq - coalesce(cur,0) else (m->>'delta')::numeric end)
             || case when unc then jsonb_build_object('uncounted', true) else '{}'::jsonb end);
  end loop;

  seqv := nextval('public.stock_seq');
  insert into public.records(coll,id,data,deleted,updated_by,updated_at)
    values('stockLog', txnid, jsonb_build_object(
      'kind', kind, 'by', actor, 'approvedBy', case when kind='set' then actor else null end,
      'site', txn->>'site', 'dir', case when kind='in' then 'from' else 'to' end,
      'items', items, 'ts', coalesce((txn->>'ts')::bigint, (extract(epoch from now())*1000)::bigint),
      'serverTs', (extract(epoch from now())*1000)::bigint, 'seq', seqv, 'applied', true, 'auth', true,
      'reason', rsn, 'src', nullif(left(trim(coalesce(txn->>'src','')), 200), ''))
      - case when rsn is null then array['reason'] else array[]::text[] end
      - case when nullif(trim(coalesce(txn->>'src','')), '') is null then array['src'] else array[]::text[] end,
      false, actor, now())
    on conflict (coll,id) do nothing;
  perform set_config('app.stock_txn','', true);

  select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0), 'qv', coalesce((r.data->>'qv')::bigint,0))), '[]'::jsonb) into out_qtys
    from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
    left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
  return jsonb_build_object('duplicate', false, 'qtys', out_qtys);
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_stock_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if;
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' then
    new.data := (new.data - 'qty' - 'qv' - 'counted' - 'countedBy')
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qty' then jsonb_build_object('qty', old.data->'qty') else '{}'::jsonb end
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qv' then jsonb_build_object('qv', old.data->'qv') else '{}'::jsonb end
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'counted' then jsonb_build_object('counted', old.data->'counted') else '{}'::jsonb end
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'countedBy' then jsonb_build_object('countedBy', old.data->'countedBy') else '{}'::jsonb end;
  else
    new.data := (new.data - 'qty' - 'qv' - 'counted' - 'countedBy') || '{"qty":0}'::jsonb;
  end if;
  return new;
end $function$
;
