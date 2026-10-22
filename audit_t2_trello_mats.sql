-- T2 (staging first): Menachem's Trello works the way he works (Baruch 2026-10-21 15:51)
--   His real cards are on the board "job Name's" (one list per job). Other boards (Daily Delivery check, orders,
--   billing, My to do) hold MIRRORS of those cards (a card whose name is the link of the real card).
--   1) every new material request becomes a card on job Name's, in that job's list (a new list is made for a job
--      that has none); the card follows the request while it is open and is ticked when the request is completed.
--   2) the owner (or the person himself, for his own tasks) can send an app task to job Name's the same way.
--   3) a card can be moved to any list on any of his boards from the app (a day mirror Monday → Tuesday, a card to
--      another job, to orders …); it moves in Trello too.
-- Config: server_config 'mat_trello' = {"emp":"o2","board":"<job Name's id>","boardName":"job Name's"}.
-- Cards are created through the existing ptask/push path (trello-personal function, every 5 minutes or "Sync now").
-- Nothing here reads or returns an access code. Nothing is deleted.

-- 0) job ↔ Trello list: "6 Hadassah Lane Spring Valley NY" and "6 Hadassah Ln, Spring Valley, NY 10977" are the same job
create or replace function private.pt_key(s text)
 returns text language sql immutable as $function$
  select case when k ~ '^[0-9][0-9a-z-]*\s+[a-z]' then substring(k from '^([0-9][0-9a-z-]*\s+[a-z]+)') else k end
    from (select btrim(regexp_replace(regexp_replace(lower(split_part(coalesce(s,''), ',', 1)), '[^a-z0-9 -]', ' ', 'g'), '\s+', ' ', 'g')) as k) x
$function$;

create or replace function private.pt_job_list(emp text, board text, site_name text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare meta jsonb; l jsonb; k text := private.pt_key(site_name); f text := lower(btrim(split_part(coalesce(site_name,''), ',', 1)));
begin
  if coalesce(k,'') = '' then return null; end if;
  select data into meta from public.records where coll = 'ptask' and id = 'ptmeta_' || emp and not deleted;
  -- the same first part ("6 Hadassah Ln") first, then the same house number + street word
  select ll into l from jsonb_array_elements(coalesce(meta->'boards','[]'::jsonb)) bb, jsonb_array_elements(coalesce(bb->'lists','[]'::jsonb)) ll
   where bb->>'id' = board and lower(btrim(split_part(ll->>'name', ',', 1))) = f limit 1;
  if l is null then
    select ll into l from jsonb_array_elements(coalesce(meta->'boards','[]'::jsonb)) bb, jsonb_array_elements(coalesce(bb->'lists','[]'::jsonb)) ll
     where bb->>'id' = board and private.pt_key(ll->>'name') = k limit 1;
  end if;
  return l;
end $function$;
revoke all on function private.pt_job_list(text, text, text) from public, anon, authenticated;

-- 1) material request → card
create or replace function private.mat_card_text(d jsonb, rid text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare lines text; who text; src text; ttl text; body text;
begin
  select string_agg('• ' || case when coalesce(btrim(v->>'q'),'') <> ''
                                 then btrim(v->>'q') || coalesce(' ' || nullif(btrim(v->>'u'),''),'') || ' — ' else '' end
                         || coalesce(v->>'t',''),
                    E'\n' order by coalesce(public._num(v->>'ord'), 0), e.key)
    into lines
    from jsonb_each(d) e(key, v)
   where e.key like 'li\_%' and position('~' in e.key) = 0 and jsonb_typeof(v) = 'object'
     and not coalesce((v->>'gone')::boolean, false) and coalesce(btrim(v->>'t'),'') <> '';
  if lines is null and coalesce(btrim(d->>'items'),'') <> '' then
    select string_agg('• ' || btrim(x), E'\n') into lines from regexp_split_to_table(d->>'items', E'\n') x where btrim(x) <> '';
  end if;
  select r.data->>'name' into who from public.records r where r.coll = 'emps' and r.id = d->>'from' and not r.deleted;
  src := case d->>'src' when 'deliver' then 'Store — deliver to the job' when 'pickup' then 'Store — pick up at the store'
                         when 'garage' then 'From the garage' else coalesce(d->>'src','') end;
  ttl := '🧰 Material — ' || coalesce(split_part(who,' ',1), '?') || case when coalesce(d->>'when','') <> '' then ' — ' || (d->>'when') else '' end;
  body := concat_ws(E'\n',
            case when src <> '' then 'Where from: ' || src end,
            case when coalesce(d->>'when','') <> '' then 'Needed: ' || (d->>'when') end,
            'Requested by: ' || coalesce(who, '?'),
            '', coalesce(lines, '(no items yet)'), '',
            '(Electrix material request ' || rid || ')');
  return jsonb_build_object('t', left(ttl, 500), 'desc', left(body, 4000));
end $function$;
revoke all on function private.mat_card_text(jsonb, text) from public, anon, authenticated;

create or replace function private.mat_to_trello()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare cfg jsonb; emp text; pid text; ex jsonb; txt jsonb; sig text; fin boolean; nowms bigint := (extract(epoch from now())*1000)::bigint;
        site text; l jsonb;
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
    insert into public.records (coll, id, data, deleted)
    values ('ptask', pid, jsonb_build_object('id', pid, 'owner', emp, 't', txt->>'t', 'desc', txt->>'desc',
              'board', cfg->'board', 'boardName', cfg->'boardName', 'list', coalesce(l->'id', '""'::jsonb), 'listName', coalesce(l->'name', to_jsonb(site)),
              'due', null, 'done', false, 'push', true, 'mat', new.id, 'matSig', sig, 'created', nowms, 'eat', nowms, 'eby', 'electrix')
            || case when l is null then jsonb_build_object('newList', left(site, 200)) else '{}'::jsonb end, false)
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
revoke all on function private.mat_to_trello() from public, anon, authenticated;

create or replace trigger records_zzz_mat_trello after insert or update on public.records for each row
  when (new.coll = 'mats'::text) execute function private.mat_to_trello();

-- 2) send an app task to someone's Trello (p_list '' = that job's list on job Name's, made if missing)
drop function if exists public.task_to_trello(text, text, text);
create or replace function public.task_to_trello(p_job text, p_emp text, p_list text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me jsonb := public.my_emp_data(); j jsonb; meta jsonb; b jsonb; l jsonb; pid text; ex jsonb; site text; who text; cfg jsonb;
        ttl text; body text; nowms bigint := (extract(epoch from now())*1000)::bigint; newl text;
begin
  if coalesce(me->>'id','') = '' then raise exception 'sign in first' using errcode = '42501'; end if;
  select data into j from public.records where coll = 'jobs' and id = p_job and not deleted;
  if j is null then raise exception 'that task is not there any more' using errcode = '22023'; end if;
  if not (me->>'role' = 'owner' or (me->>'id' = p_emp and (coalesce(j->'to','[]'::jsonb) ? p_emp or j->>'from' = p_emp))) then
    raise exception 'only the owner can send someone''s task to Trello (or the person, for his own tasks)' using errcode = '42501'; end if;
  if not exists (select 1 from public.server_config where k = 'trello_user_token:' || p_emp) then
    raise exception 'that person''s Trello is not connected' using errcode = '22023'; end if;
  begin select v::jsonb into cfg from public.server_config where k = 'mat_trello'; exception when others then cfg := null; end;
  select r.data->>'name' into site from public.records r where r.coll = 'sites' and r.id = j->>'site' and not r.deleted;
  select data into meta from public.records where coll = 'ptask' and id = 'ptmeta_' || p_emp and not deleted;
  if coalesce(p_list,'') <> '' then
    select x.b, x.l into b, l from (select bb as b, ll as l from jsonb_array_elements(coalesce(meta->'boards','[]'::jsonb)) bb,
                                     jsonb_array_elements(coalesce(bb->'lists','[]'::jsonb)) ll where ll->>'id' = p_list) x limit 1;
    if l is null then raise exception 'pick one of the Trello lists' using errcode = '22023'; end if;
  else
    if cfg is null or cfg->>'emp' is distinct from p_emp or coalesce(cfg->>'board','') = '' then
      raise exception 'pick a Trello list' using errcode = '22023'; end if;
    if site is null then raise exception 'this task has no job — pick a Trello list' using errcode = '22023'; end if;
    select bb into b from jsonb_array_elements(coalesce(meta->'boards','[]'::jsonb)) bb where bb->>'id' = cfg->>'board';
    b := coalesce(b, jsonb_build_object('id', cfg->>'board', 'name', cfg->>'boardName'));
    l := private.pt_job_list(p_emp, cfg->>'board', site);
    if l is null then newl := left(site, 200); l := jsonb_build_object('id', '', 'name', newl); end if;
  end if;
  pid := 'pt_' || p_emp || '_job_' || p_job;
  select data into ex from public.records where coll = 'ptask' and id = pid and not deleted;
  if ex is not null and not coalesce((ex->>'gone')::boolean, false) then
    return jsonb_build_object('ok', true, 'already', true, 'id', pid); end if;
  select r.data->>'name' into who from public.records r where r.coll = 'emps' and r.id = j->>'from' and not r.deleted;
  ttl := coalesce(nullif(btrim(split_part(coalesce(j->>'desc',''), E'\n', 1)), ''), 'Task');
  body := concat_ws(E'\n', coalesce(j->>'desc',''), '',
            case when site is not null then 'Job: ' || site end,
            case when who is not null then 'From: ' || who end,
            case when coalesce(j->>'due','') <> '' then 'Due: ' || (j->>'due') end,
            '(Electrix task ' || p_job || ')');
  insert into public.records (coll, id, data, deleted)
  values ('ptask', pid, jsonb_build_object('id', pid, 'owner', p_emp, 't', left(ttl, 500), 'desc', left(body, 4000),
            'board', b->'id', 'boardName', b->'name', 'list', l->'id', 'listName', l->'name', 'due', null, 'done', false,
            'push', true, 'job', p_job, 'created', nowms, 'eat', nowms, 'eby', me->>'id')
          || case when newl is not null then jsonb_build_object('newList', newl) else '{}'::jsonb end, false)
  on conflict (coll, id) do update set data = excluded.data, deleted = false;
  update public.records set data = data || jsonb_build_object('trello', jsonb_build_object('emp', p_emp, 'at', nowms, 'by', me->>'id', 'pt', pid, 'list', l->>'name', 'board', b->>'name'))
   where coll = 'jobs' and id = p_job;
  return jsonb_build_object('ok', true, 'id', pid, 'list', l->>'name', 'newList', newl is not null);
end $function$;
revoke all on function public.task_to_trello(text, text, text) from public, anon;
grant execute on function public.task_to_trello(text, text, text) to authenticated;

-- 3) personal task guard (T1) + a card may be moved to any list on the owner's boards (mv:true → the sync moves it)
create or replace function public.guard_ptask()
 returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb; o jsonb; n jsonb := new.data; nowms bigint := (extract(epoch from now())*1000)::bigint; ch boolean; mv boolean; tb jsonb; tl jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  if jsonb_typeof(n) <> 'object' then raise exception 'not allowed' using errcode = '42501'; end if;
  me := public.my_emp_data();
  if coalesce(me->>'id','') = '' then raise exception 'not allowed' using errcode = '42501'; end if;
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data end;
  if new.deleted then raise exception 'a Trello task is finished or archived, not deleted' using errcode = '42501'; end if;
  if o is null then
    if n->>'owner' is distinct from me->>'id' then raise exception 'not allowed' using errcode = '42501'; end if;
    if coalesce(n->>'list','') = '' or coalesce(btrim(n->>'t'),'') = '' then raise exception 'pick a Trello list and type the task' using errcode = '22023'; end if;
    new.data := jsonb_build_object('id', new.id, 'owner', me->>'id', 't', left(n->>'t', 500), 'desc', left(coalesce(n->>'desc',''), 4000),
      'list', n->'list', 'listName', n->'listName', 'board', n->'board', 'boardName', n->'boardName', 'due', n->'due',
      'done', coalesce(n->'done','false'::jsonb), 'push', true, 'eat', nowms, 'eby', me->>'id', 'created', nowms);
    return new;
  end if;
  if o->>'owner' is distinct from me->>'id' then raise exception 'not allowed' using errcode = '42501'; end if;   -- only the person himself
  -- a move: to a list that is really on one of the card owner's boards (any board — job Name's, orders, …)
  if o->>'card' is not null and n ? 'list' and coalesce(n->>'list','') <> '' and n->'list' is distinct from o->'list' then
    select bb, ll into tb, tl from public.records r, jsonb_array_elements(coalesce(r.data->'boards','[]'::jsonb)) bb, jsonb_array_elements(coalesce(bb->'lists','[]'::jsonb)) ll
     where r.coll = 'ptask' and r.id = 'ptmeta_' || (o->>'owner') and not r.deleted and ll->>'id' = n->>'list' limit 1;
  end if;
  mv := tl is not null;
  ch := n->'t' is distinct from o->'t' or n->'desc' is distinct from o->'desc' or n->'done' is distinct from o->'done' or n->'due' is distinct from o->'due'
        or (o->>'card' is null and n->'list' is distinct from o->'list') or mv;
  if not ch then new.data := o || jsonb_build_object('id', new.id); return new; end if;
  new.data := o || jsonb_build_object('t', left(coalesce(n->>'t', o->>'t'), 500), 'desc', left(coalesce(n->>'desc', o->>'desc', ''), 4000),
      'done', coalesce(n->'done', o->'done', 'false'::jsonb), 'due', n->'due', 'push', true, 'eat', nowms, 'eby', me->>'id')
    || case when o->>'card' is null and n ? 'list' then jsonb_build_object('list', n->'list', 'listName', n->'listName', 'board', n->'board', 'boardName', n->'boardName') else '{}'::jsonb end
    || case when mv then jsonb_build_object('list', tl->'id', 'listName', tl->'name', 'board', tb->'id', 'boardName', tb->'name', 'mv', true) else '{}'::jsonb end;
  new.data := (new.data - 'pushErr') || jsonb_build_object('id', new.id);
  return new;
end $function$;
revoke all on function public.guard_ptask() from public, anon, authenticated, service_role;
grant execute on function public.guard_ptask() to authenticated, service_role;

-- 4) privacy (Baruch 2026-10-21 19:58): a person's Trello is seen and changed ONLY by that person — not by the owner.
--    (The owner can still SEND a task into it with task_to_trello, which never shows him the board.)
do $$
declare src text; a text := '    when c = ''ptask'' then d->>''owner'' = me->>''id'' or me->>''role'' = ''owner''';
begin
  src := pg_get_functiondef('public.can_see2(text,jsonb,jsonb)'::regprocedure);
  if position(a in src) > 0 then
    src := replace(src, a, '    when c = ''ptask'' then d->>''owner'' = me->>''id''');
    execute src;
  elsif position('when c = ''ptask'' then d->>''owner'' = me->>''id''' in src) = 0 then
    raise exception 'can_see2 ptask rule not found';
  end if;
end $$;
-- connected people for the owner's "Send to …'s Trello" button: names only, never the board
create or replace function public.trello_people()
 returns table(emp text, member text, connected_at text)
 language sql stable security definer set search_path to 'public' as $function$
  select substr(k, length('trello_user:') + 1), (v::jsonb)->>'fullName', (v::jsonb)->>'at' from public.server_config
   where k like 'trello\_user:%' and ((public.my_emp_data()->>'role') = 'owner' or substr(k, length('trello_user:') + 1) = public.my_emp_data()->>'id')
$function$;
revoke all on function public.trello_people() from public, anon;
grant execute on function public.trello_people() to authenticated;
