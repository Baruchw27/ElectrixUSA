-- Automatic travel (Baruch 11/8): Travel To at the first clock-in of the day, Travel Home at the last clock-out,
-- only for jobs more than 15 road miles from the office. Pay = one-way drive minutes / 60 × the worker's own hourly rate.
-- Rates live in coll 'rates' (id = emp id), readable and writable only by the owner and Payroll.
-- Travel records are made only by the server; travel is visible to the owner, Payroll and the worker himself.

-- 1) who can see rates / travel
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.can_see2(text,jsonb,jsonb)'::regprocedure);
  d2 := replace(d, '''orr'') then true', '''orr'',''rates'') then true');
  if d2 = d then raise exception 'can_see2: collection list not found'; end if;
  d := d2;
  d2 := replace(d, $q$when c in ('punches','timeoff','goHomeLog','travel') then$q$,
    $q$when c = 'rates' then me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')
    when c = 'travel' then me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll') or d->>'who' = me->>'id'
    when c in ('punches','timeoff','goHomeLog') then$q$);
  if d2 = d then raise exception 'can_see2: travel branch not found'; end if;
  execute d2;
end $$;

-- 2) only the owner and Payroll may write a rate
create or replace function public.guard_rates() returns trigger language plpgsql set search_path to 'public' as $f$
declare me jsonb;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  me := public.my_emp_data();
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then
    raise exception 'only the owner or Payroll can change pay rates' using errcode = '42501'; end if;
  if not new.deleted and (jsonb_typeof(new.data) <> 'object' or new.data->>'who' is distinct from new.id
     or (new.data ? 'rate' and new.data->>'rate' is not null and (public._num(new.data->>'rate') is null or public._num(new.data->>'rate') < 0 or public._num(new.data->>'rate') > 500))) then
    raise exception 'bad rate' using errcode = '42501'; end if;
  return new;
end $f$;
drop trigger if exists records_guard_rates on public.records;
create trigger records_guard_rates before insert or update on public.records for each row when (new.coll = 'rates') execute function public.guard_rates();

-- 3) a phone can no longer make a travel record: anything a phone sends is kept for the record but never paid
CREATE OR REPLACE FUNCTION private.travel_checked(n jsonb, rid text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  return n || jsonb_build_object('minutes', 0, 'pay', 0, 'auto', true, 'status', 'ignored', 'why', 'travel is worked out by the server');
end $function$;

-- 4) one leg (to / home) for one worker on one day
create or replace function private.travel_leg(p_who text, p_date text, p_kind text, p_site text, p_on boolean)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare rid text := 'tv' || p_kind || '_' || p_who || '_' || replace(p_date, '-', '');
        s jsonb; mi numeric; one numeric; thr numeric; rate numeric; blat numeric; blng numeric; dist numeric; n jsonb; nm text;
begin
  if p_on and p_site is not null then
    select r.data into s from public.records r where r.coll = 'sites' and r.id = p_site and not r.deleted;
  end if;
  if s is not null and jsonb_typeof(s) = 'object' then
    if jsonb_typeof(s->'trip') = 'object' and public._num(s->'trip'->>'mi') is not null and public._num(s->'trip'->>'min') is not null then
      mi := public._num(s->'trip'->>'mi'); one := round(public._num(s->'trip'->>'min'));
    elsif public._num(s->>'lat') is not null and public._num(s->>'lng') is not null then
      select public._num(data #>> '{}') into blat from public.records where coll = 'base' and id = 'lat' and not deleted;
      select public._num(data #>> '{}') into blng from public.records where coll = 'base' and id = 'lng' and not deleted;
      if blat is not null and blng is not null then
        dist := 3958.8 * 2 * asin(sqrt(power(sin(radians(public._num(s->>'lat') - blat) / 2), 2)
                + cos(radians(blat)) * cos(radians(public._num(s->>'lat'))) * power(sin(radians(public._num(s->>'lng') - blng) / 2), 2)));
        mi := dist * 1.25; one := round(mi / 0.55);
      end if;
    end if;
  end if;
  thr := coalesce((select coalesce(public._num(r.data->>'v'), public._num(r.data #>> '{}')) from public.records r
                   where r.coll = '_' and r.id = 'travelMi' and not r.deleted), 15);
  if mi is null or mi <= thr or one is null or one <= 0 then
    update public.records set deleted = true, updated_by = 'server', updated_at = now() where coll = 'travel' and id = rid and not deleted;
    return;
  end if;
  rate := (select public._num(r.data->>'rate') from public.records r where r.coll = 'rates' and r.id = p_who and not r.deleted);
  nm := coalesce(nullif(s->>'name', ''), p_site);
  n := jsonb_build_object('id', rid, 'who', p_who, 'site', p_site, 'date', p_date, 'kind', p_kind, 'auto', true, 'srv', true,
         'from', case when p_kind = 'to' then 'Office' else nm end, 'to', case when p_kind = 'to' then nm else 'Office' end,
         'miles', round(mi, 1)::float8, 'oneWay', one::float8, 'minutes', one::float8,
         'pay', case when rate is null then null else round(rate * one / 60, 2)::float8 end,
         'status', case when rate is null then 'norate' else 'approved' end);
  insert into public.records (coll, id, data, deleted, updated_by, updated_at) values ('travel', rid, n, false, 'server', now())
  on conflict (coll, id) do update set data = excluded.data, deleted = false, updated_by = 'server', updated_at = now()
   where public.records.data is distinct from excluded.data or public.records.deleted;
end $f$;

-- 5) work out both legs for one worker on one day from his clock entries
create or replace function private.travel_rebuild(p_who text, p_date text)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare f jsonb; l jsonb;
begin
  if p_who is null or p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then return; end if;
  select x.data into f from public.records x
   where x.coll = 'punches' and not x.deleted and x.data->>'who' = p_who
     and coalesce(x.data->'voided','null'::jsonb) = 'null'::jsonb and not coalesce(x.data->'rejected' = 'true'::jsonb, false)
     and not coalesce(x.data->'pending' = 'true'::jsonb, false) and public._num(x.data->>'in') is not null
     and to_char(to_timestamp(public._num(x.data->>'in') / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD') = p_date
   order by public._num(x.data->>'in') asc limit 1;
  select x.data into l from public.records x
   where x.coll = 'punches' and not x.deleted and x.data->>'who' = p_who
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
drop trigger if exists records_zz_punch_travel on public.records;
create trigger records_zz_punch_travel after insert or update on public.records for each row when (new.coll = 'punches') execute function private.punch_travel();

-- a new or changed rate re-prices this pay week (Sunday to today) for that worker
create or replace function private.rate_travel() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare d date; today date := (now() at time zone 'America/New_York')::date;
begin
  for d in select generate_series(today - extract(dow from today)::int, today, interval '1 day')::date loop
    perform private.travel_rebuild(new.id, to_char(d, 'YYYY-MM-DD'));
  end loop;
  return null;
end $f$;
drop trigger if exists records_zz_rate_travel on public.records;
create trigger records_zz_rate_travel after insert or update on public.records for each row when (new.coll = 'rates') execute function private.rate_travel();

revoke all on function private.travel_leg(text,text,text,text,boolean), private.travel_rebuild(text,text) from public, anon, authenticated;
