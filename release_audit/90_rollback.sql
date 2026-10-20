-- 90_rollback.sql  --  put PRODUCTION (lnbcrptcdufnmqsvsisv) back to its state as captured 2026-10-20 (before 10_forward.sql).
-- One transaction. Function bodies are byte-exact copies of PRODUCTION's current pg_get_functiondef (md5-verified).
-- Left in place on purpose (harmless when unused): new functions (32 staging-only functions), schema drill + drill.records,
-- private.notify_queue, private.client_errors, public.ai_usage, their sequences, and index public.records_punch_in_idx.
-- New triggers are DISABLED (not dropped). Data written while the release was live (e.g. punches 'srvIn'/'hist', stock 'qv',
-- notify_queue / client_errors rows) is not touched.

begin;
set local search_path = public, extensions;

-- ===== 1. cron jobs added by forward (and backup-health, only if 20_backups_optional.sql was applied) =====
select cron.unschedule('assign-notify') where exists (select 1 from cron.job where jobname = 'assign-notify');
select cron.unschedule('error-digest') where exists (select 1 from cron.job where jobname = 'error-digest');
select cron.unschedule('error-log-tidy') where exists (select 1 from cron.job where jobname = 'error-log-tidy');
select cron.unschedule('backup-health') where exists (select 1 from cron.job where jobname = 'backup-health');

-- ===== 2. triggers: new ones disabled; records_guard_emphr back to production's definition =====
alter table public.records disable trigger records_zz_notify_assign;
alter table public.records disable trigger records_guard_punch;
alter table public.records disable trigger records_guard_emppay;
alter table public.records disable trigger records_guard_emphr2;
CREATE OR REPLACE TRIGGER records_guard_emphr BEFORE INSERT OR UPDATE ON public.records FOR EACH ROW WHEN ((new.coll = 'emphr'::text)) EXECUTE FUNCTION guard_emphr();

-- ===== 3. functions replaced by forward: production's current definitions + current grants =====

-- public.guard_stock_qty  production md5 e31a9911b0528bedf86b45cbb8044182
CREATE OR REPLACE FUNCTION public.guard_stock_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if;
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' then
    new.data := (new.data - 'qty')
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qty' then jsonb_build_object('qty', old.data->'qty') else '{}'::jsonb end;
  else
    new.data := (new.data - 'qty') || '{"qty":0}'::jsonb;
  end if;
  return new;
end $function$
;
revoke all on function public.guard_stock_qty() from public, anon, authenticated, service_role;
grant execute on function public.guard_stock_qty() to public;
grant execute on function public.guard_stock_qty() to anon;
grant execute on function public.guard_stock_qty() to authenticated;
grant execute on function public.guard_stock_qty() to service_role;

-- public.can_see2  production md5 aa53dfbb0ad9c9eaf3a68203e7987845
CREATE OR REPLACE FUNCTION public.can_see2(c text, d jsonb, me jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when c not in ('keep','inbox','push','meets','punches','timeoff','goHomeLog','travel','exps','emphr','stockLog','rejq') then true
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
    when c = 'inbox' then d->>'to' = me->>'id'
    when c = 'push' then d->>'who' = me->>'id'
    when c = 'meets' then me->>'role' = 'owner' or d->>'by' = me->>'id' or coalesce(d->'with','[]'::jsonb) ? (me->>'id')
    when c = 'emphr' then d->>'who' = me->>'id' or me->>'role' in ('owner','manager','office') or (me->>'all')::boolean
    when c in ('punches','timeoff','goHomeLog','travel') then
         me->>'role' in ('owner','manager','office') or (me->>'all')::boolean or d->>'who' = me->>'id'
    when c in ('stockLog','rejq') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'by' = me->>'id'
    when c = 'exps' then
         me->>'role' in ('owner','manager') or (me->>'all')::boolean
      or (me->>'role' = 'office' and me->>'title' in ('Payroll','Bookkeeper')) or d->>'who' = me->>'id'
    else true end;
$function$
;
revoke all on function public.can_see2(c text, d jsonb, me jsonb) from public, anon, authenticated, service_role;
grant execute on function public.can_see2(c text, d jsonb, me jsonb) to authenticated;
grant execute on function public.can_see2(c text, d jsonb, me jsonb) to service_role;

-- public.save_records  production md5 892f72335b324484fc2462262e330edc
CREATE OR REPLACE FUNCTION public.save_records(rows jsonb)
 RETURNS TABLE(coll text, id text, data jsonb, deleted boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare r jsonb; un text[]; ex boolean; c text; i text; del boolean; v jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    c := r->>'coll'; i := r->>'id'; del := coalesce((r->>'deleted')::boolean, false);
    begin
      ex := private.row_exists(c, i);
      if del or r ? 'full' then
        v := coalesce(r->'full', '{}'::jsonb);
        if ex then
          update public.records as t set data = v, deleted = del, updated_by = r->>'by', updated_at = now() where t.coll = c and t.id = i;
        else
          insert into public.records (coll, id, data, deleted, updated_by, updated_at) values (c, i, v, del, r->>'by', now());
        end if;
      else
        v := coalesce(r->'patch', '{}'::jsonb);
        un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}'::text[]);
        if ex then
          update public.records as t
            set data = case when t.deleted then v
                            when jsonb_typeof(t.data) <> 'object' then t.data
                            else (t.data || v) - un end,
                deleted = false, updated_by = r->>'by', updated_at = now()
            where t.coll = c and t.id = i;
        else
          insert into public.records (coll, id, data, deleted, updated_by, updated_at) values (c, i, v, false, r->>'by', now());
        end if;
      end if;
    exception
      when insufficient_privilege then null;
      when unique_violation then
        update public.records as t set data = case when r ? 'full' or del then coalesce(r->'full','{}'::jsonb)
                                                    when jsonb_typeof(t.data) <> 'object' then t.data
                                                    else t.data || coalesce(r->'patch','{}'::jsonb) end,
               deleted = del, updated_by = r->>'by', updated_at = now()
          where t.coll = c and t.id = i;
    end;
    return query select t.coll, t.id, t.data, t.deleted from public.records t where t.coll = c and t.id = i;
  end loop;
end $function$
;
revoke all on function public.save_records(rows jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_records(rows jsonb) to authenticated;
grant execute on function public.save_records(rows jsonb) to service_role;

-- public.apply_stock_txn  production md5 57e62d9153bc5b8a20251c2d7c3c715b
CREATE OR REPLACE FUNCTION public.apply_stock_txn(txn jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare txnid text; fp text; existing_fp text; m jsonb; me jsonb; actor text; can_adjust boolean;
        cur numeric; newq numeric; nm text; items jsonb := '[]'::jsonb; out_qtys jsonb; kind text; seqv bigint;
        rsn text;
begin
  txnid := txn->>'id';
  if coalesce(txnid,'') = '' then raise exception 'txn id required' using errcode='22023'; end if;
  me := public.my_emp_data(); actor := me->>'id';
  if coalesce(actor,'') = '' then raise exception 'not allowed' using errcode='42501'; end if;
  can_adjust := (me->>'role' in ('owner','manager','office')) or coalesce((me->>'all')::boolean,false);
  kind := coalesce(txn->>'kind','');
  rsn := nullif(left(trim(coalesce(txn->>'reason','')), 300), '');
  fp := md5(kind || '|' || coalesce((txn->'moves')::text,'[]'));

  insert into public.stock_applied(id, fingerprint) values(txnid, fp) on conflict (id) do nothing;
  if not found then
    select fingerprint into existing_fp from public.stock_applied where id = txnid;
    if existing_fp is distinct from fp then
      raise exception 'txn_reuse_conflict: id % reused with different content', txnid using errcode='23505';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0))), '[]'::jsonb) into out_qtys
      from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
      left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
    return jsonb_build_object('duplicate', true, 'qtys', out_qtys);
  end if;

  perform set_config('app.stock_txn','1', true);
  if kind not in ('in','out','set') then raise exception 'bad kind' using errcode = '22023'; end if;
  for m in select * from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) loop
    -- SEC moves: a pick-up only takes out, a return only brings in, a count only sets; amounts must be numbers
    if coalesce(jsonb_typeof(m),'') <> 'object' or coalesce(m->>'id','') = '' then raise exception 'bad move' using errcode = '22023'; end if;
    if (kind = 'set') <> (m ? 'set') then raise exception 'bad move for this kind of change' using errcode = '22023'; end if;
    if kind = 'set' and (coalesce(jsonb_typeof(m->'set'),'') <> 'number' or (m ? 'expect' and coalesce(jsonb_typeof(m->'expect'),'') <> 'number')) then raise exception 'count must be a number' using errcode = '22023'; end if;
    if kind <> 'set' and coalesce(jsonb_typeof(m->'delta'),'') <> 'number' then raise exception 'amount must be a number' using errcode = '22023'; end if;
    if kind = 'out' and (m->>'delta')::numeric >= 0 then raise exception 'a pick-up must take items out' using errcode = '22023'; end if;
    if kind = 'in' and (m->>'delta')::numeric <= 0 then raise exception 'a return must bring items in' using errcode = '22023'; end if;
    select (data->>'qty')::numeric, data->>'name' into cur, nm
      from public.records where coll='stock' and id = m->>'id' and not deleted for update;
    if m ? 'set' then
      if not can_adjust then raise exception 'manual stock adjustment is office/owner only' using errcode='42501'; end if;
      if (m ? 'expect') and coalesce(cur,0) <> (m->>'expect')::numeric then
        raise exception 'stock_changed_recount: % now %, you saw %', m->>'id', coalesce(cur,0), m->>'expect' using errcode='40001';
      end if;
      newq := greatest(0, (m->>'set')::numeric);
    else
      newq := coalesce(cur,0) + (m->>'delta')::numeric;
      if newq < 0 then
        raise exception 'insufficient_stock: % available %, requested %', coalesce(nm,m->>'name',m->>'id'), coalesce(cur,0), abs((m->>'delta')::numeric) using errcode='P0001';
      end if;
    end if;
    if cur is null then
      insert into public.records(coll,id,data,deleted,updated_by,updated_at)
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',newq), false, actor, now())
        on conflict (coll,id) do update set data = jsonb_set(public.records.data,'{qty}', to_jsonb(newq)), updated_by=actor, updated_at=now();
    else
      update public.records set data = jsonb_set(data,'{qty}', to_jsonb(newq)), updated_by=actor, updated_at=now()
        where coll='stock' and id = m->>'id';
    end if;
    items := items || jsonb_build_object('id', m->>'id', 'name', coalesce(nm,m->>'name',m->>'id'),
               'before', coalesce(cur,0), 'after', newq,
               'change', case when m ? 'set' then newq - coalesce(cur,0) else (m->>'delta')::numeric end);
  end loop;

  seqv := nextval('public.stock_seq');
  insert into public.records(coll,id,data,deleted,updated_by,updated_at)
    values('stockLog', txnid, jsonb_build_object(
      'kind', kind, 'by', actor, 'approvedBy', case when kind='set' then actor else null end,
      'site', txn->>'site', 'dir', case when kind='in' then 'from' else 'to' end,
      'items', items, 'ts', coalesce((txn->>'ts')::bigint, (extract(epoch from now())*1000)::bigint),
      'serverTs', (extract(epoch from now())*1000)::bigint, 'seq', seqv, 'applied', true, 'auth', true,
      'reason', rsn) - case when rsn is null then array['reason'] else array[]::text[] end,
      false, actor, now())
    on conflict (coll,id) do nothing;
  perform set_config('app.stock_txn','', true);

  select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0))), '[]'::jsonb) into out_qtys
    from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
    left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
  return jsonb_build_object('duplicate', false, 'qtys', out_qtys);
end $function$
;
revoke all on function public.apply_stock_txn(txn jsonb) from public, anon, authenticated, service_role;
grant execute on function public.apply_stock_txn(txn jsonb) to public;
grant execute on function public.apply_stock_txn(txn jsonb) to anon;
grant execute on function public.apply_stock_txn(txn jsonb) to authenticated;
grant execute on function public.apply_stock_txn(txn jsonb) to service_role;

-- public.meeting_reminders  production md5 f4b3ce911acd91a4dc7b1fcce7d319d2
CREATE OR REPLACE FUNCTION public.meeting_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record; who text; n int := 0; nowms bigint := (extract(epoch from now())*1000)::bigint; msg text; nid text;
begin
  for m in
    select r.id, r.data, s.data->>'name' as site
    from records r left join records s on s.coll='sites' and s.id = r.data->>'site' and not s.deleted
    where r.coll='meets' and not r.deleted
      and (r.data->>'at') ~ '^[0-9]+$'
      and (r.data->>'at')::bigint > nowms
      and (r.data->>'at')::bigint <= nowms + 15*60*1000
      and coalesce(r.data->>'ping15','') <> (r.data->>'at')
  loop
    msg := '⏰ ' || to_char(to_timestamp((m.data->>'at')::bigint/1000) at time zone 'America/New_York', 'FMHH12:MI AM')
           || ' (in ' || greatest(1, round(((m.data->>'at')::bigint - nowms)/60000.0))::int || ' min): ' || coalesce(m.data->>'title','Meeting')
           || coalesce(' — ' || m.site, '');
    for who in
      select distinct x from (
        select m.data->>'by' as x
        union select jsonb_array_elements_text(m.data->'with') where jsonb_typeof(m.data->'with') = 'array'
        union select id from records where not (m.data ? 'with') and coll='emps' and not deleted and data->>'role'='owner' and coalesce((data->>'inactive')::boolean,false)=false
      ) q where x is not null and x <> ''
    loop
      nid := 'n' || replace(gen_random_uuid()::text,'-','');
      insert into records (coll,id,data,deleted,updated_by,updated_at)
      values ('inbox', nid, jsonb_build_object('id',nid,'to',who,'msg',msg,'kind','info','ts',nowms,'read',false,'link',jsonb_build_object('tab','cal')), false, 'server', now());
      n := n + 1;
    end loop;
    update records set data = data || jsonb_build_object('ping15', m.data->>'at'), updated_at = now() where coll='meets' and id = m.id;
  end loop;
  return n;
end $function$
;
revoke all on function public.meeting_reminders() from public, anon, authenticated, service_role;
grant execute on function public.meeting_reminders() to service_role;

-- public.stamp_record  production md5 fd26da214f812c0a351e541ce6179534
CREATE OR REPLACE FUNCTION public.stamp_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; bad text := '[''"\\<>`]';
begin
  if new.id !~ '^[A-Za-z0-9_.:|@-]{1,100}$' or new.coll !~ '^[A-Za-z_]{1,40}$' then
    raise exception 'bad record id' using errcode = '42501'; end if;
  if jsonb_typeof(new.data) = 'object' and (
       exists (select 1 from jsonb_each(new.data) e where e.key in ('id','site','who','by','to','from','crew','re','job','owner','manager','punch','approvedBy','doneBy','paidBy','ref','type')
               and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ bad)
    or exists (select 1 from jsonb_each(new.data) e, jsonb_array_elements_text(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) a
               where e.key in ('to','with','collab','share','managers') and a ~ bad)
    or exists (select 1 from jsonb_each(new.data) e where e.key like 'm\_%' and jsonb_typeof(e.value) = 'object'
               and (coalesce(e.value->>'re','') ~ bad or coalesce(e.value->>'by','') ~ bad or coalesce(e.value->>'kind','') ~ bad))) then
    raise exception 'bad characters in a reference field' using errcode = '42501'; end if;
  if current_user in ('authenticated','anon') and auth.uid() is not null then
    me := public.my_emp_data();
    new.updated_by := coalesce(me->>'id', 'uid:' || auth.uid()::text);
    new.updated_at := now();
  end if;
  return new;
end $function$
;
revoke all on function public.stamp_record() from public, anon, authenticated, service_role;
grant execute on function public.stamp_record() to public;
grant execute on function public.stamp_record() to anon;
grant execute on function public.stamp_record() to authenticated;
grant execute on function public.stamp_record() to service_role;

-- public.guard_record  production md5 4facfb796ad83fcb89c1d5c996e6b22f
CREATE OR REPLACE FUNCTION public.guard_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; role text; boss boolean; office boolean; payroll boolean; money boolean; hours boolean; approver boolean; material boolean;
        o jsonb; n jsonb := new.data; f text; nowms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' and private.row_exists(new.coll, new.id) then return new; end if;
  me := public.my_emp_data();
  if me = '{}'::jsonb then return new; end if;
  role := coalesce(me->>'role','');
  o := case when tg_op = 'UPDATE' then old.data else null end;
  if new.coll = 'inbox' and tg_op = 'INSERT' and jsonb_typeof(n) = 'object' then
    new.data := n || jsonb_build_object('from', me->>'id'); n := new.data; end if;
  if new.coll = 'push' and ((o is null and n->>'who' is distinct from me->>'id') or (o is not null and o->>'who' is distinct from me->>'id')
                            or (not new.deleted and n->>'who' is distinct from me->>'id')) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  if new.coll = 'emps' and not new.deleted and (
       (n ? 'authUid' and n->>'authUid' is distinct from o->>'authUid' and exists (select 1 from public.records x where x.coll='emps' and not x.deleted and x.id <> new.id and x.data->>'authUid' = n->>'authUid'))
    or (n ? 'authEmail' and lower(n->>'authEmail') is distinct from lower(o->>'authEmail') and exists (select 1 from public.records x where x.coll='emps' and not x.deleted and x.id <> new.id and lower(x.data->>'authEmail') = lower(n->>'authEmail')))) then
    raise exception 'that sign-in already belongs to someone' using errcode = '42501'; end if;
  if role = 'owner' then return new; end if;
  boss := public.is_boss();
  office := role = 'office';
  payroll := office and me->>'title' = 'Payroll';
  material := office and me->>'title' = 'Material';
  money := coalesce((me->>'all')::boolean,false) or (office and me->>'title' in ('Payroll','Bookkeeper'));
  hours := coalesce((me->>'all')::boolean,false) or payroll;
  approver := role in ('manager','office') or coalesce((me->>'all')::boolean,false);
  if new.coll = 'emps' then
    if boss then
      if public.emp_privileged(n) or coalesce(n->>'role','') = 'office'
         or (o is not null and (public.emp_privileged(o) or coalesce(o->>'role','') = 'office')) then
        if not (o is not null and old.id = me->>'id' and not new.deleted and (n - 'lang' - 'phone') = (o - 'lang' - 'phone')) then
          raise exception 'only the owner can change this person' using errcode = '42501'; end if;
      end if;
      return new;
    end if;
    if new.deleted or o is null or old.id <> me->>'id' or (n - 'lang' - 'phone') is distinct from (o - 'lang' - 'phone') then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll in ('base','crews','sched','_') then
    if not boss then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'sites' then
    if not (boss or office) and (new.deleted
         or n->'lat' is distinct from o->'lat' or n->'lng' is distinct from o->'lng' or n->'rad' is distinct from o->'rad'
         or n->'fenceOk' is distinct from o->'fenceOk' or n->'trip' is distinct from o->'trip') then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'stock' then
    if new.deleted and not (boss or material) then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'mats' then
    if new.deleted and not (boss or material or o->>'from' = me->>'id') then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'keep' then
    if o is not null and o->>'owner' is distinct from me->>'id' and (n->>'owner' is distinct from o->>'owner' or new.deleted) then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'jobs' then
    if not boss and ((o is null and coalesce(n->>'from', me->>'id') <> me->>'id') or (o is not null and n->>'from' is distinct from o->>'from')) then
      raise exception 'not allowed' using errcode = '42501'; end if;
    if new.deleted and not boss and o->>'from' is distinct from me->>'id' then raise exception 'not allowed' using errcode = '42501'; end if;
    for f in select k from jsonb_object_keys(n) k where k like 'm\_%' loop
      if (o is null or o->f is distinct from n->f) and n->f->>'by' is distinct from me->>'id'
         and not (o ? f and ((n->f) - 'seen' - 'got') = ((o->f) - 'seen' - 'got')) then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end loop;
    return new;
  end if;
  if new.coll = 'meets' then
    if (o is null and n->>'by' is distinct from me->>'id') or (o is not null and o->>'by' is distinct from me->>'id') then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll not in ('punches','timeoff','exps','travel','goHomeLog') then return new; end if;
  if new.coll = 'goHomeLog' then
    if not (role = 'manager' or coalesce((me->>'all')::boolean,false)) then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.deleted then
    if new.coll = 'punches' and not hours then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.coll = 'exps' and not money and (o->>'who' is distinct from me->>'id' or coalesce((o->>'paid')::boolean,false)) then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.coll in ('timeoff','travel') and not boss and o->>'who' is distinct from me->>'id' then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if ((o is null and n->>'who' is distinct from me->>'id') or (o is not null and n->>'who' is distinct from o->>'who'))
     and not (new.coll = 'punches' and hours) and not (new.coll = 'exps' and money) and not (new.coll in ('timeoff','travel') and boss) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  if new.coll = 'punches' and not hours then
    if o is null and (public._num(n->>'in') is null or public._num(n->>'in') > nowms + 300000 or public._num(n->>'in') < nowms - 3*86400000
                      or (n->'out' is not null and n->'out' <> 'null'::jsonb and (public._num(n->>'out') < public._num(n->>'in') or public._num(n->>'out') > nowms + 300000))) then
      raise exception 'clock time out of range' using errcode = '42501'; end if;
    if coalesce(n->>'approvedBy','') <> coalesce(o->>'approvedBy','')
       or (coalesce((o->>'pending')::boolean,false) and not coalesce((n->>'pending')::boolean,false)) then
      if not approver or o is null or o->>'who' = me->>'id' or (n->>'approvedBy' is distinct from me->>'id' and coalesce(n->>'approvedBy','') <> '') then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end if;
    if o is not null then
      if n->>'in' is distinct from o->>'in' or n->'edits' is distinct from o->'edits' then
        raise exception 'clock times can only be changed by Payroll' using errcode = '42501'; end if;
      if o->'out' is not null and o->'out' <> 'null'::jsonb and n->'out' is distinct from o->'out' then
        raise exception 'clock times can only be changed by Payroll' using errcode = '42501'; end if;
      if (o->'out' is null or o->'out' = 'null'::jsonb) and n->'out' is not null and n->'out' <> 'null'::jsonb then
        if o->>'who' is distinct from me->>'id' and not approver then raise exception 'not allowed' using errcode = '42501'; end if;
        if public._num(n->>'out') > nowms + 300000 or public._num(n->>'out') < public._num(o->>'in') then
          raise exception 'clock time out of range' using errcode = '42501'; end if;
      end if;
    end if;
  elsif new.coll = 'timeoff' and not boss then
    if (o is null and coalesce(n->>'status','pending') <> 'pending')
       or (o is not null and n->>'status' is distinct from o->>'status' and n->>'status' <> 'cancelled')
       or (o is not null and coalesce(o->>'status','pending') <> 'pending' and (n - 'status' - 'seen' - 'read') is distinct from (o - 'status' - 'seen' - 'read')) then
      raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'exps' and not money then
    if coalesce((n->>'paid')::boolean,false) and not coalesce((o->>'paid')::boolean,false) then raise exception 'not allowed' using errcode = '42501'; end if;
    if n->>'paidBy' is distinct from o->>'paidBy' or n->>'paidAt' is distinct from o->>'paidAt' then raise exception 'not allowed' using errcode = '42501'; end if;
    if coalesce((o->>'paid')::boolean,false) and (n - 'seen' - 'read') is distinct from (o - 'seen' - 'read') then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'travel' and not boss then
    if o is not null and (n->>'status' is distinct from o->>'status' or n->>'minutes' is distinct from o->>'minutes' or n->>'pay' is distinct from o->>'pay' or n->>'miles' is distinct from o->>'miles') then
      raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  return new;
end $function$
;
revoke all on function public.guard_record() from public, anon, authenticated, service_role;
grant execute on function public.guard_record() to authenticated;
grant execute on function public.guard_record() to service_role;

-- public.on_record_change  production md5 b2bc7ed7f908d857c9ecc392f8af7516
CREATE OR REPLACE FUNCTION public.on_record_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
      body := jsonb_build_object('to', new.data->>'to', 'msg', new.data->>'msg'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  else
    perform net.http_post(url := base || '/trello',
      body := jsonb_build_object('card', new.data->>'trello', 'stage', new.data->>'stage', 'phase', new.data->>'phase'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  return new;
end $function$
;
revoke all on function public.on_record_change() from public, anon, authenticated, service_role;
grant execute on function public.on_record_change() to service_role;

-- ===== 4. grants changed by forward section 7 =====
revoke all on function public.guard_emphr() from public, anon, authenticated, service_role;
grant execute on function public.guard_emphr() to authenticated;
grant execute on function public.guard_emphr() to service_role;
revoke all on function public.guard_fields() from public, anon, authenticated, service_role;
grant execute on function public.guard_fields() to authenticated;
grant execute on function public.guard_fields() to service_role;
revoke all on function public.lock_record_key() from public, anon, authenticated, service_role;
grant execute on function public.lock_record_key() to authenticated;
grant execute on function public.lock_record_key() to service_role;

-- ===== 5. policies changed by forward section 9 =====
alter policy "members claim" on public.stock_applied to public;
alter policy "members read" on public.stock_applied to public;
commit;

/* VERIFY after rollback:
with expected(fn, md5) as (values
  ('public.guard_stock_qty', 'e31a9911b0528bedf86b45cbb8044182'),
  ('public.can_see2', 'aa53dfbb0ad9c9eaf3a68203e7987845'),
  ('public.save_records', '892f72335b324484fc2462262e330edc'),
  ('public.apply_stock_txn', '57e62d9153bc5b8a20251c2d7c3c715b'),
  ('public.meeting_reminders', 'f4b3ce911acd91a4dc7b1fcce7d319d2'),
  ('public.stamp_record', 'fd26da214f812c0a351e541ce6179534'),
  ('public.guard_record', '4facfb796ad83fcb89c1d5c996e6b22f'),
  ('public.on_record_change', 'b2bc7ed7f908d857c9ecc392f8af7516'))
select e.fn, e.md5 = md5(pg_get_functiondef(to_regproc(e.fn))) as ok from expected e order by 1;
-- trigger records_guard_emphr expected md5 a5c029d11299f75374ab834cda570037; records_guard_emphr2/emppay/punch/zz_notify_assign tgenabled = 'D'
*/
