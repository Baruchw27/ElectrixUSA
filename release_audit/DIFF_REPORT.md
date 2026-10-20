# Release audit: staging → production (database)

Staging `rkkxykdkjgdsgkujanau` (target) vs production `lnbcrptcdufnmqsvsisv` (live). Captured 2026-10-20 using read-only catalog queries only. Nothing was applied.
Every function body in `10_forward.sql` / `90_rollback.sql` is checked against the source `md5(pg_get_functiondef)`: 48 of 48 match. I also ran a dry run on a throwaway local PostgreSQL 16 with a mock of production: forward ×2, rollback ×2, forward again. All passed, and the 40 function md5s plus the 5 trigger md5s matched staging.

## ⚠ Read this before you release: production logic that staging's version would REMOVE

**`public.apply_stock_txn`**: production has a "SEC moves" input check that staging's version does not have:

```
- if coalesce(jsonb_typeof(m),'') <> 'object' or coalesce(m->>'id','') = '' then raise exception 'bad move' ...
- if kind = 'set' and (coalesce(jsonb_typeof(m->'set'),'') <> 'number' or (m ? 'expect' and coalesce(jsonb_typeof(m->'expect'),'') <> 'number')) then raise exception 'count must be a number' ...
- if kind <> 'set' and coalesce(jsonb_typeof(m->'delta'),'') <> 'number' then raise exception 'amount must be a number' ...
```
Staging only checks the sign, using `coalesce(public._num(delta),0)`. Here is what happens after the release:
- A **count** (`kind='set'`) whose `set` is a string goes straight through `(m->>'set')::numeric`. The string `"NaN"` would store `qty = NaN`, because `greatest(0, NaN)` = NaN. A non-numeric `expect` gets the same treatment. Only owner, manager and office users can do counts.
- A `delta` sent as a JSON string such as `"5"` is now accepted. Production rejects it today.
- A move that is not an object, or has an empty `id`, no longer gets the clean `bad move` error. It fails later with a less clear error or a not-null violation.

**Recommendation:** add the three production checks to staging's `apply_stock_txn` (keep staging's new `order by value->>'id'`, `qv`, `src` and B1 re-add logic), re-test on staging, then regenerate. Alternatively, release as-is and accept the change. Nothing else that production has is missing from staging. In every other function, staging only adds logic or rewrites it without losing anything.

## Functions on both sides that differ (8). All are replaced by forward and restored by rollback.

| function | what staging changes (prod → staging) | prod-only lines lost? |
|---|---|---|
| `apply_stock_txn` | `bad kind` check moved before the duplicate check; moves are processed in `id` order, which avoids deadlocks; new `qv` version counter on stock rows and in the returned `qtys`; B1: a positive delta brings a deleted stock item back; `move needs delta or set`; `src` is stored in the stockLog | **YES: the SEC moves type checks above** |
| `guard_record` | punches: server receive time `srvIn` is set once; A5b keeps `pending/approvedBy/rejected/rejectWhy` when a phone re-sends an old copy; only Payroll can un-delete a punch or change breaks (`punch_breaks_kept`); sites: `travelPay` is protected like lat/lng; a boss cannot approve or deny their own time off; travel: new or restored rows by non-bosses **and bosses' own rows** now go through `private.travel_checked` (server computes minutes and pay, rejects bad dates, duplicates and local jobs) | no |
| `can_see2` | adds visibility rules for `incidents`, `fixes`, `msgs`, `apps`, `invites`. Today these fall into "visible to everyone" | no |
| `guard_stock_qty` | also protects the new `qv` field from phone writes | no |
| `stamp_record` | rejects records over 400 kB from app users (`record too large`) | no |
| `save_records` | B2: a patch to a row deleted on another phone no longer brings it back (except punches, sched, stock) | no |
| `on_record_change` | the push notify payload also sends `id` and `ts` | no |
| `meeting_reminders` | the reminder text is now per person and in Spanish for `lang='es'` (`en N min`, `Reunión`) | no (text rebuilt, same content for English) |

## Functions only on staging (32), added by forward

- private (15): `arr_len, crew_name, day_label, edits_prefix_kept, emp_row, expand_people, last_why, min_label, short_site, sched_sig, sched_text, punch_breaks_kept, travel_checked, notify_now, tidy_client_errors`
- public (17): `ai_take, apply_stock_moves, backup_files_since, backup_health_check, backup_note, backup_restore, backup_snapshot, error_digest, guard_emp_pay, guard_punch, history_records, log_client_errors, notify_assign, notify_flush, recent_client_errors, stock_item_history, stock_site_history`
- There are no `stg_*` functions and no functions in schema `drill` on staging. No function exists only on production.
- `apply_stock_moves` (granted to PUBLIC/anon, security invoker) looks like a legacy helper. On staging it is still granted to anon. `guard_stock_qty` would undo its qty changes for app users anyway.

## Grants (function ACLs)

- `guard_record`: staging also grants EXECUTE to PUBLIC and anon. It is a trigger function, so this has no practical effect. Forward copies the staging grants.
- `guard_emphr`, `guard_fields`, `lock_record_key`: the bodies are identical, but production also grants EXECUTE to `authenticated`. Forward section 7 revokes it to match staging, and rollback restores it. These are trigger functions, so this does not affect triggers.
- 10 new private helpers have a NULL ACL on staging (default = PUBLIC execute), so no grant lines are emitted for them. Neither side has default privileges for schema `private`, so production gets the same NULL ACL.

## Triggers on `public.records`

- **Differs:** `records_guard_emphr`. Production fires on `coll='emphr'`, staging on `coll='empHR'`. Staging adds `records_guard_emphr2` for `'emphr'`, so after the release both spellings are guarded.
- **Staging only (created by forward):** `records_guard_emphr2`, `records_guard_punch` → `guard_punch()` (clock-entry rules, reasons and history, late-entry approval), `records_guard_emppay` → `guard_emp_pay()` (only the owner or Payroll can change `payMonthly`), `records_zz_notify_assign` → `notify_assign()` (assignment and schedule notifications, which feed `private.notify_queue`).
- Disabled on one side but not the other: **none**. Every trigger is `tgenabled='O'` on both sides. Storage triggers are identical.
- Rollback disables the 4 new triggers (no DROP) and restores production's `records_guard_emphr`.

## Tables, sequences, indexes, columns

- Added by forward: schema `drill` + `drill.records` (same shape as `public.records`, plus 4 indexes; owner-only; used by `backup_restore(p_target=>'drill')`), `private.notify_queue` (+ seq, `notify_queue_open`), `private.client_errors` (+ seq, `client_errors_at`), `public.ai_usage` (RLS on, no policies, service_role only), and index `public.records_punch_in_idx`. Production `records` has about 2,500 rows (1 MB), so building the index locks it only briefly.
- `stock_seq` already exists on both.
- **Not added (staging-only test objects):** `public.scan_field_log` (+ identity seq, `scan_field_log_session` index, policies `scan_log_insert`/`scan_log_read`). The app code calls it "STAGING ONLY … camera test" (`staging/config.js` `fieldtest`). Also not added: `public.zz_bc_run2, zz_bc_results, zz_bc_results3, zz_bc_retry, zz_bc_retry2`.
- Tables on both sides have the same columns, so there is no `add column`. `stock_applied` has the same columns in a different order (`at` and `fingerprint` swapped), which is harmless.
- Production-only tables, left alone: `_hr_migrate_log`, `backup_records_s1_20261018`, `backup_records_s2_20261018`, `sites_bak_20261019` (FORCE RLS), `private.fn_backup`. They look like one-off backups and migration logs. `_hr_migrate_log` and the two `backup_records_*` tables grant full rights to **anon and authenticated** (RLS is on, with no policies visible), so think about tidying them up separately.

## RLS policies

- `stock_applied` "members claim" / "members read": same command and expressions, but roles are `{public}` on production and `{authenticated}` on staging. Forward uses `alter policy … to authenticated`, and rollback sets them back to `public`.
- `records` and `storage.objects` policies are identical on both sides (including `zz probe`). The `scan_field_log` policies are skipped together with the table.

## Cron jobs

| job | staging | production | release |
|---|---|---|---|
| `assign-notify` `* * * * *` `select public.notify_flush()` | yes | no | forward |
| `error-digest` `37 11 * * *` `select public.error_digest()` | yes | no | forward |
| `error-log-tidy` `41 3 * * 0` `select private.tidy_client_errors()` | yes | no | forward |
| `backup-health` `7 13 * * *` `select public.backup_health_check()` | yes | no | **20_backups_optional.sql only** (owner approval) |
| `daily-backup` `7 7 * * *` `select public.backup_records()` | yes | **already on prod**, identical | nothing to do |
| `geo-jobs`, `geo-sanity`, `meeting-reminders` | yes | yes, identical | — |
| `trello_sync_5min` (`*/5`, POST `/trello-sync`) | **no** | yes | left alone; staging doesn't have it |

## What rollback does not undo (by design)

The 32 new functions, the new tables, schema `drill` and `records_punch_in_idx` stay in place. Nothing calls them once the triggers and cron jobs are off. Data written while the release was live also stays: punch `srvIn`/`hist`/`lateEntry`, stock `qv`, travel pay set by the server, and rows in notify_queue and client_errors.
