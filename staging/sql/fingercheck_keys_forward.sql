-- Fingercheck keys typed in the app by the owner. Write-only: nobody can read them back except the server function.
create table if not exists private.fc_keys (k text primary key check (k in ('api','usa','inc')), v text not null, updated_at timestamptz not null default now(), updated_by text);
revoke all on private.fc_keys from public, anon, authenticated;
create or replace function public.fc_set_key(p_k text, p_v text) returns text language plpgsql security definer set search_path to 'public' as $f$
declare me jsonb := public.my_emp_data(); v text := btrim(coalesce(p_v, ''));
begin
  if coalesce(me->>'role','') <> 'owner' then raise exception 'only the owner can set the Fingercheck keys' using errcode = '42501'; end if;
  if p_k not in ('api','usa','inc') then raise exception 'unknown key' using errcode = '22023'; end if;
  if v = '' then delete from private.fc_keys where k = p_k; return null; end if;
  if length(v) > 500 or v ~ '\s' then raise exception 'that does not look like a key' using errcode = '22023'; end if;
  insert into private.fc_keys (k, v, updated_at, updated_by) values (p_k, v, now(), me->>'id')
  on conflict (k) do update set v = excluded.v, updated_at = now(), updated_by = excluded.updated_by;
  return right(v, 4);
end $f$;
create or replace function public.fc_key_status() returns table (k text, last4 text, updated_at timestamptz) language plpgsql security definer set search_path to 'public' as $f$
declare me jsonb := public.my_emp_data();
begin
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query select f.k, right(f.v, 4), f.updated_at from private.fc_keys f;
end $f$;
create or replace function public.fc_keys_server() returns jsonb language sql security definer set search_path to 'public' as $f$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from private.fc_keys;
$f$;
revoke all on function public.fc_set_key(text,text), public.fc_key_status(), public.fc_keys_server() from public, anon, authenticated;
grant execute on function public.fc_set_key(text,text), public.fc_key_status() to authenticated;
grant execute on function public.fc_keys_server() to service_role;
