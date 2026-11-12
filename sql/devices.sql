-- Baruch 11/12: every phone / computer reports every few minutes whether it has changes waiting to be saved
create table if not exists private.devices (dev text primary key, who text, ver text, pending int, rejects int, err text, ua text,
  online boolean, first_at timestamptz not null default now(), last_at timestamptz not null default now(), stuck_since timestamptz);
create or replace function public.device_ping(p_dev text, p_ver text, p_pending int, p_rejects int, p_err text, p_ua text, p_online boolean) returns void
language plpgsql security definer set search_path = public, private as $f$
declare w text := (public.my_emp_data())->>'id';
begin
  if w is null or coalesce(p_dev,'') = '' then return; end if;
  insert into private.devices(dev, who, ver, pending, rejects, err, ua, online, stuck_since)
  values (left(p_dev,40), w, left(p_ver,40), p_pending, p_rejects, left(p_err,200), left(p_ua,160), p_online, case when p_pending > 0 then now() end)
  on conflict (dev) do update set who = excluded.who, ver = excluded.ver, pending = excluded.pending, rejects = excluded.rejects, err = excluded.err,
    ua = excluded.ua, online = excluded.online, last_at = now(),
    stuck_since = case when excluded.pending > 0 then coalesce(private.devices.stuck_since, now()) else null end;
end $f$;
revoke all on function public.device_ping(text,text,int,int,text,text,boolean) from public, anon; grant execute on function public.device_ping(text,text,int,int,text,text,boolean) to authenticated;
