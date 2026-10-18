# Electrix USA — security & reliability review

**Date:** 17–18 October 2026 · **Reviewed by:** Claude (the app's author) · **For:** independent audit (ChatGPT) and Baruch

**Live app:** https://baruchw27.github.io/ElectrixUSA/ · **Database:** Supabase project `lnbcrptcdufnmqsvsisv` (free plan) · **Code:** this folder

This report says what was tested, how, what failed, what was fixed, and what is still open. Passing tests are evidence, not proof. The raw outputs are in `evidence/`. The database rules are all in `schema.sql`; the newest ones are at the end of that file.

## How it was tested

| Where | What | Changes data? |
|---|---|---|
| **Staging database:** a local PostgreSQL 16 with a Supabase stand-in (`test/supabase_stub.sql`), the full `schema.sql` and fake employees | Every rule, attack attempt and the load test (`test/rls_test.sql`; output in `evidence/staging_database_rules.txt` and `evidence/load_test.txt`) | Yes, staging only |
| **Live database:** real employee accounts, each check run as that person through the same rules the app uses | Spot-checks of the fixes (`evidence/live_server_checks.txt`) | **No.** Every live check ran inside one transaction that was rolled back. |
| **Browser:** headless Chromium driving the real app, against a fake Supabase server that copies the database rules | Two phones syncing, offline use, every button for 9 roles (about 2,700 clicks), 279 screens checked for width, a scale test with 150 people and a year of data | Test copy only |

The fake server (`test/fakeserver.js`) copies the read and change rules. It is a model, so the database rules were checked on the real database engine in staging, and spot-checked on the live database.

## Results: the three things you asked to prove

### 1. No privilege escalation

Before this review, a worker could make himself owner. I confirmed this on the live database inside a rolled-back test. A manager or Payroll person could also reset the owner's password.

**What is in place now:**

- **Change rules are checked by the database** (`guard_record`) on every save, including direct API requests that skip the app.
- **Only the owner can grant or change privilege.** That covers the roles owner and manager, everyone-access, and the Payroll and Bookkeeper titles. Managers can still add and edit workers and ordinary office staff.
- **Workers can change only their own language and phone** on their employee record.
- **Only the owner can reset a privileged person's password.** This applies to `admin_set_password` and to `admin_create_user` when the sign-in already exists.
- **Passwords:** at least 8 characters, letters and numbers, and common passwords are refused. The app and the server both check this.

**Live evidence (rolled back):** for each attempt below the save call returned, but the database record did not change.

- Worker saves role=owner → his role is still worker.
- Manager saves his own role=owner → still manager.
- Payroll saves her own role=owner → still office.
- Manager or Payroll resets the owner's password → "not allowed".
- Manager makes a worker a manager → refused.
- Manager moves a worker to another crew, a normal job → allowed.

### 2. No data leaking between employees

| Data | Who can read it (enforced by the database) |
|---|---|
| Hours, time off, sent-home log, travel | The person himself; crew leaders their own crew; office, managers and owner everyone |
| Receipts | The person himself; owner, managers, everyone-access, Payroll and Bookkeeper |
| Alerts (inbox), phone-alert sign-ups | Only the person they are addressed to |
| Meetings | The owner, whoever made it, and whoever it is with |
| Private notes | The owner of the note and the people it is shared with |
| Jobs, schedule, material, people list (names, roles, phone numbers) | The whole team, by design |

**Each route was checked separately:**

- **The API and the sync download:** the same database read rule (`can_see2`) applies. Live, worker Carlos sees 0 of other people's hours, receipts and alerts, and all 426 jobs.
- **Realtime updates:** Supabase realtime uses the same read rule (`records` is the only published table). This was not tested separately with a realtime client.
- **File storage:** receipt, hours and time-off photos, and note pictures, open only for people who may see that record (`file_ok`). Live, the worker sees 0 of other people's receipt photos. The `files` bucket is private.
- **AI search:** limited to the owner and managers. The AI features are switched off on the server anyway, because no AI key is set.
- **Offline and cached data:** a turned-off employee's phone checks access on every catch-up. When access is gone it wipes the company data on the phone and goes back to sign-in (`test/t_sync.py` step 11b). On sign-in, a phone downloads only what the database lets that person see.
- **The anonymous key, used before sign-in:** it has no access to any table. It can call `resolve_login` (turns a name or phone into the internal sign-in email) and `no_team_yet`.

### 3. No silent manipulation of payroll

**Hours:**

- **Workers** can clock in and clock out for themselves only. They cannot move a clock-in, change a clock-out once it is saved, approve their own out-of-fence clock-in, delete hours, or create hours for someone else.
- **Out-of-fence approval** is for managers and office. They can approve, but they cannot edit times.
- **Clock times** can be edited only by Payroll, everyone-access and the owner.

**Time off:** approving or denying is for owner, managers, everyone-access and Payroll. A worker can only request, or cancel his own.

**Receipts:**

- Only Payroll, Bookkeeper, everyone-access and the owner can mark a receipt paid.
- A paid receipt can't be changed by the person who submitted it.

**Who changed what:**

- **Who** is stamped by the database from the sign-in, so a phone can't claim to be someone else. Live: a save that claimed to be by Baruch was recorded as Carlos's.
- **Change history:** `records_history` gets a row for every change to every record, with who, when, before and after. Only the server can read it, not the app. Live: a test punch's history read `u7:null > u7:5000 > o2:5000 > o3:6000` (clock-in, clock-out, office approval, Payroll correction).
- **Signed messages:** a task's sender and each chat message's author can't be faked.

## Everything checked (your 10 sections)

| # | Area | Result |
|---|---|---|
| 1 | Employee access and permissions | **Fixed:** self-promotion, manager or Payroll taking over the owner, workers seeing others' data, impersonation through the `by` and `from` fields. **Verified live.** |
| 2 | Database and server security | **Fixed:** read and change rules checked per person. The anonymous key gets nothing. Signed-in users can't delete rows directly or truncate (deleting is a flag that stays in history). Server secrets, history and backups are unreadable from the app. No service-role key or secret is in the browser code; only the public anon key and the public push key are. Supabase's own security check now shows only informational items and the accepted ones listed below. |
| 3 | Authentication | Supabase Auth (bcrypt passwords, signed session tokens). Expired or invalid tokens get nothing. Turned-off employees lose access at once (`is_member`) and their phone is wiped. **Open:** no self-service password reset by email; resets go through the owner or a manager. Sign-in rate limits are Supabase's defaults; I didn't change them. |
| 4 | Payroll and time clock | **Fixed and verified live:** see section 3 above. |
| 5 | Files and receipts | **Fixed:** private bucket; photos tied to private records only for people who may see the record; nobody can overwrite someone else's file; 50 MB limit; only pictures, video, audio, PDF, Word, Excel, CAD and plain text accepted, so web pages and SVG are refused. Viewer: only pictures and PDFs show on screen, other files download. |
| 6 | Web vulnerabilities | **SQL injection:** none. All database access goes through the API or fixed SQL functions with parameters. **XSS (code smuggled in through saved text):** a full code review found about 30 places where saved data reached the screen without escaping. All were fixed: escaping now also covers `'`; pictures and links from saved data only accept real image or https addresses; values inside buttons are cleaned; the file viewer no longer displays web pages. On top of that, the database refuses quotes and `<>` in record ids and in the fields that hold ids (`site`, `who`, `to`, `re`…). **CSRF:** not applicable, because the app uses bearer tokens, not cookies. **Rate limiting:** Supabase defaults. **Dependencies:** pinned versions from public CDNs (supabase-js, ZXing 0.21.3, Tesseract 5.1.1); not checked against advisories. **Security headers:** GitHub Pages can't set them, so there is no CSP; see open items. |
| 7 | Offline sync and several users | Only the fields that changed are sent, and the server checks every change again when it arrives, including changes made offline. A change that isn't allowed is skipped on the server (`test/t_sync.py`: no normal save was refused). Two people editing the **same field** at the same time: the last one wins. The history keeps both versions. |
| 8 | Owner protection | Only the owner can grant owner, manager, everyone-access, Payroll or Bookkeeper, or reset those people's passwords. Every change is in the history. **Open:** no second confirmation step (like re-entering a password) for owner actions. |
| 9 | Backup and recovery | **Added:** a daily copy of every record at 3:07 AM, 14 rotating days, plus the change history. A restore from the daily copy was tested on staging (test 14: undo a mass mistake). A failed sync can't erase data, because deletes are flags and the history keeps the old value. **Open:** the free plan has no off-site backup; Supabase Pro (about $25/month) adds daily off-site backups. |
| 10 | Performance and reliability | **Load test on staging** (`evidence/load_test.txt`), with 15,800 records and 50 employees, all saving at the same moment on a 2-core test machine. **Found and fixed:** each save took about 0.5 s because the reply checked the read rule against the whole table. It now takes 4 ms (about 33× more saves per second). The read rule was made inline-able, and crew leaders' crews are looked up once per request. Screen speed: every screen with 150 people and a year of data on a 4× slowed phone runs at about 0.4–0.6 s. Slow or lost internet: time limits on every server call, the app opens from the phone's copy, and work waits on the phone (`t_freeze`, `t_offline`). |

## Bugs found and fixed during this review

- **Worker could make himself owner.** The database didn't check field changes.
- **Manager or Payroll could reset the owner's password**, or re-create the owner's sign-in.
- **Workers could read everyone's hours, receipts and alerts** through the API. The screens hid them; the database didn't.
- **The office location was saved as a list.** Merging a change into a plain value turned `41.12` into `[41.12, {}]`. It was repaired in the database the same night.
- **My own privacy fix briefly stopped some normal saves.** An upsert must pass the read rule using only the changed fields, so a clock-out could be skipped. Saves now update existing records and insert new ones. Nobody used the app in that window.
- **Saves slowed down as data grew:** about 0.5 s each at 15,800 records. Fixed (4 ms).
- **Supplier deliveries were tagged with a job by mistake.** Fixed.
- **About 30 places displayed saved text without escaping.** Fixed (see section 6 of the table).

## Still open: needs a decision or attention

1. **Off-site backups:** need Supabase Pro (about $25/month). The free plan only has the in-database daily copy added here.
2. **Leaked-password check** (HaveIBeenPwned) also needs Supabase Pro.
3. **No Content-Security-Policy header**, because GitHub Pages can't set it. The app also uses inline scripts, so a strict CSP would need restructuring. The escaping and database checks above are the defense.
4. **The session token is stored in browser storage** (Supabase default). Any code smuggled into the page could read it, which is why the escaping work matters. Phones lock with Face ID when that is set up.
5. **Phone numbers and names are visible to the whole team.** This is a business decision, not a bug.
6. **The phone downloads all history at sign-in, then trims it.** That is fine for about 2 years at this size, but the download should later be limited to recent months.
7. **`_row_exists` is callable by any signed-in user.** It reveals only whether a record id exists, never the content. It is needed by the save function.
8. **`can_see2` has no fixed search path,** so the database can inline it for speed. It uses only built-in operators.
9. **Same-field edits:** if two people edit the same field at the same time, the last save wins. The history shows both versions.
10. **Not done:** a separate test that uses deliberately malicious text to try to inject code; a third-party dependency vulnerability scan; real-phone testing of the barcode and label reader; a live realtime-channel test with two signed-in workers.

## Files for the auditor

- **`schema.sql`:** every database rule. The newest are at the end: `can_see2` (read rule), `guard_record` (change rule), `stamp_record` (authorship and id checks), `log_record` (history), `backup_records`, `file_ok` (files), `save_records`.
- **`test/rls_test.sql`:** the attack tests T1–T15 run on staging. `evidence/staging_database_rules.txt` is their output.
- **`evidence/live_server_checks.txt`:** the live checks, all rolled back.
- **`evidence/load_test.txt`:** the load test.
- **`evidence/SUMMARY_browser_tests.txt`:** the browser test results, with the full output in the other files in `evidence/`.
- **`sync.js`:** how phones download and save. **`index.html`:** the app; `esc`, `safeSrc`, `safeHref` and `jsq` are the escaping helpers.
