-- Audit A5 (STAGING) — payroll controls on clock entries, following Baruch's directions of 2026-10-20:
--  • Late clock entries (received by the server more than 30 minutes after their clock-in time) wait for Payroll
--    approval before they count; the original entry is kept exactly as received, with a full approval history.
--  • Only the Owner and Payroll (office staff whose title is "Payroll" — a title only the Owner can give) may change
--    clock times (in, out after it was set, person, job, finished breaks / material runs, removal). Every such change
--    needs a written reason and is recorded. ("All-access" users and managers can no longer change clock times.)
--  • A history of every clock entry is kept inside it by the server ("hist"), which phones cannot change; removing a
--    clock entry keeps the original data (marked deleted) instead of blanking it.
-- Runs after guard_record (trigger names fire in alphabetical order), so all existing permission checks still apply.

create or replace function private.edits_prefix_kept(o jsonb, n jsonb) returns boolean
language plpgsql immutable set search_path to 'pg_catalog' as $$
begin
  if coalesce(jsonb_typeof(o),'') <> 'array' then return true; end if;
  if jsonb_array_length(o) = 0 then return true; end if;
  if coalesce(jsonb_typeof(n),'') <> 'array' then return false; end if;
  if jsonb_array_length(n) < jsonb_array_length(o) then return false; end if;
  return (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(n) with ordinality x(e, i) where i <= jsonb_array_length(o)) = o;
end $$;

create or replace function private.arr_len(a jsonb) returns int
language sql immutable set search_path to 'pg_catalog' as $$
  select case when jsonb_typeof(a) = 'array' then jsonb_array_length(a) else 0 end;
$$;

create or replace function private.last_why(n jsonb, min_len int default 3) returns text
language plpgsql immutable set search_path to 'pg_catalog' as $$
declare w text;
begin
  if coalesce(jsonb_typeof(n->'edits'),'') <> 'array' then return null; end if;
  if jsonb_array_length(n->'edits') = 0 then return null; end if;
  w := trim(coalesce(n->'edits'->-1->>'why',''));
  return case when length(w) >= min_len then w end;
end $$;

create or replace function public.guard_punch() returns trigger
language plpgsql set search_path to 'public' as $$
declare me jsonb; role text; owner boolean; payroll boolean; clockok boolean; o jsonb; n jsonb := new.data;
        nowms bigint := (extract(epoch from now()) * 1000)::bigint; hist jsonb; late boolean; why text;
        chg boolean; LATE_MS constant bigint := 30 * 60000;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;   -- server jobs
  if jsonb_typeof(n) <> 'object' then return new; end if;
  me := public.my_emp_data(); if me = '{}'::jsonb then return new; end if;
  role := coalesce(me->>'role',''); owner := role = 'owner';
  payroll := role = 'office' and me->>'title' = 'Payroll';
  clockok := owner or payroll;
  o := case when tg_op = 'UPDATE' and jsonb_typeof(old.data) = 'object' then old.data end;
  -- server-written fields: a phone can never change them
  n := (n - 'hist' - 'lateEntry')
       || case when o ? 'lateEntry' then jsonb_build_object('lateEntry', o->'lateEntry') else '{}'::jsonb end;
  hist := case when coalesce(jsonb_typeof(o->'hist'),'') = 'array' then o->'hist' else '[]'::jsonb end;

  -- removing a clock entry: Owner/Payroll only; the original data stays in the record
  if new.deleted then
    if tg_op = 'UPDATE' and old.deleted then return new; end if;
    if not clockok then raise exception 'only the owner or Payroll can remove a clock entry' using errcode = '42501'; end if;
    new.data := coalesce(o, n) || jsonb_build_object('deletedBy', me->>'id', 'deletedAt', nowms,
                 'hist', hist || jsonb_build_array(jsonb_build_object('act','deleted','by',me->>'id','at',nowms)));
    return new;
  end if;

  if o is null or old.deleted then
    -- a new clock entry (or one brought back)
    late := coalesce(public._num(n->>'in'), nowms) < nowms - LATE_MS;
    if n->>'who' is distinct from me->>'id' and not clockok then
      raise exception 'only the owner or Payroll can add a clock entry for someone else' using errcode = '42501'; end if;
    if clockok and (n->>'who' is distinct from me->>'id' or o is not null) then
      -- Owner/Payroll entering a missed punch for SOMEONE ELSE: that is the approval, but it needs a reason.
      -- (Their own late clock-in waits like anyone's; someone else approves it.)
      why := private.last_why(n);
      if why is null then raise exception 'a reason is required for a clock entry added by the office' using errcode = '42501'; end if;
      hist := hist || jsonb_build_array(jsonb_build_object('act', case when o is null then 'added' else 'restored' end,'by',me->>'id','at',nowms,
                 'in',n->'in','out',n->'out','who',n->'who','why',why));
    elsif late then
      -- typed in / sent long after the fact: waits for Payroll, original kept as received
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

  -- an existing clock entry is being changed
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
  -- approvals
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
  -- an approved/rejected late entry cannot be put back to "waiting" or flipped by anyone but Payroll
  if o ? 'lateEntry' and not clockok and (n->'rejected' is distinct from o->'rejected' or n->'approvedBy' is distinct from o->'approvedBy') then
    raise exception 'only Payroll can approve a late clock entry' using errcode = '42501'; end if;
  new.data := n || jsonb_build_object('hist', hist);
  return new;
end $$;

create or replace trigger records_guard_punch before insert or update on public.records
  for each row when (new.coll = 'punches') execute function public.guard_punch();

revoke all on function private.edits_prefix_kept(jsonb, jsonb) from public, anon;
revoke all on function private.last_why(jsonb, int) from public, anon;
revoke all on function private.arr_len(jsonb) from public, anon;
grant execute on function private.arr_len(jsonb) to authenticated;
grant execute on function private.edits_prefix_kept(jsonb, jsonb) to authenticated;
grant execute on function private.last_why(jsonb, int) to authenticated;
