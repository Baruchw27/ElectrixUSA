-- Baruch 11/23 ("make sure his OwnTracks is on Move"): OwnTracks sends its monitoring mode with every location report
-- (m: -1 quiet, 0 manual, 1 significant changes, 2 move). Keep the latest per man so the Today page can warn when a phone is
-- not on Move. Older reports never overwrite a newer one.
alter table private.ot_tokens add column if not exists mode int;
alter table private.ot_tokens add column if not exists mode_at timestamptz;

create or replace function public.ot_mode(p_who text, p_m int, p_at bigint) returns void
language sql security definer set search_path to 'public' as $f$
  update private.ot_tokens set mode = p_m, mode_at = to_timestamp(p_at/1000.0)
   where who = p_who and (mode_at is null or mode_at <= to_timestamp(p_at/1000.0)) $f$;
revoke all on function public.ot_mode(text,int,bigint) from public, anon, authenticated;
grant execute on function public.ot_mode(text,int,bigint) to service_role;

-- the Today page (owner + Payroll): add the mode to each man's tracker line
do $d$
declare s text := pg_get_functiondef('public.ot_report'::regproc); a text;
begin
  if position('''mode''' in s) > 0 then return; end if;
  a := '''batt_at'', batt_at)';
  if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'ot_report people not found once'; end if;
  s := replace(s, a, '''batt_at'', batt_at, ''mode'', mode, ''mode_at'', mode_at)');
  execute s;
end $d$;
