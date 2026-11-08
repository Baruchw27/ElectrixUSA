-- Fingercheck history import (Baruch 11/8): past Fingercheck time cards come in as punches (src='fingercheck'),
-- paychecks as coll 'fcpay' (owner + Payroll only). Imported punches never make app travel (it was paid in Fingercheck).
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.can_see2(text,jsonb,jsonb)'::regprocedure);
  if position('''fcpay''' in d) > 0 then return; end if;
  d2 := replace(d, '''orr'',''rates'') then true', '''orr'',''rates'',''fcpay'') then true');
  if d2 = d then raise exception 'can_see2: collection list not found'; end if;
  d := d2;
  d2 := replace(d, $q$when c = 'rates' then$q$, $q$when c in ('rates','fcpay') then$q$);
  if d2 = d then raise exception 'can_see2: rates branch not found'; end if;
  execute d2;
end $$;

create or replace function public.guard_fcpay() returns trigger language plpgsql set search_path to 'public' as $f$
declare me jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  return new;
end $f$;
drop trigger if exists records_guard_fcpay on public.records;
create trigger records_guard_fcpay before insert or update on public.records for each row when (new.coll = 'fcpay') execute function public.guard_fcpay();

create or replace function private.travel_rebuild(p_who text, p_date text)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare f jsonb; l jsonb;
begin
  if p_who is null or p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then return; end if;
  select x.data into f from public.records x
   where x.coll = 'punches' and not x.deleted and x.data->>'who' = p_who and coalesce(x.data->>'src','') <> 'fingercheck'
     and coalesce(x.data->'voided','null'::jsonb) = 'null'::jsonb and not coalesce(x.data->'rejected' = 'true'::jsonb, false)
     and not coalesce(x.data->'pending' = 'true'::jsonb, false) and public._num(x.data->>'in') is not null
     and to_char(to_timestamp(public._num(x.data->>'in') / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD') = p_date
   order by public._num(x.data->>'in') asc limit 1;
  select x.data into l from public.records x
   where x.coll = 'punches' and not x.deleted and x.data->>'who' = p_who and coalesce(x.data->>'src','') <> 'fingercheck'
     and coalesce(x.data->'voided','null'::jsonb) = 'null'::jsonb and not coalesce(x.data->'rejected' = 'true'::jsonb, false)
     and not coalesce(x.data->'pending' = 'true'::jsonb, false) and public._num(x.data->>'in') is not null
     and to_char(to_timestamp(public._num(x.data->>'in') / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD') = p_date
   order by public._num(x.data->>'in') desc limit 1;
  perform private.travel_leg(p_who, p_date, 'to', f->>'site', f is not null);
  perform private.travel_leg(p_who, p_date, 'home', l->>'site', l is not null and public._num(l->>'out') is not null);
end $f$;

create or replace function private.punch_travel() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare dn text; do_ text;
begin
  if jsonb_typeof(new.data) = 'object' and new.data->>'src' = 'fingercheck' then return null; end if;
  if jsonb_typeof(new.data) = 'object' and public._num(new.data->>'in') is not null then
    dn := to_char(to_timestamp(public._num(new.data->>'in') / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD');
    perform private.travel_rebuild(new.data->>'who', dn);
  end if;
  if tg_op = 'UPDATE' and jsonb_typeof(old.data) = 'object' and public._num(old.data->>'in') is not null then
    do_ := to_char(to_timestamp(public._num(old.data->>'in') / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD');
    if do_ is distinct from dn or old.data->>'who' is distinct from new.data->>'who' then
      perform private.travel_rebuild(old.data->>'who', do_); end if;
  end if;
  return null;
end $f$;
revoke all on function private.travel_rebuild(text,text) from public, anon, authenticated;
