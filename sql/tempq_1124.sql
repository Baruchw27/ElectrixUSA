-- Baruch 11/24: no more "Apply to O&R (temp service / new service) — new job X" task for every new job from Trello.
-- Instead: when a job moves INTO Confirmed jobs (stage 'ready'), Baruch gets a question task "Does X need a temp service?"
-- (orrAuto 'tempq'). In the app (p14): Yes → a task for Matty (o4) "Apply to O&R for a temp service" (orrAuto 'apply', so it
-- closes by itself once an O&R request for that job is in the app); No → closed, nothing else.
do $patch$
declare s text := pg_get_functiondef('private.orr_tick'::regproc); a int; b int; n text;
begin
  a := position(E'      if not (seen ? s.id) and s.stg in (''upcoming'',''ready'',''active'',''priced'')' in s);
  b := position(E'      elsif s.stg = ''roughdone''' in s);
  if a = 0 or b = 0 or b < a then raise exception 'orr_tick: apply branch not found'; end if;
  n := E'      if s.stg = ''ready'' and coalesce(seen->>s.id,'''') <> ''ready''\n'
    || E'         and not exists (select 1 from records o where o.coll=''orr'' and not o.deleted and o.data->>''site'' = s.id)\n'
    || E'         and not exists (select 1 from records q where q.coll=''jobs'' and q.id in (''orrA_'' || s.id || ''_apply'', ''orrA_'' || s.id || ''_tempq'')) then\n'
    || E'        -- Baruch 11/24: moved into Confirmed jobs → ask Baruch whether it needs a temp service (Yes → task for Matty)\n'
    || E'        key := ''orrA_'' || s.id || ''_tempq''; dsc := ''Does '' || s.nm || '' need a temp service? It just moved to Confirmed jobs.'';\n'
    || E'        insert into records(coll,id,data) values (''jobs'', key, jsonb_build_object(''id'',key,''ts'',ms,''to'',jsonb_build_array(''u1''),''from'',''u1'',''site'',s.id,\n'
    || E'          ''desc'',dsc,''descLang'',''en'',''descTr'','''',''due'',''Today'',''status'',''open'',''photo'',''na'',''pri'',false,''media'',''[]''::jsonb,''orrAuto'',''tempq'')) on conflict do nothing;\n'
    || E'        get diagnostics n_ = row_count; if n_ > 0 then perform private.notify_now(''u1'', ''❓ '' || dsc, ''❓ '' || dsc, ''info'', jsonb_build_object(''job'',key), null); made := made + 1; end if;\n';
  s := substr(s, 1, a - 1) || n || substr(s, b);
  s := replace(s, 'n_ = row_count; if n_ > 0', 'n = row_count; if n > 0');
  execute s;
end $patch$;
