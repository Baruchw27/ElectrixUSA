-- PAYROLL agent rollback (staging rkkxykdkjgdsgkujanau). Restores the definitions that were in place before
-- fix_payroll_forward.sql (identical to production on 2026-10-28, verified by md5 of pg_get_functiondef).

begin;

-- new objects
select cron.unschedule('punch-tick') where exists (select 1 from cron.job where jobname = 'punch-tick');
drop function if exists private.punch_tick();
drop trigger if exists records_guard_fixes on public.records;
drop function if exists public.guard_fixes();

-- test flag set on the staging "Yossi" (u2)
update public.records set data = data - 'approveTO' where coll = 'emps' and id = 'u2';

CREATE OR REPLACE FUNCTION public.guard_emp_pay()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; oldv jsonb;
begin
  if current_user not in ('authenticated', 'anon') or auth.uid() is null then return new; end if;
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  oldv := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data->'clock' end;
  if coalesce(new.data->'clock', 'true'::jsonb) = coalesce(oldv, 'true'::jsonb) then return new; end if;
  me := public.my_emp_data();
  if me->>'role' = 'owner' or coalesce((me->>'all')::boolean, false) or (me->>'role' = 'office' and me->>'title' = 'Payroll') then return new; end if;
  new.data := (new.data - 'clock') || case when oldv is not null then jsonb_build_object('clock', oldv) else '{}'::jsonb end;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.travel_checked(n jsonb, rid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s jsonb; d date; mins numeric; pay numeric; rate numeric; tmin numeric;
        today date := (now() at time zone 'America/New_York')::date;
begin
  begin d := (n->>'date')::date; exception when others then d := null; end;
  if d is null or coalesce(n->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or d < today - 3 or d > today + 1 then
    raise exception 'travel date out of range' using errcode = '42501'; end if;
  if exists (select 1 from public.records x where x.coll = 'travel' and not x.deleted and x.id <> rid
              and x.data->>'who' = n->>'who' and x.data->>'site' = n->>'site' and x.data->>'date' = n->>'date') then
    raise exception 'travel already logged for this job that day' using errcode = '42501'; end if;
  select r.data into s from public.records r where r.coll = 'sites' and r.id = n->>'site' and not r.deleted;
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'unknown job' using errcode = '42501'; end if;
  if jsonb_typeof(s->'trip') = 'object' and public._num(s->'trip'->>'min') is not null then
    mins := round(public._num(s->'trip'->>'min'));
  else
    mins := least(greatest(coalesce(public._num(n->>'minutes'), 0), 0), 240);
  end if;
  if coalesce(s->>'travelPay','') <> '' and public._num(s->>'travelPay') is not null then
    pay := public._num(s->>'travelPay');
  else
    tmin := coalesce((select coalesce(public._num(r.data->>'v'), public._num(r.data #>> '{}')) from public.records r where r.coll = '_' and r.id = 'travelMin' and not r.deleted), 25);
    if mins <= tmin then raise exception 'local job: no travel pay' using errcode = '42501'; end if;
    rate := coalesce((select coalesce(public._num(r.data->>'v'), public._num(r.data #>> '{}')) from public.records r where r.coll = '_' and r.id = 'travelRate' and not r.deleted), 0);
    pay := round(rate * mins / 60, 2);
  end if;
  return n || jsonb_build_object('minutes', mins::float8, 'pay', pay::float8, 'auto', true, 'status', 'approved');   -- plain numbers, like the app writes
end $function$;

CREATE OR REPLACE FUNCTION public.guard_punch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; role text; owner boolean; payroll boolean; clockok boolean; o jsonb; n jsonb := new.data;
        nowms bigint := (extract(epoch from now()) * 1000)::bigint; hist jsonb; late boolean; why text;
        chg boolean; LATE_MS constant bigint := 30 * 60000;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  if jsonb_typeof(n) <> 'object' then return new; end if;
  me := public.my_emp_data(); if me = '{}'::jsonb then return new; end if;
  role := coalesce(me->>'role',''); owner := role = 'owner';
  payroll := role = 'office' and me->>'title' = 'Payroll';
  clockok := owner or payroll;
  o := case when tg_op = 'UPDATE' and jsonb_typeof(old.data) = 'object' then old.data end;
  n := (n - 'hist' - 'lateEntry')
       || case when o ? 'lateEntry' then jsonb_build_object('lateEntry', o->'lateEntry') else '{}'::jsonb end;
  hist := case when coalesce(jsonb_typeof(o->'hist'),'') = 'array' then o->'hist' else '[]'::jsonb end;

  if new.deleted then
    if tg_op = 'UPDATE' and old.deleted then new.data := old.data; return new; end if;
    if not clockok then raise exception 'only the owner or Payroll can remove a clock entry' using errcode = '42501'; end if;
    new.data := coalesce(o, n) || jsonb_build_object('deletedBy', me->>'id', 'deletedAt', nowms,
                 'hist', hist || jsonb_build_array(jsonb_build_object('act','deleted','by',me->>'id','at',nowms)));
    return new;
  end if;

  if o is null or old.deleted then
    late := coalesce(public._num(n->>'in'), nowms) < nowms - LATE_MS;
    if n->>'who' is distinct from me->>'id' and not clockok then
      raise exception 'only the owner or Payroll can add a clock entry for someone else' using errcode = '42501'; end if;
    if clockok and (n->>'who' is distinct from me->>'id' or o is not null) then
      why := private.last_why(n);
      if why is null then raise exception 'a reason is required for a clock entry added by the office' using errcode = '42501'; end if;
      hist := hist || jsonb_build_array(jsonb_build_object('act', case when o is null then 'added' else 'restored' end,'by',me->>'id','at',nowms,
                 'in',n->'in','out',n->'out','who',n->'who','why',why));
    elsif late then
      n := n || jsonb_build_object('pending', true,
             'lateEntry', jsonb_build_object('srvIn', nowms, 'in', n->'in', 'out', n->'out', 'site', n->'site', 'by', me->>'id'));
      hist := hist || jsonb_build_array(jsonb_build_object('act','late','by',me->>'id','at',nowms,'in',n->'in','out',n->'out',
                 'minutesLate', round((nowms - public._num(n->>'in')) / 60000.0)));
    else
      hist := hist || jsonb_build_array(jsonb_build_object('act','created','by',me->>'id','at',nowms,'in',n->'in'));
    end if;
    new.data := n || jsonb_build_object('hist', hist);
    return new;
  end if;

  -- A5b close: only Owner/Payroll end someone else's open clock entry (a manager's "not approved" answer to a
  -- "clock me in" request ends it at its own start and is the one exception)
  if coalesce(o->'out','null'::jsonb) = 'null'::jsonb and coalesce(n->'out','null'::jsonb) <> 'null'::jsonb
     and o->>'who' is distinct from me->>'id' and not clockok
     and not (coalesce(o->'pending' = 'true'::jsonb, false) and n->'out' = n->'in') then
    raise exception 'only the owner or Payroll can clock someone else out' using errcode = '42501'; end if;
  if not private.edits_prefix_kept(o->'edits', n->'edits') then
    raise exception 'the change history of a clock entry cannot be rewritten' using errcode = '42501'; end if;
  chg := n->'in' is distinct from o->'in' or n->'who' is distinct from o->'who' or n->'site' is distinct from o->'site'
      or (coalesce(o->'out','null'::jsonb) <> 'null'::jsonb and n->'out' is distinct from o->'out')
      or n->'voided' is distinct from o->'voided'
      or not private.punch_breaks_kept(o, n);
  if chg then
    if not clockok then raise exception 'only the owner or Payroll can change clock times' using errcode = '42501'; end if;
    why := private.last_why(n);
    if why is null or private.arr_len(n->'edits') <= private.arr_len(o->'edits') then
      raise exception 'a reason is required to change clock times' using errcode = '42501'; end if;
    hist := hist || jsonb_build_array(jsonb_build_object('act', case when n ? 'voided' and not (o ? 'voided') then 'voided'
                                                               when o ? 'voided' and not (n ? 'voided') then 'unvoided' else 'edited' end,
              'by',me->>'id','at',nowms,'why',why,
              'from',jsonb_build_object('in',o->'in','out',o->'out','who',o->'who','site',o->'site'),
              'to',jsonb_build_object('in',n->'in','out',n->'out','who',n->'who','site',n->'site')));
  end if;
  if coalesce((o->'pending' = 'true'::jsonb),false) and not coalesce((n->'pending' = 'true'::jsonb),false) then
    if o ? 'lateEntry' then
      if not clockok then raise exception 'only Payroll can approve a late clock entry' using errcode = '42501'; end if;
      if o->>'who' = me->>'id' and not owner then raise exception 'someone else must approve your own clock entry' using errcode = '42501'; end if;
      if coalesce((n->'rejected' = 'true'::jsonb),false) and length(trim(coalesce(n->>'rejectWhy',''))) < 3 then
        raise exception 'a reason is required to reject a clock entry' using errcode = '42501'; end if;
    end if;
    hist := hist || jsonb_build_array(jsonb_build_object('act', case when coalesce((n->'rejected' = 'true'::jsonb),false) then 'rejected' else 'approved' end,
              'by',me->>'id','at',nowms,'why',nullif(trim(coalesce(n->>'rejectWhy','')),'')));
  end if;
  if o ? 'lateEntry' and not clockok and (n->'rejected' is distinct from o->'rejected' or n->'approvedBy' is distinct from o->'approvedBy') then
    raise exception 'only Payroll can approve a late clock entry' using errcode = '42501'; end if;
  new.data := n || jsonb_build_object('hist', hist);
  return new;
end $function$;

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
  -- A2 punches: server receive time, set once, never changed by a phone
  if new.coll = 'punches' and jsonb_typeof(n) = 'object' then
    if tg_op = 'INSERT' or old.deleted then new.data := (n - 'srvIn') || jsonb_build_object('srvIn', nowms);
    else new.data := (n - 'srvIn') || case when jsonb_typeof(o) = 'object' and o ? 'srvIn' then jsonb_build_object('srvIn', o->'srvIn') else '{}'::jsonb end; end if;
    n := new.data;
  end if;
  -- A5b keep: fields set by the server or by Payroll survive a phone re-sending an older whole copy
  if new.coll = 'punches' and tg_op = 'UPDATE' and jsonb_typeof(o) = 'object' and jsonb_typeof(n) = 'object'
     and not (role = 'owner' or (role = 'office' and me->>'title' = 'Payroll')) then
    n := n || coalesce((select jsonb_object_agg(k, o->k) from unnest(array['pending','approvedBy','rejected','rejectWhy']) k where o ? k and not n ? k), '{}'::jsonb);
    new.data := n;
  end if;
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
  if new.coll = 'orr' then
    if not (boss or (office and coalesce(me->>'title','') <> 'Accountant')) then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'sites' then
    if not (boss or office) and (new.deleted
         or n->'lat' is distinct from o->'lat' or n->'lng' is distinct from o->'lng' or n->'rad' is distinct from o->'rad'
         or n->'fenceOk' is distinct from o->'fenceOk' or n->'trip' is distinct from o->'trip'
         or n->'travelPay' is distinct from o->'travelPay') then
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
    if tg_op = 'UPDATE' and old.deleted then raise exception 'only Payroll can bring back a deleted clock entry' using errcode = '42501'; end if;
    if o is not null and not private.punch_breaks_kept(o, n) then raise exception 'breaks can only be changed by Payroll' using errcode = '42501'; end if;
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
  elsif new.coll = 'timeoff' and boss and coalesce(n->>'who', o->>'who') = me->>'id'
        and o is not null and n->>'status' is distinct from o->>'status' and n->>'status' in ('approved','denied') then
    raise exception 'your own time off is approved by the owner' using errcode = '42501';
  elsif new.coll = 'timeoff' and not boss then
    if (o is null and coalesce(n->>'status','pending') <> 'pending')
       or (o is not null and n->>'status' is distinct from o->>'status' and n->>'status' <> 'cancelled')
       or (o is not null and coalesce(o->>'status','pending') <> 'pending' and (n - 'status' - 'seen' - 'read') is distinct from (o - 'status' - 'seen' - 'read')) then
      raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'exps' and not money then
    if coalesce((n->>'paid')::boolean,false) and not coalesce((o->>'paid')::boolean,false) then raise exception 'not allowed' using errcode = '42501'; end if;
    if n->>'paidBy' is distinct from o->>'paidBy' or n->>'paidAt' is distinct from o->>'paidAt' then raise exception 'not allowed' using errcode = '42501'; end if;
    if coalesce((o->>'paid')::boolean,false) and (n - 'seen' - 'read') is distinct from (o - 'seen' - 'read') then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'travel' and (not boss or coalesce(n->>'who', o->>'who') = me->>'id') then
    if o is null or old.deleted then new.data := private.travel_checked(n, new.id); n := new.data; end if;
    if o is not null and (n->>'status' is distinct from o->>'status' or n->>'minutes' is distinct from o->>'minutes' or n->>'pay' is distinct from o->>'pay' or n->>'miles' is distinct from o->>'miles') then
      raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  return new;
end $function$;

commit;
-- M15 follow-up: nothing to roll back (no SQL change).
-- R3/R4 follow-up: covered by the guard_punch / travel_checked definitions above (restores pre-fix versions).
