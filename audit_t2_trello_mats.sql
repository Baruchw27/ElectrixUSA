-- T2 (staging first): Menachem's Trello (Baruch 2026-10-21 15:46)
--   1) every new material request becomes a card in Menachem's Trello (board/list in server_config 'mat_trello'),
--      the card text follows the request while it is open, and the card is ticked when the request is completed.
--   2) the owner (or the person himself, for his own tasks) can send an app task to that person's Trello list.
-- Cards are created through the existing ptask/push path: the server writes a ptask with push:true and the
-- trello-personal function (every 5 minutes, or "Sync now") creates the card with that person's own Trello access.
-- Nothing here reads or returns an access code. Nothing is deleted.

-- 1) material request → card
create or replace function private.mat_card_text(d jsonb, rid text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare lines text; site text; who text; src text; ttl text; body text;
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
  select r.data->>'name' into site from public.records r where r.coll = 'sites' and r.id = d->>'site' and not r.deleted;
  select r.data->>'name' into who from public.records r where r.coll = 'emps' and r.id = d->>'from' and not r.deleted;
  src := case d->>'src' when 'deliver' then 'Store — deliver to the job' when 'pickup' then 'Store — pick up at the store'
                         when 'garage' then 'From the garage' else coalesce(d->>'src','') end;
  ttl := '🧰 Material — ' || coalesce(nullif(site,''), nullif(btrim(d->>'addr'),''), 'no job picked') || ' — ' || coalesce(split_part(who,' ',1), '?');
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
begin
  if new.deleted or jsonb_typeof(new.data) <> 'object' then return null; end if;
  begin select v::jsonb into cfg from public.server_config where k = 'mat_trello'; exception when others then cfg := null; end;
  if cfg is null or coalesce(cfg->>'emp','') = '' or coalesce(cfg->>'list','') = '' then return null; end if;
  emp := cfg->>'emp';
  if not exists (select 1 from public.server_config where k = 'trello_user_token:' || emp) then return null; end if;
  pid := 'pt_' || emp || '_mat_' || new.id;
  select data into ex from public.records where coll = 'ptask' and id = pid and not deleted;
  fin := coalesce(new.data->>'st','') = 'completed' or coalesce(new.data->>'status','') in ('done','delivered','completed');
  txt := private.mat_card_text(new.data, new.id);
  sig := md5(txt::text);
  if ex is null then
    -- only for a request that is new (or brought back), and not already finished
    if not (tg_op = 'INSERT' or old.deleted) or fin then return null; end if;
    insert into public.records (coll, id, data, deleted)
    values ('ptask', pid, jsonb_build_object('id', pid, 'owner', emp, 't', txt->>'t', 'desc', txt->>'desc',
              'board', cfg->'board', 'boardName', cfg->'boardName', 'list', cfg->'list', 'listName', cfg->'listName',
              'due', null, 'done', false, 'push', true, 'mat', new.id, 'matSig', sig, 'created', nowms, 'eat', nowms, 'eby', 'electrix'), false)
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

-- 2) send an app task to someone's Trello list
create or replace function public.task_to_trello(p_job text, p_emp text, p_list text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me jsonb := public.my_emp_data(); j jsonb; meta jsonb; b jsonb; l jsonb; pid text; ex jsonb; site text; who text;
        ttl text; body text; nowms bigint := (extract(epoch from now())*1000)::bigint;
begin
  if coalesce(me->>'id','') = '' then raise exception 'sign in first' using errcode = '42501'; end if;
  select data into j from public.records where coll = 'jobs' and id = p_job and not deleted;
  if j is null then raise exception 'that task is not there any more' using errcode = '22023'; end if;
  if not (me->>'role' = 'owner' or (me->>'id' = p_emp and (coalesce(j->'to','[]'::jsonb) ? p_emp or j->>'from' = p_emp))) then
    raise exception 'only the owner can send someone''s task to Trello (or the person, for his own tasks)' using errcode = '42501'; end if;
  if not exists (select 1 from public.server_config where k = 'trello_user_token:' || p_emp) then
    raise exception 'that person''s Trello is not connected' using errcode = '22023'; end if;
  select data into meta from public.records where coll = 'ptask' and id = 'ptmeta_' || p_emp and not deleted;
  select x.b, x.l into b, l from (select bb as b, ll as l from jsonb_array_elements(coalesce(meta->'boards','[]'::jsonb)) bb,
                                   jsonb_array_elements(coalesce(bb->'lists','[]'::jsonb)) ll where ll->>'id' = p_list) x limit 1;
  if l is null then raise exception 'pick one of the Trello lists' using errcode = '22023'; end if;
  pid := 'pt_' || p_emp || '_job_' || p_job;
  select data into ex from public.records where coll = 'ptask' and id = pid and not deleted;
  if ex is not null and not coalesce((ex->>'gone')::boolean, false) then
    return jsonb_build_object('ok', true, 'already', true, 'id', pid); end if;
  select r.data->>'name' into site from public.records r where r.coll = 'sites' and r.id = j->>'site' and not r.deleted;
  select r.data->>'name' into who from public.records r where r.coll = 'emps' and r.id = j->>'from' and not r.deleted;
  ttl := coalesce(nullif(btrim(split_part(coalesce(j->>'desc',''), E'\n', 1)), ''), 'Task');
  if site is not null then ttl := ttl || ' — ' || site; end if;
  body := concat_ws(E'\n', coalesce(j->>'desc',''), '',
            case when site is not null then 'Job: ' || site end,
            case when who is not null then 'From: ' || who end,
            case when coalesce(j->>'due','') <> '' then 'Due: ' || (j->>'due') end,
            '(Electrix task ' || p_job || ')');
  insert into public.records (coll, id, data, deleted)
  values ('ptask', pid, jsonb_build_object('id', pid, 'owner', p_emp, 't', left(ttl, 500), 'desc', left(body, 4000),
            'board', b->'id', 'boardName', b->'name', 'list', l->'id', 'listName', l->'name', 'due', null, 'done', false,
            'push', true, 'job', p_job, 'created', nowms, 'eat', nowms, 'eby', me->>'id'), false)
  on conflict (coll, id) do update set data = excluded.data, deleted = false;
  update public.records set data = data || jsonb_build_object('trello', jsonb_build_object('emp', p_emp, 'at', nowms, 'by', me->>'id', 'pt', pid, 'list', l->>'name', 'board', b->>'name'))
   where coll = 'jobs' and id = p_job;
  return jsonb_build_object('ok', true, 'id', pid);
end $function$;
revoke all on function public.task_to_trello(text, text, text) from public, anon;
grant execute on function public.task_to_trello(text, text, text) to authenticated;
