-- STAGING (prepared, apply only when AI label reading is approved): per-person and team daily caps for the "ai" function.
create table if not exists public.ai_usage(day date not null default current_date, uid uuid not null, kind text not null, n int not null default 0, primary key(day, uid, kind));
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
create or replace function public.ai_take(p_kind text) returns boolean language plpgsql security definer set search_path = public as $$
declare mine int; team int;
begin
  if auth.uid() is null or not public.is_member() then return false; end if;
  select coalesce(sum(n),0) into team from ai_usage where day = current_date;
  select coalesce(sum(n),0) into mine from ai_usage where day = current_date and uid = auth.uid();
  if mine >= 60 or team >= 400 then return false; end if;
  insert into ai_usage(day, uid, kind, n) values (current_date, auth.uid(), coalesce(p_kind,'quick'), 1)
    on conflict (day, uid, kind) do update set n = ai_usage.n + 1;
  return true;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;
