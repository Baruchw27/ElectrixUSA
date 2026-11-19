-- Baruch 11/19: remember the newest phone reading handled per person, so a reading the phone sends again (Android re-sends
-- its last fix over and over) is dropped as a repeat, while a late but NEW reading still counts with its own time.
alter table private.ot_tokens add column if not exists last_tst bigint;
create or replace function public.ot_tst(p_who text, p_tst bigint) returns bigint
language plpgsql security definer set search_path = public, private as $f$
declare prev bigint;
begin
  select last_tst into prev from private.ot_tokens where who = p_who for update;
  update private.ot_tokens set last_tst = greatest(coalesce(last_tst, 0), p_tst) where who = p_who;
  return prev;
end $f$;
revoke all on function public.ot_tst(text, bigint) from public, anon, authenticated;
