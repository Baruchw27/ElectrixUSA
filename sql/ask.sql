-- 11/15 (Baruch): the ✨ Ask assistant counts against a daily limit too (each step of an answer is one call).
create or replace function public.ai_take(p_kind text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare mine int; team int; month int; k text := coalesce(p_kind,'label');
begin
  if auth.uid() is null or not public.is_member() then return false; end if;
  if k = 'label' then
    perform pg_advisory_xact_lock(hashtext('ai_take'));             -- two phones at once can't both slip past a cap
    select coalesce(sum(n),0) into team from ai_usage where day = current_date and kind = 'label';
    select coalesce(sum(n),0) into mine from ai_usage where day = current_date and kind = 'label' and uid = auth.uid();
    select coalesce(sum(n),0) into month from ai_usage where day >= date_trunc('month', current_date)::date and kind = 'label';
    if mine >= 60 or team >= 400 or month >= 3000 then return false; end if;
  elsif k = 'ask' then
    perform pg_advisory_xact_lock(hashtext('ai_take_ask'));
    select coalesce(sum(n),0) into team from ai_usage where day = current_date and kind = 'ask';
    select coalesce(sum(n),0) into mine from ai_usage where day = current_date and kind = 'ask' and uid = auth.uid();
    select coalesce(sum(n),0) into month from ai_usage where day >= date_trunc('month', current_date)::date and kind = 'ask';
    if mine >= 300 or team >= 1500 or month >= 15000 then return false; end if;
  end if;
  insert into ai_usage(day, uid, kind, n) values (current_date, auth.uid(), k, 1)
    on conflict (day, uid, kind) do update set n = ai_usage.n + 1;
  return true;
end $function$;
