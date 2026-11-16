-- Baruch 11/15 (late): an automatic "pack up — go home" message every workday, 15 minutes before the day ends
-- (6:45 PM; Friday 1:00 PM), to everyone on the app clock who is still punched in today. A crew kept late with
-- "Stay late" gets neither this nor the 7:05 "still punched in" reminder — they get the go-home message when the
-- boss taps "Send home". Patched into private.clock_tick (runs every 5 minutes) without touching the rest of it.
create or replace function private.kept_late(p_who text, p_day text) returns boolean
language sql stable security definer set search_path = public as $f$
  select coalesce((select r.data->>'kind' = 'late' from public.records r
    where r.coll = 'goHomeLog' and not r.deleted and r.data->>'who' = p_who
      and to_char(to_timestamp(public._num(r.data->>'ts')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = p_day
    order by public._num(r.data->>'ts') desc limit 1), false) $f$;
revoke all on function private.kept_late(text,text) from public, anon, authenticated;

do $$
declare d text; d2 text;
  anchor text := $a$    if hm >= endm + 5 and hm < endm + 120 and not done ? ('out:'||e.id) then$a$;
begin
  d := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('pack:' in d) > 0 then return; end if;
  if position(anchor in d) = 0 then raise exception 'clock_tick: 7:05 reminder not found'; end if;
  d2 := replace(d, anchor,
$b$    if hm >= endm - 15 and hm < endm + 5 and not done ? ('pack:'||e.id) and not private.kept_late(e.id, d) then
      if exists (select 1 from records r where r.coll='punches' and not r.deleted and r.data->>'who' = e.id and coalesce(r.data->'out','null'::jsonb) = 'null'::jsonb
          and r.data->>'voided' is null and to_char(to_timestamp(public._num(r.data->>'in')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = d) then
        perform private.notify_now(e.id, '🏠 Pack up — the day ends in 15 minutes. Time to go home.',
          '🏠 Recojan — en 15 minutos se termina el día. Hora de irse a casa.', 'info', jsonb_build_object('tab','punch'), null);
        done := done || to_jsonb('pack:'||e.id); n := n + 1; end if;
    end if;
    if hm >= endm + 5 and hm < endm + 120 and not done ? ('out:'||e.id) and not private.kept_late(e.id, d) then$b$);
  execute d2;
end $$;
