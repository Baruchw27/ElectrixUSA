-- 20_backups_optional.sql  --  ONLY after the owner approves production backups. Run after 10_forward.sql (needs public.backup_health_check).
-- daily-backup: already exists on production with the same schedule/command as staging ('7 7 * * *', select public.backup_records()) -> nothing to add.
-- backup-health: on staging, missing on production. It alerts owners via inbox when server_config 'backup_repo' is set and the last backup is >30h old;
-- with no 'backup_repo' row it only returns 'off-site backup not set up'.
-- Undo: select cron.unschedule('backup-health') where exists (select 1 from cron.job where jobname = 'backup-health');  (also in 90_rollback.sql)
begin;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'backup-health') then
    perform cron.schedule('backup-health', '7 13 * * *', $c$select public.backup_health_check()$c$);
  end if;
end $$;
commit;
