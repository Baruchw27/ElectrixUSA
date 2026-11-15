-- Baruch 11/15: nightly self-check of the Electrix Assistant (the "ask" function, called with the push secret).
-- Result in server_config 'ask_check'; the owner gets a push if it fails. ai_key_status now also returns the last check.
create or replace function public.ai_key_status() returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare me jsonb := public.my_emp_data(); m text; c text;
begin
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then raise exception 'not allowed' using errcode = '42501'; end if;
  select v into m from public.server_config where k = 'anthropic_key_meta';
  select v into c from public.server_config where k = 'ask_check';
  if not exists (select 1 from public.server_config where k = 'anthropic_key' and coalesce(v, '') <> '') then return null; end if;
  return coalesce(m::jsonb, '{}'::jsonb) || jsonb_build_object('check', case when c is null then null else c::jsonb end);
end $f$;
-- the anon key is public (it is inside the app); the scheduler needs it to reach the function
-- insert into server_config(k,v) values ('anon_key','<publishable anon key>') on conflict (k) do update set v = excluded.v;
select cron.schedule('ask-self-check', '13 8 * * *', $$
  select net.http_post(
    url := (select v from server_config where k='functions_url')||'/ask',
    body := '{"check":true}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret',(select v from server_config where k='secret'),
                                  'Authorization','Bearer '||(select v from server_config where k='anon_key'),'apikey',(select v from server_config where k='anon_key')),
    timeout_milliseconds := 120000)
$$);
