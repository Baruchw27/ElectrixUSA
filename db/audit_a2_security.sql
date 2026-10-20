-- Audit A2 — server-side protections found missing by tests/security/pentest_all_roles.sql (STAGING first).
-- Each change patches the live function text at a unique anchor and refuses to run if the anchor is not found
-- exactly once, so it cannot silently half-apply. Safe to re-run (each patch checks for its own marker first).
--
--  1. Clock entries: workers/office could REMOVE or shorten finished breaks and material-run trips on their own
--     punch (more paid time), drop an in-progress break or an "away" mark, or bring back a punch Payroll deleted.
--     Every punch now also gets a server receive time (srvIn) that nobody can change, so a punch that was typed in
--     long after the fact is visible to Payroll.
--  2. Travel pay: a worker's phone could insert any pay amount (e.g. $999) already "approved". The server now
--     works the minutes and pay out itself from the job and the company travel rate, allows one automatic entry per
--     person / job / day, and only for dates around today.
--  3. Stock: apply_stock_txn accepted a "pick-up" (out) with a positive amount (adding stock), a return (in) with a
--     negative amount, and plain amounts inside a "set" (count) — which skipped the office-only check for counts.
--  4. Any record over 400 KB is refused (photos are uploaded as files, never stored inline), so one phone cannot
--     fill every other phone's storage.

create schema if not exists private;

create or replace function private.punch_breaks_kept(o jsonb, n jsonb) returns boolean
language sql immutable set search_path to 'pg_catalog' as $$
  select
    -- every finished break is still there, unchanged (new ones may be added)
    (case when jsonb_typeof(o->'breaks') = 'array' then o->'breaks' else '[]'::jsonb end)
      <@ (case when jsonb_typeof(n->'breaks') = 'array' then n->'breaks' else '[]'::jsonb end)
    -- every material run is still there, unchanged
    and (case when jsonb_typeof(o->'trips') = 'array' then o->'trips' else '[]'::jsonb end)
      <@ (case when jsonb_typeof(n->'trips') = 'array' then n->'trips' else '[]'::jsonb end)
    -- an open break can only end by becoming a finished break that starts at the same moment
    and (coalesce(o->'breakStart','null'::jsonb) = 'null'::jsonb
         or n->'breakStart' = o->'breakStart'
         or (jsonb_typeof(n->'breaks') = 'array' and n->'breaks' @> jsonb_build_array(jsonb_build_object('s', o->'breakStart'))))
    -- "away from the site" can only end as a material run, or by the punch being closed
    and (coalesce(o->'away','null'::jsonb) = 'null'::jsonb
         or n->'away' = o->'away'
         or coalesce(n->'out','null'::jsonb) <> 'null'::jsonb
         or (jsonb_typeof(n->'trips') = 'array' and n->'trips' @> jsonb_build_array(jsonb_build_object('left', o->'away'))));
$$;

create or replace function private.travel_checked(n jsonb, rid text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
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
end $$;
revoke all on function private.travel_checked(jsonb, text) from public, anon;
revoke all on function private.punch_breaks_kept(jsonb, jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.punch_breaks_kept(jsonb, jsonb) to authenticated;
grant execute on function private.travel_checked(jsonb, text) to authenticated;

do $patch$
declare src text; a text; b text;
begin
  src := pg_get_functiondef('public.guard_record()'::regprocedure);
  if position($m$-- A2 punches$m$ in src) = 0 then
    a := $x$  if role = 'owner' then return new; end if;
$x$; b := $y$  -- A2 punches: server receive time, set once, never changed by a phone
  if new.coll = 'punches' and jsonb_typeof(n) = 'object' then
    if tg_op = 'INSERT' or old.deleted then new.data := (n - 'srvIn') || jsonb_build_object('srvIn', nowms);
    else new.data := (n - 'srvIn') || case when jsonb_typeof(o) = 'object' and o ? 'srvIn' then jsonb_build_object('srvIn', o->'srvIn') else '{}'::jsonb end; end if;
    n := new.data;
  end if;
  if role = 'owner' then return new; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'A2: anchor not found exactly once in public.guard_record(): %', a; end if;
    src := replace(src, a, b);
    a := $x$  if new.coll = 'punches' and not hours then
$x$; b := $y$  if new.coll = 'punches' and not hours then
    if tg_op = 'UPDATE' and old.deleted then raise exception 'only Payroll can bring back a deleted clock entry' using errcode = '42501'; end if;
    if o is not null and not private.punch_breaks_kept(o, n) then raise exception 'breaks can only be changed by Payroll' using errcode = '42501'; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'A2: anchor not found exactly once in public.guard_record(): %', a; end if;
    src := replace(src, a, b);
    a := $x$  elsif new.coll = 'travel' and not boss then
$x$; b := $y$  elsif new.coll = 'travel' and not boss then
    if o is null or old.deleted then new.data := private.travel_checked(n, new.id); n := new.data; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'A2: anchor not found exactly once in public.guard_record(): %', a; end if;
    src := replace(src, a, b);
    execute src;
  end if;
  src := pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure);
  if position($m$-- A2 signs$m$ in src) = 0 then
    a := $x$order by value->>'id' loop
$x$; b := $y$order by value->>'id' loop
    -- A2 signs: a pick-up only takes out, a return only brings in, a count only sets
    if (kind = 'set') <> (m ? 'set') then raise exception 'bad move for this kind of change' using errcode = '22023'; end if;
    if kind = 'out' and coalesce(public._num(m->>'delta'), 0) >= 0 then raise exception 'a pick-up must take items out' using errcode = '22023'; end if;
    if kind = 'in' and coalesce(public._num(m->>'delta'), 0) <= 0 then raise exception 'a return must bring items in' using errcode = '22023'; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'A2: anchor not found exactly once in public.apply_stock_txn(jsonb): %', a; end if;
    src := replace(src, a, b);
    execute src;
  end if;
  src := pg_get_functiondef('public.stamp_record()'::regprocedure);
  if position($m$-- A2 size$m$ in src) = 0 then
    a := $x$  if current_user in ('authenticated','anon') and auth.uid() is not null then
$x$; b := $y$  -- A2 size: photos go to file storage, so no record needs to be this big
  if current_user in ('authenticated','anon') and octet_length(new.data::text) > 400000 then
    raise exception 'record too large' using errcode = '42501'; end if;
  if current_user in ('authenticated','anon') and auth.uid() is not null then
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'A2: anchor not found exactly once in public.stamp_record(): %', a; end if;
    src := replace(src, a, b);
    execute src;
  end if;
end $patch$;
