-- Audit A8 — helpers for the nightly off-site backup + the "backup is overdue" alert (free plan, no extra services).
create or replace function public.backup_files_since(p_since timestamptz)
returns table(name text, type text, created_at timestamptz) language sql stable security definer set search_path to 'public' as $$
  select o.name, o.metadata->>'mimetype', o.created_at from storage.objects o
   where o.bucket_id = 'files' and o.created_at > coalesce(p_since, 'epoch') order by o.created_at, o.name;
$$;
create or replace function public.backup_note(p_k text, p_v text) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_k not in ('last_backup_records','last_backup_files') then raise exception 'not a backup note'; end if;
  update public.server_config set v = p_v where k = p_k;
  if not found then insert into public.server_config(k, v) values (p_k, p_v); end if;
end $$;
-- Once a day: if the last good off-site backup is more than 30 hours old, every owner gets an alert in the app
-- (bell + phone notification, like any other message). It repeats each day until backups are working again.
create or replace function public.backup_health_check() returns text language plpgsql security definer set search_path to 'public' as $$
declare last timestamptz; enabled boolean; o record; msg text;
begin
  enabled := exists (select 1 from public.server_config where k = 'backup_repo' and coalesce(v,'') <> '');
  if not enabled then return 'off-site backup not set up'; end if;
  select (v::jsonb->>'at')::timestamptz into last from public.server_config where k = 'last_backup_records';
  if last is not null and last > now() - interval '30 hours' then return 'ok: last backup ' || last; end if;
  msg := '⚠ Nightly backup is overdue' || case when last is null then ' (none yet)' else ' — last good copy ' || to_char(last at time zone 'America/New_York', 'Mon DD HH12:MI AM') end
         || '. Check the electrix-backups page on GitHub, or ask Claude.';
  for o in select id from public.records where coll = 'emps' and not deleted and data->>'role' = 'owner' loop
    insert into public.records(coll, id, data, deleted) values ('inbox', 'bk' || to_char(now(), 'YYYYMMDD') || o.id,
      jsonb_build_object('id', 'bk' || to_char(now(), 'YYYYMMDD') || o.id, 'to', o.id, 'ts', (extract(epoch from now()) * 1000)::bigint,
                         'msg', msg, 'from', o.id, 'kind', 'warn', 'link', null, 'read', false), false)
    on conflict (coll, id) do nothing;
  end loop;
  return 'alerted: ' || msg;
end $$;
revoke all on function public.backup_files_since(timestamptz) from public, anon, authenticated;
revoke all on function public.backup_note(text, text) from public, anon, authenticated;
revoke all on function public.backup_health_check() from public, anon, authenticated;
grant execute on function public.backup_files_since(timestamptz) to service_role;
grant execute on function public.backup_note(text, text) to service_role;
select cron.schedule('backup-health', '7 13 * * *', 'select public.backup_health_check()');
