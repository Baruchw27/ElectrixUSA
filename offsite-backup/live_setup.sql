-- LIVE setup for the nightly encrypted off-site backup (NOT applied until Baruch approves). Read-only for the app:
-- adds backup/restore functions only the server's own key can call, the overdue alert, and the owner's PUBLIC key.
-- No drill secret on live: only the private electrix-backups GitHub job (signed GitHub token) can download.
-- Audit A7 (STAGING) — off-site backup and tested restore.
-- backup_snapshot(): everything needed to rebuild the app's data: every record (including removed ones), the stock
--   system's applied-move list, the list of files, and the database rules (functions, triggers, policies, tables) so a
--   brand-new project could be set up from it. Only the server's own key can call it (not the app, not employees).
-- backup_restore(): puts records back from a snapshot. Modes:
--   'check'   — changes nothing; reports how many records differ / are missing
--   'missing' — brings back only records that are missing or were removed since the backup (never overwrites newer work)
--   'all'     — makes every record exactly as in the backup (for a full disaster restore)
--   target 'drill' writes into drill.records instead of the live table (used to test restores safely).
-- Every restore is itself logged in records_history (the normal change log), so it can be reviewed and undone.

create schema if not exists drill;
create table if not exists drill.records (like public.records including all);
revoke all on schema drill from public, anon, authenticated;
revoke all on drill.records from public, anon, authenticated;

create or replace function public.backup_snapshot() returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare recs jsonb; sa jsonb; files jsonb; fns jsonb; trg jsonb; pol jsonb; tbl jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('coll',coll,'id',id,'data',data,'deleted',deleted,'updated_by',updated_by,'updated_at',updated_at) order by coll,id),'[]'::jsonb) into recs from public.records;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'at',at,'fingerprint',fingerprint) order by id),'[]'::jsonb) into sa from public.stock_applied;
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'size',(metadata->>'size')::bigint,'type',metadata->>'mimetype','updated_at',updated_at) order by name),'[]'::jsonb) into files from storage.objects where bucket_id = 'files';
  select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'def',pg_get_functiondef(p.oid)) order by n.nspname,p.proname),'[]'::jsonb) into fns
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.prokind = 'f';
  select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'def',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname),'[]'::jsonb) into trg
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.schemaname,x.tablename,x.policyname),'[]'::jsonb) into pol from pg_policies x where x.schemaname in ('public','storage');
  select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'columns',cols) order by table_name),'[]'::jsonb) into tbl from (
    select table_name, jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'default',column_default,'null',is_nullable) order by ordinal_position) cols
    from information_schema.columns where table_schema = 'public' group by table_name) q;
  return jsonb_build_object('meta', jsonb_build_object('format','electrix-backup-1','taken_at',now(),'database',current_database(),
            'records',jsonb_array_length(recs),'records_md5',md5(recs::text),'stock_applied',jsonb_array_length(sa),'files',jsonb_array_length(files)),
         'records',recs,'stock_applied',sa,'files',files,
         'schema',jsonb_build_object('functions',fns,'triggers',trg,'policies',pol,'tables',tbl));
end $$;

create or replace function public.backup_restore(p jsonb, p_mode text default 'check', p_target text default 'public')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; cur record; missing int := 0; differ int := 0; same int := 0; written int := 0; newdata jsonb; tgt text;
begin
  if coalesce(p->'meta'->>'format','') <> 'electrix-backup-1' then raise exception 'not an Electrix backup'; end if;
  if p_mode not in ('check','missing','all') then raise exception 'mode must be check, missing or all'; end if;
  if p_target not in ('public','drill') then raise exception 'target must be public or drill'; end if;
  tgt := case when p_target = 'drill' then 'drill.records' else 'public.records' end;
  -- the encrypted file already proves it is complete and unchanged (AES-GCM + SHA-256); here we make sure nothing was cut off
  if jsonb_typeof(p->'records') <> 'array' or jsonb_array_length(p->'records') <> coalesce((p->'meta'->>'records')::int, -1) then
    raise exception 'backup file is incomplete (record count does not match)'; end if;
  for r in select value from jsonb_array_elements(p->'records') loop
    execute format('select data, deleted from %s where coll = $1 and id = $2', tgt) into cur using r->>'coll', r->>'id';
    if cur is null then missing := missing + 1;
    elsif cur.data is distinct from (r->'data') or cur.deleted is distinct from (r->>'deleted')::boolean then differ := differ + 1;
    else same := same + 1; continue; end if;
    if p_mode = 'check' then continue; end if;
    if p_mode = 'missing' and cur is not null and not (cur.deleted and not (r->>'deleted')::boolean) then continue; end if;
    newdata := r->'data';
    -- the schedule only accepts a higher revision number; a restored day gets one so the phones take it
    if r->>'coll' = 'sched' and cur is not null and jsonb_typeof(newdata) = 'object' then
      newdata := newdata || jsonb_build_object('rev', greatest(coalesce(public._num(newdata->>'rev'),0), coalesce(public._num(cur.data->>'rev'),0) + 1));
    end if;
    execute format('insert into %s(coll,id,data,deleted,updated_by,updated_at) values ($1,$2,$3,$4,$5,now())
                    on conflict (coll,id) do update set data = excluded.data, deleted = excluded.deleted, updated_by = excluded.updated_by, updated_at = now()', tgt)
      using r->>'coll', r->>'id', newdata, (r->>'deleted')::boolean, 'restore:' || coalesce(p->'meta'->>'taken_at','?');
    written := written + 1;
  end loop;
  return jsonb_build_object('mode',p_mode,'target',p_target,'in_backup',jsonb_array_length(p->'records'),'same',same,'differ',differ,'missing',missing,'written',written);
end $$;

revoke all on function public.backup_snapshot() from public, anon, authenticated;
revoke all on function public.backup_restore(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.backup_snapshot() to service_role;
grant execute on function public.backup_restore(jsonb, text, text) to service_role;

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

insert into public.server_config(k,v) select 'backup_pubkey', $pk$-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEApFt5MU3JT7ncbCJdz73s
+fr1+jewIarYrCmP1M8bV73Uc94q/Gv44VUbbP65T5SdZzLbNdOXsbkeHeVAKDI0
rbtLdo17Tqpz9qKvGMafMfaf04zeSMMvC0vICMedswpx1znV8qMQSKJDfivpWZfH
GcNQyxkQpL9sWeYoedWOK+JzaYdcPGoQEkQEyToXe6JLgVoBTzWtCiseflToQxxs
HIK1nEH8caxICLQiFCnN51B/y+BfhkshbLwh1hMQwfI9ecYJ3Im/D8AY4z5YrqxM
1fV0XfrFntkNtQI5dgjEfu+QgFJBhdwtiJAOl4m3fqmAo4ot4RT+50a67p0PLBRA
2UEY3RySQ2pzVu/GjCTTB/iJY1KQKYMlKexAtYhEfNdI/9P6OZsTc5ONuCX4IOei
D2+hAnZHzHMrzZOA3Bi9Z7e+6oFJX2HsmTPfOxO5mENEnqBq6lqnRtiRpbMn4jZz
MBxQX9YSqMgyMX7Tx1FWjV7P1VtVfzYNapJv6VKLSMbXYioBCRjZoPemOsqmng5l
gBGSQnXYJaDmVm0Xo8/ROLBO6TJrEvs360mTfVgBp2csDY5qvH359vuq6P5pAmjb
UaJRQ7Hx1P9wn80gF/s+pXY6aEDbW6OHouXEcoKyYS8RKL5XLZeHWisCnL/mnjK0
TyrY5Nx1lXKZdYh3MnWW9GcCAwEAAQ==
-----END PUBLIC KEY-----
$pk$ where not exists (select 1 from public.server_config where k='backup_pubkey');
insert into public.server_config(k,v) select 'backup_repo','Baruchw27/electrix-backups' where not exists (select 1 from public.server_config where k='backup_repo');
