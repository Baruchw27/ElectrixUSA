-- B6 (staging first): Baruch's Time Clock rule + schedule-notice wording.
--  • Time Clock YES/NO per employee (emps.data.clock = false means NO). Only the Owner, an all-access admin or Payroll
--    can change it; anyone else's save keeps the old value. (Replaces the earlier "paid monthly" switch — no pay data.)
--  • Schedule messages never name a job for exception days (cancel / replace / patch) or a day that was cleared or
--    removed — they say the schedule changed and to open the app (an ongoing job may still continue that day).
create or replace function public.guard_emp_pay() returns trigger language plpgsql set search_path = public as $$
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
end $$;

do $do$ declare d text; a1 text; a2 text; a3 text; a4 text; begin
  d := pg_get_functiondef('public.notify_assign'::regproc);
  a1 := $x$  if new.deleted or jsonb_typeof(n) <> 'object' then return null; end if;$x$;
  a2 := $x$        en := private.day_label(day, 'en') || ': ' || case when txt <> '' then txt$x$;
  a3 := $x$        es := private.day_label(day, 'es') || ': ' || case when txt <> '' then txt$x$;
  a4 := $x$                else 'no job scheduled for your crew' end;$x$;
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 or position(a4 in d) = 0 then raise exception 'notify_assign not the expected version'; end if;
  -- a removed schedule day is a change too (treated as an empty day)
  d := replace(d, a1, $x$  if new.coll = 'sched' and new.deleted then n := '{}'::jsonb;
  elsif new.deleted or jsonb_typeof(n) <> 'object' then return null; end if;$x$);
  d := replace(d, a2, $x$        if coalesce(n->>'cancel','') <> '' or coalesce(n->>'replace','') <> '' or n ? 'patch' then txt := ''; end if;
        en := private.day_label(day, 'en') || ': ' || case when txt <> '' then txt$x$);
  d := replace(d, a3, $x$        es := private.day_label(day, 'es') || ': ' || case when txt <> '' then txt$x$);
  d := replace(d, a4, $x$                else 'schedule changed — open the app' end;$x$);
  d := replace(d, $x$                else 'sin trabajo programado para tu cuadrilla' end;$x$, $x$                else 'el horario cambió — abre la app' end;$x$);
  d := replace(d, $x$then 'changed — open the schedule'$x$, $x$then 'schedule changed — open the app'$x$);
  d := replace(d, $x$then 'cambió — abre el horario'$x$, $x$then 'el horario cambió — abre la app'$x$);
  execute d;
end $do$;

-- a removed ongoing job is announced as ending today
do $do$ declare d text; a text; begin
  d := pg_get_functiondef('public.notify_assign'::regproc);
  if position('removed rule = ends today' in d) > 0 then return; end if;
  a := $x$      if k ~ '^ONG:' then
        crew := split_part(k, ':', 2);$x$;
  if position(a in d) = 0 then raise exception 'notify_assign not the expected version'; end if;
  d := replace(d, a, $x$      if k ~ '^ONG:' then
        crew := split_part(k, ':', 2);
        if n = '{}'::jsonb then n := o || jsonb_build_object('to', to_char(tdy, 'YYYY-MM-DD')); end if;   -- removed rule = ends today$x$);
  execute d;
end $do$;
