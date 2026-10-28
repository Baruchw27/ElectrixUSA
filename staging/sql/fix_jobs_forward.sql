-- JOBS agent — audit fixes C15 H05 H11 H12/H13 (server part) H16 H18 H22 H23 H24 M07 — server side
-- Apply to STAGING (rkkxykdkjgdsgkujanau) only. Rollback: fix_jobs_rollback.sql
-- Rules (Baruch): job stage changes (stage, phase, tmove, trelloList) only by the owner, managers and the people in
-- server_config 'stage_movers' (production: ["o1","o2"] = Shia, Menachem). Not Miriam, not Matty. No name matching.
-- Site managers are assigned by the owner + server_config 'mgr_assigners' (production: ["o1"] = Shia).
--
-- PRODUCTION VALUES when this goes live:  stage_movers = ["o1","o2"]   mgr_assigners = ["o1"]
-- STAGING test values (fake people):      stage_movers = ["u4","u3"]   mgr_assigners = ["u4"]
--   (u4 Pat Payroll = Shia-equivalent: inspection task + move alerts, like o1; u3 Olga Office = Menachem-equivalent:
--    billing task + personal Trello, like o2; u5 Ben = Matty-equivalent, not a mover)

begin;

insert into public.server_config(k, v) values ('stage_movers', '["u4","u3"]'), ('mgr_assigners', '["u4"]')
  on conflict (k) do update set v = excluded.v;

-- ───────────── who may move a job / assign site managers (one rule for the server and the app) ─────────────
create or replace function private.cfg_ids(p_key text)
 returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce((select array(select jsonb_array_elements_text(case when jsonb_typeof(v::jsonb) = 'array' then v::jsonb else '[]'::jsonb end))
                     from public.server_config where k = p_key), '{}'::text[]);
$$;
create or replace function private.can_move_stage(me jsonb)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(me->>'role','') in ('owner','manager') or coalesce(me->>'id','') = any(private.cfg_ids('stage_movers'));
$$;
create or replace function private.can_assign_mgr(me jsonb)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(me->>'role','') = 'owner' or coalesce(me->>'id','') = any(private.cfg_ids('mgr_assigners'));
$$;
-- the app asks once after sign-in: { stageMovers, mgrAssigners, orrOwner, stage, mgr } (ids only; no secrets)
create or replace function public.job_perms()
 returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.is_member() then '{}'::jsonb else jsonb_build_object(
    'stageMovers', to_jsonb(private.cfg_ids('stage_movers')),
    'mgrAssigners', to_jsonb(private.cfg_ids('mgr_assigners')),
    'orrOwner', (select v from public.server_config where k = 'orr_owner'),
    'stage', private.can_move_stage(public.my_emp_data()),
    'mgr', private.can_assign_mgr(public.my_emp_data())) end;
$$;
revoke all on function public.job_perms() from public, anon;
grant execute on function public.job_perms() to authenticated;

-- C15 / H16 / H05: guard on jobs (sites) — stage/phase/tmove/trelloList movers; manager/managers assigners
create or replace function private.guard_site_stage()
 returns trigger language plpgsql set search_path to 'public' as $$
declare me jsonb; n jsonb := new.data; o jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;   -- server / Trello sync
  if jsonb_typeof(n) <> 'object' then return new; end if;
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data end;
  me := public.my_emp_data();
  if o is null then
    if coalesce(n->>'stage','') in ('roughdone','inspection','done') and not private.can_move_stage(me) then
      raise exception 'only the owner, the site managers, Shia or Menachem can move a job' using errcode = '42501'; end if;
    return new;
  end if;
  if (n->'stage' is distinct from o->'stage'
      or (n->'phase' is distinct from o->'phase' and not (o->'phase' is null and n->>'phase' = 'rough'))   -- the app fills in the default
      or n->'tmove' is distinct from o->'tmove' or n->'trelloList' is distinct from o->'trelloList')
     and not private.can_move_stage(me) then
    raise exception 'only the owner, the site managers, Shia or Menachem can move a job' using errcode = '42501'; end if;
  if (n->'manager' is distinct from o->'manager' or n->'managers' is distinct from o->'managers')
     and not private.can_assign_mgr(me) then
    raise exception 'only the owner or Shia can assign site managers' using errcode = '42501'; end if;
  return new;
end $$;
create or replace trigger records_guard_site_stage before insert or update on public.records
  for each row when (new.coll = 'sites') execute function private.guard_site_stage();

-- H22 + R2: an inspection-call task closes only once the inspection is booked. The live app sends the task's "done"
-- BEFORE the inspection's "booked" in the same save, so the check runs at the END of the save (deferred constraint
-- trigger): if the inspection is still only "requested" then, the task goes back to open and the person is told — no
-- refused row, so no "Not saved" error. Booking / passing / failing an inspection closes its open call-in task(s)
-- on the server (records_zz_insp_close_tasks), whatever order the rows arrive in.
create or replace function private.guard_task_insp()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare cur jsonb; who text;
begin
  if auth.uid() is null then return null; end if;                       -- server / Trello / merge work
  if new.deleted or coalesce(new.data->>'insp','') = '' or coalesce(new.data->>'status','') <> 'done' then return null; end if;
  if tg_op = 'UPDATE' and not old.deleted and coalesce(old.data->>'status','') = 'done' then return null; end if;
  select data into cur from public.records where coll = 'jobs' and id = new.id and not deleted;
  if cur is null or coalesce(cur->>'status','') <> 'done' or (cur->'inspBooked' is not null and cur->'inspBooked' <> 'null'::jsonb) then return null; end if;
  if not exists (select 1 from public.records i where i.coll = 'insp' and i.id = cur->>'insp' and not i.deleted
                  and coalesce(i.data->>'status','requested') = 'requested') then return null; end if;
  update public.records set data = (data - 'doneAt' - 'doneBy') || '{"status":"open"}'::jsonb, updated_at = now()
   where coll = 'jobs' and id = new.id;
  who := public.my_emp_data()->>'id';
  perform private.notify_now(who, '📅 Book the inspection first (date and time) — the task closes by itself: ' || left(coalesce(cur->>'desc',''), 60),
                                  '📅 Primero agende la inspección (fecha y hora) — la tarea se cierra sola: ' || left(coalesce(cur->>'desc',''), 60),
                                  'info', jsonb_build_object('job', new.id), null);
  return null;
end $$;
-- (an earlier staging version had this as a BEFORE trigger that refused the save; it is switched off)
do $$ begin if exists (select 1 from pg_trigger where tgrelid = 'public.records'::regclass and tgname = 'records_guard_task_insp') then
  alter table public.records disable trigger records_guard_task_insp; end if; end $$;
do $$ begin if not exists (select 1 from pg_trigger where tgrelid = 'public.records'::regclass and tgname = 'records_zz_task_insp_check') then
  create constraint trigger records_zz_task_insp_check after insert or update on public.records
    deferrable initially deferred for each row when (new.coll = 'jobs') execute function private.guard_task_insp(); end if; end $$;

create or replace function private.insp_close_tasks()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare n jsonb := new.data; o jsonb; actor text; nowms bigint := (extract(epoch from now())*1000)::bigint;
begin
  if new.deleted or jsonb_typeof(n) <> 'object' or coalesce(n->>'status','') not in ('booked','pass','fail') then return null; end if;
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data end;
  if o is not null and coalesce(o->>'status','') in ('booked','pass','fail') then return null; end if;
  if auth.uid() is not null then actor := public.my_emp_data()->>'id'; end if;
  actor := coalesce(nullif(actor,''), nullif(n->>'bookedBy',''), 'auto');
  update public.records set data = data || jsonb_build_object('status','done','doneAt',nowms,'doneBy',actor,
           'inspBooked', coalesce(nullif(n->>'at','')::bigint, nowms)), updated_at = now()
   where coll = 'jobs' and not deleted and data->>'insp' = new.id and coalesce(data->>'status','') <> 'done';
  return null;
end $$;
create or replace trigger records_zz_insp_close_tasks after insert or update on public.records
  for each row when (new.coll = 'insp') execute function private.insp_close_tasks();

-- H11: the old "/trello" function is gone (404 every time a job moved) and used an obsolete stage map — the database no
-- longer calls it. Trello moves are made by trello-sync (tmove). The inbox → push branch is unchanged.
CREATE OR REPLACE FUNCTION public.on_record_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare base text; secret text;
begin
  if new.deleted or new.coll <> 'inbox' or tg_op <> 'INSERT' then return new; end if;
  select v into base from public.server_config where k = 'functions_url';
  select v into secret from public.server_config where k = 'secret';
  if base is null or secret is null then return new; end if;
  perform net.http_post(url := base || '/notify',
    body := jsonb_build_object('to', new.data->>'to', 'msg', new.data->>'msg', 'id', new.id,
                               'ts', case when (new.data->>'ts') ~ '^[0-9]+$' then (new.data->>'ts')::bigint end),
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  return new;
end $function$;

-- H11/H12/H13: trello-sync writes only what it changed (merge, never a whole stale copy), never brings back a removed
-- job, and never undoes a move made in the app while it was running. Service role only.
create or replace function public.trello_apply_sites(p_rows jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; cur record; p jsonb; un text[]; done int := 0; skipped int := 0; created int := 0; heldMove int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    p := coalesce(r->'patch','{}'::jsonb);
    un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset','[]'::jsonb))), '{}'::text[]);
    select * into cur from public.records where coll = 'sites' and id = r->>'id' for update;
    if not found then
      if coalesce((r->>'create')::boolean,false) then
        insert into public.records(coll,id,data,deleted,updated_by,updated_at) values ('sites', r->>'id', p, false, 'trello', now())
          on conflict (coll,id) do nothing;
        created := created + 1;
      else skipped := skipped + 1; end if;
      continue;
    end if;
    if cur.deleted or jsonb_typeof(cur.data) <> 'object' then skipped := skipped + 1; continue; end if;   -- H13: removed stays removed
    -- a move made in the app after trello-sync read the job: keep the app's move (it goes to Trello next run)
    if r ? 'expectMove' and coalesce(cur.data->'tmove', 'null'::jsonb) is distinct from coalesce(r->'expectMove', 'null'::jsonb) then
      p := p - 'stage' - 'phase' - 'trelloList' - 'tlpos' - 'tpos' - 'tgone' - 'tgoneAt' - 'stageBeforeGone' - 'tmoveErr' - 'tmovedAt';
      un := array(select x from unnest(un) x where x not in ('tmove','tmoveErr','tgone','tgoneAt','stageBeforeGone'));
      heldMove := heldMove + 1;
    end if;
    if p = '{}'::jsonb and cardinality(un) = 0 then continue; end if;
    update public.records set data = (data || p) - un, updated_by = 'trello', updated_at = now()
     where coll = 'sites' and id = cur.id;
    done := done + 1;
  end loop;
  return jsonb_build_object('updated', done, 'created', created, 'skipped', skipped, 'heldForAppMove', heldMove);
end $$;
revoke all on function public.trello_apply_sites(jsonb) from public, anon, authenticated;
grant execute on function public.trello_apply_sites(jsonb) to service_role;

-- H18: "Same job — merge" on the server, in one step, with a preview and an undo. Owner only.
create table if not exists private.merge_log (
  id bigserial primary key, at timestamptz not null default now(), by_emp text, keep_id text not null, dup_id text not null,
  rows jsonb not null default '[]'::jsonb,      -- [{coll,id,old}] every record whose job reference was moved
  keep_old jsonb, dup_old jsonb, punch_old jsonb, undone_at timestamptz, undone_by text);
revoke all on private.merge_log from public, anon, authenticated;

-- replace a job id in the reference fields (site / siteId / sid, and lists sites / siteIds), at any depth
create or replace function private.swap_site(d jsonb, p_from text, p_to text)
 returns jsonb language plpgsql immutable as $$
declare k text; v jsonb; out jsonb;
begin
  if jsonb_typeof(d) = 'object' then
    out := '{}'::jsonb;
    for k, v in select key, value from jsonb_each(d) loop
      if k in ('site','siteId','sid') and jsonb_typeof(v) = 'string' and v #>> '{}' = p_from then v := to_jsonb(p_to);
      elsif k in ('sites','siteIds') and jsonb_typeof(v) = 'array' then
        v := (select coalesce(jsonb_agg(case when jsonb_typeof(e) = 'string' and e #>> '{}' = p_from then to_jsonb(p_to) else e end order by ord), '[]'::jsonb)
                from jsonb_array_elements(v) with ordinality as a(e, ord));
      elsif jsonb_typeof(v) in ('object','array') then v := private.swap_site(v, p_from, p_to); end if;
      out := out || jsonb_build_object(k, v);
    end loop;
    return out;
  elsif jsonb_typeof(d) = 'array' then
    return (select coalesce(jsonb_agg(private.swap_site(e, p_from, p_to) order by ord), '[]'::jsonb) from jsonb_array_elements(d) with ordinality as a(e, ord));
  end if;
  return d;
end $$;

create or replace function public.merge_sites(p_keep text, p_dup text, p_dry boolean default true)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me jsonb := public.my_emp_data(); actor text; k jsonb; d jsonb; kd jsonb; dd jsonb; f text; cnt jsonb; logrows jsonb := '[]'::jsonb;
        r record; nd jsonb; pk jsonb; pdp jsonb; lid bigint; nowms bigint := (extract(epoch from now())*1000)::bigint; ln text;
begin
  if coalesce(me->>'role','') <> 'owner' then raise exception 'only the owner can merge jobs' using errcode = '42501'; end if;
  actor := me->>'id';
  if coalesce(p_keep,'') = '' or coalesce(p_dup,'') = '' or p_keep = p_dup then raise exception 'pick two different jobs' using errcode = '22023'; end if;
  select data into k from public.records where coll = 'sites' and id = p_keep and not deleted;
  select data into d from public.records where coll = 'sites' and id = p_dup and not deleted;
  if k is null or d is null then raise exception 'that job is not there any more' using errcode = '22023'; end if;
  if coalesce(d->>'mergedInto','') <> '' or coalesce(k->>'mergedInto','') <> '' then raise exception 'one of these jobs was already merged' using errcode = '22023'; end if;
  -- preview: how many records of each kind point at the copy that goes away
  select coalesce(jsonb_object_agg(coll, n), '{}'::jsonb) into cnt from (
    select coll, count(*) n from public.records
     where coll <> 'sites' and not deleted and strpos(data::text, '"' || p_dup || '"') > 0
       and private.swap_site(data, p_dup, p_keep) <> data group by coll) q;
  select data into pdp from public.records where coll = 'punchlists' and id = p_dup and not deleted;
  if p_dry then
    return jsonb_build_object('dry', true, 'keep', jsonb_build_object('id', p_keep, 'name', k->>'name'), 'dup', jsonb_build_object('id', p_dup, 'name', d->>'name'),
      'moves', cnt, 'files', jsonb_array_length(coalesce(d->'files','[]'::jsonb)), 'notes', jsonb_array_length(coalesce(d->'notes','[]'::jsonb)),
      'links', jsonb_array_length(coalesce(d->'links','[]'::jsonb)), 'punchList', pdp is not null, 'trello', coalesce(d->>'trello','') <> '' and coalesce(k->>'trello','') = '');
  end if;
  -- from here on it is the server's own work: no "moved to Lost" / "new task" alerts, nothing re-checked as a phone edit
  perform set_config('request.jwt.claims', '', true);
  for r in select coll, id, data from public.records
            where coll <> 'sites' and not deleted and strpos(data::text, '"' || p_dup || '"') > 0 for update loop
    nd := private.swap_site(r.data, p_dup, p_keep);
    if nd = r.data then continue; end if;
    if r.coll = 'sched' and jsonb_typeof(nd) = 'object' then nd := nd || jsonb_build_object('rev', coalesce((r.data->>'rev')::int,0) + 1); end if;
    logrows := logrows || jsonb_build_array(jsonb_build_object('coll', r.coll, 'id', r.id, 'old', r.data));
    update public.records set data = nd, updated_by = 'merge:' || actor, updated_at = now() where coll = r.coll and id = r.id;
  end loop;
  -- punch list of the copy → added to the kept job's punch list
  select data into pk from public.records where coll = 'punchlists' and id = p_keep and not deleted;
  if pdp is not null and jsonb_typeof(pdp) = 'object' then
    nd := coalesce(pk, '{}'::jsonb);
    for ln in select jsonb_object_keys(pdp) loop
      if jsonb_typeof(pdp->ln) = 'array' then nd := nd || jsonb_build_object(ln, coalesce(case when jsonb_typeof(nd->ln) = 'array' then nd->ln end, '[]'::jsonb) || (pdp->ln)); end if;
    end loop;
    insert into public.records(coll,id,data,deleted,updated_by,updated_at) values ('punchlists', p_keep, nd, false, 'merge:' || actor, now())
      on conflict (coll,id) do update set data = excluded.data, deleted = false, updated_by = excluded.updated_by, updated_at = now();
    update public.records set deleted = true, updated_by = 'merge:' || actor, updated_at = now() where coll = 'punchlists' and id = p_dup;
  end if;
  -- the kept job gets the copy's files, links and notes, and any detail it was missing
  kd := k;
  foreach f in array array['files','links','notes'] loop
    if jsonb_typeof(d->f) = 'array' and jsonb_array_length(d->f) > 0 then
      kd := kd || jsonb_build_object(f, coalesce(case when jsonb_typeof(kd->f) = 'array' then kd->f end, '[]'::jsonb) || (d->f)); end if;
  end loop;
  foreach f in array array['client','phone','manager','managers','crew','lat','lng','rad','permit','email','addr'] loop
    if (kd->f is null or kd->f = 'null'::jsonb or kd->>f = '' or kd->f = '[]'::jsonb) and d->f is not null and d->f <> 'null'::jsonb and d->>f <> '' and d->f <> '[]'::jsonb then
      kd := kd || jsonb_build_object(f, d->f); end if;
  end loop;
  if coalesce(kd->>'trello','') = '' and coalesce(d->>'trello','') <> '' then
    kd := kd || jsonb_build_object('trello', d->'trello', 'trelloList', d->'trelloList', 'tname', d->'tname', 'tlpos', d->'tlpos', 'tpos', d->'tpos'); end if;
  dd := d || jsonb_build_object('stageBeforeMerge', d->'stage', 'stage', 'lost', 'mergedInto', p_keep, 'mergedAt', nowms, 'mergedBy', actor,
                                'mergedTrello', coalesce(d->>'trello',''), 'trello', '', 'files', '[]'::jsonb, 'links', '[]'::jsonb, 'notes', '[]'::jsonb);
  dd := dd - 'tmove';
  update public.records set data = kd, updated_by = 'merge:' || actor, updated_at = now() where coll = 'sites' and id = p_keep;
  update public.records set data = dd, updated_by = 'merge:' || actor, updated_at = now() where coll = 'sites' and id = p_dup;
  insert into private.merge_log(by_emp, keep_id, dup_id, rows, keep_old, dup_old, punch_old)
    values (actor, p_keep, p_dup, logrows, k, d, jsonb_build_object('keep', pk, 'dup', pdp)) returning id into lid;
  update public.records set data = data || jsonb_build_object('mergeLog', lid) where coll = 'sites' and id = p_dup;   -- the owner can undo it later
  return jsonb_build_object('ok', true, 'log', lid, 'moves', cnt, 'moved', jsonb_array_length(logrows));
end $$;

-- undo a merge: references go back to the copy (only where they still point at the kept job), the copy comes back as it
-- was, and the kept job loses only what came from the copy (anything added since stays)
create or replace function public.unmerge_sites(p_log bigint)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me jsonb := public.my_emp_data(); actor text; L record; x jsonb; cur jsonb; nd jsonb; kd jsonb; f text; ids jsonb; n int := 0;
begin
  if coalesce(me->>'role','') <> 'owner' then raise exception 'only the owner can undo a merge' using errcode = '42501'; end if;
  actor := me->>'id';
  select * into L from private.merge_log where id = p_log for update;
  if not found then raise exception 'that merge is not in the log' using errcode = '22023'; end if;
  if L.undone_at is not null then raise exception 'that merge was already undone' using errcode = '22023'; end if;
  perform set_config('request.jwt.claims', '', true);
  for x in select * from jsonb_array_elements(L.rows) loop
    select data into cur from public.records where coll = x->>'coll' and id = x->>'id' for update;
    if cur is null then continue; end if;
    -- a record that pointed at BOTH jobs before the merge cannot be told apart any more: it stays with the kept job
    if strpos((x->'old')::text, '"' || L.keep_id || '"') > 0 then continue; end if;
    nd := private.swap_site(cur, L.keep_id, L.dup_id);
    if nd = cur then continue; end if;
    if x->>'coll' = 'sched' and jsonb_typeof(nd) = 'object' then nd := nd || jsonb_build_object('rev', coalesce((cur->>'rev')::int,0) + 1); end if;
    update public.records set data = nd, updated_by = 'unmerge:' || actor, updated_at = now() where coll = x->>'coll' and id = x->>'id';
    n := n + 1;
  end loop;
  -- the kept job: drop the files / links / notes that came from the copy; undo filled-in details still equal to the copy's
  select data into kd from public.records where coll = 'sites' and id = L.keep_id for update;
  if kd is not null then
    foreach f in array array['files','links','notes'] loop
      if jsonb_typeof(L.dup_old->f) = 'array' and jsonb_typeof(kd->f) = 'array' then
        ids := (select coalesce(jsonb_agg(e->'id'), '[]'::jsonb) from jsonb_array_elements(L.dup_old->f) e where e ? 'id');
        kd := kd || jsonb_build_object(f, (select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) from jsonb_array_elements(kd->f) with ordinality a(e, ord)
                                          where not (e ? 'id' and ids @> jsonb_build_array(e->'id'))));
      end if;
    end loop;
    foreach f in array array['client','phone','manager','managers','crew','lat','lng','rad','permit','email','addr','trello','trelloList','tname','tlpos','tpos'] loop
      if (L.keep_old->f) is distinct from (kd->f) and (kd->f) is not distinct from (L.dup_old->f) then
        kd := case when L.keep_old ? f then kd || jsonb_build_object(f, L.keep_old->f) else kd - f end; end if;
    end loop;
    update public.records set data = kd, updated_by = 'unmerge:' || actor, updated_at = now() where coll = 'sites' and id = L.keep_id;
  end if;
  update public.records set data = L.dup_old, deleted = false, updated_by = 'unmerge:' || actor, updated_at = now() where coll = 'sites' and id = L.dup_id;
  if L.punch_old is not null and L.punch_old->'dup' is not null and L.punch_old->'dup' <> 'null'::jsonb then
    update public.records set data = L.punch_old->'dup', deleted = false, updated_by = 'unmerge:' || actor, updated_at = now() where coll = 'punchlists' and id = L.dup_id;
    if L.punch_old->'keep' is null or L.punch_old->'keep' = 'null'::jsonb then
      update public.records set deleted = true, updated_by = 'unmerge:' || actor, updated_at = now() where coll = 'punchlists' and id = L.keep_id;
    else
      update public.records set data = L.punch_old->'keep', updated_by = 'unmerge:' || actor, updated_at = now() where coll = 'punchlists' and id = L.keep_id;
    end if;
  end if;
  update private.merge_log set undone_at = now(), undone_by = actor where id = p_log;
  return jsonb_build_object('ok', true, 'restored', n);
end $$;
revoke all on function public.merge_sites(text, text, boolean) from public, anon;
revoke all on function public.unmerge_sites(bigint) from public, anon;
grant execute on function public.merge_sites(text, text, boolean) to authenticated;
grant execute on function public.unmerge_sites(bigint) to authenticated;
revoke all on function private.swap_site(jsonb, text, text) from public, anon, authenticated;

-- H23: a real due date (dueDate, YYYY-MM-DD, set by the app) wins over the words
CREATE OR REPLACE FUNCTION private.p3_due(d jsonb)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(d->>'dueDate','') ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'dueDate')::date
    when coalesce(d->>'due','') in ('Today','ASAP') then b
    when d->>'due' = 'Tomorrow morning' then b + 1
    when d->>'due' = 'This week' then b + ((5 - extract(dow from b)::int + 7) % 7)
  end
  from (select (to_timestamp(coalesce(nullif(d->>'ts','')::bigint, 0)/1000.0) at time zone 'America/New_York')::date as b) x
$function$;

-- H24: priority tasks — one reminder an hour to each person who has one open, Sunday–Friday 7:00–18:00 New York
create or replace function private.pri_tick(p_now timestamptz default now())
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare loc timestamp := p_now at time zone 'America/New_York'; wd int := extract(dow from (p_now at time zone 'America/New_York'))::int;
        nowms bigint := (extract(epoch from p_now)*1000)::bigint; r record; sent int := 0; e jsonb; en text; es text;
begin
  if wd = 6 or loc::time < time '07:00' or loc::time > time '18:00' then return jsonb_build_object('skip', 'outside hours'); end if;
  for r in
    select who, count(*) n,
           string_agg(left(coalesce(nullif(private.short_site(j.data->>'site'),'') || ' — ', '') || coalesce(j.data->>'desc',''), 40), ' · ' order by j.id) txt_en,
           string_agg(left(coalesce(nullif(private.short_site(j.data->>'site'),'') || ' — ', '') ||
                           case when coalesce(j.data->>'descLang','en') <> 'es' and coalesce(j.data->>'descTr','') <> '' then j.data->>'descTr' else coalesce(j.data->>'desc','') end, 40), ' · ' order by j.id) txt_es,
           min(j.id) one
      from public.records j, lateral private.expand_people(j.data->'to') who
     where j.coll = 'jobs' and not j.deleted and jsonb_typeof(j.data) = 'object'
       and coalesce((j.data->>'pri')::boolean, false) and coalesce(j.data->>'status','') <> 'done'
       and coalesce(nullif(j.data->>'ts','')::bigint, 0) < nowms - 50*60000      -- the "new task" alert is enough for the first hour
       and coalesce(j.data->>('snz_' || who), '') <= to_char(loc, 'YYYY-MM-DD')
     group by who
  loop
    en := '🔴 PRIORITY (' || r.n || '): ' || left(r.txt_en, 300) || ' — please complete';
    es := '🔴 PRIORIDAD (' || r.n || '): ' || left(r.txt_es, 300) || ' — por favor termínala';
    perform private.notify_now(r.who, en, es, 'pri', case when r.n = 1 then jsonb_build_object('job', r.one) else jsonb_build_object('tab', 'jobs') end, null);
    sent := sent + 1;
  end loop;
  return jsonb_build_object('sent', sent, 'at', loc);
end $$;
revoke all on function private.pri_tick(timestamptz) from public, anon, authenticated;
select cron.unschedule('pri-hourly') where exists (select 1 from cron.job where jobname = 'pri-hourly');
select cron.schedule('pri-hourly', '3 * * * *', 'select private.pri_tick()');

commit;
