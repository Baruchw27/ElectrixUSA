-- Baruch 11/20 (Lennin, Android, 220 Prospect): a punch made with no signal waits on the phone until the Electrix app is open
-- WITH signal. On Android the phone can send it by itself in the background (Background Sync) — the app's helper
-- (service worker) sends it to the edge function "punchsync" as soon as there is signal, even with the app closed.
-- The helper has no sign-in of its own, so each phone gets a "punch key" when the person is signed in: it can ONLY save
-- that person's own punches, through the very same checks as the app (guard_punch etc. run as that person).
create table if not exists private.bg_keys (
  dev text primary key,              -- random id of the phone (made by the app)
  who text not null,                 -- Electrix person id (emps)
  uid uuid not null,                 -- his sign-in id (auth.users)
  key_hash text not null,            -- sha256 of the key (the key itself is only on the phone)
  created_at timestamptz not null default now(),
  last_used timestamptz
);
revoke all on private.bg_keys from public, anon, authenticated;

-- called by the signed-in app: a new key for this phone (replaces the old one)
create or replace function public.bg_key_register(p_dev text) returns text
language plpgsql security definer set search_path = public as $f$
declare u uuid := auth.uid(); e jsonb; k text;
begin
  if u is null or p_dev is null or length(p_dev) < 8 or length(p_dev) > 80 then return null; end if;
  e := public.my_emp_data();
  if e = '{}'::jsonb or coalesce(e->>'id','') = '' then return null; end if;
  k := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.bg_keys(dev, who, uid, key_hash, created_at, last_used)
    values (p_dev, e->>'id', u, encode(extensions.digest(k, 'sha256'), 'hex'), now(), null)
    on conflict (dev) do update set who = excluded.who, uid = excluded.uid, key_hash = excluded.key_hash, created_at = now(), last_used = null;
  return k;
end $f$;
revoke all on function public.bg_key_register(text) from public, anon;
grant execute on function public.bg_key_register(text) to authenticated;

-- sign-out: the phone's key stops working
create or replace function public.bg_key_drop(p_dev text) returns void
language sql security definer set search_path = public as $f$
  update private.bg_keys set key_hash = 'revoked', last_used = now() where dev = p_dev and uid = auth.uid() $f$;
revoke all on function public.bg_key_drop(text) from public, anon;
grant execute on function public.bg_key_drop(text) to authenticated;
