# Electrix USA — security & reliability review

**Date:** 17–18 October 2026 · **By:** Claude (the app's author) · **For:** independent audit (ChatGPT) and Baruch
**Live app:** https://baruchw27.github.io/ElectrixUSA/ · **Database:** Supabase project `lnbcrptcdufnmqsvsisv` (free plan) · **Code:** this folder

This report lists what was tested, how, what failed, what was fixed and what is still open. Passing tests are evidence, not proof.
- **Raw outputs:** `evidence/`.
- **Database rules:** all in `schema.sql`; the newest definitions are at the end of the file and override earlier ones with the same name.

**Independent check of this report:** before publishing, a separate checker read the first draft against the code and evidence. It found 6 wrong or overstated claims and 10 real gaps. All 10 gaps were fixed and re-tested live, and the claims are corrected below; see "Found by the independent check".

## How it was tested

| Where | What | Changes data? |
|---|---|---|
| **Staging database:** local PostgreSQL 16 with a Supabase stand-in (`test/supabase_stub.sql`) and the full `schema.sql` | Every rule and attack attempt T1–T16 (`test/rls_test.sql`; output in `evidence/staging_database_rules.txt`). Load test (`evidence/load_test.txt`). | Staging only |
| **Live database:** real employee accounts, run through the same rules the app uses | Spot-checks of every fix (`evidence/live_server_checks.txt`) | **No.** Each run was one transaction that was rolled back. |
| **Browser:** headless Chromium driving the real app against a fake server that copies the rules (`test/fakeserver.js`) | Two phones syncing, offline use, every visible button for 9 roles, 279 screens checked for width, 150 people with a year of data | Test copy only |

## The three things you asked to prove

### 1. No privilege escalation
**Before:**
- A worker could make himself owner (confirmed live, rolled back).
- A manager or Payroll person could reset the owner's password.

**Now, enforced by the database on every save (`guard_record`), including direct API requests:**
- **Only the owner adds or changes privileged or office people:** owner, manager, everyone-access, and any office role (Payroll, Bookkeeper, Material, and so on). Managers, everyone-access and Payroll can add and edit workers: crew, crew leader, name, phone.
- **Everyone else** can change only their own language and phone.
- **Password resets:** only the owner can reset or re-create a sign-in that belongs to a privileged person. The check looks at every employee record tied to that sign-in, by sign-in id and by email (`signin_privileged`).
- **One sign-in, one person:** two employee records can't share a sign-in or an email, so a look-alike record can't be planted.
- **Passwords:** 8 or more characters, letters and numbers, common passwords refused (app and server).
- **First-time setup** (`setup_owner`) is closed now that the owner exists.

**Live results:**
- Refused: worker, manager or Payroll saving role=owner; manager or Payroll resetting the owner's password; manager making a worker a manager; manager deactivating the owner; manager adding an office person; manager adding a look-alike record with the owner's email.
- Allowed: manager moving a worker to another crew; manager adding a worker; manager resetting a worker's password.

### 2. No data leaking between employees
| Data | Who can read it (database rule `can_see2`) |
|---|---|
| Hours, time off, sent-home log, travel | The person; crew leader for his crew; office, managers, everyone-access, owner |
| Receipts | The person; owner, managers, everyone-access, Payroll, Bookkeeper |
| Alerts (inbox), phone-alert sign-ups | Only the person they belong to |
| Meetings | Owner, whoever made it, whoever it's with |
| Private notes | The note's owner and the people it's shared with |
| Jobs, schedule, material, crews, and the whole employee list (names, roles, crews, phones, plus each record's internal sign-in id and sign-in email) | The whole team, by design |

**Each route checked:**
- **API and the phone download:** the same rule applies. Live, a worker sees 0 of others' hours, receipts and alerts, and all 426 jobs.
- **Files:** photos of receipts, hours, time off and private notes open only for people who may see that record (`file_ok`). Live: 0 of others' receipt photos. The bucket is private.
- **Realtime:** `records` is the only published table, and Supabase applies the same read rule to realtime changes. *Not tested with a separate realtime client.*
- **AI search:** the button is limited to owner and managers **in the app only**. The server's AI function checks only that the person is on the team, and is unused because no AI key is set. **Open:** if AI is switched on, the role check must be added on the server too.
- **Offline and cached data:** when an employee is turned off, the server stops answering him immediately (`is_member`). On its next catch-up his phone sees that, wipes the company data and goes to sign-in (`test/t_sync.py` step 11b).
- **The anonymous key (before sign-in):** no access to any table. It can call `resolve_login` (turns a name or phone into the internal sign-in email) and `no_team_yet`.

### 3. No silent manipulation of payroll
**Hours:**
- **Workers:** clock in and out for themselves only. A new clock-in can't be in the future or more than 3 days back (phones that were offline catch up). A clock-out can't be before the clock-in or in the future. Once saved, a clock-in can't be moved and a clock-out can't be changed.
- **Out-of-fence approval:** managers and office, never their own.
- **Clock-time edits and deleting hours:** only Payroll, everyone-access and the owner.
- **Nobody can move a record to another person.** Exceptions: Payroll and everyone-access for hours, Payroll and Bookkeeper for receipts, managers for time off and travel.

**Time off:** approve or deny is for owner, managers, everyone-access and Payroll. A worker can request, or cancel his own. Dates can't change once it's been answered.

**Receipts:** only Payroll, Bookkeeper, everyone-access and the owner mark paid. A paid receipt is locked for the person who submitted it.

**Who changed what:**
- **Author:** every save's author is stamped by the database from the sign-in, never from what the phone claims. Live: a save claiming "by Baruch" was recorded as the worker's.
- **History:** `records_history` gets a row for every change to every record: who, when, before and after. Only the server can read it. Live: a test punch's history showed who made each change in order: worker (clock-in), worker (clock-out), office (approval), Payroll (correction).
- **No forging:** a task's sender, each chat message's author, and an alert's sender can't be faked. Alerts now carry their real sender.

**Not fully closed:**
- The clock-in time and GPS position come from the phone. A tampered phone can still lie within the allowed window.
- Automatic travel pay is worked out on the worker's phone when he clocks in. The server checks it's his own record and locks it afterwards, but doesn't recompute the amount. Recommended fix: compute travel pay on the server.

## Everything checked (your 10 sections)
| # | Area | Result |
|---|---|---|
| 1 | Permissions | Fixed and verified live (above). |
| 2 | Database and server | **Read, change and settings rules:** checked per person. Only managers and up change the office location, crews and the schedule. Only office and up change a job's location, clock-in fence or drive time, or delete a job. Only the sender or a manager deletes a task. Only the note's owner hands a note to someone else. **Table access:** the anonymous key gets no table; signed-in users can't hard-delete rows (deleting is a flag, kept in history) or truncate. **Unreadable from the app:** server secrets, history, backups. **Browser code:** no secret key, only the public anon and push keys. **Supabase security check:** remaining items are informational (tables with no client access, on purpose) or listed under "Still open". |
| 3 | Authentication | Supabase Auth (bcrypt, signed tokens). Turned-off employees lose access at once and their phone is wiped. **Open:** no self-service password reset by email; sign-in rate limits are Supabase defaults, not reviewed. |
| 4 | Payroll and time clock | See section 3 above. |
| 5 | Files | **Done:** private bucket; record-tied photos only for people who may see the record; nobody overwrites someone else's file; 50 MB limit; accepted types are pictures (no SVG), video, audio, PDF, Word, Excel, CAD and plain text, so web pages are refused. **Viewer:** only pictures and PDFs are displayed; everything else downloads. |
| 6 | Web vulnerabilities | **SQL injection:** none found. Access goes through the API or fixed functions with parameters. **Stored code injection (XSS):** a code review found about 30 places where saved text reached the screen unescaped. All were fixed: escaping now covers `'`; pictures and links from saved data must be real image or https addresses; values inside buttons are cleaned. The database also refuses quotes and `<>` in record ids and in id fields (`site`, `who`, `to`, `re`, …). The escaping helpers have unit tests (`t_sanitize`). *Not done: a test that feeds deliberately malicious text through every screen.* **CSRF:** not applicable (bearer tokens, no cookies). **Dependencies:** pinned CDN versions, not scanned against advisories. **Headers:** GitHub Pages can't set a CSP. |
| 7 | Offline sync and several users | Only changed fields are sent, and the server re-checks every change on arrival, including offline ones. A refused change is skipped and the phone takes the server's version back. Same field edited by two people at once: the last save wins; the history keeps both versions. |
| 8 | Owner protection | Only the owner grants privilege or office roles, or resets those people's passwords. Every change is in the history. **Open:** no second confirmation step (re-entering a password) for owner actions. |
| 9 | Backup and recovery | Daily copy of every record at 07:07 UTC (03:07 New York summer time), 14 rotating days, plus the full change history. **Restore tested on staging (T14):** a mass mistake was undone from the daily copy. **Open:** no off-site backup on the free plan (Supabase Pro, about $25/month). |
| 10 | Performance | **Load test on staging**, 15,800 records, every employee saving at the same moment (`evidence/load_test.txt`). **Before the fix:** 25 people → 3 per second, 8.5 s each. **After:** 25 people → 206 per second, 0.12 s each; 50 people → 206 per second, 0.24 s each. A single save went from 223 ms to 14 ms. **Cause:** the save's reply checked the read rule against the whole table. **Also:** 25 phones downloading everything at the same moment take about 4.4 s each (see open items). On screen, with 150 people and a year of data on a 4× slowed phone, the heaviest screens (Schedule, Punch) take about 0.4–0.6 s; side by side, the version before the security changes was the same. |

## Found by the independent check — fixed and verified live
1. **Alert hijack:** a worker could register his phone to receive the owner's push alerts. Fixed: phone-alert sign-ups are your own only.
2. **Fake alerts:** fixed. The server stamps every alert with its real sender. Anyone on the team can still send an alert to anyone, which is needed for "Carlos needs material".
3. **Taking over another person's hours, receipts or time off** by moving them into your own name: fixed.
4. **Travel records:** an existing record can't be changed by the worker. *A new one still carries the pay worked out on his phone (see open items).*
5. **Changing the dates of approved time off:** fixed.
6. **Look-alike record to unlock the owner's password reset:** fixed (one sign-in per person, and every matching record is checked).
7. **Managers creating office staff,** who can read hours and approve fences: now owner-only.
8. **Workers editing company settings, job fences and drive times, or deleting jobs, tasks or stock:** fixed. Worker phones no longer save job locations or drive times; the server works them out.
9. **A note collaborator taking ownership of a note:** fixed.
10. **Clock-in backdating and future clock-outs:** limited (see section 3).

**Claims corrected:** the AI-search limit is in the app only; `setup_owner` was still open to the anonymous key (now closed); the speed numbers are now in the evidence file; the whole employee record (sign-in id and email included) is visible to the team.

## Other bugs found and fixed during the review
- **The office location was being saved as a list:** `41.12` became `[41.12, {}]`. It was repaired the same night.
- **A privacy fix briefly made some normal saves (a clock-out) get skipped:** fixed within minutes, and nobody used the app in that window.
- **Supplier deliveries were tagged with a job by mistake.**
- **Any phone could re-locate the office from the address:** that is how the office pin moved on 18 Oct 03:51 UTC (from Shauly's phone; shown in the history). The live app now keeps the office location on the server only.

## Still open — needs a decision or attention
1. **Off-site backups and the leaked-password check** both need Supabase Pro (about $25/month).
2. **Travel pay** is worked out on the worker's phone. It should be computed on the server before travel pay is relied on.
3. **Clock times and GPS come from the phone** and can't be fully trusted. Out-of-fence clock-ins already need approval.
4. **The AI function** checks only team membership, not role. It must get a role check before AI is switched on.
5. **No Content-Security-Policy** (GitHub Pages can't set headers, and the app uses inline scripts). The session token sits in browser storage, which is the Supabase default. Escaping and the database checks are the defence.
6. **The whole team sees names, roles, phones and each person's sign-in email.** That is a business choice; restricting it is possible.
7. **Phones download all history they may see at sign-in.** That is fine for about 2 years at this size; after that, the download should be limited to recent months.
8. **`_row_exists`:** any signed-in user can call it. It reveals only whether a record id exists, never its content, and the save function needs it.
9. **`can_see2` has no fixed search path,** so the database can inline it for speed. It uses only built-in operators.
10. **Not done:**
    - a test that feeds malicious text through every screen
    - a dependency scan
    - real-phone testing of the barcode and label reader
    - a realtime test with two signed-in workers
    - sign-in rate limits review

## Files for the auditor
- `schema.sql`: all database rules. The newest are at the end:
  - `guard_record`, the change rules v3
  - `can_see2`, the read rule
  - `stamp_record`, authorship and id checks
  - `log_record`, history
  - `backup_records`
  - `file_ok`, the file rule
  - `save_records`
  - `signin_privileged` and `admin_set_password`
- `test/rls_test.sql`: attack tests T1–T16. Their output is `evidence/staging_database_rules.txt`.
- `evidence/live_server_checks.txt`: both live runs, all rolled back.
- `evidence/load_test.txt`: the load test, before and after.
- `evidence/SUMMARY_browser_tests.txt`: browser tests; the full output of each is in the other `evidence/` files.
- `sync.js` (download and save) · `extras.js` (file viewer) · `index.html` (the app; the helpers are `esc`, `safeSrc`, `safeHref` and `jsq`).
