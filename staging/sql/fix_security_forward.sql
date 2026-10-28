-- SECURITY agent — audit fixes C12 C13 C14 C17 C19 C21 H01 H02 H34 M22 (+A05 keep data on delete) — server side
-- Apply to STAGING (rkkxykdkjgdsgkujanau) only. Rollback: fix_security_rollback.sql
-- Rules (Baruch): HR info (emphr/empHR), job applications (apps), invites and injury reports (incidents) are readable only
-- by the owner and office title 'Payroll' (+ the employee's own HR / injury record). Employees are deactivated, never
-- deleted. Nothing may be lost. Workers see only their own crew's schedule for today + the next day.

begin;

-- ───────────── C12 / H34: who may read what ─────────────
CREATE OR REPLACE FUNCTION public.can_see2(c text, d jsonb, me jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when c not in ('keep','inbox','push','meets','punches','timeoff','goHomeLog','travel','exps','emphr','empHR','stockLog','rejq',
                   'incidents','msgs','apps','invites','fixes','ptask','jobs','bcol','orr') then true
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
                         or (jsonb_typeof(d->'assign') = 'array' and d->'assign' ? (me->>'id'))
    when c = 'jobs' then me->>'role' = 'owner' or (case jsonb_typeof(d->'to') when 'array' then d->'to' when 'string' then jsonb_build_array(d->'to') else '[]'::jsonb end) ?| array[me->>'id', coalesce(nullif(me->>'crew',''), '~')]
    when c = 'bcol' then d->>'owner' = me->>'id' or me->>'role' = 'owner'
    when c = 'ptask' then d->>'owner' = me->>'id' or me->>'role' = 'owner'
    when c = 'inbox' then d->>'to' = me->>'id'
    when c = 'push' then d->>'who' = me->>'id'
    when c = 'meets' then me->>'role' = 'owner' or d->>'by' = me->>'id' or coalesce(d->'with','[]'::jsonb) ? (me->>'id')
    -- C12: home address / emergency contact — the person, the owner and Payroll only (both spellings of the collection)
    when c in ('emphr','empHR') then d->>'who' = me->>'id' or me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')
    when c in ('punches','timeoff','goHomeLog','travel') then
         me->>'role' in ('owner','manager','office') or (me->>'all')::boolean or d->>'who' = me->>'id'
    when c = 'fixes' then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'who' = me->>'id' or d->>'by' = me->>'id'
    -- C12: injury reports — the injured person / the one who filed it, the owner and Payroll
    when c = 'incidents' then
         d->>'who' = me->>'id' or d->>'by' = me->>'id' or me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')
    when c in ('stockLog','rejq') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'by' = me->>'id'
    when c = 'exps' then
         me->>'role' in ('owner','manager') or (me->>'all')::boolean
      or (me->>'role' = 'office' and me->>'title' in ('Payroll','Bookkeeper')) or d->>'who' = me->>'id'
    when c = 'msgs' then me->>'role' = 'owner' or d->>'from' = me->>'id' or d->>'to' = me->>'id' or coalesce(d->>'k','') like 'g:%'
    -- C12: job applications and invites — the owner and Payroll only
    when c in ('apps','invites') then me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')
    when c = 'orr' then me->>'role' in ('owner','manager') or coalesce((me->>'all')::boolean,false) or (me->>'role' = 'office' and coalesce(me->>'title','') <> 'Accountant')
    else true end;
$function$;

-- H34: a schedule day is visible to a field worker only for his own crew (or his own / his crew's moves when he leads it),
-- today and the next day (Friday also shows Sunday: Saturday is the off day). Ongoing rules of his crew stay visible.
CREATE OR REPLACE FUNCTION private.sched_day_ok(d text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when d ~ '^\d{4}-\d{2}-\d{2}$' then
    d::date between (now() at time zone 'America/New_York')::date
                and (now() at time zone 'America/New_York')::date
                    + case when extract(dow from (now() at time zone 'America/New_York')::date + 1) = 6 then 2 else 1 end
  else false end;
$function$;

CREATE OR REPLACE FUNCTION private.sched_visible(i text, me jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) then true
    when i like 'ONG:%' then split_part(i,':',2) = coalesce(nullif(me->>'crew',''),'~')
    when i like 'L:%' then (split_part(substr(i,3),'|',1) = me->>'id' or coalesce(me->'crew_ids','[]'::jsonb) ? split_part(substr(i,3),'|',1))
                            and private.sched_day_ok(split_part(i,'|',2))
    else split_part(i,'|',1) = coalesce(nullif(me->>'crew',''),'~') and private.sched_day_ok(split_part(i,'|',2))
  end;
$function$;
revoke all on function private.sched_day_ok(text) from public, anon;
revoke all on function private.sched_visible(text, jsonb) from public, anon;
grant execute on function private.sched_day_ok(text) to authenticated, service_role;
grant execute on function private.sched_visible(text, jsonb) to authenticated, service_role;

alter policy "team can read" on public.records
  using ((select public.is_member()) and coalesce(public.can_see2(coll, data, (select public.my_emp_data())), false)
         and (coll <> 'sched' or private.sched_visible(id, (select public.my_emp_data()))));

-- ───────────── C14: write rules for applications, invites, injury reports, inspections, O&R ─────────────
CREATE OR REPLACE FUNCTION public.guard_sensitive()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; owner boolean; payroll boolean; staff boolean; o jsonb; n jsonb := new.data;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if me = '{}'::jsonb then raise exception 'not allowed' using errcode = '42501'; end if;
  owner := me->>'role' = 'owner';
  payroll := me->>'role' = 'office' and me->>'title' = 'Payroll';
  staff := owner or me->>'role' in ('manager','office') or coalesce((me->>'all')::boolean,false);
  o := case when tg_op = 'UPDATE' and jsonb_typeof(old.data) = 'object' then old.data end;
  if new.coll in ('apps','invites') then
    if owner or payroll then return new; end if;
    raise exception 'only the owner or Payroll can change job applications and invites' using errcode = '42501';
  end if;
  if new.coll = 'incidents' then
    if owner or payroll then return new; end if;
    -- anyone may file his OWN injury report (new, open); changing it afterwards is for the owner / Payroll
    if tg_op = 'INSERT' and not new.deleted and jsonb_typeof(n) = 'object' and n->>'who' = me->>'id'
       and coalesce(n->>'status','open') = 'open' then return new; end if;
    raise exception 'injury reports are changed by the owner or Payroll' using errcode = '42501';
  end if;
  if new.coll = 'insp' then
    if staff then return new; end if;
    -- a crew leader may ask for an inspection (new, "requested", by himself)
    if tg_op = 'INSERT' and not new.deleted and coalesce((me->>'lead')::boolean,false) and jsonb_typeof(n) = 'object'
       and n->>'by' = me->>'id' and n->>'status' = 'requested' then return new; end if;
    -- the reminder flags every phone sets are harmless
    if tg_op = 'UPDATE' and not new.deleted and o is not null and jsonb_typeof(n) = 'object' and (n - 'reminded') = (o - 'reminded') then return new; end if;
    raise exception 'only the office or a manager can change an inspection' using errcode = '42501';
  end if;
  if new.coll = 'orr' then
    if owner or me->>'role' = 'manager' or coalesce((me->>'all')::boolean,false)
       or (me->>'role' = 'office' and coalesce(me->>'title','') <> 'Accountant') then return new; end if;
    raise exception 'only the office can change O&R requests' using errcode = '42501';
  end if;
  return new;
end $function$;
revoke all on function public.guard_sensitive() from public, anon;
create or replace trigger records_guard_sensitive before insert or update on public.records for each row
  when (new.coll = any (array['apps','invites','incidents','insp','orr'])) execute function public.guard_sensitive();

-- C12/C14: HR records — written by the person himself, the owner or Payroll
CREATE OR REPLACE FUNCTION public.guard_emphr()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if me = '{}'::jsonb then raise exception 'not allowed' using errcode='42501'; end if;
  if me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll') then return new; end if;
  if coalesce(new.data->>'who', old.data->>'who') is distinct from me->>'id'
     or (tg_op = 'UPDATE' and old.data->>'who' is distinct from new.data->>'who') then
    raise exception 'not allowed' using errcode='42501'; end if;
  return new;
end $function$;

-- ───────────── C17: employees are deactivated, never removed ─────────────
CREATE OR REPLACE FUNCTION public.guard_emp_nodelete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user in ('authenticated','anon') then
    raise exception 'employees are never removed — turn them off (inactive) instead, so their history stays' using errcode = '42501';
  end if;
  return new;
end $function$;
revoke all on function public.guard_emp_nodelete() from public, anon;
create or replace trigger records_guard_emps_nodelete before update on public.records for each row
  when (new.coll = 'emps' and new.deleted and not old.deleted) execute function public.guard_emp_nodelete();

-- ───────────── C13: no password is ever stored in a record ─────────────
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
  -- C13: passwords live only (hashed) in the sign-in system — never in a record anyone can sync. A password key a phone
  -- sends (or an old record still holds) is quietly dropped, so old records stay editable and old phones keep working.
  if current_user in ('authenticated','anon') and jsonb_typeof(new.data) = 'object'
     and (new.data ? 'pass' or new.data ? 'password' or new.data ? 'pw') then
    new.data := new.data - 'pass' - 'password' - 'pw'; end if;
  -- A2 size: photos go to file storage, so no record needs to be this big
  if current_user in ('authenticated','anon') and octet_length(new.data::text) > 400000 then
    raise exception 'record too large' using errcode = '42501'; end if;
  if current_user in ('authenticated','anon') and auth.uid() is not null then
    me := public.my_emp_data();
    new.updated_by := coalesce(me->>'id', 'uid:' || auth.uid()::text);
    new.updated_at := now();
  end if;
  return new;
end $function$;

-- ───────────── C19: lists inside a record are merged item by item, not replaced whole ─────────────
CREATE OR REPLACE FUNCTION private.arr_key(x jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when jsonb_typeof(x) = 'object' and x ? 'id' and jsonb_typeof(x->'id') in ('string','number') then 'id:' || (x->>'id') else 'v:' || x::text end;
$function$;

-- cur = what the server has now, base = what the phone started from, nw = what the phone has now.
-- Result: the server's list, minus what this phone removed, with this phone's version of what it changed, plus what it added.
CREATE OR REPLACE FUNCTION private.merge_arr(cur jsonb, base jsonb, nw jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare out jsonb := '[]'::jsonb; el jsonb; ne jsonb; be jsonb; key text;
        bk text[] := '{}'; nk text[] := '{}'; ck text[] := '{}';
begin
  if jsonb_typeof(cur) <> 'array' or jsonb_typeof(base) <> 'array' or jsonb_typeof(nw) <> 'array' then return nw; end if;
  bk := array(select private.arr_key(x) from jsonb_array_elements(base) x);
  nk := array(select private.arr_key(x) from jsonb_array_elements(nw) x);
  for el in select x from jsonb_array_elements(cur) x loop
    key := private.arr_key(el);
    if key = any(bk) and not key = any(nk) then continue; end if;            -- this phone removed it
    if key = any(nk) and key = any(bk) then                                  -- this phone may have changed it
      select x into ne from jsonb_array_elements(nw) x where private.arr_key(x) = key limit 1;
      select x into be from jsonb_array_elements(base) x where private.arr_key(x) = key limit 1;
      if ne is distinct from be then el := ne; end if;
    end if;
    if key = any(ck) then continue; end if;
    out := out || jsonb_build_array(el); ck := ck || key;
  end loop;
  for el in select x from jsonb_array_elements(nw) x loop                   -- this phone added it
    key := private.arr_key(el);
    if not key = any(bk) and not key = any(ck) then out := out || jsonb_build_array(el); ck := ck || key; end if;
  end loop;
  return out;
end $function$;
revoke all on function private.arr_key(jsonb) from public, anon;
revoke all on function private.merge_arr(jsonb, jsonb, jsonb) from public, anon;
grant execute on function private.arr_key(jsonb) to authenticated, service_role;
grant execute on function private.merge_arr(jsonb, jsonb, jsonb) to authenticated, service_role;

-- ───────────── save_records: C17/A05 keep data on delete, C19 list merge, M22 say WHY a row was refused ─────────────
-- save_records_v2 = the real work + an "err" column (the reason a row was refused). save_records keeps its old answer
-- shape (no err column) so phones already in the field keep working; it simply calls v2.
CREATE OR REPLACE FUNCTION public.save_records_v2(rows jsonb)
 RETURNS TABLE(coll text, id text, data jsonb, deleted boolean, err text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare r jsonb; un text[]; ex boolean; c text; i text; del boolean; v jsonb; e text; b jsonb; cur jsonb; f text;
begin
  for r in select * from jsonb_array_elements(rows) loop
    c := r->>'coll'; i := r->>'id'; del := coalesce((r->>'deleted')::boolean, false); e := null;
    begin
      ex := private.row_exists(c, i);
      if del then
        -- C17/A05: a removal only marks the record removed — what it held stays (history, links, restore)
        if ex then
          -- C18: a schedule day's "Clear day" says which version the phone cleared (rev) → guard_sched_rev refuses a stale one
          update public.records as t set deleted = true, updated_by = r->>'by', updated_at = now(),
                 data = case when c = 'sched' and jsonb_typeof(r->'full') = 'object' and r->'full' ? 'rev' and jsonb_typeof(t.data) = 'object'
                             then t.data || jsonb_build_object('delRev', r->'full'->'rev') else t.data end
            where t.coll = c and t.id = i;
        else
          insert into public.records (coll, id, data, deleted, updated_by, updated_at) values (c, i, coalesce(r->'full', '{}'::jsonb), true, r->>'by', now());
        end if;
      elsif r ? 'full' then
        v := coalesce(r->'full', '{}'::jsonb);
        if ex then
          update public.records as t set data = v, deleted = false, updated_by = r->>'by', updated_at = now() where t.coll = c and t.id = i;
        else
          insert into public.records (coll, id, data, deleted, updated_by, updated_at) values (c, i, v, false, r->>'by', now());
        end if;
      else
        v := coalesce(r->'patch', '{}'::jsonb);
        un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}'::text[]);
        if ex and c not in ('punches','sched','stock')
           and exists (select 1 from public.records t where t.coll = c and t.id = i and t.deleted) then
          null;   -- B2: removed on another phone — an edit does not bring it back (the phone gets the removal)
        elsif ex then
          -- C19: a list the phone changed is merged with what other phones saved meanwhile (needs the phone's starting copy)
          b := case when jsonb_typeof(r->'base') = 'object' then r->'base' else '{}'::jsonb end;
          if b <> '{}'::jsonb and c <> 'sched' then
            select t.data into cur from public.records t where t.coll = c and t.id = i and not t.deleted;
            if jsonb_typeof(cur) = 'object' then
              for f in select jsonb_object_keys(b) loop
                if jsonb_typeof(v->f) = 'array' and jsonb_typeof(b->f) = 'array' and jsonb_typeof(cur->f) = 'array' and cur->f is distinct from b->f then
                  v := v || jsonb_build_object(f, private.merge_arr(cur->f, b->f, v->f));
                end if;
              end loop;
            end if;
          end if;
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
      when insufficient_privilege then e := left(coalesce(SQLERRM, 'not allowed'), 300);   -- M22: the phone shows the reason
      when unique_violation then
        if del then
          update public.records as t set deleted = true, updated_by = r->>'by', updated_at = now(),
                 data = case when c = 'sched' and jsonb_typeof(r->'full') = 'object' and r->'full' ? 'rev' and jsonb_typeof(t.data) = 'object'
                             then t.data || jsonb_build_object('delRev', r->'full'->'rev') else t.data end
            where t.coll = c and t.id = i;
        else
          update public.records as t set data = case when r ? 'full' then coalesce(r->'full','{}'::jsonb)
                                                      when jsonb_typeof(t.data) <> 'object' then t.data
                                                      else t.data || coalesce(r->'patch','{}'::jsonb) end,
                 deleted = false, updated_by = r->>'by', updated_at = now()
            where t.coll = c and t.id = i;
        end if;
    end;
    return query select t.coll, t.id, t.data, t.deleted, e from public.records t where t.coll = c and t.id = i;
    -- a refused brand-new row is not in the table: still report it (as absent), so the phone can say why
    if e is not null and not found then return query select c, i, null::jsonb, true, e; end if;
  end loop;
end $function$;
revoke all on function public.save_records_v2(jsonb) from public, anon;
grant execute on function public.save_records_v2(jsonb) to authenticated, service_role;

-- the name every phone already calls: same answer shape as before (no err column), same rules
CREATE OR REPLACE FUNCTION public.save_records(rows jsonb)
 RETURNS TABLE(coll text, id text, data jsonb, deleted boolean)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select s.coll, s.id, s.data, s.deleted from public.save_records_v2(rows) s where s.data is not null;
$function$;

-- ───────────── H01: an ambiguous name never picks somebody's account ─────────────
CREATE OR REPLACE FUNCTION public.resolve_login(q text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  qq text := lower(trim(q));
  dig text := regexp_replace(q, '\D', '', 'g');
  em text; n int;
begin
  if qq = '' then return null; end if;
  -- 1) exact: full name, e-mail, sign-in e-mail or phone — must point to ONE person
  select count(*), min(r.data->>'authEmail') into n, em
  from public.records r
  where r.coll = 'emps' and not r.deleted
    and coalesce((r.data->>'inactive')::boolean, false) = false
    and (lower(r.data->>'name') = qq
      or lower(coalesce(r.data->>'email','')) = qq
      or lower(coalesce(r.data->>'authEmail','')) = qq
      or (length(dig) >= 7 and regexp_replace(coalesce(r.data->>'phone',''), '\D', '', 'g') = dig));
  if n = 1 then return em; end if;
  if n > 1 then return null; end if;
  -- 2) first name only — allowed only when exactly one active person has it
  select count(*), min(r.data->>'authEmail') into n, em
  from public.records r
  where r.coll = 'emps' and not r.deleted
    and coalesce((r.data->>'inactive')::boolean, false) = false
    and lower(split_part(r.data->>'name',' ',1)) = qq;
  if n = 1 then return em; end if;
  return null;
end $function$;

-- ───────────── H02: changing your own password goes through the same password rules ─────────────
CREATE OR REPLACE FUNCTION public.change_my_password(p_pass text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  perform public._pw_check(p_pass);
  update auth.users set encrypted_password = crypt(p_pass, gen_salt('bf')), updated_at = now() where id = auth.uid();
  return found;
end $function$;
revoke all on function public.change_my_password(text) from public, anon;
grant execute on function public.change_my_password(text) to authenticated, service_role;

-- ───────────── C21: daily check that the off-site backup is not overdue (alerts the owner in the app) ─────────────
-- (it already existed on staging with this schedule; cron.schedule with an existing name just updates it)
select cron.schedule('backup-health', '7 13 * * *', 'select public.backup_health_check()');

-- ───────────── H34 follow-up: schedule pushes to field workers only for today + next workday ─────────────
CREATE OR REPLACE FUNCTION private.sched_push_ok(who text, k text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select k like 'ONG:%'                              -- the crew's ongoing rule: workers see it (sched_visible)
      or coalesce((select e.data->>'role' in ('owner','manager','office') or coalesce((e.data->>'all')::boolean,false)
                   from public.records e where e.coll = 'emps' and e.id = who and not e.deleted limit 1), false)
      or private.sched_day_ok(split_part(k,'|',2));
$function$;
revoke all on function private.sched_push_ok(text, text) from public, anon, authenticated;
-- notify_assign (identical to production on 2026-10-28, md5 6a2eca27678a283da3b06bff16d45b66): every schedule push
-- recipient check also asks sched_push_ok. Done as an exact text replacement so nothing else in the function changes.
do $mig$
declare d text := pg_get_functiondef('public.notify_assign()'::regprocedure); n text;
begin
  if position('private.sched_push_ok' in d) > 0 then return; end if;   -- already applied
  n := replace(d, $q$if who <> coalesce(actor, '') then$q$, $q$if who <> coalesce(actor, '') and private.sched_push_ok(who, k) then$q$);
  if (length(n) - length(d)) <> 3 * length($q$ and private.sched_push_ok(who, k)$q$) then raise exception 'notify_assign is not the expected version'; end if;
  execute n;
end $mig$;

commit;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PRODUCTION — RUN ONLY AFTER BARUCH'S APPROVAL (not part of the staging transaction above; run by hand, step by step)
-- C13 one-time cleanup: remove password keys from existing records. The "Team passwords" note (keep/kn_teampw) is
-- NOT touched — Baruch decides what happens to it. Every change is kept in records_history (log_record trigger).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Step 1 (read-only): how many records would change?
--   select coll, count(*) from public.records
--    where jsonb_typeof(data) = 'object' and (data ? 'pass' or data ? 'password' or data ? 'pw')
--      and not (coll = 'keep' and id = 'kn_teampw')
--    group by coll order by coll;
-- Step 2 (only if step 1 shows rows, and after approval):
--   begin;
--   update public.records set data = data - 'pass' - 'password' - 'pw', updated_at = now(), updated_by = 'cleanup:C13'
--    where jsonb_typeof(data) = 'object' and (data ? 'pass' or data ? 'password' or data ? 'pw')
--      and not (coll = 'keep' and id = 'kn_teampw');
--   -- check the row count matches step 1, then:
--   commit;
