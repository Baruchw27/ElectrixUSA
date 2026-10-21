-- T1 (staging first): personal Trello tasks (Baruch 2026-10-20 21:45). Example: Menachem's own Trello (billing etc.)
-- shows up ONLY on his own Tasks page in Electrix ("📋 My Trello"); the owner can switch to it. Shia's Trello board for
-- jobs (trello-sync → sites) is not touched.
--   records coll 'ptask', id 'pt_<emp>_<cardId>' (or a phone-made id until Trello gives the card an id):
--     {owner, card, t, desc, board, boardName, list, listName, due, done, url, act, gone, push, eat, eby, pushErr}
--   The access code for each person's Trello is in server_config 'trello_user_token:<emp>' (server only, never on phones).
--   Edge function trello-personal syncs every 5 minutes (cron) and on demand; trello-connect is the one-time connect page.

-- 1) privacy: a personal task is seen only by its owner — and by the company owner (who can switch to it)
do $$
declare src text; a text := '''incidents'',''msgs'',''apps'',''invites'',''fixes'') then true'; b text := '    when c = ''inbox'' then';
begin
  src := pg_get_functiondef('public.can_see2(text,jsonb,jsonb)'::regprocedure);
  if position('ptask' in src) > 0 then return; end if;
  if position(a in src) = 0 or position(b in src) = 0 then raise exception 'can_see2 anchors not found'; end if;
  src := replace(src, a, '''incidents'',''msgs'',''apps'',''invites'',''fixes'',''ptask'') then true');
  src := replace(src, b, '    when c = ''ptask'' then d->>''owner'' = me->>''id'' or me->>''role'' = ''owner''' || chr(10) || b);
  execute src;
end $$;

-- 2) who may write a personal task: its owner (or the company owner). A phone may only change the text, the note, done,
--    the due date, and — for a task it creates — which Trello list it goes on. Everything Trello-side is kept as the
--    server last saw it. Any real change is marked push:true so the next sync sends it to Trello. Never deleted from a
--    phone (a task done/archived in Trello is marked gone by the server).
create or replace function public.guard_ptask()
 returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb; o jsonb; n jsonb := new.data; nowms bigint := (extract(epoch from now())*1000)::bigint; ch boolean;
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
  if o->>'owner' is distinct from me->>'id' and me->>'role' <> 'owner' then raise exception 'not allowed' using errcode = '42501'; end if;
  ch := n->'t' is distinct from o->'t' or n->'desc' is distinct from o->'desc' or n->'done' is distinct from o->'done' or n->'due' is distinct from o->'due'
        or (o->>'card' is null and n->'list' is distinct from o->'list');
  if not ch then new.data := o || jsonb_build_object('id', new.id); return new; end if;
  new.data := o || jsonb_build_object('t', left(coalesce(n->>'t', o->>'t'), 500), 'desc', left(coalesce(n->>'desc', o->>'desc', ''), 4000),
      'done', coalesce(n->'done', o->'done', 'false'::jsonb), 'due', n->'due', 'push', true, 'eat', nowms, 'eby', me->>'id')
    || case when o->>'card' is null and n ? 'list' then jsonb_build_object('list', n->'list', 'listName', n->'listName', 'board', n->'board', 'boardName', n->'boardName') else '{}'::jsonb end;
  new.data := (new.data - 'pushErr') || jsonb_build_object('id', new.id);
  return new;
end $function$;
revoke all on function public.guard_ptask() from public, anon, authenticated, service_role;
grant execute on function public.guard_ptask() to authenticated, service_role;
create or replace trigger records_guard_ptask before insert or update on public.records for each row
  when (new.coll = 'ptask'::text) execute function public.guard_ptask();

-- 3) who is connected (owner only — for the "View Menachem's tasks" switch); never returns the access code
create or replace function public.trello_people()
 returns table(emp text, member text, connected_at text)
 language sql stable security definer set search_path to 'public' as $function$
  select substr(k, length('trello_user:') + 1), (v::jsonb)->>'fullName', (v::jsonb)->>'at' from public.server_config
   where k like 'trello\_user:%' and ((public.my_emp_data()->>'role') = 'owner' or substr(k, length('trello_user:') + 1) = public.my_emp_data()->>'id')
$function$;
revoke all on function public.trello_people() from public, anon;
grant execute on function public.trello_people() to authenticated;

-- 4) every 5 minutes: sync everyone who is connected
create or replace function private.trello_personal_tick() returns void language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare base text; secret text;
begin
  if not exists (select 1 from public.server_config where k like 'trello\_user\_token:%') then return; end if;
  select v into base from public.server_config where k = 'functions_url';
  select v into secret from public.server_config where k = 'secret';
  if base is null or secret is null then return; end if;
  perform net.http_post(url := base || '/trello-personal', body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret), timeout_milliseconds := 60000);
end $function$;
revoke all on function private.trello_personal_tick() from public, anon, authenticated, service_role;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'trello-personal') then
    perform cron.schedule('trello-personal', '*/5 * * * *', $c$select private.trello_personal_tick()$c$);
  end if;
end $$;
