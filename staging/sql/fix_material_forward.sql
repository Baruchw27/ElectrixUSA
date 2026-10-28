-- MATERIAL agent — audit fixes C22 H41 H42 H44 H46 H47 M11 M12 M14 (server side)
-- Apply to STAGING (rkkxykdkjgdsgkujanau) only. Rollback: fix_material_rollback.sql
-- Rules (Baruch): the material catalog he approved does not change until he (or a catalog manager) changes it;
-- new material requests land on Menachem's "job Name's" board in the job's list and are mirrored to "Daily Delivery check".

begin;

-- ───────────── M12: quantities typed as "2 boxes", "1,5", "1,000" ─────────────
-- (public._num stays strict — it is also used to validate stock moves; this one is only for request quantities)
create or replace function private.qty_num(x text) returns numeric language sql immutable set search_path to 'pg_catalog' as $function$
  select case
    when x is null then null
    when btrim(x) ~ '^-?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?(?![0-9])' then substring(replace(btrim(x), ',', '') from '^-?[0-9]+(?:\.[0-9]+)?')::numeric
    else substring(replace(btrim(x), ',', '.') from '^-?[0-9]+(?:\.[0-9]+)?')::numeric end;
$function$;

-- ───────────── H44 + M12: request status (legacy finished requests stay finished; "2 boxes" is a number) ─────────────
CREATE OR REPLACE FUNCTION private.mat_status(n jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare tot int := 0; dn int := 0; anyprep boolean := false; allpk boolean := true; anypk boolean := false; v jsonb; qn numeric; pk numeric; stm text := coalesce(n->>'stm','');
begin
  for v in select value from jsonb_each(n) e where e.key like 'li\_%' and position('~' in e.key) = 0 loop
    if jsonb_typeof(v) <> 'object' or coalesce((v->>'gone')::boolean,false) then continue; end if;
    tot := tot + 1;
    if coalesce((v->>'done')::boolean,false) then dn := dn + 1; end if;
    if coalesce(private.qty_num(v->>'pq'),0) > 0 or coalesce((v->>'done')::boolean,false) then anyprep := true; end if;
    qn := private.qty_num(v->>'q'); pk := coalesce(private.qty_num(v->>'pk'), 0);
    if pk > 0 then anypk := true; end if;
    if pk <= 0 or (qn is not null and pk < qn) then allpk := false; end if;
  end loop;
  return case when stm = 'completed' then 'completed'
              when tot = 0 and coalesce(n->>'status','') in ('delivered','done','completed') then 'completed'   -- H44: an old-style finished request
              when tot > 0 and allpk then 'completed'
              when anypk then 'partpicked'
              when tot > 0 and dn = tot then 'ready'
              when anyprep then 'partial'
              when stm in ('requested','reviewing','ordered','preparing') then stm
              else 'requested' end;
end $function$;

-- ───────────── M11 + M12: never prepared more than asked (unless the quantity is amended) ─────────────
CREATE OR REPLACE FUNCTION private.mat_item_fix(ov jsonb, nv jsonb, prep boolean, pick boolean, actor text, nowms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare fin jsonb := nv; f text; qn numeric; pq numeric; prepch boolean; contch boolean; wasprep boolean; dn boolean;
begin
  -- picked-up quantity: only mat_pickup()
  if not pick then fin := fin - 'pk'; if ov ? 'pk' then fin := fin || jsonb_build_object('pk', ov->'pk'); end if; end if;
  -- preparation fields: only the people who prepare
  if not prep then
    foreach f in array array['pq','done','doneBy','doneAt','rck','pqBy','pqAt'] loop
      fin := fin - f; if ov ? f then fin := fin || jsonb_build_object(f, ov->f); end if;
    end loop;
    if ov is null then fin := fin || '{"done":false}'::jsonb; end if;
  end if;
  prepch := prep and (fin->'pq' is distinct from ov->'pq' or coalesce((fin->>'done')::boolean,false) is distinct from coalesce((ov->>'done')::boolean,false));
  contch := ov is not null and (coalesce(fin->>'q','') is distinct from coalesce(ov->>'q','') or coalesce(fin->>'t','') is distinct from coalesce(ov->>'t','')
            or coalesce(fin->>'sid','') is distinct from coalesce(ov->>'sid','') or coalesce(fin->>'u','') is distinct from coalesce(ov->>'u',''));
  wasprep := ov is not null and (coalesce(private.qty_num(ov->>'pq'),0) > 0 or coalesce((ov->>'done')::boolean,false));
  -- done only when the full quantity is prepared
  qn := private.qty_num(fin->>'q');
  if qn is not null and qn > 0 then
    pq := private.qty_num(fin->>'pq');
    if prep and fin->'pq' is not distinct from ov->'pq' then
      if coalesce((fin->>'done')::boolean,false) and not coalesce((ov->>'done')::boolean,false) then pq := qn;          -- ticked: all of it
      elsif not coalesce((fin->>'done')::boolean,false) and coalesce((ov->>'done')::boolean,false) then pq := 0; end if; -- unticked
    end if;
    if pq is not null then
      pq := least(greatest(0, pq), qn);                                    -- M11: more than asked → change the asked quantity first
      fin := fin || jsonb_build_object('pq', pq, 'done', pq >= qn);
    elsif ov is null or not prep then
      fin := fin || jsonb_build_object('done', coalesce((fin->>'done')::boolean,false) and coalesce(private.qty_num(fin->>'pq'),0) >= qn);
    end if;
  end if;
  dn := coalesce((fin->>'done')::boolean,false);
  if dn and not coalesce((ov->>'done')::boolean,false) then fin := fin || jsonb_build_object('doneBy', actor, 'doneAt', nowms);
  elsif not dn then fin := fin - 'doneBy' - 'doneAt'; end if;
  if prep and fin->'pq' is distinct from ov->'pq' then fin := fin || jsonb_build_object('pqBy', actor, 'pqAt', nowms); end if;
  -- recheck: what was asked for changed after it was (partly) prepared
  if prepch then fin := fin - 'rck';
  elsif contch and wasprep then fin := fin || '{"rck":true}'::jsonb; end if;
  return fin;
end $function$;

-- ───────────── H42: barcodes, part number and the "unverified" mark are catalog fields too ─────────────
CREATE OR REPLACE FUNCTION private.catalog_fields()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['name','cat','sec','unit','pkg','ft','fam','vl','at','desc','alias','fav','hidden','mergedInto','ord','aka','size',
               'model','codes','packs','unverified','crev','cedBy','cedAt']::text[] $function$;

-- ───────────── H42: a new material from a scan / put-back by someone who does not manage the list = UNVERIFIED ─────────────
-- (kept out of the material picker until Menachem / Baruch approve it or merge it into an existing material)
CREATE OR REPLACE FUNCTION public.guard_catalog()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; mgr boolean; o jsonb; n jsonb := new.data; f text; changed boolean := false; nm text; nowms bigint := (extract(epoch from now())*1000)::bigint;
        keep jsonb := '{}'::jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if;   -- receiving stock (apply_stock_txn) may add an item (marked unverified there)
  me := public.my_emp_data();
  mgr := private.catalog_mgr(me);
  if new.deleted and new.coll = 'stock' then                                 -- removing a material: catalog managers only (soft, kept in history)
    if not mgr and tg_op = 'UPDATE' and not old.deleted then
      raise exception 'only the people who manage the material list can remove materials — hide it instead' using errcode = '42501'; end if;
    return new; end if;
  if jsonb_typeof(n) <> 'object' then raise exception 'not allowed' using errcode = '42501'; end if;
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data end;
  if new.coll = 'mtpl' then
    if not mgr then raise exception 'only the people who manage the material list can change templates' using errcode = '42501'; end if;
    if new.deleted then raise exception 'a template is hidden, not deleted' using errcode = '42501'; end if;
    new.data := n || jsonb_build_object('id', new.id, 'eby', me->>'id', 'eat', nowms);
    return new;
  end if;
  if new.deleted then return new; end if;
  if o is null then                                                        -- a new material
    nm := lower(btrim(coalesce(n->>'name','')));
    if nm = '' then raise exception 'a material needs a name' using errcode = '42501'; end if;
    if exists (select 1 from public.records s where s.coll = 'stock' and not s.deleted and s.id <> new.id and jsonb_typeof(s.data) = 'object'
                and (lower(btrim(s.data->>'name')) = nm or (jsonb_typeof(s.data->'aka') = 'array' and exists (select 1 from jsonb_array_elements_text(s.data->'aka') a where lower(btrim(a)) = nm)))) then
      raise exception 'already in the material list: %', n->>'name' using errcode = '42501'; end if;
    if not mgr then
      -- H42: someone else found a new item (scanner / typed): it is saved, but only as UNVERIFIED and hidden from the picker
      new.data := (n - 'crev' - 'cedBy' - 'cedAt' - 'fav' - 'mergedInto') || jsonb_build_object('unverified', true, 'hidden', true, 'newBy', me->>'id', 'newAt', nowms);
      return new; end if;
    new.data := n || jsonb_build_object('crev', 1, 'cedBy', me->>'id', 'cedAt', nowms);
    return new;
  end if;
  foreach f in array private.catalog_fields() loop
    if f in ('crev','cedBy','cedAt') then continue; end if;
    if n->f is distinct from o->f then changed := true; end if;
  end loop;
  if not changed then
    -- nothing about the material itself changed: keep the server's catalog fields exactly
    foreach f in array array['crev','cedBy','cedAt'] loop
      n := n - f; if o ? f then n := n || jsonb_build_object(f, o->f); end if;
    end loop;
    new.data := n; return new;
  end if;
  if not mgr or (n->'crev') is distinct from (o->'crev') then
    -- not a catalog manager, or a phone that had an older copy of this material: the catalog fields stay as they are on
    -- the server; anything else in the change (photo, notes …) still goes through
    foreach f in array private.catalog_fields() loop
      n := n - f; if o ? f then n := n || jsonb_build_object(f, o->f); end if;
    end loop;
    new.data := n; return new;
  end if;
  -- a catalog manager's change from the current version
  nm := lower(btrim(coalesce(n->>'name','')));
  if nm = '' then raise exception 'a material needs a name' using errcode = '42501'; end if;
  if lower(btrim(coalesce(o->>'name',''))) <> nm then
    if exists (select 1 from public.records s where s.coll = 'stock' and not s.deleted and s.id <> new.id and jsonb_typeof(s.data) = 'object'
                and lower(btrim(s.data->>'name')) = nm and not coalesce((s.data->>'hidden')::boolean, false)) then
      raise exception 'another material already has that name: %', n->>'name' using errcode = '42501'; end if;
    -- remember the old name so an old copy of the app can't add it again as a new material
    n := n || jsonb_build_object('aka', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
           select jsonb_array_elements_text(case when jsonb_typeof(o->'aka') = 'array' then o->'aka' else '[]'::jsonb end) x
           union select o->>'name') q where coalesce(x,'') <> '' and lower(btrim(x)) <> nm));
  end if;
  if (n->>'mergedInto') is distinct from (o->>'mergedInto') and coalesce(n->>'mergedInto','') <> '' then
    raise exception 'use "merge duplicates" to merge materials' using errcode = '42501'; end if;
  -- approving an unverified item: record who approved it
  if coalesce((o->>'unverified')::boolean,false) and not coalesce((n->>'unverified')::boolean,false) then
    n := n || jsonb_build_object('approvedBy', me->>'id', 'approvedAt', nowms); end if;
  new.data := n || jsonb_build_object('crev', coalesce(public._num(o->>'crev')::int, 0) + 1, 'cedBy', me->>'id', 'cedAt', nowms);
  return new;
end $function$;

-- ───────────── C22 + H42 + H47: the stock transaction ─────────────
--  • H42: an item that does not exist yet, created by someone who does not manage the list → unverified + hidden
--  • H47: where a put-back came from (job / supplier / new) is stored on the history row (srcKind)
--  • C22: the idempotency row is claimed only inside this function (the table no longer accepts direct inserts)
CREATE OR REPLACE FUNCTION public.apply_stock_txn(txn jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare txnid text; fp text; existing_fp text; m jsonb; me jsonb; actor text; can_adjust boolean;
        cur numeric; newq numeric; nm text; items jsonb := '[]'::jsonb; out_qtys jsonb; kind text; seqv bigint;
        rsn text; ex boolean; cnt boolean; unc boolean; nowms bigint := (extract(epoch from now())*1000)::bigint;
        newflags jsonb; sk text;
begin
  txnid := txn->>'id';
  if coalesce(txnid,'') = '' then raise exception 'txn id required' using errcode='22023'; end if;
  me := public.my_emp_data(); actor := me->>'id';
  if coalesce(actor,'') = '' then raise exception 'not allowed' using errcode='42501'; end if;
  can_adjust := (me->>'role' in ('owner','manager','office')) or coalesce((me->>'all')::boolean,false);
  kind := coalesce(txn->>'kind','');
  if kind not in ('in','out','set') then raise exception 'bad kind' using errcode='22023'; end if;
  rsn := nullif(left(trim(coalesce(txn->>'reason','')), 300), '');
  sk := case when kind = 'in' and txn->>'srcKind' in ('job','supplier','new') then txn->>'srcKind' end;
  newflags := case when private.catalog_mgr(me) then '{}'::jsonb
                   else jsonb_build_object('unverified', true, 'hidden', true, 'newBy', actor, 'newAt', nowms) end;
  fp := md5(kind || '|' || coalesce((txn->'moves')::text,'[]'));

  perform set_config('app.stock_txn','1', true);
  insert into public.stock_applied(id, fingerprint) values(txnid, fp) on conflict (id) do nothing;
  if not found then
    perform set_config('app.stock_txn','', true);
    select fingerprint into existing_fp from public.stock_applied where id = txnid;
    if existing_fp is distinct from fp then
      raise exception 'txn_reuse_conflict: id % reused with different content', txnid using errcode='23505';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0), 'qv', coalesce((r.data->>'qv')::bigint,0))), '[]'::jsonb) into out_qtys
      from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
      left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
    return jsonb_build_object('duplicate', true, 'qtys', out_qtys);
  end if;

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
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',0,'qv',0) || newflags, false, actor, now())
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
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',newq,'qv',1) || newflags
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
      'site', case when sk in ('supplier','new') then null else txn->>'site' end, 'dir', case when kind='in' then 'from' else 'to' end,
      'items', items, 'ts', coalesce((txn->>'ts')::bigint, (extract(epoch from now())*1000)::bigint),
      'serverTs', (extract(epoch from now())*1000)::bigint, 'seq', seqv, 'applied', true, 'auth', true,
      'reason', rsn, 'src', nullif(left(trim(coalesce(txn->>'src','')), 200), ''), 'srcKind', sk)
      - case when rsn is null then array['reason'] else array[]::text[] end
      - case when nullif(trim(coalesce(txn->>'src','')), '') is null then array['src'] else array[]::text[] end
      - case when sk is null then array['srcKind'] else array[]::text[] end
      - case when sk in ('supplier','new') or txn->>'site' is null then array['site'] else array[]::text[] end,
      false, actor, now())
    on conflict (coll,id) do nothing;
  perform set_config('app.stock_txn','', true);

  select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0), 'qv', coalesce((r.data->>'qv')::bigint,0))), '[]'::jsonb) into out_qtys
    from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
    left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
  return jsonb_build_object('duplicate', false, 'qtys', out_qtys);
end $function$;

-- ───────────── C22: hardening ─────────────
-- the old absolute-count helper is not used by any app version any more
revoke execute on function public.apply_stock_moves(jsonb) from public, anon, authenticated;
-- stock functions: signed-in team members only (never the anonymous key)
revoke execute on function public.apply_stock_txn(jsonb) from public, anon;
revoke execute on function public.stock_reconcile() from public, anon;
revoke execute on function public.stock_site_net(text) from public, anon;
revoke execute on function public.stock_site_history(text) from public, anon;
revoke execute on function public.stock_item_history(text) from public, anon;
revoke execute on function public.stock_history(text,text,text,text,bigint,bigint,integer,integer) from public, anon;
revoke execute on function public.stock_history_v2(text,text,text,text,bigint,bigint,integer,integer) from public, anon;
grant execute on function public.apply_stock_txn(jsonb), public.stock_reconcile(), public.stock_site_net(text), public.stock_site_history(text),
  public.stock_item_history(text), public.stock_history(text,text,text,text,bigint,bigint,integer,integer),
  public.stock_history_v2(text,text,text,text,bigint,bigint,integer,integer) to authenticated, service_role;
-- a transaction id can only be claimed by apply_stock_txn (so nobody can block someone else's move by taking its id first)
alter policy "members claim" on public.stock_applied
  with check (public.is_member() and coalesce(current_setting('app.stock_txn', true), '') = '1');

-- ───────────── H46: barcode → item links (coll 'bc') ─────────────
-- anyone may save a NEW link (first time a barcode is confirmed); changing which item a saved barcode points to, or removing
-- it, is for the people who manage the material list. The previous link is kept on the record (prev) — nothing is lost.
create or replace function public.guard_bc() returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb; mgr boolean; o jsonb; n jsonb := new.data; nowms bigint := (extract(epoch from now())*1000)::bigint;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if coalesce(me->>'id','') = '' then raise exception 'not allowed' using errcode = '42501'; end if;
  mgr := private.catalog_mgr(me);
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data end;
  if new.deleted then
    if o is null then return new; end if;
    if not mgr then raise exception 'only the people who manage the material list can remove a saved barcode' using errcode = '42501'; end if;
    new.data := o || jsonb_build_object('removedBy', me->>'id', 'removedAt', nowms);
    return new;
  end if;
  if jsonb_typeof(n) <> 'object' or coalesce(n->>'item','') = '' then raise exception 'bad barcode link' using errcode = '22023'; end if;
  if o is null then
    new.data := n || jsonb_build_object('by', me->>'id', 'ts', nowms);
    return new;
  end if;
  if n->'item' is distinct from o->'item' or n->'pack' is distinct from o->'pack' or n->'code' is distinct from o->'code' then
    if not mgr then raise exception 'only the people who manage the material list can change a saved barcode' using errcode = '42501'; end if;
    new.data := n || jsonb_build_object('by', me->>'id', 'ts', nowms,
                  'prev', jsonb_build_object('item', o->'item', 'pack', o->'pack', 'by', o->'by', 'ts', o->'ts'));
    return new;
  end if;
  new.data := o;   -- nothing that matters changed
  return new;
end $function$;
create or replace trigger records_guard_bc before insert or update on public.records
  for each row when (new.coll = 'bc') execute function public.guard_bc();

-- ───────────── M14: van lists — the crew itself, Menachem (material office) and the owner change them; others only look ─────────────
create or replace function public.guard_vans() returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if coalesce(me->>'id','') = '' then raise exception 'not allowed' using errcode = '42501'; end if;
  if me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Material')
     or (me->>'role' = 'worker' and coalesce(me->>'crew','') <> '' and me->>'crew' = new.id) then
    if new.deleted then raise exception 'a van list is emptied, not removed' using errcode = '42501'; end if;
    return new; end if;
  raise exception 'only that crew, Menachem or Baruch can change this van list' using errcode = '42501';
end $function$;
create or replace trigger records_guard_vans before insert or update on public.records
  for each row when (new.coll = 'vans') execute function public.guard_vans();

-- ───────────── H41: new material request → card on job Name's AND a mirror on Daily Delivery check ─────────────
-- mat_trello config gets "daily" (the Daily Delivery check board id). The mirror is made by trello-personal right after the
-- job card exists (its name is the card link, like the mirrors made in the app), once — the job card keeps "ddCard".
-- STAGING board id is "BD" (mock Trello). PRODUCTION: use the real Daily Delivery check board id 69b81ac4ca472d409d18ff0f.
update public.server_config set v = ((v::jsonb) || '{"daily":"BD","dailyName":"Daily Delivery check"}'::jsonb)::text where k = 'mat_trello';

create or replace function private.mat_dd_list(emp text, board text, p_when text) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $function$
declare meta jsonb; w text := lower(btrim(coalesce(p_when,''))); d date := (now() at time zone 'America/New_York')::date; want text; l jsonb;
begin
  select data into meta from public.records where coll = 'ptask' and id = 'ptmeta_' || emp and not deleted;
  if meta is null then return null; end if;
  if w like 'today%' or w like 'asap%' or w like 'now%' then want := lower(to_char(d, 'FMDay'));
  elsif w like 'tomorrow%' then want := lower(to_char(d + 1, 'FMDay'));
  else want := 'waiting'; end if;
  select ll into l from jsonb_array_elements(coalesce(meta->'boards','[]'::jsonb)) bb, jsonb_array_elements(coalesce(bb->'lists','[]'::jsonb)) ll
   where bb->>'id' = board and lower(btrim(ll->>'name')) = want limit 1;
  if l is null then   -- that day has no list (weekend): the "Waiting" list
    select ll into l from jsonb_array_elements(coalesce(meta->'boards','[]'::jsonb)) bb, jsonb_array_elements(coalesce(bb->'lists','[]'::jsonb)) ll
     where bb->>'id' = board and lower(btrim(ll->>'name')) = 'waiting' limit 1;
  end if;
  return l;
end $function$;
revoke all on function private.mat_dd_list(text,text,text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.mat_to_trello()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cfg jsonb; emp text; pid text; ex jsonb; txt jsonb; sig text; fin boolean; nowms bigint := (extract(epoch from now())*1000)::bigint;
        site text; l jsonb; dl jsonb;
begin
  if new.deleted or jsonb_typeof(new.data) <> 'object' then return null; end if;
  begin select v::jsonb into cfg from public.server_config where k = 'mat_trello'; exception when others then cfg := null; end;
  if cfg is null or coalesce(cfg->>'emp','') = '' or coalesce(cfg->>'board','') = '' then return null; end if;
  emp := cfg->>'emp';
  if not exists (select 1 from public.server_config where k = 'trello_user_token:' || emp) then return null; end if;
  pid := 'pt_' || emp || '_mat_' || new.id;
  select data into ex from public.records where coll = 'ptask' and id = pid and not deleted;
  fin := coalesce(new.data->>'st','') = 'completed' or coalesce(new.data->>'status','') in ('done','delivered','completed');
  txt := private.mat_card_text(new.data, new.id);
  sig := md5(txt::text);
  if ex is null then
    if not (tg_op = 'INSERT' or old.deleted) or fin then return null; end if;   -- only new requests, not finished ones
    select r.data->>'name' into site from public.records r where r.coll = 'sites' and r.id = new.data->>'site' and not r.deleted;
    site := coalesce(nullif(btrim(site),''), nullif(btrim(new.data->>'addr'),''), 'Material — no job picked');
    l := private.pt_job_list(emp, cfg->>'board', site);
    if coalesce(cfg->>'daily','') <> '' then dl := private.mat_dd_list(emp, cfg->>'daily', new.data->>'when'); end if;
    insert into public.records (coll, id, data, deleted)
    values ('ptask', pid, jsonb_build_object('id', pid, 'owner', emp, 't', txt->>'t', 'desc', txt->>'desc',
              'board', cfg->'board', 'boardName', cfg->'boardName', 'list', coalesce(l->'id', '""'::jsonb), 'listName', coalesce(l->'name', to_jsonb(site)),
              'due', null, 'done', false, 'push', true, 'mat', new.id, 'matSig', sig, 'created', nowms, 'eat', nowms, 'eby', 'electrix')
            || case when l is null then jsonb_build_object('newList', left(site, 200)) else '{}'::jsonb end
            || case when dl is not null then jsonb_build_object('dd', dl->'id', 'ddName', dl->'name', 'ddBoard', cfg->'daily', 'ddBoardName', coalesce(cfg->'dailyName', '"Daily Delivery check"'::jsonb)) else '{}'::jsonb end, false)
    on conflict (coll, id) do nothing;
    return null;
  end if;
  if coalesce((ex->>'gone')::boolean, false) then return null; end if;            -- archived in Trello: leave it
  if ex->>'matSig' is distinct from sig or (fin and not coalesce((ex->>'done')::boolean, false)) then
    update public.records set data = ex
        || case when ex->>'matSig' is distinct from sig then jsonb_build_object('t', txt->>'t', 'desc', txt->>'desc', 'matSig', sig) else '{}'::jsonb end
        || case when fin then jsonb_build_object('done', true) else '{}'::jsonb end
        || jsonb_build_object('push', true, 'eat', nowms, 'eby', 'electrix')
     where coll = 'ptask' and id = pid;
  end if;
  return null;
end $function$;

commit;
