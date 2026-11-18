-- Baruch 11/17: when a forgotten app punch closes by itself (always at the time he left the job / the last time the app
-- saw him on it / the day's end):
--   • normal day: 1 hour after the day's end (8 PM; Friday 2:15 PM) — not 2 hours;
--   • crew kept late ("Stay late"): 1 hour after the boss taps "Send home"; never sent home → midnight;
--   • the phone saw him LEAVE: 1 hour after he left, but never later than the deadline above (left 7:13 → closes 8:00
--     at 7:13, not 8:13).
create or replace function private.clock_due(p_who text, p_day text, p_end timestamp) returns timestamp
language sql stable security definer set search_path = public as $f$
  with g as (select r.data->>'kind' kind, public._num(r.data->>'ts') ts from public.records r
             where r.coll = 'goHomeLog' and not r.deleted and r.data->>'who' = p_who and public._num(r.data->>'ts') is not null
               and to_char(to_timestamp(public._num(r.data->>'ts')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = p_day
             order by public._num(r.data->>'ts') desc limit 1)
  select case
    when (select kind from g) = 'late' then date_trunc('day', p_end) + interval '1 day'
    when exists (select 1 from g) and (to_timestamp((select ts from g)/1000.0) at time zone 'America/New_York') > p_end
      then (to_timestamp((select ts from g)/1000.0) at time zone 'America/New_York') + interval '1 hour'
    else p_end + interval '1 hour' end $f$;
revoke all on function private.clock_due(text,text,timestamp) from public, anon, authenticated;
grant execute on function private.clock_due(text,text,timestamp) to service_role;

do $$
declare d text; d2 text; aw_old text := $a$if aw is not null and aw > public._num(p.data->>'in') and nowms >= aw + 3600000 then$a$;
begin
  d := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('clock_due(' in d) > 0 then return; end if;
  d2 := regexp_replace(d, $r$due := \(pend \+ [^;]*;( +/\*[^*]*\*/)?$r$,
    $b$due := private.clock_due(p.data->>'who', to_char(pin,'YYYY-MM-DD'), pend) at time zone 'America/New_York';  /* Baruch 11/17 */$b$);
  if d2 = d then raise exception 'clock_tick: close deadline not found'; end if;
  if position(aw_old in d2) = 0 then raise exception 'clock_tick: left-the-job close not found'; end if;
  d2 := replace(d2, aw_old, $b$if aw is not null and aw > public._num(p.data->>'in') and (nowms >= aw + 3600000 or p_now >= due) then$b$);
  execute d2;
end $$;
