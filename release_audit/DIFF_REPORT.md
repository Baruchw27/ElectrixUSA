# Release audit: staging → production (database)

Staging `rkkxykdkjgdsgkujanau` (target) vs production `lnbcrptcdufnmqsvsisv` (live). Captured 2026-10-20 using read-only catalog queries only, and **regenerated after staging migrations `audit_b4_stock_input`, `audit_b5_review_msgs`, `audit_b6_timeclock` and `audit_b6_ongoing_removed`**. Nothing was applied.
Every function body in `10_forward.sql` / `90_rollback.sql` is checked against the source `md5(pg_get_functiondef)`: 48 of 48 match. I also ran a dry run on a throwaway local PostgreSQL 16 with a mock of production: forward ×2, rollback, forward again. All passed, and the 40 function md5s plus the 5 trigger md5s matched staging.

Re-check at regeneration time:
- On staging, only four objects changed since the first capture, and their grants did not:
  - `public.apply_stock_txn` (`audit_b4_stock_input`): md5 `dad5618d…` → **`6a0c1f0cc2466a6a174414fbc754c22c`**
  - `public.can_see2` (`audit_b5_review_msgs`): md5 `bb52dde1…` → **`3169e5b31b58f45b6594d680b0d6b66a`**
  - `public.guard_emp_pay` (`audit_b6_timeclock`): md5 `fd659341…` → **`de75b4ac716230674878873ad8a2813b`**
  - `public.notify_assign` (`audit_b6_ongoing_removed`): md5 `614cf04c…` → **`50741fff00ade44dbcd727c6162bfa31`**
- Every other function, trigger, cron job, policy and table matches the first capture.
- Production has not changed: all 41 function md5s and grants match the first capture (aggregate `a720ec33…`), and so do its triggers, cron jobs and policies.

## Production logic that staging lacks: now resolved, with one small difference

**`public.apply_stock_txn`**: staging now has production's three "SEC moves" checks, labelled "B4 input checks":

| production check | staging (B4) | result |
|---|---|---|
| move must be an object with a non-empty `id` → `bad move` | same (`jsonb_typeof(m) <> 'object' or coalesce(m->>'id','') = ''`) | identical |
| `set` / `expect` must be numbers → `count must be a number` | `public._num(m->>'set')` / `_num(m->>'expect')` must be non-null | same error; `"NaN"`, `"abc"`, `null` and `true` are rejected |
| `delta` must be a number → `amount must be a number` | `(m ? 'delta') and _num(m->>'delta') is null`. A missing delta is still rejected by the sign checks or by `move needs delta or set` | same error; `"NaN"` and `"abc"` are rejected |

I tested this on the local copy, against what production does today:
- `"NaN"`, `"abc"`, `[1]`, an empty `id`, set `"NaN"` and expect `"x"` are all rejected with the same messages as production.
- `5` and `1e3` are accepted, as on production.

**The one remaining difference:** production's test is a JSON *type* check (`jsonb_typeof = 'number'`). Staging's is a *text* check (`_num`, regex `^-?[0-9]+(\.[0-9]+)?$`). Because of that, staging still **accepts plain numbers sent as JSON strings**, such as `"delta":"5"` or `"set":"7"`, which production rejects with `amount/count must be a number`.
- This is low risk: NaN, Infinity, exponent strings and non-numeric text are all still blocked, so no bad quantity can be stored.
- It is still looser than production. If you want an exact match, use `jsonb_typeof(m->'delta') = 'number'` (and the same for `set` and `expect`) on staging.

Apart from that, production's version of every function has nothing that staging lacks. In all 8 functions that differ, staging only adds logic or rewrites it without losing anything.

## Functions on both sides that differ (8). All are replaced by forward and restored by rollback.

| function | what staging changes (prod → staging) | prod-only lines lost? |
|---|---|---|
| `apply_stock_txn` | `bad kind` check moved before the duplicate check; moves are processed in `id` order, which avoids deadlocks; production's SEC input checks are carried over as B4 (`_num`-based); new `qv` version counter on stock rows and in the returned `qtys`; B1: a positive delta brings a deleted stock item back; `move needs delta or set`; `src` is stored in the stockLog | no (only nuance: numeric *strings* such as `"5"` are accepted, see above) |
| `guard_record` | punches: server receive time `srvIn` is set once; A5b keeps `pending/approvedBy/rejected/rejectWhy` when a phone re-sends an old copy; only Payroll can un-delete a punch or change breaks (`punch_breaks_kept`); sites: `travelPay` is protected like lat/lng; a boss cannot approve or deny their own time off; travel: new or restored rows by non-bosses **and bosses' own rows** now go through `private.travel_checked` (server computes minutes and pay, rejects bad dates, duplicates and local jobs) | no |
| `can_see2` | adds visibility rules for `incidents`, `fixes`, `msgs`, `apps`, `invites`. Today these fall into "visible to everyone". For `msgs`, a person sees a message if they are the owner, the sender or the recipient, or if the message's `k` starts with `g:`, which marks a group message (`audit_b5_review_msgs`) | no |
| `guard_stock_qty` | also protects the new `qv` field from phone writes | no |
| `stamp_record` | rejects records over 400 kB from app users (`record too large`) | no |
| `save_records` | B2: a patch to a row deleted on another phone no longer brings it back (except punches, sched, stock) | no |
| `on_record_change` | the push notify payload also sends `id` and `ts` | no |
| `meeting_reminders` | the reminder text is now per person and in Spanish for `lang='es'` (`en N min`, `Reunión`) | no (text rebuilt, same content for English) |

## B6 staging changes (both functions exist only on staging, so production has nothing to lose here)

- **`guard_emp_pay`** now guards the Time Clock field `clock` (default YES) instead of `payMonthly`, and also lets all-access users change it. **It no longer protects `payMonthly` at all**, so after the release any app user who can edit an employee (for example a manager) could switch "Paid monthly" on or off. Production has never had this guard, so this isn't a regression for production, but it is a step back from the earlier staging rule. The f1 regression's five "Paid monthly" tests were also removed (only the `-- PAID MONTHLY` heading is left). If "Paid monthly" should still be limited to Owner and Payroll, it needs its own guard again.
- **`notify_assign`** (schedule notices):
  - A removed schedule day now sends "schedule changed — open the app" / "el horario cambió — abre la app" instead of "no job scheduled".
  - A day with a cancel, replace or patch never names a guessed job.
  - A removed ongoing rule is announced as ending today.

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
- **Staging only (created by forward):** `records_guard_emphr2`, `records_guard_punch` → `guard_punch()` (clock-entry rules, reasons and history, late-entry approval), `records_guard_emppay` → `guard_emp_pay()` (only the owner, all-access users or Payroll can change the Time Clock YES/NO field `clock`; anyone else's change is silently undone), `records_zz_notify_assign` → `notify_assign()` (assignment and schedule notifications, which feed `private.notify_queue`).
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
