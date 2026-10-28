-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Electrix USA — SCHEDULE agent fixes (schedule, O&R automation, meetings, inspections)
-- Items: C18 H28 H30 H31 H51 H52 H54 H56 H57 H60 M20  (app-side parts are in staging/*.js, index.html)
-- Applied to STAGING (rkkxykdkjgdsgkujanau). Production: run only after Baruch approves the preview.
-- Rollback: fix_schedule_rollback.sql (puts back the exact old function definitions saved in step 0).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 0. keep the current definitions so the rollback is exact ──
create table if not exists private.fn_backup_schedule (name text primary key, def text not null, saved_at timestamptz default now());
insert into private.fn_backup_schedule(name, def) values
  ('public.guard_sched_rev',   pg_get_functiondef('public.guard_sched_rev'::regproc)),
  ('private.orr_tick',         pg_get_functiondef('private.orr_tick'::regproc)),
  ('private.orr_wd',           pg_get_functiondef('private.orr_wd'::regproc)),
  ('public.meeting_reminders', pg_get_functiondef('public.meeting_reminders'::regproc))
on conflict (name) do nothing;   -- a second run never overwrites the ORIGINAL copy
revoke all on private.fn_backup_schedule from public, anon, authenticated;

-- ── C18: schedule revision guard ──
-- • same as before: an edit must carry a higher rev than the stored one (40001 = "someone else changed this day")
-- • a day that was removed may be booked again by a phone that has no copy of it (rev 1 = "new booking"); the server
--   makes the rev higher than the removed one so later edits keep working. A phone that still holds an OLDER copy
--   (rev 2+ but not newer than the removal) is refused (40001) — it would bring back a day someone cleared.
-- • a removal that DOES carry the version it cleared (data.delRev — new phones send rev+1; save_records_v2 passes it on,
--   see 'Needs owner: security' in the report) must be newer than the stored day.
--   A removal without rev information (phones in the field today) is still accepted — for one release.
CREATE OR REPLACE FUNCTION public.guard_sched_rev()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare nr int; orv int; dr int;
begin
  if NEW.coll <> 'sched' or OLD.coll <> 'sched' then return NEW; end if;
  nr  := case when jsonb_typeof(NEW.data) = 'object' and (NEW.data->>'rev') ~ '^[0-9]+$' then (NEW.data->>'rev')::int end;
  orv := case when jsonb_typeof(OLD.data) = 'object' and (OLD.data->>'rev') ~ '^[0-9]+$' then (OLD.data->>'rev')::int else 0 end;
  if coalesce(OLD.deleted,false) then
    -- bringing back exactly what was removed (restore / undo) is always fine
    if not coalesce(NEW.deleted,false) and NEW.data is distinct from OLD.data and jsonb_typeof(NEW.data) = 'object' and coalesce(nr,0) <= orv then
      if coalesce(nr,0) > 1 then
        raise exception 'stale_sched_write for %: this day was cleared on another phone (rev % ≤ %)', NEW.id, nr, orv using errcode='40001';
      end if;
      NEW.data := NEW.data || jsonb_build_object('rev', orv + 1);   -- a fresh booking on a cleared day
    end if;
    return NEW;
  end if;
  if coalesce(NEW.deleted,false) then
    -- which version the phone cleared: delRev, or rev when the removal replaces the data
    dr := case when jsonb_typeof(NEW.data) = 'object' and (NEW.data->>'delRev') ~ '^[0-9]+$' then (NEW.data->>'delRev')::int
               when NEW.data is distinct from OLD.data and not (jsonb_typeof(NEW.data) = 'object' and NEW.data ? 'delRev') then nr end;
    if dr is not null and dr <= orv then
      raise exception 'stale_sched_write for %: removal rev % must exceed stored rev %', NEW.id, dr, orv using errcode='40001';
    end if;
    if jsonb_typeof(NEW.data) = 'object' and NEW.data ? 'delRev' then NEW.data := NEW.data - 'delRev'; end if;
    return NEW;   -- no rev information (phones in the field today): accepted for one release
  end if;
  if NEW.data is distinct from OLD.data and coalesce(nr,0) <= orv then
    raise exception 'stale_sched_write for %: incoming rev % must exceed stored rev %', NEW.id, coalesce(nr,0), orv using errcode='40001';
  end if;
  return NEW;
end $function$;

-- ── H31: ongoing ("until reassigned") rules can't rewrite the past ──
-- • "to" may never be earlier than the day before "from" (from-1 = ended before it started)
-- • a change may not end a rule before yesterday when it was still running after that (past days stay as they were)
-- • a rule that already ran (from < today) is never removed — it is ended instead
CREATE OR REPLACE FUNCTION private.guard_ong_rule()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare td date := (now() at time zone 'America/New_York')::date; n jsonb := NEW.data; o jsonb; nf date; nt date; ot date; ofr date;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return NEW; end if;
  if NEW.coll <> 'sched' or NEW.id not like 'ONG:%' then return NEW; end if;
  o := case when tg_op = 'UPDATE' and not OLD.deleted and jsonb_typeof(OLD.data) = 'object' then OLD.data end;
  ofr := case when o->>'from' ~ '^\d{4}-\d{2}-\d{2}$' then (o->>'from')::date end;
  ot  := case when o->>'to'   ~ '^\d{4}-\d{2}-\d{2}$' then (o->>'to')::date end;
  if NEW.deleted then
    if o is not null and ofr is not null and ofr < td then
      raise exception 'an ongoing job that already ran can only be ended, not removed (past days stay as they were)' using errcode = '42501';
    end if;
    return NEW;
  end if;
  if jsonb_typeof(n) <> 'object' or (o is not null and n = o) then return NEW; end if;
  nf := case when n->>'from' ~ '^\d{4}-\d{2}-\d{2}$' then (n->>'from')::date end;
  nt := case when n->>'to'   ~ '^\d{4}-\d{2}-\d{2}$' then (n->>'to')::date end;
  if nf is not null and nt is not null and nt < nf - 1 then
    raise exception 'the ongoing job cannot end before it starts' using errcode = '42501';
  end if;
  if o is not null and nt is not null and nt is distinct from ot and nt < td - 1
     and (ot is null or ot > nt) and coalesce(ofr, nf, td) < td then
    raise exception 'an ongoing job can end yesterday at the earliest — past days stay as they were' using errcode = '42501';
  end if;
  if o is not null and nf is not null and ofr is not null and nf <> ofr and least(nf, ofr) < td then
    raise exception 'the start of an ongoing job that already ran cannot be moved' using errcode = '42501';
  end if;
  return NEW;
end $function$;
drop trigger if exists records_guard_ong_rule on public.records;
create trigger records_guard_ong_rule before insert or update on public.records
  for each row when (new.coll = 'sched') execute function private.guard_ong_rule();

-- ── H56: only the owner, managers and the office book meetings (also through the API) ──
CREATE OR REPLACE FUNCTION private.guard_meets_book()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return NEW; end if;
  if NEW.deleted then return NEW; end if;
  if tg_op = 'UPDATE' and not OLD.deleted then return NEW; end if;   -- editing: guard_record (only the person who booked it)
  me := public.my_emp_data();
  if coalesce(me->>'role','') in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) then return NEW; end if;
  raise exception 'only the owner, managers and the office can book meetings' using errcode = '42501';
end $function$;
drop trigger if exists records_guard_meets_book on public.records;
create trigger records_guard_meets_book before insert or update on public.records
  for each row when (new.coll = 'meets') execute function private.guard_meets_book();

-- ── H52: O&R history notes are never lost when two people save at the same time ──
-- the stored history and the incoming history are combined (each note once, oldest first)
CREATE OR REPLACE FUNCTION private.orr_log_merge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if NEW.coll <> 'orr' or NEW.deleted or OLD.deleted or jsonb_typeof(NEW.data) <> 'object' or jsonb_typeof(OLD.data) <> 'object' then return NEW; end if;
  if jsonb_typeof(OLD.data->'log') <> 'array' then return NEW; end if;
  if jsonb_typeof(NEW.data->'log') <> 'array' then
    NEW.data := NEW.data || jsonb_build_object('log', OLD.data->'log');   -- a save without the history keeps it
    return NEW;
  end if;
  if NEW.data->'log' = OLD.data->'log' then return NEW; end if;
  NEW.data := NEW.data || jsonb_build_object('log', (
    select coalesce(jsonb_agg(e order by case when (e->>'ts') ~ '^[0-9]+$' then (e->>'ts')::bigint else 0 end, e::text), '[]'::jsonb)
    from (select distinct e from jsonb_array_elements((OLD.data->'log') || (NEW.data->'log')) e) q));
  return NEW;
end $function$;
drop trigger if exists records_orr_log_merge on public.records;
create trigger records_orr_log_merge before update on public.records
  for each row when (new.coll = 'orr') execute function private.orr_log_merge();

-- ── H28 / H51: work days are Sunday–Friday (only Saturday is off) ──
CREATE OR REPLACE FUNCTION private.orr_wd(a date, b date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(count(*)::int,0) from generate_series(a + 1, b, interval '1 day') d where extract(isodow from d) <> 6 $function$;

-- ── H51 / H54: O&R automation ──
-- • follow-ups go to the request's owner AND everyone in server_config orr_to (Shia + Matty)
-- • a follow-up date set by hand (fuOn) is always respected — no automatic reminder before it
-- • no follow-up date → reminder after 3 work days with no update (Sunday counts, Saturday doesn't), then every 3 work days
-- • work hours Sunday–Friday 9–5
-- • no "meter set" task when the job already has a New Service / Upgrade request (its steps cover the meters)
CREATE OR REPLACE FUNCTION private.orr_tick(p_now timestamp with time zone DEFAULT now(), p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare td date := (p_now at time zone 'America/New_York')::date; loc timestamp := p_now at time zone 'America/New_York';
        ms bigint := (extract(epoch from p_now)*1000)::bigint; dow int := extract(isodow from (p_now at time zone 'America/New_York'))::int;
        workhrs boolean; anyhrs boolean; own_def text; seen jsonb; first_run boolean; r record; s record;
        own text; nm text; tn text; touch date; idle int; key text; dsc text; want text[] := '{}'; made int := 0; closed int := 0; n int; stp text; lbl text; whos text; wo text;
        fu_to jsonb; fwho jsonb; p text; fu date;
begin
  workhrs := p_force or (dow <> 6 and loc::time >= time '09:00' and loc::time < time '17:00');
  anyhrs  := p_force or (dow <> 6 and loc::time >= time '07:00' and loc::time < time '21:00');
  if not anyhrs then return jsonb_build_object('skip','off hours'); end if;
  own_def := coalesce(nullif((select v from server_config where k='orr_owner'),''), 'o1');
  if not p_force and coalesce((select v from server_config where k='orr_start'),'') > td::text then return jsonb_build_object('skip','starts '||(select v from server_config where k='orr_start')); end if;
  begin fu_to := (select v from server_config where k='orr_to')::jsonb; exception when others then fu_to := null; end;
  if jsonb_typeof(fu_to) <> 'array' then fu_to := '[]'::jsonb; end if;

  for r in select o.id, o.data d, split_part(coalesce(si.data->>'name', o.data->>'addr', '?'), ',', 1) nm
           from records o left join records si on si.coll='sites' and si.id = o.data->>'site'
           where o.coll='orr' and not o.deleted and o.data->>'status' in ('sent','us','sched') loop
    own := coalesce(nullif(r.d->>'owner',''), own_def); nm := r.nm;
    -- who gets a follow-up: the owner + orr_to (active people only, once each)
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into fwho from (
      select distinct x from (select own as x union all select jsonb_array_elements_text(fu_to)) q
      where coalesce(x,'') <> '' and exists (select 1 from records e where e.coll='emps' and e.id = q.x and not e.deleted and not coalesce((e.data->>'inactive')::boolean,false))) z;
    if fwho = '[]'::jsonb then fwho := jsonb_build_array(own); end if;
    fu := case when r.d->>'fuOn' ~ '^\d{4}-\d{2}-\d{2}$' then (r.d->>'fuOn')::date end;
    if (r.d->>'flow') is not null then
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
      if whos <> 'us' and coalesce(r.d->>'need','') = '' then
        key := null;
        if fu is not null then
          if fu <= td then key := 'orrT_' || r.id || '_f_' || fu::text; end if;          -- the date someone set by hand
        else
          touch := (to_timestamp(coalesce(nullif(r.d->>'stepAt','')::bigint, nullif(r.d->>'upd','')::bigint, nullif(r.d->>'ts','')::bigint, 0)/1000.0) at time zone 'America/New_York')::date;
          idle := private.orr_wd(touch, td);
          if idle >= 3 then key := 'orrT_' || r.id || '_f_' || touch::text || '_' || (idle / 3); end if;   -- no date set: every 3 work days
        end if;
        if key is not null then
          dsc := case when whos = 'cust' then 'Check if the customer paid the O&R invoice — ' || nm || wo
                 else 'Follow up' || coalesce(' with ' || nullif(r.d->>'pm',''), ' with O&R') || ': ' || nm || ' — ' || lbl || wo end;
          if exists (select 1 from records where coll='jobs' and id=key) then want := want || key;
          elsif workhrs then
            insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',fwho,'from',own,'site',r.d->>'site',
              'desc',dsc,'descLang','en','descTr','','due','Today','status','open','photo','na','pri',false,'media','[]'::jsonb,'orr',r.id,'orrAuto','follow'));
            for p in select jsonb_array_elements_text(fwho) loop
              perform private.notify_now(p, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null);
            end loop;
            made := made + 1; want := want || key;
          end if;
        end if;
      end if;
      continue;
    end if;
    -- older requests (before the step tracker)
    tn := case r.d->>'type' when 'temp' then 'temp service' when 'tempout' then 'temp removal' when 'newsvc' then 'new service'
          when 'meter' then 'meter set / cut-in' when 'upgrade' then 'service upgrade' when 'disc' then 'disconnect/reconnect'
          when 'demo' then 'demolition removal' when 'reloc' then 'relocation' else 'request' end;
    touch := greatest(
      (to_timestamp(coalesce(nullif(r.d->>'upd','')::bigint,0)/1000.0) at time zone 'America/New_York')::date,
      (to_timestamp(coalesce(nullif(r.d->>'ts','')::bigint,0)/1000.0) at time zone 'America/New_York')::date,
      case when r.d->>'sent' ~ '^\d{4}-\d{2}-\d{2}$' then (r.d->>'sent')::date else date '2000-01-01' end);
    idle := private.orr_wd(touch, td);
    key := null;
    if r.d->>'status' = 'us' then
      key := 'orrT_' || r.id || '_u_' || coalesce(nullif(r.d->>'usAt',''), r.d->>'upd', '0');
      dsc := 'O&R needs from us: ' || coalesce(nullif(r.d->>'need',''), 'see the O&R request') || ' — ' || nm || ' (' || tn || coalesce(', #' || nullif(r.d->>'wo',''), '') || ')';
      if not exists (select 1 from records where coll='jobs' and id=key) then
        insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',jsonb_build_array(own),'from',own,'site',r.d->>'site',
          'desc',dsc,'descLang','en','descTr','','due','Today','status','open','photo','na','pri',false,'media','[]'::jsonb,'orr',r.id,'orrAuto','us'));
        perform private.notify_now(own, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null); made := made + 1;
      end if;
      want := want || key;
    elsif r.d->>'status' = 'sched' then
      if r.d->>'schedOn' ~ '^\d{4}-\d{2}-\d{2}$' and (r.d->>'schedOn')::date < td then
        key := 'orrT_' || r.id || '_s_' || (r.d->>'schedOn');
        dsc := 'Confirm with O&R: was the ' || tn || ' done on ' || to_char((r.d->>'schedOn')::date,'Mon FMDD') || '? — ' || nm;
        if exists (select 1 from records where coll='jobs' and id=key) then want := want || key;
        elsif workhrs then
          insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',fwho,'from',own,'site',r.d->>'site',
            'desc',dsc,'descLang','en','descTr','','due','Today','status','open','photo','na','pri',false,'media','[]'::jsonb,'orr',r.id,'orrAuto','sched'));
          for p in select jsonb_array_elements_text(fwho) loop
            perform private.notify_now(p, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null);
          end loop;
          made := made + 1; want := want || key;
        end if;
      end if;
    end if;
    if r.d->>'status' = 'sent' and (fu is null or fu <= td) and (fu is not null or idle >= 3) then
      key := case when fu is not null then 'orrT_' || r.id || '_f_' || fu::text else 'orrT_' || r.id || '_f_' || touch::text || '_' || (idle / 3) end;
      dsc := 'Follow up with O&R' || coalesce(' (' || nullif(r.d->>'pm','') || ')', '') || ': ' || nm || ' — ' || tn || coalesce(', #' || nullif(r.d->>'wo',''), '') || ' · ' || idle || ' work days, no update';
      if exists (select 1 from records where coll='jobs' and id=key) then want := want || key;
      elsif workhrs then
        insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',fwho,'from',own,'site',r.d->>'site',
          'desc',dsc,'descLang','en','descTr','','due','Today','status','open','photo','na','pri',idle >= 10,'media','[]'::jsonb,'orr',r.id,'orrAuto','follow'));
        for p in select jsonb_array_elements_text(fwho) loop
          perform private.notify_now(p, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null);
        end loop;
        made := made + 1; want := want || key;
        if idle >= 10 then
          for s in select e.id from records e where e.coll='emps' and not e.deleted and e.data->>'role'='owner' and not (fwho ? e.id) and not coalesce((e.data->>'inactive')::boolean,false) loop
            perform private.notify_now(s.id, '⚡ O&R stuck ' || idle || ' work days: ' || nm || ' — ' || tn || ' (' || coalesce(nullif((select split_part(data->>'name',' ',1) from records where coll='emps' and id=own),''),'office') || ' has a follow-up task)',
                                              '⚡ O&R detenido ' || idle || ' días hábiles: ' || nm, 'info', jsonb_build_object('tab','orr','orr',r.id), null);
          end loop;
        end if;
      end if;
    end if;
  end loop;

  seen := (select v from server_config where k='orr_seen')::jsonb;
  first_run := seen is null; seen := coalesce(seen, '{}'::jsonb);
  for s in select si.id, si.data->>'stage' stg, split_part(coalesce(si.data->>'name','?'), ',', 1) nm, coalesce((si.data->>'orrNone')::boolean,false) nonee
           from records si where si.coll='sites' and not si.deleted and coalesce(si.data->>'stage','') <> 'lost' loop
    if not first_run and not s.nonee then
      own := own_def; key := null;
      if not (seen ? s.id) and s.stg in ('upcoming','ready','active','priced')
         and not exists (select 1 from records o where o.coll='orr' and not o.deleted and o.data->>'site' = s.id) then
        key := 'orrA_' || s.id || '_apply'; dsc := 'Apply to O&R (temp service / new service) — new job ' || s.nm;
        insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',jsonb_build_array(own),'from',own,'site',s.id,
          'desc',dsc,'descLang','en','descTr','','due','This week','status','open','photo','na','pri',false,'media','[]'::jsonb,'orrAuto','apply')) on conflict do nothing;
        get diagnostics n = row_count; if n > 0 then perform private.notify_now(own, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null); made := made + 1; end if;
      elsif s.stg = 'roughdone' and coalesce(seen->>s.id,'') <> 'roughdone'
         and not exists (select 1 from records o where o.coll='orr' and not o.deleted and o.data->>'site' = s.id
                           and o.data->>'type' in ('meter','newsvc','upgrade') and coalesce(o.data->>'status','') <> 'cancel') then
        key := 'orrA_' || s.id || '_meter'; dsc := 'O&R: send the cut-in card / request the meter set — ' || s.nm || ' is Rough Complete';
        insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',jsonb_build_array(own),'from',own,'site',s.id,
          'desc',dsc,'descLang','en','descTr','','due','This week','status','open','photo','na','pri',false,'media','[]'::jsonb,'orrAuto','meter')) on conflict do nothing;
        get diagnostics n = row_count; if n > 0 then perform private.notify_now(own, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null); made := made + 1; end if;
      elsif s.stg = 'done' and coalesce(seen->>s.id,'') <> 'done'
         and exists (select 1 from records o where o.coll='orr' and not o.deleted and o.data->>'site' = s.id and o.data->>'type' = 'temp' and o.data->>'status' <> 'cancel')
         and not exists (select 1 from records o where o.coll='orr' and not o.deleted and o.data->>'site' = s.id and o.data->>'type' = 'tempout') then
        key := 'orrA_' || s.id || '_tempout'; dsc := 'O&R: request the temp service removal — ' || s.nm || ' is Complete';
        insert into records(coll,id,data) values ('jobs', key, jsonb_build_object('id',key,'ts',ms,'to',jsonb_build_array(own),'from',own,'site',s.id,
          'desc',dsc,'descLang','en','descTr','','due','This week','status','open','photo','na','pri',false,'media','[]'::jsonb,'orrAuto','tempout')) on conflict do nothing;
        get diagnostics n = row_count; if n > 0 then perform private.notify_now(own, '⚡ ' || dsc, '⚡ ' || dsc, 'info', jsonb_build_object('job',key), null); made := made + 1; end if;
      end if;
    end if;
    seen := seen || jsonb_build_object(s.id, coalesce(s.stg,''));
  end loop;
  insert into server_config(k,v) values ('orr_seen', seen::text) on conflict (k) do update set v = excluded.v;

  -- only the automatic tasks close by themselves (tasks people made by hand are never touched)
  update records t set data = t.data || jsonb_build_object('status','done','doneAt',ms,'doneBy','auto','autoClosed',true)
   where t.coll='jobs' and not t.deleted and coalesce(t.data->>'status','') <> 'done' and t.data->>'orrAuto' in ('us','follow','sched','step','fwd')
     and not (t.id = any(want))
     and not (t.data->>'orrAuto' = 'follow' and not workhrs);
  get diagnostics closed = row_count;
  update records t set data = t.data || jsonb_build_object('status','done','doneAt',ms,'doneBy','auto','autoClosed',true)
   where t.coll='jobs' and not t.deleted and coalesce(t.data->>'status','') <> 'done' and (
         (t.data->>'orrAuto' = 'apply'   and exists (select 1 from records o where o.coll='orr' and not o.deleted and o.data->>'site' = t.data->>'site'))
      or (t.data->>'orrAuto' = 'meter'   and exists (select 1 from records o where o.coll='orr' and not o.deleted and o.data->>'site' = t.data->>'site'
                                                       and o.data->>'type' in ('meter','newsvc','upgrade') and coalesce(o.data->>'status','') <> 'cancel'))
      or (t.data->>'orrAuto' = 'tempout' and exists (select 1 from records o where o.coll='orr' and not o.deleted and o.data->>'site' = t.data->>'site' and o.data->>'type'='tempout')));
  get diagnostics n = row_count; closed := closed + n;
  return jsonb_build_object('made', made, 'closed', closed, 'first_run', first_run, 'at', loc);
end $function$;
revoke all on function private.orr_tick(timestamptz, boolean) from public, anon, authenticated;

-- ── H60 / M20: meeting reminder 30 min before ──
-- • the alert opens the meeting itself (link.meet; older phones still use link.tab = 'cal')
-- • a meeting booked less than 35 minutes ahead gets no extra reminder (the booking alert is the reminder)
-- • a moved meeting gets a fresh reminder (ping15 = the meeting time it was sent for) — unchanged
CREATE OR REPLACE FUNCTION public.meeting_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record; who text; n int := 0; nowms bigint := (extract(epoch from now())*1000)::bigint; tm text; mins int; msg text; nid text;
begin
  for m in
    select r.id, r.data, s.data->>'name' as site
    from records r left join records s on s.coll='sites' and s.id = r.data->>'site' and not s.deleted
    where r.coll='meets' and not r.deleted
      and (r.data->>'at') ~ '^[0-9]+$'
      and (r.data->>'at')::bigint > nowms
      and (r.data->>'at')::bigint <= nowms + 30*60*1000
      and coalesce(r.data->>'ping15','') <> (r.data->>'at')
  loop
    if (m.data->>'ts') ~ '^[0-9]+$' and (m.data->>'at')::bigint - (m.data->>'ts')::bigint < 35*60*1000 then
      update records set data = data || jsonb_build_object('ping15', m.data->>'at'), updated_at = now() where coll='meets' and id = m.id;
      continue;
    end if;
    tm := to_char(to_timestamp((m.data->>'at')::bigint/1000) at time zone 'America/New_York', 'FMHH12:MI AM');
    mins := greatest(1, round(((m.data->>'at')::bigint - nowms)/60000.0))::int;
    for who in
      select distinct x from (
        select m.data->>'by' as x
        union select jsonb_array_elements_text(m.data->'with') where jsonb_typeof(m.data->'with') = 'array'
        union select id from records where not (m.data ? 'with') and coll='emps' and not deleted and data->>'role'='owner' and coalesce((data->>'inactive')::boolean,false)=false
      ) q where x is not null and x <> ''
    loop
      msg := '⏰ ' || tm || case when coalesce(private.emp_row(who)->>'lang','') = 'es' then ' (en ' || mins || ' min): ' || coalesce(m.data->>'title','Reunión')
                                  else ' (in ' || mins || ' min): ' || coalesce(m.data->>'title','Meeting') end || coalesce(' — ' || m.site, '');
      nid := 'n' || replace(gen_random_uuid()::text,'-','');
      insert into records (coll,id,data,deleted,updated_by,updated_at)
      values ('inbox', nid, jsonb_build_object('id',nid,'to',who,'msg',msg,'kind','info','ts',nowms,'read',false,'link',jsonb_build_object('tab','cal','meet',m.id)), false, 'server', now());
      n := n + 1;
    end loop;
    update records set data = data || jsonb_build_object('ping15', m.data->>'at'), updated_at = now() where coll='meets' and id = m.id;
  end loop;
  return n;
end $function$;

-- ── H57: inspection reminders from the server (every phone may be closed) ──
-- day before (24 h ahead) and 6:30 AM the same day, to: who asked for it, who booked it, the job's crew, owner + managers.
-- Each is sent once per booked time (srvRem.d1 / srvRem.m = the inspection time it was sent for), so a moved
-- inspection is reminded again and nothing is sent twice.
CREATE OR REPLACE FUNCTION private.insp_reminders(p_now timestamptz DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i record; nowms bigint := (extract(epoch from p_now)*1000)::bigint; at_ms bigint; at_l timestamp; morning bigint; rem jsonb;
        d1 boolean; mo boolean; kind_en text; kind_es text; site text; crew text; who text; en text; es text; n int := 0; today date := (p_now at time zone 'America/New_York')::date;
begin
  for i in select r.id, r.data from records r where r.coll='insp' and not r.deleted and r.data->>'status' = 'booked'
             and (r.data->>'at') ~ '^[0-9]+$' and (r.data->>'at')::bigint > nowms and (r.data->>'at')::bigint <= nowms + 24*3600*1000 loop
    at_ms := (i.data->>'at')::bigint;
    at_l := to_timestamp(at_ms/1000.0) at time zone 'America/New_York';
    morning := (extract(epoch from ((at_l::date + time '06:30') at time zone 'America/New_York'))*1000)::bigint;
    rem := case when jsonb_typeof(i.data->'srvRem') = 'object' then i.data->'srvRem' else '{}'::jsonb end;
    d1 := coalesce(rem->>'d1','') <> at_ms::text;                                  -- 24 h window (we are inside it)
    mo := coalesce(rem->>'m','') <> at_ms::text and nowms >= morning;              -- 6:30 the same day
    if not d1 and not mo then continue; end if;
    kind_en := case i.data->>'kind' when 'rough' then 'Rough inspection' when 'final' then 'Final inspection' else 'Inspection' end;
    kind_es := case i.data->>'kind' when 'rough' then 'Inspección de rough' when 'final' then 'Inspección final' else 'Inspección' end;
    site := private.short_site(i.data->>'site');
    crew := (select s.data->>'crew' from records s where s.coll='sites' and s.id = i.data->>'site' and not s.deleted limit 1);
    if at_l::date = today then
      en := '⏰ Today ' || to_char(at_l,'FMHH12:MI AM') || ': ' || kind_en || ' — ' || site;
      es := '⏰ Hoy ' || to_char(at_l,'FMHH12:MI AM') || ': ' || kind_es || ' — ' || site;
    else
      en := '⏰ Tomorrow ' || to_char(at_l,'FMHH12:MI AM') || ': ' || kind_en || ' — ' || site;
      es := '⏰ Mañana ' || to_char(at_l,'FMHH12:MI AM') || ': ' || kind_es || ' — ' || site;
    end if;
    for who in select distinct x from (
        select i.data->>'by' x union all select i.data->>'bookedBy'
        union all select private.expand_people(jsonb_build_array(crew)) where coalesce(crew,'') <> ''
        union all select e.id from records e where e.coll='emps' and not e.deleted and e.data->>'role' in ('owner','manager') and not coalesce((e.data->>'inactive')::boolean,false)
      ) q where coalesce(x,'') <> '' loop
      perform private.notify_now(who, en, es, 'pri', jsonb_build_object('insp', i.id), null);
      n := n + 1;
    end loop;
    -- one message covers both windows when they open together (booked late the day before / the same morning)
    rem := rem || jsonb_build_object('d1', at_ms::text) || case when nowms >= morning or at_l::date = today then jsonb_build_object('m', at_ms::text) else '{}'::jsonb end;
    update records set data = data || jsonb_build_object('srvRem', rem), updated_at = now() where coll='insp' and id = i.id;
  end loop;
  return n;
end $function$;
revoke all on function private.insp_reminders(timestamptz) from public, anon, authenticated;

-- ── H30: tomorrow's job to every worker's phone at 6 PM (Sunday–Thursday evening, and Saturday evening for Sunday) ──
-- what a worker does tomorrow, worked out the same way the app shows it:
--   his own move (L:<emp>|day) → else his crew's day: an explicit day booking, or the ongoing job (unless cancelled /
--   replaced that day) plus that day's one-off jobs.
CREATE OR REPLACE FUNCTION private.sched_for(p_emp text, p_crew text, d date)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare row jsonb; rule jsonb; parts text[] := '{}'; a jsonb; rep jsonb; dk text := to_char(d,'YYYY-MM-DD');
begin
  select data into row from records where coll='sched' and id = 'L:' || p_emp || '|' || dk and not deleted;
  if jsonb_typeof(row->'assignments') = 'array' then
    for a in select x from jsonb_array_elements(row->'assignments') x where coalesce(x->>'site','') <> '' order by case when (x->>'start') ~ '^[0-9.]+$' then (x->>'start')::numeric end nulls last loop
      parts := parts || (private.short_site(a->>'site') || ' ' || private.min_label(a->>'start'));
    end loop;
  end if;
  if coalesce(p_crew,'') = '' then return array_to_string(parts, ' + '); end if;
  select data into row from records where coll='sched' and id = p_crew || '|' || dk and not deleted;
  if row is not null and not (row ? 'cancel' or row ? 'replace' or row ? 'patch')
     and (coalesce(row->>'site','') <> '' or jsonb_typeof(row->'assignments') = 'array') then
    if jsonb_typeof(row->'assignments') = 'array' and jsonb_array_length(row->'assignments') > 0 then
      for a in select x from jsonb_array_elements(row->'assignments') x where coalesce(x->>'site','') <> '' order by case when (x->>'start') ~ '^[0-9.]+$' then (x->>'start')::numeric end nulls last loop
        parts := parts || (private.short_site(a->>'site') || ' ' || private.min_label(a->>'start'));
      end loop;
    elsif coalesce(row->>'site','') <> '' then
      parts := parts || (private.short_site(row->>'site') || coalesce(' ' || nullif(row->>'time',''), ''));
    end if;
    return array_to_string(parts, ' + ');
  end if;
  select data into rule from records where coll='sched' and id like 'ONG:' || p_crew || ':%' and not deleted
     and coalesce(data->>'site','') <> ''
     and (data->>'from' is null or (data->>'from') <= dk) and (coalesce(data->>'to','') = '' or (data->>'to') >= dk)
     and (case when jsonb_typeof(data->'workdays') = 'array' then data->'workdays' else '[0,1,2,3,4,5]'::jsonb end) @> to_jsonb(extract(dow from d)::int)
   order by data->>'from' desc nulls last limit 1;
  if rule is not null and not coalesce(row->'cancel','[]'::jsonb) ? 'ONG' then
    rep := row->'replace'->'ONG';
    if jsonb_typeof(rep) = 'object' and coalesce(rep->>'site','') <> '' then parts := parts || (private.short_site(rep->>'site') || ' ' || private.min_label(rep->>'start'));
    else parts := parts || (private.short_site(rule->>'site') || ' ' || private.min_label(rule->>'start')); end if;
  end if;
  if jsonb_typeof(row->'assignments') = 'array' then
    for a in select x from jsonb_array_elements(row->'assignments') x where coalesce(x->>'site','') <> '' order by case when (x->>'start') ~ '^[0-9.]+$' then (x->>'start')::numeric end nulls last loop
      parts := parts || (private.short_site(a->>'site') || ' ' || private.min_label(a->>'start'));
    end loop;
  end if;
  return array_to_string(parts, ' + ');
end $function$;

CREATE OR REPLACE FUNCTION private.sched_tomorrow_tick(p_now timestamptz DEFAULT now(), p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare loc timestamp := p_now at time zone 'America/New_York'; td date := (p_now at time zone 'America/New_York')::date; tm date; e record; txt text; sent int := 0;
begin
  tm := td + 1;
  if extract(dow from tm) = 6 and not p_force then return jsonb_build_object('skip','saturday off'); end if;
  if not p_force and (loc::time < time '18:00' or coalesce((select v from server_config where k='sched_tmr_day'),'') = td::text) then
    return jsonb_build_object('skip','not time'); end if;
  if not p_force then insert into server_config(k,v) values ('sched_tmr_day', td::text) on conflict (k) do update set v = excluded.v; end if;
  for e in select r.id, r.data from records r where r.coll='emps' and not r.deleted and r.data->>'role' = 'worker'
             and not coalesce((r.data->>'inactive')::boolean,false) loop
    txt := private.sched_for(e.id, e.data->>'crew', tm);
    if coalesce(txt,'') = '' then continue; end if;
    perform private.notify_now(e.id, '📅 Tomorrow (' || private.day_label(tm,'en') || '): ' || txt,
                                     '📅 Mañana (' || private.day_label(tm,'es') || '): ' || txt, 'info', jsonb_build_object('tab','sched'), null);
    sent := sent + 1;
  end loop;
  return jsonb_build_object('sent', sent, 'for', tm);
end $function$;
revoke all on function private.sched_tomorrow_tick(timestamptz, boolean) from public, anon, authenticated;
revoke all on function private.sched_for(text, text, date) from public, anon, authenticated;
revoke all on function private.insp_reminders(timestamptz) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('insp-reminders','sched-tomorrow');
select cron.schedule('insp-reminders', '*/5 * * * *', 'select private.insp_reminders()');
select cron.schedule('sched-tomorrow', '*/15 * * * *', 'select private.sched_tomorrow_tick()');

-- ── H51: who gets O&R follow-ups (staging test people: u3 Olga Office, u4 Pat Payroll) ──
insert into server_config(k,v) values ('orr_to', '["u3","u4"]') on conflict (k) do nothing;

-- ── H28 data (STAGING): crews and running ongoing jobs work Sunday–Friday ──
update records set data = jsonb_set(data, '{day,workdays}', '[0,1,2,3,4,5]'::jsonb), updated_at = now()
 where coll='crews' and not deleted and jsonb_typeof(data->'day') = 'object';
update records set data = data || jsonb_build_object('workdays','[0,1,2,3,4,5]'::jsonb, 'rev', coalesce((data->>'rev')::int,0) + 1), updated_at = now()
 where coll='sched' and id like 'ONG:%' and not deleted and coalesce(data->>'to','') = ''
   and data->'workdays' is distinct from '[0,1,2,3,4,5]'::jsonb;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PRODUCTION — run only after approval (Baruch). Do NOT run on staging (staging ids differ).
-- The function / trigger / cron parts above are the same for production. The two data parts differ:
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- -- H51: O&R follow-ups to Shia (o1) and Matty (o4)
-- insert into server_config(k,v) values ('orr_to', '["o1","o4"]') on conflict (k) do update set v = excluded.v;
-- -- H28: Sunday–Friday for every crew that has its own working hours, and for every running ongoing job
-- update records set data = jsonb_set(data, '{day,workdays}', '[0,1,2,3,4,5]'::jsonb), updated_at = now()
--  where coll='crews' and not deleted and jsonb_typeof(data->'day') = 'object';
-- update records set data = data || jsonb_build_object('workdays','[0,1,2,3,4,5]'::jsonb, 'rev', coalesce((data->>'rev')::int,0) + 1), updated_at = now()
--  where coll='sched' and id like 'ONG:%' and not deleted and coalesce(data->>'to','') = ''
--    and data->'workdays' is distinct from '[0,1,2,3,4,5]'::jsonb;
-- (live 2026-10-28: crews c1, c2 have day.workdays [1..5]; open rules ONG:c1:mvj2in9p, ONG:c2:mvkgzihz, ONG:c5:mvj2hkx3)
-- The update runs without a signed-in user, so no "schedule changed" push goes to the crews.
