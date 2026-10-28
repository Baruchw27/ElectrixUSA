do $m$ declare f text := pg_get_functiondef('private.orr_tick'::regproc); g text; begin
  if position('whos text' in f) > 0 then raise notice 'already'; return; end if;
  g := replace(f, 'closed int := 0; n int;', 'closed int := 0; n int; stp text; lbl text; whos text; wo text;');
  g := replace(g, 'nm := r.nm;'||chr(10), 'nm := r.nm;'||chr(10)||$b$    if (r.d->>'flow') is not null then
      stp := coalesce(r.d->>'step','app');
      lbl := case stp when 'app' then 'Send the application' when 'inc' then 'O&R sends the incomplete letter + list' when 'meet' then 'Site meeting with O&R'
        when 'plan' then 'Send the updated site plan' when 'design' then 'O&R design' when 'pay' then 'Customer pays the O&R invoice' when 'pics' then 'Send pictures of the meters + unit numbers'
        when 'sched' then 'O&R schedules the electric' when 'gaspics' then 'Gas: send the pictures' when 'gascert' then 'Gas: send the certificate' when 'hook' then 'O&R hooks it up'
        when 'inv' then 'O&R sends the invoice' when 'setup' then 'Set up the temp service on site' when 'insp' then 'Schedule the inspection' when 'wait' then 'O&R does it' else stp end;
      whos := case when stp in ('app','plan','pics','gaspics','gascert','setup','insp') then 'us' when stp = 'pay' then 'cust' else 'oru' end;
      wo := coalesce(' (#' || nullif(r.d->>'wo','') || ')', '');
      if coalesce(r.d->>'need','') <> '' then
        key := 'orrT_' || r.id || '_u_' || coalesce(nullif(r.d->>'usAt',''), r.d->>'upd', '0');
        dsc := 'O&R needs from us: ' || (r.d->>'need') || ' — ' || nm || wo;
        if not exists (select 1 from records where coll='jobs' and id=key) then
          insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',jsonb_build_array(own),'from',own,'site',r.d->>'site',
            'desc',dsc,'descLang','en','descTr','','due','Today','status','open','photo','na','pri',false,'media','[]'::jsonb,'orr',r.id,'orrAuto','us'));
          perform private.notify_now(own, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null); made := made + 1;
        end if;
        want := want || key;
      end if;
      if whos = 'us' then
        key := 'orrT_' || r.id || '_s_' || stp || '_' || coalesce(r.d->>'stepAt','0');
        dsc := 'O&R · ' || nm || ': ' || lbl || wo;
        if not exists (select 1 from records where coll='jobs' and id=key) then
          insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',jsonb_build_array(own),'from',own,'site',r.d->>'site',
            'desc',dsc,'descLang','en','descTr','','due','Today','status','open','photo','na','pri',false,'media','[]'::jsonb,'orr',r.id,'orrAuto','step','orrStep',stp));
          perform private.notify_now(own, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null); made := made + 1;
        end if;
        want := want || key;
      elsif stp = 'pay' then
        key := 'orrT_' || r.id || '_fwd_' || coalesce(r.d->>'stepAt','0');
        dsc := 'Forward the O&R invoice to the customer — ' || nm || wo;
        if not exists (select 1 from records where coll='jobs' and id=key) then
          insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',jsonb_build_array(own),'from',own,'site',r.d->>'site',
            'desc',dsc,'descLang','en','descTr','','due','Today','status','open','photo','na','pri',false,'media','[]'::jsonb,'orr',r.id,'orrAuto','fwd'));
          perform private.notify_now(own, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null); made := made + 1;
        end if;
        want := want || key;
      end if;
      if whos <> 'us' and r.d->>'fuOn' ~ '^\d{4}-\d{2}-\d{2}$' and (r.d->>'fuOn')::date <= td then
        key := 'orrT_' || r.id || '_f_' || (r.d->>'fuOn');
        dsc := case when whos = 'cust' then 'Check if the customer paid the O&R invoice — ' || nm || wo
               else 'Follow up' || coalesce(' with ' || nullif(r.d->>'pm',''), ' with O&R') || ': ' || nm || ' — ' || lbl || wo end;
        if exists (select 1 from records where coll='jobs' and id=key) then want := want || key;
        elsif workhrs then
          insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',jsonb_build_array(own),'from',own,'site',r.d->>'site',
            'desc',dsc,'descLang','en','descTr','','due','Today','status','open','photo','na','pri',false,'media','[]'::jsonb,'orr',r.id,'orrAuto','follow'));
          perform private.notify_now(own, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null); made := made + 1; want := want || key;
        end if;
      end if;
      continue;
    end if;
$b$);
  g := replace(g, $q$in ('us','follow','sched')$q$, $q$in ('us','follow','sched','step','fwd')$q$);
  if g = f or position('whos' in g) = 0 or position($q$'step','fwd'$q$ in g) = 0 then raise exception 'patch failed'; end if;
  execute g;
end $m$;
select position('whos text' in pg_get_functiondef('private.orr_tick'::regproc))>0 ok;