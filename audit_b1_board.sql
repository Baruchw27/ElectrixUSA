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
  if current_user in ('authenticated','anon') and auth.uid() is not null then
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
declare me jsonb; actor text; aname text; n jsonb := new.data; o jsonb := '{}'::jsonb; who text; site text; d text;
begin
  if auth.uid() is null or new.deleted or jsonb_typeof(n) <> 'object' then return null; end if;
  if tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then o := old.data; end if;
  if coalesce(n->>'status','') <> 'done' or coalesce(o->>'status','') = 'done' then return null; end if;
  begin
    me := public.my_emp_data(); actor := me->>'id'; aname := coalesce(nullif(private.emp_row(actor)->>'name',''), 'Office');
    site := private.short_site(n->>'site'); d := left(coalesce(n->>'desc',''), 60);
    for who in
      select distinct x from (select jsonb_array_elements_text(coalesce(n->'sentBy','[]'::jsonb)) x
                              union select n->>'from') s
       where coalesce(x,'') <> '' and x <> coalesce(actor,'')
         and x not in (select y from private.expand_people(n->'to') y)
    loop
      perform private.notify_now(who,
        '✓ Done by ' || aname || ': ' || case when site <> '' then site || ' — ' else '' end || d,
        '✓ Hecho por ' || aname || ': ' || case when site <> '' then site || ' — ' else '' end || d,
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
