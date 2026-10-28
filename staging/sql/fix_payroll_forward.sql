-- PAYROLL agent — audit fixes C01 C02 C05 C07 C08 C09 C10 C11 H36 H40 M18 A01 A18 (server side)
-- Apply to STAGING (rkkxykdkjgdsgkujanau) only. Rollback: fix_payroll_rollback.sql
-- Rules (Baruch): only owner + office title 'Payroll' approve blocked/late punches, change hours, change GPS fences;
-- travel = one bonus per worker per day at the first clock-in, round trip; time-off approvers = owner + approveTO flag.

begin;

-- ───────────── guard_punch: C01 fence check, C02 lunch/run times, C05 overlap, C08 server clock, A01 one open entry, M18 clock off ─────────────
CREATE OR REPLACE FUNCTION public.guard_punch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; role text; owner boolean; payroll boolean; clockok boolean; o jsonb; n jsonb := new.data;
        nowms bigint := (extract(epoch from now()) * 1000)::bigint; hist jsonb; late boolean; why text;
        chg boolean; LATE_MS constant bigint := 10 * 60000; WIN constant bigint := 10 * 60000; STALE constant bigint := 14 * 3600000;
        flag text := null; detail jsonb := '{}'::jsonb; s jsonb; dist numeric; slack numeric; e jsonb;
        nin numeric; nout numeric; ov record; ob jsonb; nb jsonb; ot jsonb; nt jsonb; counted boolean;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  if jsonb_typeof(n) <> 'object' then return new; end if;
  me := public.my_emp_data(); if me = '{}'::jsonb then return new; end if;
  role := coalesce(me->>'role',''); owner := role = 'owner';
  payroll := role = 'office' and me->>'title' = 'Payroll';
  clockok := owner or payroll;
  o := case when tg_op = 'UPDATE' and jsonb_typeof(old.data) = 'object' then old.data end;
  -- server-owned fields: never taken from a phone
  n := (n - 'hist' - 'lateEntry' - 'srvOut' - 'outSrc')
       || coalesce((select jsonb_object_agg(k, o->k) from unnest(array['lateEntry','srvOut','outSrc']) k where o ? k), '{}'::jsonb);
  hist := case when coalesce(jsonb_typeof(o->'hist'),'') = 'array' then o->'hist' else '[]'::jsonb end;

  if new.deleted then
    if tg_op = 'UPDATE' and old.deleted then new.data := old.data; return new; end if;
    if not clockok then raise exception 'only the owner or Payroll can remove a clock entry' using errcode = '42501'; end if;
    new.data := coalesce(o, n) || jsonb_build_object('deletedBy', me->>'id', 'deletedAt', nowms,
                 'hist', hist || jsonb_build_array(jsonb_build_object('act','deleted','by',me->>'id','at',nowms)));
    return new;
  end if;

  if o is null or old.deleted then
    if n->>'who' is distinct from me->>'id' and not clockok then
      raise exception 'only the owner or Payroll can add a clock entry for someone else' using errcode = '42501'; end if;
    if clockok and (n->>'who' is distinct from me->>'id' or o is not null) then
      why := private.last_why(n);
      if why is null then raise exception 'a reason is required for a clock entry added by the office' using errcode = '42501'; end if;
      hist := hist || jsonb_build_array(jsonb_build_object('act', case when o is null then 'added' else 'restored' end,'by',me->>'id','at',nowms,
                 'in',n->'in','out',n->'out','who',n->'who','why',why));
    else
      -- M18: people whose time clock is turned off cannot clock in
      if exists (select 1 from public.records x where x.coll = 'emps' and x.id = me->>'id' and not x.deleted and x.data->'clock' = 'false'::jsonb) then
        raise exception 'your time clock is turned off — ask the office' using errcode = '42501'; end if;
      late := coalesce(public._num(n->>'in'), nowms) < nowms - LATE_MS;
      -- a site switch starts at the moment he left the last job (charged to the job he is going to)
      if late and coalesce(n->'transfer' = 'true'::jsonb, false) and exists (
           select 1 from public.records x where x.coll = 'punches' and not x.deleted and x.id <> new.id and x.data->>'who' = me->>'id'
             and x.data->'out' = n->'in' and x.data->>'outSrc' = 'away' and public._num(x.data->>'srvOut') >= nowms - WIN) then
        late := false; end if;
      if coalesce(n->'semi' = 'true'::jsonb, false) then
        n := n || '{"pending":true}'::jsonb;   -- "ask the office to clock me in": always waits for Payroll
        hist := hist || jsonb_build_array(jsonb_build_object('act','semi','by',me->>'id','at',nowms,'in',n->'in'));
      elsif late then
        flag := 'late';
      else
        -- C01: the server checks the GPS point against the job's fence (phone accuracy in metres, at most 150 ft of slack)
        select r.data into s from public.records r where r.coll = 'sites' and r.id = n->>'site' and not r.deleted;
        if s is null or public._num(s->>'lat') is null or public._num(s->>'lng') is null
           or public._num(n->>'lat') is null or public._num(n->>'lng') is null then
          flag := 'geo'; detail := jsonb_build_object('why', case when s is null or public._num(s->>'lat') is null then 'job has no fence' else 'no GPS point sent' end);
        else
          dist := 2 * 20902231 * asin(sqrt(power(sin(radians(public._num(s->>'lat') - public._num(n->>'lat')) / 2), 2)
                  + cos(radians(public._num(n->>'lat'))) * cos(radians(public._num(s->>'lat')))
                  * power(sin(radians(public._num(s->>'lng') - public._num(n->>'lng')) / 2), 2)));
          slack := coalesce(public._num(s->>'rad'), 300) + least(coalesce(public._num(n->>'acc') * 3.281, 150), 150);
          if dist > slack then flag := 'geo'; detail := jsonb_build_object('dist', round(dist), 'allowed', round(slack)); end if;
        end if;
      end if;
      if flag is null and not coalesce(n->'semi' = 'true'::jsonb, false) then
        hist := hist || jsonb_build_array(jsonb_build_object('act','created','by',me->>'id','at',nowms,'in',n->'in'));
      end if;
    end if;
  else
    -- R3: the waiting / approval fields of a stored entry are Payroll's. A phone re-sending an older whole copy (retry after a
    -- timeout, photo upload retry) must not undo an approval; a NEW problem found below still makes it wait again.
    if not clockok then
      n := (n - 'pending' - 'approvedBy' - 'approvedAt' - 'rejected' - 'rejectWhy')
           || coalesce((select jsonb_object_agg(k, o->k) from unnest(array['pending','approvedBy','approvedAt','rejected','rejectWhy']) k where o ? k), '{}'::jsonb);
    end if;
    -- A5b close: only Owner/Payroll end someone else's open clock entry (Payroll's "not approved" answer to a
    -- "clock me in" request ends it at its own start)
    if coalesce(o->'out','null'::jsonb) = 'null'::jsonb and coalesce(n->'out','null'::jsonb) <> 'null'::jsonb
       and o->>'who' is distinct from me->>'id' and not clockok then
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
    if not clockok then
      ob := case when jsonb_typeof(o->'breaks') = 'array' then o->'breaks' else '[]'::jsonb end;
      nb := case when jsonb_typeof(n->'breaks') = 'array' then n->'breaks' else '[]'::jsonb end;
      ot := case when jsonb_typeof(o->'trips') = 'array' then o->'trips' else '[]'::jsonb end;
      nt := case when jsonb_typeof(n->'trips') = 'array' then n->'trips' else '[]'::jsonb end;
      if coalesce(o->'out','null'::jsonb) <> 'null'::jsonb then
        -- C02: a finished clock entry's lunch and material runs are final (Payroll corrects them)
        if nb is distinct from ob or nt is distinct from ot then
          raise exception 'lunch and material runs of a finished clock entry can only be changed by Payroll' using errcode = '42501'; end if;
      else
        -- C02/C08: lunch / leaving-the-site times must be "now" by the server clock; anything else goes to Payroll
        if public._num(n->>'breakStart') is not null and n->'breakStart' is distinct from o->'breakStart'
           and abs(public._num(n->>'breakStart') - nowms) > WIN then flag := 'breaks'; end if;
        if public._num(n->>'away') is not null and n->'away' is distinct from o->'away'
           and abs(public._num(n->>'away') - nowms) > WIN then flag := 'breaks'; end if;
        for e in select x from jsonb_array_elements(nb) x where not ob @> jsonb_build_array(x) loop
          if not (abs(coalesce(public._num(e->>'e'), 0) - nowms) <= WIN
                  and (e->'s' = o->'breakStart' or abs(coalesce(public._num(e->>'s'), 0) - nowms) <= WIN)) then flag := 'breaks'; end if;
        end loop;
        for e in select x from jsonb_array_elements(nt) x where not ot @> jsonb_build_array(x) loop
          if not (abs(coalesce(public._num(e->>'back'), 0) - nowms) <= WIN
                  and (e->'left' = o->'away' or abs(coalesce(public._num(e->>'left'), 0) - nowms) <= WIN)) then flag := 'breaks'; end if;
        end loop;
        -- C08 clock-out: server receive time is kept; a clock-out time far from it goes to Payroll
        if coalesce(n->'out','null'::jsonb) <> 'null'::jsonb then
          n := n || jsonb_build_object('srvOut', nowms);
          if n->'out' = o->'away' then n := n || jsonb_build_object('outSrc', 'away');
          elsif abs(public._num(n->>'out') - nowms) > WIN then flag := 'out';
          elsif public._num(o->>'in') < nowms - STALE then flag := 'out'; detail := jsonb_build_object('why', 'forgot to punch out — Payroll sets the real time'); end if;
        end if;
      end if;
    elsif coalesce(o->'out','null'::jsonb) = 'null'::jsonb and coalesce(n->'out','null'::jsonb) <> 'null'::jsonb then
      n := n || jsonb_build_object('srvOut', nowms);
    end if;
    if coalesce((o->'pending' = 'true'::jsonb),false) and not coalesce((n->'pending' = 'true'::jsonb),false) then
      -- C07: every waiting entry (late, off the fence, "clock me in") is approved by the owner or Payroll only
      if not clockok then raise exception 'only Payroll can approve a waiting clock entry' using errcode = '42501'; end if;
      if o->>'who' = me->>'id' and not owner then raise exception 'someone else must approve your own clock entry' using errcode = '42501'; end if;
      if coalesce((n->'rejected' = 'true'::jsonb),false) and length(trim(coalesce(n->>'rejectWhy',''))) < 3 then
        raise exception 'a reason is required to reject a clock entry' using errcode = '42501'; end if;
      hist := hist || jsonb_build_array(jsonb_build_object('act', case when coalesce((n->'rejected' = 'true'::jsonb),false) then 'rejected' else 'approved' end,
                'by',me->>'id','at',nowms,'why',nullif(trim(coalesce(n->>'rejectWhy','')),'')));
    end if;
    if not clockok and (n->'rejected' is distinct from o->'rejected' or n->'approvedBy' is distinct from o->'approvedBy') then
      raise exception 'only Payroll can approve a waiting clock entry' using errcode = '42501'; end if;
  end if;

  -- a check failed: keep the entry, but it waits for Payroll and is not paid until approved
  if flag is not null then
    n := n || jsonb_build_object('pending', true,
           'lateEntry', case when jsonb_typeof(n->'lateEntry') = 'object' then (n->'lateEntry') || jsonb_build_object('also', flag, 'alsoAt', nowms) || detail
                             else jsonb_build_object('kind', flag, 'srvIn', nowms, 'in', n->'in', 'out', n->'out', 'site', n->'site', 'by', me->>'id') || detail end);
    hist := hist || jsonb_build_array(jsonb_build_object('act', case when flag = 'late' then 'late' else 'flag' end, 'kind', flag, 'by', me->>'id', 'at', nowms,
               'in', n->'in', 'out', n->'out', 'minutesLate', case when flag = 'late' then round((nowms - public._num(n->>'in')) / 60000.0) end) || detail);
  end if;

  -- A01: one open clock entry per person
  if coalesce(n->'out','null'::jsonb) = 'null'::jsonb and (o is null or old.deleted or coalesce(o->'out','null'::jsonb) <> 'null'::jsonb)
     and exists (select 1 from public.records x where x.coll = 'punches' and not x.deleted and x.id <> new.id
                   and x.data->>'who' = n->>'who' and coalesce(x.data->'out','null'::jsonb) = 'null'::jsonb
                   and coalesce(x.data->'voided','null'::jsonb) = 'null'::jsonb and not coalesce(x.data->'rejected' = 'true'::jsonb, false)
                   and public._num(x.data->>'in') >= nowms - STALE) then   -- a forgotten entry (open > 14 h) is left to Payroll, it does not block
    raise exception 'already clocked in — punch out of the open entry first' using errcode = '42501'; end if;

  -- C05: no two paid clock entries of one person may overlap (Payroll can override with a reason: overlapOk)
  -- an entry waiting for Payroll is not paid, so it is checked when Payroll approves it
  counted := coalesce(n->'voided','null'::jsonb) = 'null'::jsonb and not coalesce(n->'rejected' = 'true'::jsonb, false)
             and not coalesce(n->'pending' = 'true'::jsonb, false) and public._num(n->>'in') is not null;
  if counted and (o is null or old.deleted or n->'in' is distinct from o->'in' or n->'out' is distinct from o->'out' or n->'who' is distinct from o->'who'
                  or n->'voided' is distinct from o->'voided' or n->'rejected' is distinct from o->'rejected' or n->'pending' is distinct from o->'pending') then
    nin := public._num(n->>'in'); nout := coalesce(public._num(n->>'out'), greatest(nowms, nin));
    select x.id, public._num(x.data->>'in') xin, public._num(x.data->>'out') xout into ov from public.records x
     where x.coll = 'punches' and not x.deleted and x.id <> new.id and x.data->>'who' = n->>'who'
       and coalesce(x.data->'voided','null'::jsonb) = 'null'::jsonb and not coalesce(x.data->'rejected' = 'true'::jsonb, false)
       and not coalesce(x.data->'pending' = 'true'::jsonb, false)
       and public._num(x.data->>'in') < nout
       and coalesce(public._num(x.data->>'out'), case when public._num(x.data->>'in') < nowms - STALE then public._num(x.data->>'in') else nowms end) > nin
     limit 1;
    if found then
      if clockok and coalesce(n->'overlapOk' = 'true'::jsonb, false) and private.last_why(n) is not null then
        hist := hist || jsonb_build_array(jsonb_build_object('act','overlapOk','by',me->>'id','at',nowms,'with',ov.id,'why',private.last_why(n)));
      else
        raise exception 'this clock entry overlaps another one (% – %) — shorten or remove that one first',
          to_char(to_timestamp(ov.xin / 1000.0) at time zone 'America/New_York', 'Mon DD HH12:MI AM'),
          coalesce(to_char(to_timestamp(ov.xout / 1000.0) at time zone 'America/New_York', 'HH12:MI AM'), 'still open') using errcode = '42501';
      end if;
    end if;
  end if;

  new.data := n || jsonb_build_object('hist', hist);
  return new;
end $function$;

-- ───────────── guard_record: C07 (approvals, hours, fences = owner/Payroll title), C09 travel, H40 time-off approvers ─────────────
CREATE OR REPLACE FUNCTION public.guard_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; role text; boss boolean; office boolean; payroll boolean; money boolean; hours boolean; approver boolean; material boolean;
        approve_to boolean;
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
    n := n || coalesce((select jsonb_object_agg(k, o->k) from unnest(array['pending','approvedBy','rejected','rejectWhy','missingOut','missingAt']) k where o ? k and not n ? k), '{}'::jsonb);
    new.data := n;
  end if;
  if role = 'owner' then return new; end if;
  boss := public.is_boss();
  office := role = 'office';
  payroll := office and me->>'title' = 'Payroll';
  material := office and me->>'title' = 'Material';
  money := coalesce((me->>'all')::boolean,false) or (office and me->>'title' in ('Payroll','Bookkeeper'));
  -- C07: hours, approvals and fences belong to the owner and Payroll (by title — the "all" switch does not give it)
  hours := payroll;
  approver := payroll;
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
    if new.deleted and not (boss or office) then raise exception 'not allowed' using errcode = '42501'; end if;
    -- C07: the GPS fence and travel amounts are set by the owner or Payroll (a new job may start without a fence)
    if not payroll and (
         (o is null and (coalesce(n->'lat','null'::jsonb) <> 'null'::jsonb or coalesce(n->'lng','null'::jsonb) <> 'null'::jsonb
                         or coalesce(n->'fenceOk','null'::jsonb) not in ('null'::jsonb, 'false'::jsonb)
                         or coalesce(n->'trip','null'::jsonb) <> 'null'::jsonb or coalesce(n->'travelPay','null'::jsonb) not in ('null'::jsonb, '""'::jsonb)))
      or (o is not null and (n->'lat' is distinct from o->'lat' or n->'lng' is distinct from o->'lng' or n->'rad' is distinct from o->'rad'
                         or n->'fenceOk' is distinct from o->'fenceOk' or n->'trip' is distinct from o->'trip'
                         or n->'travelPay' is distinct from o->'travelPay'))) then
      raise exception 'only the owner or Payroll can change the GPS fence or travel pay' using errcode = '42501'; end if;
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
  -- H40: time off is approved by the owner and by people with the approveTO flag (Yossi) — not by any boss
  approve_to := new.coll = 'timeoff' and exists (select 1 from public.records x where x.coll = 'emps' and x.id = me->>'id' and not x.deleted
                                                  and x.data->'approveTO' = 'true'::jsonb);
  if new.coll = 'punches' and not hours then
    if tg_op = 'UPDATE' and old.deleted then raise exception 'only Payroll can bring back a deleted clock entry' using errcode = '42501'; end if;
    if o is not null and not private.punch_breaks_kept(o, n) then raise exception 'breaks can only be changed by Payroll' using errcode = '42501'; end if;
    if o is null and (public._num(n->>'in') is null or public._num(n->>'in') > nowms + 300000 or public._num(n->>'in') < nowms - 3*86400000
                      or (n->'out' is not null and n->'out' <> 'null'::jsonb and (public._num(n->>'out') < public._num(n->>'in') or public._num(n->>'out') > nowms + 300000))) then
      raise exception 'clock time out of range' using errcode = '42501'; end if;
    if coalesce(n->>'approvedBy','') <> coalesce(o->>'approvedBy','')
       or (coalesce((o->>'pending')::boolean,false) and not coalesce((n->>'pending')::boolean,false)) then
      if not approver or o is null or o->>'who' = me->>'id' or (n->>'approvedBy' is distinct from me->>'id' and coalesce(n->>'approvedBy','') <> '') then
        raise exception 'only Payroll can approve a waiting clock entry' using errcode = '42501'; end if;
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
  elsif new.coll = 'timeoff' and coalesce(n->>'who', o->>'who') = me->>'id'
        and o is not null and n->>'status' is distinct from o->>'status' and n->>'status' in ('approved','denied') then
    raise exception 'your own time off is approved by the owner' using errcode = '42501';
  elsif new.coll = 'timeoff' and not approve_to then
    if (o is null and coalesce(n->>'status','pending') <> 'pending')
       or (o is not null and n->>'status' is distinct from o->>'status' and n->>'status' <> 'cancelled')
       or (o is not null and n->>'status' = 'cancelled' and n->>'status' is distinct from o->>'status'
           and (coalesce(o->>'status','pending') not in ('pending','approved') or coalesce(n->>'who', o->>'who') is distinct from me->>'id'))
       or (o is not null and coalesce(o->>'status','pending') <> 'pending' and (n - 'status' - 'seen' - 'read' - 'cancelledAt') is distinct from (o - 'status' - 'seen' - 'read' - 'cancelledAt')) then
      raise exception 'only Baruch or Yossi can approve time off' using errcode = '42501'; end if;
  elsif new.coll = 'exps' and not money then
    if coalesce((n->>'paid')::boolean,false) and not coalesce((o->>'paid')::boolean,false) then raise exception 'not allowed' using errcode = '42501'; end if;
    if n->>'paidBy' is distinct from o->>'paidBy' or n->>'paidAt' is distinct from o->>'paidAt' then raise exception 'not allowed' using errcode = '42501'; end if;
    if coalesce((o->>'paid')::boolean,false) and (n - 'seen' - 'read') is distinct from (o - 'seen' - 'read') then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'travel' and (not payroll or coalesce(n->>'who', o->>'who') = me->>'id') then
    -- C09: everyone except the owner and Payroll gets the server's own travel amount
    if o is null or old.deleted then new.data := private.travel_checked(n, new.id); n := new.data; end if;
    if o is not null and (n->>'status' is distinct from o->>'status' or n->>'minutes' is distinct from o->>'minutes' or n->>'pay' is distinct from o->>'pay'
                          or n->>'miles' is distinct from o->>'miles' or n->>'site' is distinct from o->>'site' or n->>'date' is distinct from o->>'date') then
      raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  return new;
end $function$;

-- ───────────── travel_checked: C09 server amount, C10 one bonus per worker per day at the first clock-in, round trip ─────────────
CREATE OR REPLACE FUNCTION private.travel_checked(n jsonb, rid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s jsonb; d date; one numeric; mins numeric; pay numeric; rate numeric; tmin numeric; fp jsonb;
        today date := (now() at time zone 'America/New_York')::date;
begin
  begin d := (n->>'date')::date; exception when others then d := null; end;
  if d is null or coalesce(n->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or d < today - 3 or d > today + 1 then
    raise exception 'travel date out of range' using errcode = '42501'; end if;
  select r.data into s from public.records r where r.coll = 'sites' and r.id = n->>'site' and not r.deleted;
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'unknown job' using errcode = '42501'; end if;
  -- earned at the first clock-in of that day, for the job he went to
  select x.data into fp from public.records x
   where x.coll = 'punches' and not x.deleted and x.data->>'who' = n->>'who'
     and coalesce(x.data->'voided','null'::jsonb) = 'null'::jsonb and not coalesce(x.data->'rejected' = 'true'::jsonb, false)
     and public._num(x.data->>'in') is not null
     and to_char(to_timestamp(public._num(x.data->>'in') / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD') = n->>'date'
   order by public._num(x.data->>'in') limit 1;
  if fp is null then raise exception 'no clock-in that day — no travel pay' using errcode = '42501'; end if;
  -- R4: phones still on the old app log travel on every job switch / again the same day. Those are kept for the record but
  -- pay nothing (status 'ignored'), so the worker sees no error and nothing is paid twice.
  if exists (select 1 from public.records x where x.coll = 'travel' and not x.deleted and x.id <> rid
              and x.data->>'who' = n->>'who' and x.data->>'date' = n->>'date' and coalesce(x.data->>'status','') <> 'ignored') then
    return n || jsonb_build_object('minutes', 0, 'pay', 0, 'auto', true, 'status', 'ignored', 'why', 'one travel bonus per day');
  end if;
  if fp->>'site' is distinct from n->>'site' or coalesce(fp->'transfer' = 'true'::jsonb, false) then
    return n || jsonb_build_object('minutes', 0, 'pay', 0, 'auto', true, 'status', 'ignored', 'why', 'not the first job of the day');
  end if;
  if jsonb_typeof(s->'trip') = 'object' and public._num(s->'trip'->>'min') is not null then
    one := round(public._num(s->'trip'->>'min'));
  end if;
  if coalesce(s->>'travelPay','') <> '' and public._num(s->>'travelPay') is not null then
    pay := public._num(s->>'travelPay'); mins := coalesce(2 * one, 0);
  else
    if one is null then raise exception 'no drive time for this job yet — no travel pay' using errcode = '42501'; end if;
    tmin := coalesce((select coalesce(public._num(r.data->>'v'), public._num(r.data #>> '{}')) from public.records r where r.coll = '_' and r.id = 'travelMin' and not r.deleted), 25);
    if one <= tmin then raise exception 'local job: no travel pay' using errcode = '42501'; end if;
    rate := coalesce((select coalesce(public._num(r.data->>'v'), public._num(r.data #>> '{}')) from public.records r where r.coll = '_' and r.id = 'travelRate' and not r.deleted), 0);
    mins := 2 * one;                         -- the drive in and the drive back
    pay := round(rate * mins / 60, 2);
  end if;
  return n || jsonb_build_object('minutes', mins::float8, 'oneWay', one::float8, 'pay', pay::float8, 'auto', true, 'status', 'approved');
end $function$;

-- ───────────── guard_emp_pay: time-clock switch by owner/Payroll title; approveTO by the owner only ─────────────
CREATE OR REPLACE FUNCTION public.guard_emp_pay()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; o jsonb;
begin
  if current_user not in ('authenticated', 'anon') or auth.uid() is null then return new; end if;
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data else '{}'::jsonb end;
  if coalesce(new.data->'clock', 'true'::jsonb) = coalesce(o->'clock', 'true'::jsonb)
     and coalesce(new.data->'approveTO', 'false'::jsonb) = coalesce(o->'approveTO', 'false'::jsonb) then return new; end if;
  me := public.my_emp_data();
  if me->>'role' = 'owner' then return new; end if;
  if coalesce(new.data->'clock', 'true'::jsonb) <> coalesce(o->'clock', 'true'::jsonb)
     and not (me->>'role' = 'office' and me->>'title' = 'Payroll') then
    new.data := (new.data - 'clock') || case when o ? 'clock' then jsonb_build_object('clock', o->'clock') else '{}'::jsonb end;
  end if;
  if coalesce(new.data->'approveTO', 'false'::jsonb) <> coalesce(o->'approveTO', 'false'::jsonb) then
    new.data := (new.data - 'approveTO') || case when o ? 'approveTO' then jsonb_build_object('approveTO', o->'approveTO') else '{}'::jsonb end;
  end if;
  return new;
end $function$;

-- ───────────── guard_fixes (new): C11 + A18 — workers ask, Payroll decides, a request cannot change after it is sent ─────────────
CREATE OR REPLACE FUNCTION public.guard_fixes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; pr boolean; o jsonb; n jsonb := new.data; nowms bigint := (extract(epoch from now()) * 1000)::bigint;
        FIXED constant text[] := array['who','site','date','in','out','why','ts'];
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if me = '{}'::jsonb then raise exception 'not allowed' using errcode = '42501'; end if;
  pr := me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll');
  o := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data end;
  if new.deleted then
    if tg_op = 'UPDATE' and old.deleted then return new; end if;
    if not pr then raise exception 'only Payroll can remove a punch fix request' using errcode = '42501'; end if;
    return new;
  end if;
  if jsonb_typeof(n) <> 'object' then raise exception 'not allowed' using errcode = '42501'; end if;
  if o is null then
    if not pr and (n->>'who' is distinct from me->>'id' or coalesce(n->>'status','pending') <> 'pending'
                   or coalesce(n->>'by','') <> '' or coalesce(n->>'note','') <> '') then
      raise exception 'a punch fix request is sent as pending, for yourself' using errcode = '42501'; end if;
    new.data := n || jsonb_build_object('status', coalesce(n->>'status','pending'), 'srvAt', nowms);
    return new;
  end if;
  -- A18: what was asked for never changes after it is sent, so an approval always matches what Payroll saw
  if exists (select 1 from unnest(FIXED) k where n->k is distinct from o->k) then
    raise exception 'a punch fix request cannot be changed after it is sent — send a new one' using errcode = '42501'; end if;
  if n->>'status' is distinct from o->>'status' then
    if coalesce(o->>'status','pending') <> 'pending' then
      raise exception 'this punch fix request was already answered' using errcode = '42501'; end if;
    if n->>'status' in ('approved','denied') then
      if not pr then raise exception 'only Payroll can answer a punch fix request' using errcode = '42501'; end if;
      if o->>'who' = me->>'id' and me->>'role' <> 'owner' then raise exception 'someone else must answer your own punch fix request' using errcode = '42501'; end if;
      new.data := n || jsonb_build_object('by', me->>'id', 'at', nowms);
      return new;
    elsif n->>'status' = 'cancelled' then
      if o->>'who' is distinct from me->>'id' and not pr then raise exception 'not allowed' using errcode = '42501'; end if;
      return new;
    end if;
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not pr and (n - 'seen' - 'read') is distinct from (o - 'seen' - 'read') then
    raise exception 'not allowed' using errcode = '42501'; end if;
  if pr and (n->'by' is distinct from o->'by' or n->'at' is distinct from o->'at') then
    raise exception 'not allowed' using errcode = '42501'; end if;
  return new;
end $function$;

drop trigger if exists records_guard_fixes on public.records;
CREATE TRIGGER records_guard_fixes BEFORE INSERT OR UPDATE ON public.records
  FOR EACH ROW WHEN ((new.coll = 'fixes'::text)) EXECUTE FUNCTION guard_fixes();

-- ───────────── H36: server finishes "left the site" clock-outs and flags forgotten punch-outs (never invents a time) ─────────────
CREATE OR REPLACE FUNCTION private.punch_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; nowms bigint := (extract(epoch from now()) * 1000)::bigint; pay text[]; who text; msg text;
begin
  -- 1) left the site more than 60 minutes ago and never came back: the time he left is the punch-out (same as the phone does)
  update public.records set
      data = (data - 'away') || jsonb_build_object('out', data->'away', 'autoOut', true, 'outSrc', 'away', 'srvOut', nowms,
               'hist', (case when jsonb_typeof(data->'hist') = 'array' then data->'hist' else '[]'::jsonb end)
                       || jsonb_build_array(jsonb_build_object('act','autoOut','by','server','at',nowms,'out',data->'away'))),
      updated_by = 'server', updated_at = now()
   where coll = 'punches' and not deleted and coalesce(data->'out','null'::jsonb) = 'null'::jsonb
     and public._num(data->>'away') is not null and public._num(data->>'away') < nowms - 3600000;
  -- 2) open for more than 12 hours: mark it and tell the person and Payroll once
  select coalesce(array_agg(e.id), '{}') into pay from public.records e
   where e.coll = 'emps' and not e.deleted and not coalesce((e.data->>'inactive')::boolean, false)
     and (e.data->>'role' = 'owner' or (e.data->>'role' = 'office' and e.data->>'title' = 'Payroll'));
  for r in select id, data from public.records
            where coll = 'punches' and not deleted and coalesce(data->'out','null'::jsonb) = 'null'::jsonb
              and public._num(data->>'away') is null and coalesce(data->'voided','null'::jsonb) = 'null'::jsonb
              and public._num(data->>'in') < nowms - 12 * 3600000
              and not coalesce(data->'missingOut' = 'true'::jsonb, false) loop
    update public.records set data = data || jsonb_build_object('missingOut', true, 'missingAt', nowms),
           updated_by = 'server', updated_at = now() where coll = 'punches' and id = r.id;
    msg := '⏰ ' || coalesce((select e.data->>'name' from public.records e where e.coll = 'emps' and e.id = r.data->>'who'), r.data->>'who')
           || ' — clock entry still open since ' || to_char(to_timestamp(public._num(r.data->>'in') / 1000.0) at time zone 'America/New_York', 'Dy Mon DD HH12:MI AM')
           || '. Punch out / tell Payroll the real time. · Sigue marcado desde entonces — marca la salida o avisa a la oficina.';
    foreach who in array (array[r.data->>'who'] || pay) loop
      insert into public.records (coll, id, data, updated_by)
      values ('inbox', 'mo_' || r.id || '_' || who,
              jsonb_build_object('id', 'mo_' || r.id || '_' || who, 'to', who, 'ts', nowms, 'msg', msg, 'auto', true, 'kind', 'warn',
                                 'link', jsonb_build_object('tab', case when who = r.data->>'who' then 'punch' else 'hours' end), 'read', false), 'server')
      on conflict (coll, id) do nothing;
    end loop;
  end loop;
end $function$;
revoke all on function private.punch_tick() from public;
select cron.unschedule('punch-tick') where exists (select 1 from cron.job where jobname = 'punch-tick');
select cron.schedule('punch-tick', '*/15 * * * *', 'select private.punch_tick()');

-- H40 test data: the staging "Yossi" (u2) approves time off (on production Baruch sets this on Yossi in the app)
update public.records set data = data || '{"approveTO":true}'::jsonb where coll = 'emps' and id = 'u2';

commit;

-- M15 follow-up (2026-10-28): cancelling someone else's time-off request is already refused — no SQL change needed.
--   guard_record (timeoff branch) refuses status 'cancelled' unless who = me, owner (returns early) or approveTO;
--   a worker cannot even see another worker's request (RLS can_see2), so the update touches 0 rows.
--   Tested (rolled back): worker u7 → 0 rows; office u3 / Payroll u4 → refused; requester u8, u2 (approveTO), owner → cancelled.
