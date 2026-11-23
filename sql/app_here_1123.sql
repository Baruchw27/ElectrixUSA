-- Baruch 11/23 (Fernando: tracker silent since 9:31, he opened the app at 1:31 PM, not clocked in — "But where is he now?"):
-- whenever a man has the Electrix app open, his phone tells the server which job he is standing at (inside its fence), or
-- "not at any job", at most every 5 minutes. Only the job — never the position. Only 6 AM – 9 PM.
-- Shown to the owner/Payroll on the Today page and in the where-is-everyone check. Being seen back at a job also feeds the one
-- "back at the job" rule (private.back_on_job).
create table if not exists private.app_seen (who text primary key, site text, at bigint not null, open boolean, updated timestamptz default now());
revoke all on private.app_seen from public, anon, authenticated;

create or replace function public.app_here(p_site text, p_at bigint, p_open boolean default null) returns text
language plpgsql security definer set search_path to 'public' as $f$
declare me jsonb := public.my_emp_data(); v_who text := me->>'id'; nowms bigint := (extract(epoch from now())*1000)::bigint; h int; r text := '';
begin
  if v_who is null or p_at is null then return ''; end if;
  if p_at > nowms + 60000 or p_at < nowms - 15*60000 then return ''; end if;
  h := extract(hour from to_timestamp(p_at/1000.0) at time zone 'America/New_York')::int;
  if h < 6 or h >= 21 then return ''; end if;
  if p_site is not null and not exists (select 1 from records where coll='sites' and id = p_site and not deleted) then p_site := null; end if;
  insert into private.app_seen(who, site, at, open, updated) values (v_who, p_site, p_at, p_open, now())
    on conflict (who) do update set site = excluded.site, at = excluded.at, open = excluded.open, updated = now()
    where private.app_seen.at <= excluded.at;
  if p_site is not null then r := private.back_on_job(v_who, p_site, p_at, 'his phone'); end if;
  return coalesce(r, '');
end $f$;
revoke all on function public.app_here(text,bigint,boolean) from public, anon;
grant execute on function public.app_here(text,bigint,boolean) to authenticated;

-- the Today page / time cards (owner + Payroll only): add where the app last saw each man
do $d$
declare s text := pg_get_functiondef('public.ot_report'::regproc); a text;
begin
  if position('app_seen' in s) > 0 then return; end if;
  a := E'    ''events'', coalesce(';
  if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'ot_report events not found once'; end if;
  s := replace(s, a, E'    ''app'', coalesce((select jsonb_agg(jsonb_build_object(''who'', who, ''site'', site, ''at'', at, ''open'', open)) from private.app_seen), ''[]''::jsonb),\n    ''events'', coalesce(');
  execute s;
end $d$;
