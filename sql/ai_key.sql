-- 11/15 (Baruch): the AI key for ✨ Ask (and the app's other AI features) is pasted in the app by the owner or Payroll (Shia).
-- Write-only, like the Fingercheck keys: it goes into the locked server_config table (no one can read it through the app);
-- only the server functions "ask" and "ai" use it. The app can see only the last 4 characters and when it was saved.
create or replace function public.ai_set_key(p_v text) returns text language plpgsql security definer set search_path to 'public' as $f$
declare me jsonb := public.my_emp_data(); v text := btrim(coalesce(p_v, ''));
begin
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then
    raise exception 'only the owner or Payroll can set the AI key' using errcode = '42501'; end if;
  if v = '' then delete from public.server_config where k in ('anthropic_key', 'anthropic_key_meta'); return null; end if;
  if length(v) > 300 or v ~ '\s' or v !~ '^sk-ant-' then raise exception 'that does not look like an Anthropic key (it starts with sk-ant-)' using errcode = '22023'; end if;
  insert into public.server_config (k, v) values ('anthropic_key', v) on conflict (k) do update set v = excluded.v;
  insert into public.server_config (k, v) values ('anthropic_key_meta', jsonb_build_object('last4', right(v, 4), 'at', now(), 'by', me->>'id')::text)
    on conflict (k) do update set v = excluded.v;
  return right(v, 4);
end $f$;
create or replace function public.ai_key_status() returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare me jsonb := public.my_emp_data(); m text;
begin
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then raise exception 'not allowed' using errcode = '42501'; end if;
  select v into m from public.server_config where k = 'anthropic_key_meta';
  if not exists (select 1 from public.server_config where k = 'anthropic_key' and coalesce(v, '') <> '') then return null; end if;
  return coalesce(m::jsonb, '{}'::jsonb);
end $f$;
revoke all on function public.ai_set_key(text), public.ai_key_status() from public, anon, authenticated;
grant execute on function public.ai_set_key(text), public.ai_key_status() to authenticated;
