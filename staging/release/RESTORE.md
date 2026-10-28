# Electrix — restoring from a backup

Short runbook. Test it on **staging** first, every time. Never restore into the live database without Baruch's OK.

## What backups exist

| Copy | Where | How often | Kept |
|---|---|---|---|
| In-database copy (`public.records_backup`) | Same Supabase project | Nightly 07:07 UTC (cron `daily-backup` → `backup_records()`) | 14 nightly slots (2 weeks) |
| Off-site encrypted copy | Private GitHub repo `Baruchw27/electrix-backups` (nightly job calls the `backup-export` edge function) | Nightly | As long as the repo keeps them |
| Change history (`public.records_history`) | Same project | Every change | Everything |

- **Health check:** cron `backup-health` (13:07 UTC daily) runs `backup_health_check()`. When the last off-site backup is more than 30 hours old, it puts a warning in the owner's bell.
- **Status (2026-10-28):** no off-site backup has completed on live yet. Baruch is checking the GitHub job.
- **Not covered:** the off-site copy does not hold sign-in accounts (`auth.users`) or `server_config` (Trello and push keys). After a total loss, people need new passwords (Team › person › Password) and the keys must be entered again.

## A. Bring back one record, or a few (most common)

Someone deleted or changed something by mistake. Find it in the history:

```sql
select at, by_who, op, old_data, new_data, old_deleted, new_deleted
from public.records_history where coll = 'jobs' and id = '<id>' order by at desc limit 20;
```

Put back the version you want, using its `old_data` or `new_data`:

```sql
update public.records set data = '<json>'::jsonb, deleted = false, updated_at = now(), updated_by = 'restore'
where coll = 'jobs' and id = '<id>';
```

Since 2026-10-28 (staging), a removal keeps the record's data. Often the fix is just `update … set deleted = false`.

## B. Bring back everything from the in-database nightly copy

1. See which days exist:
   ```sql
   select slot, day, count(*) from public.records_backup group by 1,2 order by day desc;
   ```
2. Build a backup document from the day you want, then check it against the live table (check only, nothing is written):
   ```sql
   select public.backup_restore(jsonb_build_object(
     'meta', jsonb_build_object('format','electrix-backup-1','taken_at',(select max(day) from public.records_backup where day = '<YYYY-MM-DD>'),
                                'records',(select count(*) from public.records_backup where day = '<YYYY-MM-DD>')),
     'records', (select jsonb_agg(jsonb_build_object('coll',coll,'id',id,'data',data,'deleted',deleted)) from public.records_backup where day = '<YYYY-MM-DD>')),
     'check', 'public');
   ```
   The answer gives `same` / `differ` / `missing`.
3. Rehearse in the side table `drill.records` first: run the same call with `'all', 'drill'`, then `'check', 'drill'` (it should say all `same`).
4. Then the real thing:
   - `'missing'` puts back only what is gone (safe).
   - `'all'` puts every record back to that day. **This undoes newer work, so use it only after Baruch agrees.**

## C. Bring back from the off-site (GitHub) copy

1. Download the newest `records-*.enc` file from the private repo.
2. Decrypt it on Baruch's computer with his private key, using the decrypt script in the backup repo. Each file holds one AES key wrapped with RSA-OAEP-256; the script checks the SHA-256 that is stored in the header.
3. Load the JSON. Run `select public.backup_restore('<json>'::jsonb, 'check', 'drill');` then `'all', 'drill'` and compare, then `'missing'` (or `'all'`) on `'public'`.
4. Files (photos, receipts): the `files-*.enc` batches go back into the storage bucket `files` at the same paths.

## Rehearsal record

| Date | Where | What | Result |
|---|---|---|---|
| 2026-10-28 | staging (rolled back) | `backup_snapshot()` → `backup_restore` check `public` / check `drill` / `all` into `drill` / check `drill` | 9,866 records: public all same; drill 9,866 missing → 9,866 written → 9,866 same |
