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
