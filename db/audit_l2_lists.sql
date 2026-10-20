-- L2 (staging first): shared lists — punch lists made from notes (coll 'keep', type 'punch') and material lists that stay
-- editable after sending (coll 'mats'). Baruch 2026-10-20 18:52.
-- Items are stored one per top-level key so independent edits merge (save_records patch semantics, like jobs' m_ keys):
--   li_<id> = {t, q, to, done, doneBy, doneAt, ord, by, ts, rev, eby, eat, gone}     (one item)
--   lc_<id> = {by, ts, text}                                                         (one comment)
--   li_<id>~<who>~<base> = a copy kept when two phones changed the same item at once (conflict: true, of: li_<id>)
-- The server (guard_lists) makes sure nothing is lost: items/comments can't be deleted (only marked gone), an edit made
-- from an older version of an item is kept next to the newer one (flagged) instead of overwriting it, and who may edit is
-- checked. Every version is in records_history; list_history() shows it to the people on the list. notify_lists sends
-- the people on the list one message per burst of edits (via notify_queue + notify_flush), never to whoever made the change.

-- 1. visibility: a person who has items assigned on a punch list can see that list (keep stays private otherwise)
create or replace function public.can_see2(c text, d jsonb, me jsonb)
 returns boolean language sql stable set search_path to 'public' as $function$
  select case
    when c not in ('keep','inbox','push','meets','punches','timeoff','goHomeLog','travel','exps','emphr','stockLog','rejq',
                   'incidents','msgs','apps','invites','fixes') then true
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
                         or (jsonb_typeof(d->'assign') = 'array' and d->'assign' ? (me->>'id'))
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
$function$;

-- 2. who may change a list's items (editors) — keep: owner + collaborators; mats: who sent it, who it is sent to,
--    collaborators, the material office and the bosses. Assignees on a punch list may tick off their own items and comment.
create or replace function private.list_editor(c text, d jsonb, me jsonb)
 returns boolean language sql stable set search_path to 'public' as $function$
  select coalesce(me->>'id','') <> '' and (
    case when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
         when c = 'mats' then d->>'from' = me->>'id' or d->>'to' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
              or me->>'role' in ('owner','manager') or coalesce((me->>'all')::boolean,false)
              or (me->>'role' = 'office' and me->>'title' in ('Material','Payroll'))
         else false end);
$function$;

-- 3. the merge + permission guard (BEFORE INSERT/UPDATE on keep and mats; runs after guard_record)
create or replace function public.guard_lists()
 returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb; actor text; o jsonb; n jsonb; k text; ov jsonb; nv jsonb; orev int; base int; nowms bigint := (extract(epoch from now())*1000)::bigint;
        editor boolean; srv boolean; ck text; a jsonb; touched boolean := false; fld text;
begin
  if jsonb_typeof(new.data) <> 'object' or new.deleted then return new; end if;
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data else '{}'::jsonb end;
  n := new.data;
  srv := not (current_user in ('authenticated','anon') and auth.uid() is not null);
  me := case when srv then '{}'::jsonb else public.my_emp_data() end;
  actor := coalesce(me->>'id', 'server');
  -- nothing list-related in old or new → leave the record alone
  if not exists (select 1 from jsonb_object_keys(n) x where x like 'li\_%' or x like 'lc\_%')
     and not exists (select 1 from jsonb_object_keys(o) x where x like 'li\_%' or x like 'lc\_%')
     and not (new.coll = 'mats' and (n->'to' is distinct from o->'to' or n->'collab' is distinct from o->'collab')) then return new; end if;
  editor := srv or private.list_editor(new.coll, case when o = '{}'::jsonb then n else o end, me);
  -- a) an item or comment is never deleted (removing is done by marking it gone)
  for k in select x from jsonb_object_keys(o) x where (x like 'li\_%' or x like 'lc\_%') and not (n ? x) loop
    n := n || jsonb_build_object(k, o->k);
  end loop;
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
      n := n || jsonb_build_object(k, (nv - 'base') || jsonb_build_object('rev', 1, 'by', actor, 'ts', coalesce(public._num(nv->>'ts')::bigint, nowms), 'eby', actor, 'eat', nowms));
      continue; end if;
    orev := coalesce(public._num(ov->>'rev')::int, 0);
    base := public._num(nv->>'base')::int;
    if base is null and coalesce(public._num(nv->>'rev')::int, 0) <= orev then   -- an older copy sent again: keep the newer one
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
    n := n || jsonb_build_object(k, (nv - 'base' - 'by' - 'ts') || jsonb_build_object('rev', orev + 1, 'eby', actor, 'eat', nowms,
            'by', coalesce(ov->'by', to_jsonb(actor)), 'ts', coalesce(ov->'ts', to_jsonb(nowms))));
  end loop;
  -- c) mats: who it is sent to / who else is on it — editors only
  if new.coll = 'mats' and (n->'to' is distinct from o->'to' or n->'collab' is distinct from o->'collab') and o <> '{}'::jsonb and not editor then
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
  new.data := n;
  return new;
end $function$;
revoke all on function public.guard_lists() from public, anon, authenticated, service_role;
grant execute on function public.guard_lists() to authenticated, service_role;
create or replace trigger records_guard_lists before insert or update on public.records for each row
  when (new.coll = any (array['keep'::text, 'mats'::text])) execute function public.guard_lists();

-- 4. notifications: what changed, to everyone on the list except whoever made the change (batched per list)
create or replace function private.list_people(c text, d jsonb)
 returns setof text language sql stable set search_path to 'public' as $function$
  select distinct x from (
    select d->>'owner' x where c = 'keep'
    union all select d->>'from' where c = 'mats'
    union all select d->>'to' where c = 'mats'
    union all select jsonb_array_elements_text(case when jsonb_typeof(d->'collab') = 'array' then d->'collab' else '[]'::jsonb end)
    union all select jsonb_array_elements_text(case when jsonb_typeof(d->'assign') = 'array' then d->'assign' else '[]'::jsonb end)
    -- a material list not sent to anyone yet goes to the material office
    union all select e.id from public.records e where c = 'mats' and coalesce(d->>'to','') = '' and e.coll = 'emps' and not e.deleted
                and e.data->>'role' = 'office' and e.data->>'title' = 'Material' and not coalesce((e.data->>'inactive')::boolean, false)
  ) q where coalesce(x, '') <> '';
$function$;

create or replace function public.notify_lists()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare me jsonb; actor text; aname text; o jsonb := '{}'::jsonb; n jsonb := new.data; k text; ov jsonb; nv jsonb; who text;
        en text[] := '{}'; es text[] := '{}'; it text; title text; ttl_es text; link jsonb; qk text; newto text[] := '{}'; i int;
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
      it := left(coalesce(case when coalesce(nv->>'q','') <> '' then (nv->>'q') || '× ' else '' end || (nv->>'t'), nv->>'text', ''), 50);
      if k like 'lc\_%' then en := en || ('💬 ' || left(coalesce(nv->>'text',''), 60)); es := es || ('💬 ' || left(coalesce(nv->>'text',''), 60)); continue; end if;
      if position('~' in k) > 0 then
        if ov is null then en := en || ('⚠ ' || it || ' — changed on two phones at once, both kept'); es := es || ('⚠ ' || it || ' — cambiado en dos teléfonos a la vez, se guardaron ambos'); end if;
        continue; end if;
      if ov is null then
        en := en || ('+ ' || it); es := es || ('+ ' || it);
        if coalesce(nv->>'to','') <> '' then newto := newto || (nv->>'to'); end if;
        continue; end if;
      if coalesce((nv->>'gone')::boolean,false) and not coalesce((ov->>'gone')::boolean,false) then
        en := en || ('− ' || it || ' (removed)'); es := es || ('− ' || it || ' (quitado)'); continue; end if;
      if coalesce((nv->>'done')::boolean,false) and not coalesce((ov->>'done')::boolean,false) then
        en := en || ('✓ ' || it); es := es || ('✓ ' || it); continue; end if;
      if not coalesce((nv->>'done')::boolean,false) and coalesce((ov->>'done')::boolean,false) then
        en := en || ('↺ ' || it || ' (reopened)'); es := es || ('↺ ' || it || ' (reabierto)'); continue; end if;
      if coalesce(nv->>'q','') is distinct from coalesce(ov->>'q','') then
        en := en || (it || ' (qty ' || coalesce(nullif(ov->>'q',''),'—') || ' → ' || coalesce(nullif(nv->>'q',''),'—') || ')');
        es := es || (it || ' (cant. ' || coalesce(nullif(ov->>'q',''),'—') || ' → ' || coalesce(nullif(nv->>'q',''),'—') || ')'); continue; end if;
      if coalesce(nv->>'to','') is distinct from coalesce(ov->>'to','') then
        en := en || ('👤 ' || it || ' → ' || coalesce(nullif(split_part(private.emp_row(nv->>'to')->>'name',' ',1),''),'nobody'));
        es := es || ('👤 ' || it || ' → ' || coalesce(nullif(split_part(private.emp_row(nv->>'to')->>'name',' ',1),''),'nadie'));
        if coalesce(nv->>'to','') <> '' then newto := newto || (nv->>'to'); end if; continue; end if;
      if coalesce(nv->>'t','') is distinct from coalesce(ov->>'t','') then en := en || ('✎ ' || it); es := es || ('✎ ' || it); end if;
    end loop;
    if new.coll = 'mats' and coalesce(n->>'to','') <> '' and n->>'to' is distinct from o->>'to' then
      en := en || ('📨 sent to ' || split_part(coalesce(private.emp_row(n->>'to')->>'name','?'),' ',1));
      es := es || ('📨 enviado a ' || split_part(coalesce(private.emp_row(n->>'to')->>'name','?'),' ',1));
    end if;
    if coalesce(array_length(en, 1), 0) = 0 then return null; end if;
    if new.coll = 'keep' then
      title := '📋 ' || coalesce(nullif(n->>'title',''), 'Punch list'); ttl_es := '📋 ' || coalesce(nullif(n->>'title',''), 'Lista de pendientes');
      link := jsonb_build_object('keep', new.id);
    else
      title := '📦 Materials' || coalesce(' · ' || nullif(private.short_site(n->>'site'),''), ''); ttl_es := '📦 Materiales' || coalesce(' · ' || nullif(private.short_site(n->>'site'),''), '');
      link := jsonb_build_object('mat', new.id);
    end if;
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
create or replace trigger records_zz_notify_lists after insert or update on public.records for each row
  when (new.coll = any (array['keep'::text, 'mats'::text])) execute function public.notify_lists();

-- 5. one message per list per burst (40 s quiet), e.g. "📦 Materials · 12 Oak: Baruch: + 10× 3-way switches · Baruch: 25× outlets (qty 20 → 25)"
create or replace function private.list_flush()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int := 0; parts_en text; parts_es text; cnt int; ids bigint[]; lk jsonb;
begin
  for r in select to_id, qkey from private.notify_queue where sent is null and qkey like 'LIST:%' group by to_id, qkey having max(created) < now() - interval '40 seconds' loop
    -- the same change twice in one burst is said once; oldest first
    select count(*), string_agg(q.en, ' · ' order by q.fid), string_agg(q.es, ' · ' order by q.fid) into cnt, parts_en, parts_es
      from (select en, min(es) es, min(id) fid from private.notify_queue where sent is null and to_id = r.to_id and qkey = r.qkey group by en) q;
    select array_agg(id order by id), (array_agg(link order by id desc))[1] into ids, lk
      from private.notify_queue where sent is null and to_id = r.to_id and qkey = r.qkey;
    perform private.notify_now(r.to_id, left(coalesce(lk->>'title','📋') || ': ' || parts_en, 400), left(coalesce(lk->>'title_es','📋') || ': ' || parts_es, 400),
                               'info', lk - 'title' - 'title_es', null);
    update private.notify_queue set sent = now() where id = any(ids);
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke all on function private.list_flush() from public, anon, authenticated, service_role;

-- notify_flush (every minute): schedule messages as before (list rows, qkey 'LIST:…', are left to list_flush — note a
-- schedule 'move one person' row starts with 'L:', so the list prefix must differ), then the list messages
create or replace function public.notify_flush()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int := 0; parts_en text; parts_es text; cnt int; ids bigint[];
begin
  for r in
    select to_id from private.notify_queue where sent is null and qkey not like 'LIST:%' group by to_id having max(created) < now() - interval '40 seconds'
  loop
    with q as (select * from private.notify_queue where sent is null and to_id = r.to_id and qkey not like 'LIST:%'),
         firsts as (select distinct on (qkey) qkey, sig_before from q order by qkey, created, id),
         lasts as (select distinct on (qkey) qkey, en, es, sig_after, created from q order by qkey, created desc, id desc),
         chg as (select l.* from lasts l join firsts f using (qkey) where coalesce(f.sig_before, '') is distinct from coalesce(l.sig_after, ''))
    select count(*), string_agg(en, ' · ' order by qkey), string_agg(es, ' · ' order by qkey), (select array_agg(id) from q)
      into cnt, parts_en, parts_es, ids from chg;
    if ids is null then select array_agg(id) into ids from private.notify_queue where sent is null and to_id = r.to_id and qkey not like 'LIST:%'; end if;
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
  return n + private.list_flush();
end $function$;
revoke all on function public.notify_flush() from public, anon, authenticated, service_role;
grant execute on function public.notify_flush() to service_role;

-- 6. earlier versions of a list, for the people on it (owner, collaborators, assignees; for materials also the office
--    and bosses). Newest first, at most 300 versions.
create or replace function public.list_history(p_coll text, p_id text)
 returns table(at timestamptz, by_who text, op text, old_data jsonb, new_data jsonb)
 language plpgsql stable security definer set search_path to 'public' as $function$
declare me jsonb := public.my_emp_data(); d jsonb;
begin
  if p_coll not in ('keep','mats') or me = '{}'::jsonb then return; end if;
  select r.data into d from public.records r where r.coll = p_coll and r.id = p_id;
  if d is null then return; end if;
  if not (private.list_editor(p_coll, d, me) or (p_coll = 'keep' and public.can_see2('keep', d, me))) then return; end if;
  return query select h.at, h.by_who, h.op, h.old_data, h.new_data from public.records_history h
                where h.coll = p_coll and h.id = p_id order by h.at desc, h.hid desc limit 300;
end $function$;
revoke all on function public.list_history(text, text) from public, anon;
grant execute on function public.list_history(text, text) to authenticated;
revoke all on function private.list_editor(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.list_editor(text, jsonb, jsonb) to authenticated;
revoke all on function private.list_people(text, jsonb) from public, anon, authenticated;
