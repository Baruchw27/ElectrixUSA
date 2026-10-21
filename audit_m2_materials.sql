-- M2 (staging first): the material system (Baruch 2026-10-20 21:38).
--   • master catalog (coll 'stock'): only catalog managers change what a material IS (name, size, unit, package,
--     category, favorite, hidden …). The list of managers is server-side: server_config 'catalog_managers' (JSON array
--     of employee ids) + the owner. Garage counts still change only through apply_stock_txn (unchanged).
--   • templates (coll 'mtpl'): catalog managers only.
--   • material requests (coll 'mats', items li_<id>): a preparation checklist — prepared quantity (pq) and done are set
--     only by the people who prepare (owner, managers, the Material office, or the person the list is sent to); done is
--     only true when the FULL quantity is prepared; an item changed after it was prepared is flagged for rechecking
--     (rck); picked-up quantities (pk) are written only by mat_pickup(), which takes the stock out through
--     apply_stock_txn (one transaction id = one pickup, never twice). The request status (st) follows the items.
--   • notifications: what changed, by whom, on which job; "Your material order is ready." to whoever asked for it.
-- Item fields: t (name), q (qty), u (unit), sid (catalog item), desc, img, cu (custom item), pq, done, doneBy, doneAt,
--   rck, pk, plus the list fields of L2 (ord, by, ts, rev, base, eby, eat, gone).

-- 0. who manages the catalog
insert into public.server_config(k, v) values ('catalog_managers', '[]') on conflict (k) do nothing;

create or replace function private.catalog_mgr(me jsonb)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce(coalesce(me->>'id','') <> '' and not coalesce((me->>'inactive')::boolean, false) and (
    coalesce(me->>'role','') = 'owner'
    or exists (select 1 from public.server_config c where c.k = 'catalog_managers' and c.v ~ '^\s*\['
               and (c.v::jsonb) ? (me->>'id'))), false);
$function$;
revoke all on function private.catalog_mgr(jsonb) from public, anon;
grant execute on function private.catalog_mgr(jsonb) to authenticated, service_role;

-- for the app: am I a catalog manager / who are they (ids only)
create or replace function public.catalog_managers()
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when public.my_emp_data() = '{}'::jsonb then '[]'::jsonb else
    coalesce((select jsonb_agg(distinct x) from (
       select jsonb_array_elements_text(case when c.v ~ '^\s*\[' then c.v::jsonb else '[]'::jsonb end) x from public.server_config c where c.k = 'catalog_managers'
       union all select r.id from public.records r where r.coll = 'emps' and not r.deleted and r.data->>'role' = 'owner') q), '[]'::jsonb) end;
$function$;
revoke all on function public.catalog_managers() from public, anon;
grant execute on function public.catalog_managers() to authenticated;


-- FIX (found while testing M2): list_editor returned NULL (not false) for a material list with no "to" — so the
-- "only the people on this list" checks did not refuse anyone. Always true/false now.
create or replace function private.list_editor(c text, d jsonb, me jsonb)
 returns boolean language sql stable set search_path to 'public' as $function$
  select coalesce(coalesce(me->>'id','') <> '' and (
    case when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
         when c = 'mats' then d->>'from' = me->>'id' or d->>'to' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
              or me->>'role' in ('owner','manager') or coalesce((me->>'all')::boolean,false)
              or (me->>'role' = 'office' and me->>'title' in ('Material','Payroll'))
         else false end), false);
$function$;

-- 1. the catalog guard (stock + templates)
create or replace function private.catalog_fields() returns text[] language sql immutable as $$
  select array['name','cat','sec','unit','pkg','ft','fam','vl','at','desc','alias','fav','hidden','mergedInto','ord','aka','size','crev','cedBy','cedAt']::text[] $$;

create or replace function public.guard_catalog()
 returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb; mgr boolean; o jsonb; n jsonb := new.data; f text; changed boolean := false; nm text; nowms bigint := (extract(epoch from now())*1000)::bigint;
        keep jsonb := '{}'::jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if;   -- receiving stock (apply_stock_txn) may add an item
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
    if not mgr then raise exception 'only the people who manage the material list can add materials' using errcode = '42501'; end if;
    nm := lower(btrim(coalesce(n->>'name','')));
    if nm = '' then raise exception 'a material needs a name' using errcode = '42501'; end if;
    if exists (select 1 from public.records s where s.coll = 'stock' and not s.deleted and s.id <> new.id and jsonb_typeof(s.data) = 'object'
                and (lower(btrim(s.data->>'name')) = nm or (jsonb_typeof(s.data->'aka') = 'array' and exists (select 1 from jsonb_array_elements_text(s.data->'aka') a where lower(btrim(a)) = nm)))) then
      raise exception 'already in the material list: %', n->>'name' using errcode = '42501'; end if;
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
    -- the server; anything else in the change (barcodes, photo, model …) still goes through
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
  new.data := n || jsonb_build_object('crev', coalesce(public._num(o->>'crev')::int, 0) + 1, 'cedBy', me->>'id', 'cedAt', nowms);
  return new;
end $function$;
revoke all on function public.guard_catalog() from public, anon, authenticated, service_role;
grant execute on function public.guard_catalog() to authenticated, service_role;
-- after guard_record / guard_fields (alphabetical), before guard_stock_qty keeps the count
create or replace trigger records_guard_catalog before insert or update on public.records for each row
  when (new.coll = any (array['stock'::text, 'mtpl'::text])) execute function public.guard_catalog();

-- staff (office) could change name/unit/cat/brand before; the catalog fields are now the catalog managers' (above),
-- brand/min/price stay with the office as before
create or replace function public.guard_fields()
 returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb; staff boolean; n jsonb := new.data; o jsonb := old.data; k text;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if me = '{}'::jsonb then raise exception 'not allowed' using errcode = '42501'; end if;
  staff := me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false);
  if staff then return new; end if;
  if jsonb_typeof(n) <> 'object' or jsonb_typeof(o) <> 'object' then
    raise exception 'that record must stay an object' using errcode = '42501'; end if;
  if new.coll = 'jobs' then
    if o->>'from' = me->>'id' then return new; end if;
    foreach k in array array['desc','descTr','descLang','site','due','pri','est','media'] loop
      if n->k is distinct from o->k then raise exception 'only the office can change %', k using errcode = '42501'; end if;
    end loop;
    if n->'to' is distinct from o->'to' and not coalesce((me->>'lead')::boolean,false) then
      raise exception 'only the office or a crew leader can reassign a job' using errcode = '42501'; end if;
  elsif new.coll = 'sites' then
    foreach k in array array['name','client','clientX','phone','price','priced','total','customer','custPhone','manager','crew','trello','trelloList'] loop
      if n->k is distinct from o->k then raise exception 'only the office can change %', k using errcode = '42501'; end if;
    end loop;
  elsif new.coll = 'stock' then
    -- catalog fields (name, unit, cat …) are handled by guard_catalog (kept as they are, not refused)
    foreach k in array array['min','brand','price','cost','upc','sku'] loop
      if n->k is distinct from o->k then raise exception 'only the office can change %', k using errcode = '42501'; end if;
    end loop;
  end if;
  return new;
end $function$;

-- 2. merge a duplicate into the material that stays (catalog managers). The duplicate is hidden (kept, with
--    mergedInto); a counted garage quantity moves over in one transaction and is written to the stock history.
create or replace function public.catalog_merge(p_from text, p_into text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me jsonb := public.my_emp_data(); a jsonb; b jsonb; qa numeric; qb numeric; nowms bigint := (extract(epoch from now())*1000)::bigint; lid text;
        codes jsonb;
begin
  if not private.catalog_mgr(me) then raise exception 'only the people who manage the material list can merge materials' using errcode = '42501'; end if;
  if coalesce(p_from,'') = '' or coalesce(p_into,'') = '' or p_from = p_into then raise exception 'pick two different materials' using errcode = '22023'; end if;
  -- lock both in a fixed order
  perform 1 from public.records where coll = 'stock' and id in (p_from, p_into) order by id for update;
  select data into a from public.records where coll = 'stock' and id = p_from and not deleted;
  select data into b from public.records where coll = 'stock' and id = p_into and not deleted;
  if a is null or b is null then raise exception 'that material is not in the list' using errcode = '22023'; end if;
  if coalesce(a->>'mergedInto','') <> '' then return jsonb_build_object('ok', true, 'already', true); end if;
  if coalesce(b->>'mergedInto','') <> '' then raise exception 'merge into the material that stays' using errcode = '22023'; end if;
  qa := coalesce(public._num(a->>'qty'), 0); qb := coalesce(public._num(b->>'qty'), 0);
  codes := case when jsonb_typeof(a->'codes') = 'array' or jsonb_typeof(b->'codes') = 'array' then
             (select coalesce(jsonb_agg(distinct c), '[]'::jsonb) from (
                select jsonb_array_elements(case when jsonb_typeof(b->'codes') = 'array' then b->'codes' else '[]'::jsonb end) c
                union all select jsonb_array_elements(case when jsonb_typeof(a->'codes') = 'array' then a->'codes' else '[]'::jsonb end)) q) end;
  perform set_config('app.stock_txn', '1', true);
  update public.records set data = data || jsonb_build_object('qty', qb + qa, 'qv', coalesce(public._num(data->>'qv')::bigint, 0) + 1,
           'aka', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
                     select jsonb_array_elements_text(case when jsonb_typeof(b->'aka') = 'array' then b->'aka' else '[]'::jsonb end) x
                     union select jsonb_array_elements_text(case when jsonb_typeof(a->'aka') = 'array' then a->'aka' else '[]'::jsonb end)
                     union select a->>'name') q where coalesce(x,'') <> ''),
           'crev', coalesce(public._num(b->>'crev')::int, 0) + 1, 'cedBy', me->>'id', 'cedAt', nowms)
           || case when codes is not null then jsonb_build_object('codes', codes) else '{}'::jsonb end
           || case when coalesce((b->>'fav')::boolean, false) or coalesce((a->>'fav')::boolean, false) then jsonb_build_object('fav', true) else '{}'::jsonb end,
         updated_by = me->>'id', updated_at = now()
   where coll = 'stock' and id = p_into;
  update public.records set data = data || jsonb_build_object('qty', 0, 'qv', coalesce(public._num(data->>'qv')::bigint, 0) + 1, 'hidden', true,
           'mergedInto', p_into, 'crev', coalesce(public._num(a->>'crev')::int, 0) + 1, 'cedBy', me->>'id', 'cedAt', nowms),
         updated_by = me->>'id', updated_at = now()
   where coll = 'stock' and id = p_from;
  if qa <> 0 then
    lid := 'merge_' || p_from || '_' || nowms;
    insert into public.records(coll, id, data, deleted, updated_by, updated_at)
    values ('stockLog', lid, jsonb_build_object('kind', 'set', 'by', me->>'id', 'approvedBy', me->>'id', 'ts', nowms, 'serverTs', nowms,
            'seq', nextval('public.stock_seq'), 'applied', true, 'auth', true, 'reason', 'Merged duplicate: ' || coalesce(a->>'name', p_from) || ' → ' || coalesce(b->>'name', p_into),
            'items', jsonb_build_array(
               jsonb_build_object('id', p_from, 'name', a->>'name', 'before', qa, 'after', 0, 'change', -qa),
               jsonb_build_object('id', p_into, 'name', b->>'name', 'before', qb, 'after', qb + qa, 'change', qa))), false, me->>'id', now())
    on conflict (coll, id) do nothing;
  end if;
  perform set_config('app.stock_txn', '', true);
  return jsonb_build_object('ok', true, 'moved', qa, 'qty', qb + qa);
end $function$;
revoke all on function public.catalog_merge(text, text) from public, anon;
grant execute on function public.catalog_merge(text, text) to authenticated;

-- 3. material requests
-- who prepares: the owner, managers, 'all' office, the Material office, or the person the list is sent to
create or replace function private.mat_preparer(d jsonb, me jsonb)
 returns boolean language sql stable set search_path to 'public' as $function$
  select coalesce(coalesce(me->>'id','') <> '' and (me->>'role' in ('owner','manager') or coalesce((me->>'all')::boolean,false)
     or (me->>'role' = 'office' and me->>'title' = 'Material') or coalesce(d->>'to','') = me->>'id'), false);
$function$;
revoke all on function private.mat_preparer(jsonb, jsonb) from public, anon;
grant execute on function private.mat_preparer(jsonb, jsonb) to authenticated, service_role;

-- one item: prepared quantity / done / recheck / picked-up rules
create or replace function private.mat_item_fix(ov jsonb, nv jsonb, prep boolean, pick boolean, actor text, nowms bigint)
 returns jsonb language plpgsql immutable as $function$
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
  wasprep := ov is not null and (coalesce(public._num(ov->>'pq'),0) > 0 or coalesce((ov->>'done')::boolean,false));
  -- done only when the full quantity is prepared
  qn := public._num(fin->>'q');
  if qn is not null and qn > 0 then
    pq := public._num(fin->>'pq');
    if prep and fin->'pq' is not distinct from ov->'pq' then
      if coalesce((fin->>'done')::boolean,false) and not coalesce((ov->>'done')::boolean,false) then pq := qn;          -- ticked: all of it
      elsif not coalesce((fin->>'done')::boolean,false) and coalesce((ov->>'done')::boolean,false) then pq := 0; end if; -- unticked
    end if;
    if pq is not null then
      pq := greatest(0, pq);
      fin := fin || jsonb_build_object('pq', pq, 'done', pq >= qn);
    elsif ov is null or not prep then
      fin := fin || jsonb_build_object('done', coalesce((fin->>'done')::boolean,false) and coalesce(public._num(fin->>'pq'),0) >= qn);
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

-- the request status, from the items (and the manual status the preparer picked)
create or replace function private.mat_status(n jsonb)
 returns text language plpgsql immutable as $function$
declare tot int := 0; dn int := 0; anyprep boolean := false; allpk boolean := true; anypk boolean := false; v jsonb; qn numeric; pk numeric; stm text := coalesce(n->>'stm','');
begin
  for v in select value from jsonb_each(n) e where e.key like 'li\_%' and position('~' in e.key) = 0 loop
    if jsonb_typeof(v) <> 'object' or coalesce((v->>'gone')::boolean,false) then continue; end if;
    tot := tot + 1;
    if coalesce((v->>'done')::boolean,false) then dn := dn + 1; end if;
    if coalesce(public._num(v->>'pq'),0) > 0 or coalesce((v->>'done')::boolean,false) then anyprep := true; end if;
    qn := public._num(v->>'q'); pk := coalesce(public._num(v->>'pk'), 0);
    if pk > 0 then anypk := true; end if;
    if pk <= 0 or (qn is not null and pk < qn) then allpk := false; end if;
  end loop;
  return case when stm = 'completed' then 'completed'
              when tot > 0 and allpk then 'completed'
              when anypk then 'partpicked'
              when tot > 0 and dn = tot then 'ready'
              when anyprep then 'partial'
              when stm in ('requested','reviewing','ordered','preparing') then stm
              else 'requested' end;
end $function$;

-- 4. the list guard (L2) with the material rules
create or replace function public.guard_lists()
 returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb; actor text; o jsonb; n jsonb; k text; ov jsonb; nv jsonb; orev int; base int; nowms bigint := (extract(epoch from now())*1000)::bigint;
        editor boolean; srv boolean; ck text; a jsonb; touched boolean := false; fld text; mats boolean := new.coll = 'mats'; prep boolean; pick boolean;
        st text; d0 jsonb;
begin
  if jsonb_typeof(new.data) <> 'object' or new.deleted then return new; end if;
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data else '{}'::jsonb end;
  n := new.data;
  srv := not (current_user in ('authenticated','anon') and auth.uid() is not null);
  me := case when srv then '{}'::jsonb else public.my_emp_data() end;
  actor := coalesce(me->>'id', 'server');
  pick := srv or coalesce(current_setting('app.mat_pickup', true), '') = '1';
  -- nothing list-related in old or new → leave the record alone (punch lists); material requests always get their status
  if not mats and not exists (select 1 from jsonb_object_keys(n) x where x like 'li\_%' or x like 'lc\_%')
     and not exists (select 1 from jsonb_object_keys(o) x where x like 'li\_%' or x like 'lc\_%') then return new; end if;
  d0 := case when o = '{}'::jsonb then n else o end;
  editor := srv or pick or private.list_editor(new.coll, d0, me);
  prep := mats and (srv or private.mat_preparer(d0, me));
  -- a) an item or comment is never deleted (removing is done by marking it gone)
  for k in select x from jsonb_object_keys(o) x where (x like 'li\_%' or x like 'lc\_%' or (mats and x like 'pu\_%')) and not (n ? x) loop
    n := n || jsonb_build_object(k, o->k);
  end loop;
  -- pickups (pu_<txn>) are written only by mat_pickup()
  if mats and not pick then
    for k in select x from jsonb_object_keys(n) x where x like 'pu\_%' loop
      if n->k is distinct from o->k then if o ? k then n := n || jsonb_build_object(k, o->k); else n := n - k; end if; end if;
    end loop;
  end if;
  -- b) each changed item
  for k in select x from jsonb_object_keys(n) x where x like 'li\_%' or x like 'lc\_%' loop
    ov := o->k; nv := n->k;
    if nv is not distinct from ov then continue; end if;
    touched := true;
    if jsonb_typeof(nv) <> 'object' then
      if ov is null then n := n - k; else n := n || jsonb_build_object(k, ov); end if; continue; end if;
    if k like 'lc\_%' then                                   -- comments: added once, never rewritten
      if ov is not null then n := n || jsonb_build_object(k, ov);
      elsif not (editor or (new.coll = 'keep' and jsonb_typeof(o->'assign') = 'array' and o->'assign' ? (me->>'id'))) then
        raise exception 'only the people on this list can comment' using errcode = '42501';
      else n := n || jsonb_build_object(k, (nv - 'by') || jsonb_build_object('by', actor, 'ts', coalesce(public._num(nv->>'ts')::bigint, nowms))); end if;
      continue; end if;
    if position('~' in k) > 0 then                           -- a kept copy: only the server makes them; editors may dismiss
      if ov is null then n := n - k; elsif editor then n := n || jsonb_build_object(k, ov || jsonb_build_object('gone', coalesce(nv->'gone','false'::jsonb))); else n := n || jsonb_build_object(k, ov); end if;
      continue; end if;
    if ov is null then                                       -- new item
      if not editor then raise exception 'only the people on this list can add to it' using errcode = '42501'; end if;
      nv := (nv - 'base') || jsonb_build_object('rev', 1, 'by', actor, 'ts', coalesce(public._num(nv->>'ts')::bigint, nowms), 'eby', actor, 'eat', nowms);
      if mats then nv := private.mat_item_fix(null, nv, prep, pick, actor, nowms); end if;
      n := n || jsonb_build_object(k, nv);
      continue; end if;
    orev := coalesce(public._num(ov->>'rev')::int, 0);
    base := public._num(nv->>'base')::int;
    if base is null and coalesce(public._num(nv->>'rev')::int, 0) <= orev and not pick then   -- an older copy sent again: keep the newer one
      n := n || jsonb_build_object(k, ov); continue; end if;
    -- permission: editors change anything; an assignee only ticks off their own item
    if not editor then
      if not (ov->>'to' = me->>'id' and (nv - 'done' - 'doneBy' - 'doneAt' - 'rev' - 'base' - 'eby' - 'eat') = (ov - 'done' - 'doneBy' - 'doneAt' - 'rev' - 'base' - 'eby' - 'eat')) then
        raise exception 'only the people on this list can change this item' using errcode = '42501'; end if;
    end if;
    if base is not null and base < orev then                 -- changed on another phone since this phone saw it: keep both
      ck := k || '~' || actor || '~' || base;
      n := n || jsonb_build_object(k, ov) || jsonb_build_object(ck, (nv - 'base') || jsonb_build_object('conflict', true, 'of', k, 'eby', actor, 'eat', nowms, 'rev', orev));
      continue; end if;
    nv := (nv - 'base' - 'by' - 'ts') || jsonb_build_object('rev', orev + 1, 'eby', actor, 'eat', nowms,
            'by', coalesce(ov->'by', to_jsonb(actor)), 'ts', coalesce(ov->'ts', to_jsonb(nowms)));
    if mats then nv := private.mat_item_fix(ov, nv, prep, pick, actor, nowms); end if;
    -- nothing left to change (e.g. a tick from someone who may not tick): keep the item as it was, same version
    if (nv - 'rev' - 'eby' - 'eat' - 'pqBy' - 'pqAt') = (ov - 'rev' - 'eby' - 'eat' - 'pqBy' - 'pqAt' - 'base') then n := n || jsonb_build_object(k, ov); continue; end if;
    n := n || jsonb_build_object(k, nv);
  end loop;
  -- c) mats: who it is sent to / who else is on it — editors only
  if mats and (n->'to' is distinct from o->'to' or n->'collab' is distinct from o->'collab') and o <> '{}'::jsonb and not editor then
    raise exception 'only the people on this list can send it on' using errcode = '42501'; end if;
  -- d) assignees (server-kept): everyone with an open item on the list
  select coalesce(jsonb_agg(distinct v->>'to'), '[]'::jsonb) into a from jsonb_each(n) e(kk, v)
   where kk like 'li\_%' and position('~' in kk) = 0 and jsonb_typeof(v) = 'object' and coalesce(v->>'to','') <> '' and not coalesce((v->>'gone')::boolean, false);
  if touched or (n->'assign') is distinct from a then n := n || jsonb_build_object('assign', a); end if;
  -- e) an assignee (not an editor) may not change anything else on the list
  if not editor and o <> '{}'::jsonb then
    for fld in select x from jsonb_object_keys(n || o) x where x not like 'li\_%' and x not like 'lc\_%' and x not in ('assign','edited','order') loop
      if n->fld is distinct from o->fld then raise exception 'only the people on this list can change it' using errcode = '42501'; end if;
    end loop;
  end if;
  -- f) material request status
  if mats then
    -- the status the preparer picks (requested / reviewing / ordered / preparing / completed); an older app sets 'status'
    if not prep then n := (n - 'stm') || case when o ? 'stm' then jsonb_build_object('stm', o->'stm') else '{}'::jsonb end;
    elsif n->'stm' is not distinct from o->'stm' and n->>'status' is distinct from o->>'status' and o <> '{}'::jsonb then
      n := n || jsonb_build_object('stm', case n->>'status' when 'delivered' then 'completed' when 'ordered' then 'ordered' else 'requested' end);
    end if;
    if coalesce(n->>'stm','') <> '' and n->>'stm' not in ('requested','reviewing','ordered','preparing','completed') then
      n := (n - 'stm') || case when o ? 'stm' then jsonb_build_object('stm', o->'stm') else '{}'::jsonb end; end if;
    st := private.mat_status(n);
    n := n || jsonb_build_object('st', st, 'status', case when st = 'completed' then 'delivered' when st in ('requested','reviewing') then 'open' else 'ordered' end);
    if st is distinct from o->>'st' then
      n := n || jsonb_build_object('stAt', nowms, 'stBy', actor);
      if st = 'ready' then n := n || jsonb_build_object('readyAt', nowms); end if;
    else
      n := (n - 'stAt' - 'stBy' - 'readyAt') || (select coalesce(jsonb_object_agg(x, o->x), '{}'::jsonb) from unnest(array['stAt','stBy','readyAt']) x where o ? x);
    end if;
    if not srv and o = '{}'::jsonb then n := n || jsonb_build_object('from', coalesce(nullif(n->>'from',''), actor)); end if;
  end if;
  new.data := n;
  return new;
end $function$;

-- 5. a pickup: the stock leaves the garage through apply_stock_txn (same checks, same history, never twice), and the
--    list records who took how much. p_lines = [{k: 'li_…', n: 2, g: true (take it out of the garage count)}]
create or replace function public.mat_pickup(p_id text, p_txn text, p_lines jsonb)
 returns jsonb language plpgsql set search_path to 'public' as $function$
declare me jsonb := public.my_emp_data(); d jsonb; ln jsonb; it jsonb; k text; qn numeric; moves jsonb := '[]'::jsonb; res jsonb := null;
        nowms bigint := (extract(epoch from now())*1000)::bigint; pkk text; upd jsonb := '{}'::jsonb; rec jsonb := '[]'::jsonb;
begin
  if coalesce(me->>'id','') = '' then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_txn,'') !~ '^[A-Za-z0-9_-]{6,80}$' then raise exception 'bad pickup id' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'nothing to pick up' using errcode = '22023'; end if;
  pkk := 'pu_' || p_txn;
  select data into d from public.records where coll = 'mats' and id = p_id and not deleted for update;
  if d is null then raise exception 'that material list is not there' using errcode = '22023'; end if;
  if not (private.list_editor('mats', d, me) or coalesce((me->>'lead')::boolean, false)) then
    raise exception 'only the people on this list can confirm a pickup' using errcode = '42501'; end if;
  if d ? pkk then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  for ln in select value from jsonb_array_elements(p_lines) loop
    k := ln->>'k'; it := d->k; qn := public._num(ln->>'n');
    if coalesce(k,'') !~ '^li_[^~]+$' or jsonb_typeof(it) <> 'object' or coalesce((it->>'gone')::boolean, false) then
      raise exception 'that item is not on the list' using errcode = '22023'; end if;
    if qn is null or qn <= 0 then raise exception 'how many were picked up?' using errcode = '22023'; end if;
    if coalesce((ln->>'g')::boolean, false) and coalesce(it->>'sid','') <> '' then
      moves := moves || jsonb_build_array(jsonb_build_object('id', it->>'sid', 'delta', -qn, 'name', it->>'t'));
    end if;
    upd := upd || jsonb_build_object(k, it || jsonb_build_object('pk', coalesce(public._num((upd->k)->>'pk'), public._num(it->>'pk'), 0) + qn,
                                                                 'rev', coalesce(public._num(it->>'rev')::int, 0) + 1, 'eby', me->>'id', 'eat', nowms));
    rec := rec || jsonb_build_array(jsonb_build_object('k', k, 'n', qn, 'g', coalesce((ln->>'g')::boolean, false) and coalesce(it->>'sid','') <> '', 'sid', it->>'sid', 't', it->>'t'));
  end loop;
  if jsonb_array_length(moves) > 0 then
    res := public.apply_stock_txn(jsonb_build_object('id', p_txn, 'kind', 'out', 'site', d->>'site', 'moves', moves, 'ts', nowms,
                                                     'reason', 'Material list pickup', 'src', 'mat:' || p_id));
  end if;
  perform set_config('app.mat_pickup', '1', true);
  update public.records set data = data || upd || jsonb_build_object(pkk, jsonb_build_object('by', me->>'id', 'ts', nowms, 'lines', rec)),
         updated_by = me->>'id', updated_at = now()
   where coll = 'mats' and id = p_id;
  perform set_config('app.mat_pickup', '', true);
  return jsonb_build_object('ok', true, 'duplicate', false, 'stock', res);
end $function$;
revoke all on function public.mat_pickup(text, text, jsonb) from public, anon;
grant execute on function public.mat_pickup(text, text, jsonb) to authenticated;

-- 6. notifications for material requests (and punch lists as before)
create or replace function public.notify_lists()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare me jsonb; actor text; aname text; o jsonb := '{}'::jsonb; n jsonb := new.data; k text; ov jsonb; nv jsonb; who text;
        en text[] := '{}'; es text[] := '{}'; it text; title text; ttl_es text; link jsonb; qk text; newto text[] := '{}'; i int;
        stl_en text; stl_es text; qn text; site text; nitems int;
begin
  if auth.uid() is null or new.deleted or jsonb_typeof(n) <> 'object' then return null; end if;
  if new.coll = 'keep' and coalesce(n->>'type','') <> 'punch' then return null; end if;
  if new.coll = 'mats' and tg_op = 'INSERT' then return null; end if;   -- a new request already tells the material office (app message)
  if tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then o := old.data; end if;
  begin
    me := public.my_emp_data(); actor := me->>'id'; aname := split_part(coalesce(nullif(private.emp_row(actor)->>'name', ''), 'Office'), ' ', 1);
    for k in select x from jsonb_object_keys(n) x where (x like 'li\_%' or x like 'lc\_%') order by x loop
      ov := o->k; nv := n->k;
      if nv is not distinct from ov or jsonb_typeof(nv) <> 'object' then continue; end if;
      qn := coalesce(nullif(nv->>'q',''), '');
      it := left(coalesce(case when qn <> '' then qn || coalesce(' ' || nullif(nv->>'u',''), '×') || ' ' else '' end || (nv->>'t'), nv->>'text', ''), 60);
      if k like 'lc\_%' then en := en || ('💬 ' || left(coalesce(nv->>'text',''), 60)); es := es || ('💬 ' || left(coalesce(nv->>'text',''), 60)); continue; end if;
      if position('~' in k) > 0 then
        if ov is null then en := en || ('⚠ ' || it || ' — changed on two phones at once, both kept'); es := es || ('⚠ ' || it || ' — cambiado en dos teléfonos a la vez, se guardaron ambos'); end if;
        continue; end if;
      if ov is null then
        en := en || ('+ ' || it || case when coalesce((nv->>'cu')::boolean,false) then ' (custom)' else '' end);
        es := es || ('+ ' || it || case when coalesce((nv->>'cu')::boolean,false) then ' (especial)' else '' end);
        if coalesce(nv->>'to','') <> '' then newto := newto || (nv->>'to'); end if;
        continue; end if;
      if coalesce((nv->>'gone')::boolean,false) and not coalesce((ov->>'gone')::boolean,false) then
        en := en || ('− ' || it || ' (removed)'); es := es || ('− ' || it || ' (quitado)'); continue; end if;
      if new.coll = 'mats' and coalesce(public._num(nv->>'pk'),0) > coalesce(public._num(ov->>'pk'),0) then
        en := en || ('📤 picked up ' || (coalesce(public._num(nv->>'pk'),0) - coalesce(public._num(ov->>'pk'),0))::text || ' of ' || it);
        es := es || ('📤 recogido ' || (coalesce(public._num(nv->>'pk'),0) - coalesce(public._num(ov->>'pk'),0))::text || ' de ' || it); continue; end if;
      if new.coll = 'mats' and coalesce((nv->>'rck')::boolean,false) and not coalesce((ov->>'rck')::boolean,false) then
        en := en || ('⚠ ' || it || ' — changed after it was prepared, please recheck');
        es := es || ('⚠ ' || it || ' — cambió después de prepararlo, revisar de nuevo'); continue; end if;
      if coalesce((nv->>'done')::boolean,false) and not coalesce((ov->>'done')::boolean,false) then
        en := en || ('✓ ' || it || case when new.coll = 'mats' then ' — ready' else '' end);
        es := es || ('✓ ' || it || case when new.coll = 'mats' then ' — listo' else '' end); continue; end if;
      if not coalesce((nv->>'done')::boolean,false) and coalesce((ov->>'done')::boolean,false) then
        en := en || ('↺ ' || it || case when new.coll = 'mats' then ' (not ready)' else ' (reopened)' end);
        es := es || ('↺ ' || it || case when new.coll = 'mats' then ' (no listo)' else ' (reabierto)' end); continue; end if;
      if new.coll = 'mats' and nv->'pq' is distinct from ov->'pq' and coalesce(public._num(nv->>'q'),0) > 0 then
        en := en || ('◐ ' || coalesce(public._num(nv->>'pq'),0)::text || ' of ' || it || ' ready');
        es := es || ('◐ ' || coalesce(public._num(nv->>'pq'),0)::text || ' de ' || it || ' listos'); continue; end if;
      if coalesce(nv->>'q','') is distinct from coalesce(ov->>'q','') then
        en := en || (coalesce(nv->>'t','') || ' (qty ' || coalesce(nullif(ov->>'q',''),'—') || ' → ' || coalesce(nullif(nv->>'q',''),'—') || ')');
        es := es || (coalesce(nv->>'t','') || ' (cant. ' || coalesce(nullif(ov->>'q',''),'—') || ' → ' || coalesce(nullif(nv->>'q',''),'—') || ')'); continue; end if;
      if coalesce(nv->>'to','') is distinct from coalesce(ov->>'to','') then
        en := en || ('👤 ' || it || ' → ' || coalesce(nullif(split_part(private.emp_row(nv->>'to')->>'name',' ',1),''),'nobody'));
        es := es || ('👤 ' || it || ' → ' || coalesce(nullif(split_part(private.emp_row(nv->>'to')->>'name',' ',1),''),'nadie'));
        if coalesce(nv->>'to','') <> '' then newto := newto || (nv->>'to'); end if; continue; end if;
      if coalesce(nv->>'t','') is distinct from coalesce(ov->>'t','') or coalesce(nv->>'desc','') is distinct from coalesce(ov->>'desc','')
         or coalesce(nv->>'u','') is distinct from coalesce(ov->>'u','') then en := en || ('✎ ' || it); es := es || ('✎ ' || it); end if;
    end loop;
    if new.coll = 'mats' and coalesce(n->>'to','') <> '' and n->>'to' is distinct from o->>'to' then
      en := en || ('📨 sent to ' || split_part(coalesce(private.emp_row(n->>'to')->>'name','?'),' ',1));
      es := es || ('📨 enviado a ' || split_part(coalesce(private.emp_row(n->>'to')->>'name','?'),' ',1));
    end if;
    if new.coll = 'mats' and coalesce(n->>'st','') is distinct from coalesce(o->>'st','') and o <> '{}'::jsonb
       and n->>'st' in ('reviewing','ordered','preparing','partpicked','completed') then
      stl_en := case n->>'st' when 'reviewing' then 'Reviewing' when 'ordered' then 'Ordered' when 'preparing' then 'Preparing'
                              when 'partpicked' then 'Partially picked up' else 'Completed' end;
      stl_es := case n->>'st' when 'reviewing' then 'En revisión' when 'ordered' then 'Pedido' when 'preparing' then 'Preparando'
                              when 'partpicked' then 'Recogido en parte' else 'Completado' end;
      en := en || ('Status: ' || stl_en); es := es || ('Estado: ' || stl_es);
    end if;
    if new.coll = 'keep' then
      title := '📋 ' || coalesce(nullif(n->>'title',''), 'Punch list'); ttl_es := '📋 ' || coalesce(nullif(n->>'title',''), 'Lista de pendientes');
      link := jsonb_build_object('keep', new.id);
    else
      site := nullif(coalesce(private.short_site(n->>'site'), ''), '');
      if site is null and coalesce(n->>'addr','') <> '' then site := left(n->>'addr', 40); end if;
      title := '📦 Materials' || coalesce(' · ' || site, ''); ttl_es := '📦 Materiales' || coalesce(' · ' || site, '');
      link := jsonb_build_object('mat', new.id);
      -- everything is prepared → tell whoever asked for it right away (once per time it becomes ready)
      if n->>'st' = 'ready' and coalesce(o->>'st','') <> 'ready' and o <> '{}'::jsonb then
        select count(*) into nitems from jsonb_each(n) e where e.key like 'li\_%' and position('~' in e.key) = 0 and jsonb_typeof(e.value) = 'object' and not coalesce((e.value->>'gone')::boolean,false);
        perform private.notify_now(n->>'from', '📦 Your material order is ready.' || coalesce(' — ' || site, '') || ' (' || nitems || ' items, prepared by ' || aname || ')',
                                   '📦 Tu pedido de material está listo.' || coalesce(' — ' || site, '') || ' (' || nitems || ' artículos, preparado por ' || aname || ')',
                                   'mat', link, actor);
      end if;
    end if;
    if coalesce(array_length(en, 1), 0) = 0 then return null; end if;
    qk := 'LIST:' || new.coll || ':' || new.id;
    for who in select p from private.list_people(new.coll, n) p union select unnest(newto) loop
      if who = coalesce(actor, '') then continue; end if;
      for i in 1 .. array_length(en, 1) loop
        insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
        values (who, qk, actor, aname || ': ' || en[i], aname || ': ' || es[i], null, null,
                link || jsonb_build_object('title', title, 'title_es', ttl_es));
      end loop;
    end loop;
  exception when others then
    raise warning 'notify_lists % %: %', new.coll, new.id, sqlerrm;
  end;
  return null;
end $function$;
revoke all on function public.notify_lists() from public, anon, authenticated, service_role;
grant execute on function public.notify_lists() to service_role;

-- 7. history for the people on a list: also the material office / bosses (unchanged), plus templates for managers
-- (records_history already keeps every version of stock, mats and mtpl)
