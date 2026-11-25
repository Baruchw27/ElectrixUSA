-- 2026-11-25  Capacity fix + retention + monitoring (applied to live as migrations
-- retention_1125_backup_ring_and_cron_log and capacity_monitor_1125).
-- Before: 492 MB of 500 MB. After: 391 MB. No business records changed.
-- Proof run before trimming: all 14 in-database backup days (287,613 rows) rebuilt exactly
-- from records + records_history (0 differences), so the removed days held no unique data.

-- 1) In-database backup ring keeps 7 days (was 14).
create or replace function public.backup_records()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n int; s int := (current_date - date '2026-01-01') % 14; keep_days constant int := 7;
begin
  delete from public.records_backup where slot = s or day <= current_date - keep_days;
  insert into public.records_backup (slot, day, coll, id, data, deleted, updated_by, updated_at)
    select s, current_date, coll, id, data, deleted, updated_by, updated_at from public.records;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke execute on function public.backup_records() from public, anon, authenticated;

-- 2) Scheduled-job run log keeps 7 days (technical log only).
create or replace function private.log_retention()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $function$;
revoke execute on function private.log_retention() from public, anon, authenticated;
select cron.schedule('log-retention', '23 6 * * *', $$select private.log_retention()$$);

-- 3) Daily capacity check (12:43 UTC): logs sizes to private.capacity_log and sends the owner
--    one inbox warning a day if DB > 80% of 500 MB, projected full in < 21 days, storage > 80% of 1 GB,
--    last night's backup missing, or >= 10 scheduled-job failures in 24 h.
--    Full definition: sql/capacity_monitor_1125.sql
