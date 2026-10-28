-- SECURITY agent rollback (staging rkkxykdkjgdsgkujanau). Restores the definitions in place before
-- fix_security_forward.sql (identical to production on 2026-10-28, verified by md5 of pg_get_functiondef).
-- Note: the 'backup-health' cron job already existed on staging before this change, so it is left in place.

begin;

-- new objects
drop trigger if exists records_guard_sensitive on public.records;
drop function if exists public.guard_sensitive();
drop trigger if exists records_guard_emps_nodelete on public.records;
drop function if exists public.guard_emp_nodelete();
drop function if exists public.change_my_password(text);

-- read policy
alter policy "team can read" on public.records
  using ((select public.is_member()) and coalesce(public.can_see2(coll, data, (select public.my_emp_data())), false));
drop function if exists private.sched_visible(text, jsonb);
drop function if exists private.sched_day_ok(text);

CREATE OR REPLACE FUNCTION public.can_see2(c text, d jsonb, me jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when c not in ('keep','inbox','push','meets','punches','timeoff','goHomeLog','travel','exps','emphr','stockLog','rejq',
                   'incidents','msgs','apps','invites','fixes','ptask','jobs','bcol','orr') then true
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
                         or (jsonb_typeof(d->'assign') = 'array' and d->'assign' ? (me->>'id'))
    when c = 'jobs' then me->>'role' = 'owner' or (case jsonb_typeof(d->'to') when 'array' then d->'to' when 'string' then jsonb_build_array(d->'to') else '[]'::jsonb end) ?| array[me->>'id', coalesce(nullif(me->>'crew',''), '~')]
    when c = 'bcol' then d->>'owner' = me->>'id' or me->>'role' = 'owner'
    when c = 'ptask' then d->>'owner' = me->>'id' or me->>'role' = 'owner'
    when c = 'inbox' then d->>'to' = me->>'id'
    when c = 'push' then d->>'who' = me->>'id'
    when c = 'meets' then me->>'role' = 'owner' or d->>'by' = me->>'id' or coalesce(d->'with','[]'::jsonb) ? (me->>'id')
    when c = 'emphr' then d->>'who' = me->>'id' or me->>'role' in ('owner','manager','office') or (me->>'all')::boolean
    when c in ('punches','timeoff','goHomeLog','travel') then
         me->>'role' in ('owner','manager','office') or (me->>'all')::boolean or d->>'who' = me->>'id'
    when c in ('fixes','incidents') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'who' = me->>'id' or d->>'by' = me->>'id'
    when c in ('stockLog','rejq') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'by' = me->>'id'
    when c = 'exps' then
         me->>'role' in ('owner','manager') or (me->>'all')::boolean
      or (me->>'role' = 'office' and me->>'title' in ('Payroll','Bookkeeper')) or d->>'who' = me->>'id'
    when c = 'msgs' then me->>'role' = 'owner' or d->>'from' = me->>'id' or d->>'to' = me->>'id' or coalesce(d->>'k','') like 'g:%'
    when c in ('apps','invites') then me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false)
    when c = 'orr' then me->>'role' in ('owner','manager') or coalesce((me->>'all')::boolean,false) or (me->>'role' = 'office' and coalesce(me->>'title','') <> 'Accountant')
    else true end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_emphr()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; staff boolean; begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if me = '{}'::jsonb then raise exception 'not allowed' using errcode='42501'; end if;
  staff := me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false);
  if staff then return new; end if;
  if coalesce(new.data->>'who', old.data->>'who') is distinct from me->>'id' then
    raise exception 'not allowed' using errcode='42501'; end if;
  return new;
end $function$;

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
        if ex and c not in ('punches','sched','stock')
           and exists (select 1 from public.records t where t.coll = c and t.id = i and t.deleted) then
          null;   -- B2: removed on another phone — an edit does not bring it back (the phone gets the removal)
        elsif ex then
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
end $function$;
revoke all on function public.save_records(jsonb) from public, anon;
grant execute on function public.save_records(jsonb) to authenticated, service_role;
drop function if exists public.save_records_v2(jsonb);
drop function if exists private.merge_arr(jsonb, jsonb, jsonb);
drop function if exists private.arr_key(jsonb);

CREATE OR REPLACE FUNCTION public.resolve_login(q text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  qq text := lower(trim(q));
  dig text := regexp_replace(q, '\D', '', 'g');
  em text;
begin
  if qq = '' then return null; end if;
  select r.data->>'authEmail' into em
  from public.records r
  where r.coll = 'emps' and not r.deleted
    and coalesce((r.data->>'inactive')::boolean, false) = false
    and (
      lower(r.data->>'name') = qq
      or lower(coalesce(r.data->>'email','')) = qq
      or lower(coalesce(r.data->>'authEmail','')) = qq
      or (length(dig) >= 7 and regexp_replace(coalesce(r.data->>'phone',''), '\D', '', 'g') = dig)
      or lower(split_part(r.data->>'name',' ',1)) = qq
    )
  order by (lower(r.data->>'name') = qq) desc
  limit 1;
  return em;
end $function$;

-- H34 follow-up: notify_assign back to its production text (undo the exact replacement), then drop the helper
do $mig$
declare d text := pg_get_functiondef('public.notify_assign()'::regprocedure);
begin
  if position('private.sched_push_ok' in d) = 0 then return; end if;
  execute replace(d, $q$ and private.sched_push_ok(who, k)$q$, '');
end $mig$;
drop function if exists private.sched_push_ok(text, text);

commit;
