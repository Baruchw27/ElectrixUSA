-- AI spending caps for scanner label reading (applied on staging Oct 19 2026; part of the production release only if AI is approved).
-- Label reading: 60 per person per day, 400 per team per day, 3,000 per month. Other AI features are only counted.
create table if not exists public.ai_usage(day date not null default current_date, uid uuid not null, kind text not null, n int not null default 0, primary key(day, uid, kind));
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
create or replace function public.ai_take(p_kind text) returns boolean language plpgsql security definer set search_path = public as $$
declare mine int; team int; month int; k text := coalesce(p_kind,'label');
begin
  if auth.uid() is null or not public.is_member() then return false; end if;
  if k = 'label' then
    perform pg_advisory_xact_lock(hashtext('ai_take'));             -- two phones at once can't both slip past a cap
    select coalesce(sum(n),0) into team from ai_usage where day = current_date and kind = 'label';
    select coalesce(sum(n),0) into mine from ai_usage where day = current_date and kind = 'label' and uid = auth.uid();
    select coalesce(sum(n),0) into month from ai_usage where day >= date_trunc('month', current_date)::date and kind = 'label';
    if mine >= 60 or team >= 400 or month >= 3000 then return false; end if;
  end if;
  insert into ai_usage(day, uid, kind, n) values (current_date, auth.uid(), k, 1)
    on conflict (day, uid, kind) do update set n = ai_usage.n + 1;
  return true;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;
