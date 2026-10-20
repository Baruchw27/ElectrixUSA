-- B1 (staging first): phone notifications carry the bell message's id (tap → opens that job / screen) and its time
-- (a message saved offline that arrives > 30 min late stays in the bell but doesn't buzz); "Taken off your list" uses
-- the job text in the reader's language. Goes with functions/notify/index.ts (B1).
create or replace function public.on_record_change() returns trigger language plpgsql security definer
set search_path to 'public', 'extensions' as $function$
declare base text; secret text;
begin
  if new.deleted or new.coll not in ('inbox','sites') then return new; end if;
  if new.coll = 'inbox' and tg_op <> 'INSERT' then return new; end if;
  if new.coll = 'sites' and (tg_op <> 'UPDATE' or coalesce(new.data->>'stage','') = coalesce(old.data->>'stage','') or coalesce(new.data->>'trello','') = '') then return new; end if;
  select v into base from public.server_config where k = 'functions_url';
  select v into secret from public.server_config where k = 'secret';
  if base is null or secret is null then return new; end if;
  if new.coll = 'inbox' then
    perform net.http_post(url := base || '/notify',
      body := jsonb_build_object('to', new.data->>'to', 'msg', new.data->>'msg', 'id', new.id,
                                 'ts', case when (new.data->>'ts') ~ '^[0-9]+$' then (new.data->>'ts')::bigint end),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  else
    perform net.http_post(url := base || '/trello',
      body := jsonb_build_object('card', new.data->>'trello', 'stage', new.data->>'stage', 'phase', new.data->>'phase'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  return new;
end $function$;

do $do$ declare d text; a text; begin
  d := pg_get_functiondef('public.notify_assign'::regproc);
  a := $x$for who in select y from private.expand_people(o->'to') y except select x from private.expand_people(n->'to') x loop
          perform private.notify_now(who,$x$;
  if position(a in d) = 0 then raise exception 'notify_assign not the expected version'; end if;
  d := replace(d, a, $x$for who in select y from private.expand_people(o->'to') y except select x from private.expand_people(n->'to') x loop
          e := private.emp_row(who);
          d := case when coalesce(n->>'descLang', '') = '' or n->>'descLang' = coalesce(e->>'lang', 'en') or coalesce(n->>'descTr', '') = ''
                    then coalesce(n->>'desc', '') else n->>'descTr' end;
          perform private.notify_now(who,$x$);
  d := replace(d, $x$'Taken off your list: ' || case when site <> '' then site || ' — ' else '' end || left(coalesce(n->>'desc', ''), 50),$x$,
                  $x$'Taken off your list: ' || case when site <> '' then site || ' — ' else '' end || left(d, 50),$x$);
  d := replace(d, $x$'Quitado de tu lista: ' || case when site <> '' then site || ' — ' else '' end || left(coalesce(n->>'descTr', n->>'desc', ''), 50),$x$,
                  $x$'Quitado de tu lista: ' || case when site <> '' then site || ' — ' else '' end || left(d, 50),$x$);
  execute d;
end $do$;
