-- 91_rollback_post_release.sql — undo the production changes made AFTER the vaud1020 release (2026-10-20 evening):
--   S1 (only counted items refuse a shortage) and L2 (shared lists). Restores the release versions (md5-verified in
--   10_forward.sql) and switches the two list triggers off. Data is not touched: list items (li_/lc_ keys) stay in the
--   records, the opening garage count stays. App: revert gh-pages to the previous release commit.
begin;
set local search_path = public, extensions;
-- public.can_see2  [REPLACES production version]  staging md5 3169e5b31b58f45b6594d680b0d6b66a
CREATE OR REPLACE FUNCTION public.can_see2(c text, d jsonb, me jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when c not in ('keep','inbox','push','meets','punches','timeoff','goHomeLog','travel','exps','emphr','stockLog','rejq',
                   'incidents','msgs','apps','invites','fixes') then true
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
    when c = 'inbox' then d->>'to' = me->>'id'
    when c = 'push' then d->>'who' = me->>'id'
    when c = 'meets' then me->>'role' = 'owner' or d->>'by' = me->>'id' or coalesce(d->'with','[]'::jsonb) ? (me->>'id')
    when c = 'emphr' then d->>'who' = me->>'id' or me->>'role' in ('owner','manager','office') or (me->>'all')::boolean
    when c in ('punches','timeoff','goHomeLog','travel') then
         me->>'role' in ('owner','manager','office') or (me->>'all')::boolean or d->>'who' = me->>'id'
    when c in ('fixes','incidents') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'who' = me->>'id' or d->>'by' = me->>'id'
    when c in ('stockLog','rejq') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'by' = me->>'id'
    when c = 'exps' then
         me->>'role' in ('owner','manager') or (me->>'all')::boolean
      or (me->>'role' = 'office' and me->>'title' in ('Payroll','Bookkeeper')) or d->>'who' = me->>'id'
    when c = 'msgs' then me->>'role' = 'owner' or d->>'from' = me->>'id' or d->>'to' = me->>'id' or coalesce(d->>'k','') like 'g:%'
    when c in ('apps','invites') then me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false)
    else true end;
$function$
;
revoke all on function public.can_see2(c text, d jsonb, me jsonb) from public, anon, authenticated, service_role;
grant execute on function public.can_see2(c text, d jsonb, me jsonb) to authenticated;
grant execute on function public.can_see2(c text, d jsonb, me jsonb) to service_role;

-- public.apply_stock_txn  [REPLACES production version]  staging md5 6a0c1f0cc2466a6a174414fbc754c22c
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
        on conflict (coll,id) do update set deleted = false, data = public.records.data || jsonb_build_object('qty', newq, 'qv', coalesce((public.records.data->>'qv')::bigint,0)+1), updated_by=actor, updated_at=now();
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
revoke all on function public.apply_stock_txn(txn jsonb) from public, anon, authenticated, service_role;
grant execute on function public.apply_stock_txn(txn jsonb) to public;
grant execute on function public.apply_stock_txn(txn jsonb) to anon;
grant execute on function public.apply_stock_txn(txn jsonb) to authenticated;
grant execute on function public.apply_stock_txn(txn jsonb) to service_role;

-- public.guard_stock_qty  [REPLACES production version]  staging md5 ffae2d53aafe84ac874aa1128b6a9474
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
    new.data := (new.data - 'qty' - 'qv')
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qty' then jsonb_build_object('qty', old.data->'qty') else '{}'::jsonb end
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qv' then jsonb_build_object('qv', old.data->'qv') else '{}'::jsonb end;
  else
    new.data := (new.data - 'qty' - 'qv') || '{"qty":0}'::jsonb;
  end if;
  return new;
end $function$
;
revoke all on function public.guard_stock_qty() from public, anon, authenticated, service_role;
grant execute on function public.guard_stock_qty() to public;
grant execute on function public.guard_stock_qty() to anon;
grant execute on function public.guard_stock_qty() to authenticated;
grant execute on function public.guard_stock_qty() to service_role;

-- public.notify_flush  [new (staging-only)]  staging md5 82e29f83bda586a4ecb4f26deed7de76
CREATE OR REPLACE FUNCTION public.notify_flush()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0; parts_en text; parts_es text; cnt int; ids bigint[];
begin
  for r in
    select to_id from private.notify_queue where sent is null group by to_id having max(created) < now() - interval '40 seconds'
  loop
    with q as (select * from private.notify_queue where sent is null and to_id = r.to_id),
         firsts as (select distinct on (qkey) qkey, sig_before from q order by qkey, created, id),
         lasts as (select distinct on (qkey) qkey, en, es, sig_after, created from q order by qkey, created desc, id desc),
         chg as (select l.* from lasts l join firsts f using (qkey) where coalesce(f.sig_before, '') is distinct from coalesce(l.sig_after, ''))
    select count(*), string_agg(en, ' · ' order by qkey), string_agg(es, ' · ' order by qkey), (select array_agg(id) from q)
      into cnt, parts_en, parts_es, ids from chg;
    if ids is null then select array_agg(id) into ids from private.notify_queue where sent is null and to_id = r.to_id; end if;
    if cnt = 1 then
      perform private.notify_now(r.to_id, '📅 Schedule · ' || parts_en, '📅 Horario · ' || parts_es, 'info', jsonb_build_object('tab', 'sched'), null);
      n := n + 1;
    elsif cnt > 1 then
      perform private.notify_now(r.to_id, left('📅 Your schedule changed (' || cnt || '): ' || parts_en, 400),
                                          left('📅 Tu horario cambió (' || cnt || '): ' || parts_es, 400), 'info', jsonb_build_object('tab', 'sched'), null);
      n := n + 1;
    end if;
    update private.notify_queue set sent = now() where id = any(ids);
  end loop;
  return n;
end $function$
;
revoke all on function public.notify_flush() from public, anon, authenticated, service_role;
grant execute on function public.notify_flush() to service_role;

alter table public.records disable trigger records_guard_lists;
alter table public.records disable trigger records_zz_notify_lists;
commit;
-- verify: can_see2 3169e5b31b58f45b6594d680b0d6b66a, apply_stock_txn 6a0c1f0cc2466a6a174414fbc754c22c,
--         guard_stock_qty ffae2d53aafe84ac874aa1128b6a9474, notify_flush 82e29f83bda586a4ecb4f26deed7de76
