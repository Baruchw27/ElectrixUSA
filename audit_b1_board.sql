-- B1 (staging first): My Board for everyone (Baruch 2026-10-21 20:00–20:26)
--   • a task is seen only by whoever HOLDS it (it is "to" them or their crew). You do not see a task once you sent it on.
--     The owner can LOOK at everyone's tasks (read-only, when he switches to that person in the app).
--   • the server remembers who sent a task along (sentBy). When the holder marks it done, everyone who sent it along
--     (and whoever made it) gets "✓ Done by …".
--   • each person's board columns (To do · Today · Punch list · Waiting · their own) live in coll 'bcol', id
--     'bcol_<emp>' — seen and changed only by that person (the owner can look).
-- Nothing is deleted.

-- 1) who sees what
create or replace function private.task_holders(d jsonb)
 returns jsonb language sql immutable as $function$
  select case jsonb_typeof(d->'to') when 'array' then d->'to' when 'string' then jsonb_build_array(d->'to') else '[]'::jsonb end
$function$;

do $$
declare src text; a text := '''incidents'',''msgs'',''apps'',''invites'',''fixes'',''ptask'') then true';
        b text := '    when c = ''ptask'' then';
begin
  src := pg_get_functiondef('public.can_see2(text,jsonb,jsonb)'::regprocedure);
  if position('when c = ''jobs''' in src) > 0 then return; end if;
  if position(a in src) = 0 or position(b in src) = 0 then raise exception 'can_see2 anchors not found'; end if;
  src := replace(src, a, '''incidents'',''msgs'',''apps'',''invites'',''fixes'',''ptask'',''jobs'',''bcol'') then true');
  src := replace(src, b,
       '    when c = ''jobs'' then me->>''role'' = ''owner'' or (case jsonb_typeof(d->''to'') when ''array'' then d->''to'' when ''string'' then jsonb_build_array(d->''to'') else ''[]''::jsonb end) ?| array[me->>''id'', coalesce(nullif(me->>''crew'',''''), ''~'')]' || chr(10)
    || '    when c = ''bcol'' then d->>''owner'' = me->>''id'' or me->>''role'' = ''owner''' || chr(10) || b);
  execute src;
end $$;

-- 2) who sent it along (server-owned: a phone cannot change sentBy)
create or replace function private.jobs_chain()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare me jsonb; actor text; crew text; o jsonb; n jsonb := new.data; sb jsonb; holds boolean;
begin
  if jsonb_typeof(n) <> 'object' or new.deleted then return new; end if;
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data end;
  sb := coalesce(o->'sentBy', case when o is null then n->'sentBy' end, '[]'::jsonb);
  if jsonb_typeof(sb) <> 'array' then sb := '[]'::jsonb; end if;
  if auth.uid() is not null then                 -- a person's change (not the server's own work)
    me := public.my_emp_data(); actor := me->>'id'; crew := coalesce(nullif(me->>'crew',''), '~');
    if coalesce(actor,'') <> '' and (o is null or private.task_holders(n) is distinct from private.task_holders(o)) then
      holds := private.task_holders(n) ?| array[actor, crew];
      if not holds and not sb ? actor then sb := sb || to_jsonb(actor); end if;
    end if;
  end if;
  new.data := n || jsonb_build_object('sentBy', sb);
  return new;
end $function$;
revoke all on function private.jobs_chain() from public, anon;
create or replace trigger records_guard_jobs_chain before insert or update on public.records for each row
  when (new.coll = 'jobs'::text) execute function private.jobs_chain();

-- 3) done → tell everyone who sent it along (and whoever made it), not the one who did it, not the holders
create or replace function private.notify_task_done()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare me jsonb; actor text; aname text; n jsonb := new.data; o jsonb := '{}'::jsonb; who text; site text; d text; des text;
begin
  if auth.uid() is null or new.deleted or jsonb_typeof(n) <> 'object' then return null; end if;
  if tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then o := old.data; end if;
  if coalesce(n->>'status','') <> 'done' or coalesce(o->>'status','') = 'done' then return null; end if;
  begin
    me := public.my_emp_data(); actor := me->>'id'; aname := coalesce(nullif(private.emp_row(actor)->>'name',''), 'Office');
    site := private.short_site(n->>'site'); d := left(coalesce(n->>'desc',''), 60);
    des := left(case when coalesce(n->>'descLang','en') <> 'es' and coalesce(n->>'descTr','') <> '' then n->>'descTr' else coalesce(n->>'desc','') end, 60);
    for who in
      select distinct x from (select jsonb_array_elements_text(coalesce(n->'sentBy','[]'::jsonb)) x
                              union select n->>'from') s
       where coalesce(x,'') <> '' and x <> coalesce(actor,'')
         and x not in (select y from private.expand_people(n->'to') y)
    loop
      perform private.notify_now(who,
        '✓ Done by ' || aname || ': ' || case when site <> '' then site || ' — ' else '' end || d,
        '✓ Hecho por ' || aname || ': ' || case when site <> '' then site || ' — ' else '' end || des,
        'info', jsonb_build_object('tab', 'jobs'), actor);
    end loop;
  exception when others then raise warning 'notify_task_done %: %', new.id, sqlerrm;
  end;
  return null;
end $function$;
revoke all on function private.notify_task_done() from public, anon;
create or replace trigger records_zz_notify_task_done after insert or update on public.records for each row
  when (new.coll = 'jobs'::text) execute function private.notify_task_done();

-- 4) board columns: only the person himself writes his own
create or replace function public.guard_bcol()
 returns trigger language plpgsql set search_path to 'public' as $function$
declare me jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if new.deleted then raise exception 'board columns are not deleted' using errcode = '42501'; end if;
  if jsonb_typeof(new.data) <> 'object' or new.id <> 'bcol_' || (me->>'id') or new.data->>'owner' is distinct from me->>'id' then
    raise exception 'only you can change your own board' using errcode = '42501'; end if;
  if jsonb_typeof(new.data->'cols') <> 'array' or jsonb_array_length(new.data->'cols') > 30 then
    raise exception 'bad board columns' using errcode = '22023'; end if;
  return new;
end $function$;
revoke all on function public.guard_bcol() from public, anon, authenticated, service_role;
grant execute on function public.guard_bcol() to authenticated, service_role;
create or replace trigger records_guard_bcol before insert or update on public.records for each row
  when (new.coll = 'bcol'::text) execute function public.guard_bcol();

-- 5) send a task on (it leaves your board, lands on theirs). A plain save cannot do this: after it, the task is no
--    longer yours to see, so the database refuses the change — this does it for you after checking you hold it.
create or replace function public.send_task(p_id text, p_to jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me jsonb := public.my_emp_data(); j jsonb; x text; nd jsonb;
begin
  if coalesce(me->>'id','') = '' then raise exception 'sign in first' using errcode = '42501'; end if;
  select data into j from public.records where coll = 'jobs' and id = p_id and not deleted for update;
  if j is null then raise exception 'that task is not there any more' using errcode = '22023'; end if;
  if not (me->>'role' = 'owner' or private.task_holders(j) ?| array[me->>'id', coalesce(nullif(me->>'crew',''), '~')]) then
    raise exception 'this task is not on your board' using errcode = '42501'; end if;
  if me->>'role' = 'worker' and not coalesce((me->>'lead')::boolean, false) and j->>'from' is distinct from me->>'id' then
    raise exception 'only the office or a crew leader can send a job on' using errcode = '42501'; end if;
  if jsonb_typeof(p_to) <> 'array' or jsonb_array_length(p_to) = 0 or jsonb_array_length(p_to) > 20 then
    raise exception 'pick who gets it' using errcode = '22023'; end if;
  for x in select jsonb_array_elements_text(p_to) loop
    if not exists (select 1 from public.records r where r.coll in ('emps','crews') and r.id = x and not r.deleted) then
      raise exception 'unknown person or crew: %', x using errcode = '22023'; end if;
  end loop;
  update public.records set data = data || jsonb_build_object('to', p_to), updated_by = me->>'id'
   where coll = 'jobs' and id = p_id returning data into nd;
  return jsonb_build_object('ok', true, 'row', jsonb_build_object('coll','jobs','id',p_id,'data',nd,'deleted',false));
end $function$;
revoke all on function public.send_task(text, jsonb) from public, anon;
grant execute on function public.send_task(text, jsonb) to authenticated;
