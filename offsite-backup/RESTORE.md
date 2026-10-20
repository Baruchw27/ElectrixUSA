# Electrix USA — how to recover from a backup

You need: the backup file(s) from the private `electrix-backups` repository, the owner's private key
(`owner_private.pem`, kept offline), a computer with Python 3, and `backup_tool.py`
(`pip install cryptography` once). Claude can do every step for you if you hand it the files.

## Which copy?
- `daily/live/YYYY-MM-DD.enc` — every night, last 35 nights
- `monthly/live/YYYY-MM.enc` — the last good copy of each month, last 24 months
- `files/live/*.enc` — every photo / receipt / voice note, each stored once (you need ALL of these)
- Inside the app's own database there are also 14 daily copies (`records_backup`) for quick fixes.

## A) Something was deleted or changed by mistake (the app still works)
1. Pick the last copy from before the problem: `python3 backup_tool.py decrypt owner_private.pem daily/live/2026-11-03.enc backup.json`
2. See what would change, without changing anything:
   `python3 backup_tool.py sql backup.json check.sql check` → paste `check.sql` in Supabase → SQL editor → Run.
   It reports how many records are the same / different / missing.
3. Bring back only what is missing or was removed (never overwrites newer work):
   `python3 backup_tool.py sql backup.json restore.sql missing` → paste → Run.
4. Only if everything must go back to that night: use `all` instead of `missing` (newer changes to those records are
   replaced; every restored record is written to the change log so it can be reviewed).

## B) The whole project is gone (disaster)
1. Create a new Supabase project (free plan is fine).
2. Rebuild the database rules from the backup (`schema` section: tables, functions, triggers, policies) — Claude
   does this from the file in a few minutes; the same rules are also kept in the code repository (`db/*.sql`).
3. Restore all records: `sql backup.json restore.sql all` → paste → Run.
4. Put the files back: `python3 backup_tool.py files files_batch.json out/` for every file batch, then upload the
   `out/` folder into the new project's `files` storage bucket (Claude can do this).
5. Point the app at the new project (config.js) and have everyone sign in again (passwords are not in backups;
   sign-ins are re-created and people set new passwords).

## Tested
- 2026-10-20 (staging): full restore into an empty copy — every one of 7,181 records identical byte for byte;
  damaged live table (10 removed clock entries, 5 renamed stock items, 2 changed schedule days) found exactly by
  `check`, `missing` brought back only the 10 removed entries, `all` restored the rest; wrong / cut-off files refused.
- 2026-10-20 (staging): the deployed backup service produced an encrypted backup (3.5 MB, 7,181 records) and a file
  batch (8 files); both decrypted with the private key on a separate computer; the restore check on the database
  matched 25/25 records exactly. Wrong key or a changed byte → refused. No key / forged GitHub token → refused.
- Nightly job simulated for 40 nights: 35 nightly + monthly copies kept, file batches kept, repository stays one
  compact snapshot, a refused download fails the night (Issue + in-app alert after 30 hours).
- Repeat a restore drill every 3 months (Claude can run it on staging with a recent live copy).
