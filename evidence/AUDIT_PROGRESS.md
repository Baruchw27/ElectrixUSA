# Electrix USA — full audit, progress log (staging only, nothing deployed to production)

Branch `audit/staging`. Kept separate from the schedule release (`release/schedule-v21`), which is unchanged.
"Simulated" = Chromium with iPhone/Android/desktop profiles against a local stand-in server. "Real DB" = the
staging Supabase database (`rkkxykdkjgdsgkujanau`), every test inside a transaction that is rolled back.

## Fixed in staging (with a regression test for each)

| # | Problem (found by) | Effect in everyday use | Fix | Test |
|---|---|---|---|---|
| A1 | Hours/time-clock set (see commit 91871ab) | wrong totals around DST, stale open punches, pending time counted | see commit | test/audit/hours.py 12/12 |
| B1 | Live updates could be missed during a catch-up; one bad stock move blocked the rest | other phones' changes missing until next restart | new live feed opened before fetching; unknown refusals recorded | stock.py |
| A2.1 | **Worker/office could delete or shorten finished breaks and material runs on their own punch** (pen-test, real DB) | more paid time than worked | server refuses; only Payroll can change breaks | a2_regression.sql 27/27 |
| A2.2 | Worker could bring back a punch Payroll deleted (real DB) | deleted time reappears | Payroll only | a2_regression.sql |
| A2.3 | **Worker's phone could save any travel pay ($999) already "approved"** (pen-test) | overpayment | server works out minutes and pay itself from the job and the company rate; one entry per person/job/day; local jobs get none | a2_regression.sql |
| A2.4 | **Stock pick-up with a positive amount ADDED stock; "count" with plain amounts skipped the office-only rule** (pen-test, all roles) | inventory can be inflated by anyone | server checks the direction of every move | a2_regression.sql |
| A2.5 | Any user could store huge records | every phone downloads them (fills storage) | 400 KB limit (photos are files) | a2_regression.sql |
| A2.6 | Clock entries typed in long after the fact were indistinguishable | — | server receive time `srvIn` on every punch, unchangeable | a2_regression.sql |
| A3.1 | **Every clock-in carries its selfie (~9.4 KB) inside the punch** (production data) | office/owner phones would hit the 5 MB phone limit within weeks; database (free plan, 500 MB) and its 14 daily copies would grow ~10× faster | selfie uploaded as a file like other photos | growth.py 10/10 |
| A3.2 | **Start-up downloads ALL history every time the app opens** | start-up gets slower every month; on a weak signal it eventually times out | only the last 130 days of clock/travel/stock history/messages; jobs, stock, people in full | growth.py |
| A3.3 | Start-up download pages had no fixed order | a row changed during the download could be skipped | ordered by (coll,id) | growth.py |
| A3.4 | "Use my version" / any caller of catch-up got nothing back while another catch-up was running | the choice could be refused again and need a second tap | callers wait for the running catch-up | suite.py 74/74 |
| A4.1 | **Stock history copied again on every app start** (server rows have no id inside) | history list doubles each restart; storage grows | id kept; old copies cleared | stock.py 6/6 (fails on old code) |
| A4.2 | **A pick-up whose answer was lost was counted twice on the phone** | garage count shown too low until the next signal | moves the server already recorded are not added again | stock.py (fails on old code) |

## Full regression run on the audit build (all green)
schedule suite 74, suite2 29, review 21, isolation 16, every button/role 4,440 clicks, stale/loan/storage repros,
storage-full 15, on-phone self-test 15 × 3 profiles, hours 12, stock 6, growth 10, scanner flows 79, two phones 20,
three phones + owner stock 27, everyday flows 19. Real-DB: a2_regression 27/27; pen-test re-run: all holes closed.

## Pen-test (real staging DB, 8 accounts: owner, manager, office ×3, worker ×3) — remaining "allowed" results, all by design
owner can do everything; manager & Payroll can create sign-ins, edit the schedule and others' hours; office can edit job
fences (existing rule); worker cannot read others' clock entries, HR, expenses, notes, history, backups, secrets or files.

## Not yet in production — production is missing protections staging already has
- Production has no `guard_stock_qty` trigger: any signed-in worker can set a stock count directly through the API.
- All A2 server rules above.
These need a separate, approved production change (database + app together).

## Needs Baruch (business decisions / credentials)
1. **Backups**: Supabase is on the FREE plan — no platform backups. The only backup is `records_backup` (14 daily copies)
   inside the same database; if the project is lost, everything is lost. Options: Pro plan (daily backups), or a nightly
   copy to somewhere outside Supabase (needs a key from you).
2. Material-run time: the hours math deducts it, the message tells the worker it was kept. Which is right?
3. Clock entries typed in long after the fact (now visible by `srvIn`): just show them to Payroll, or require approval?
4. May "all-access" users change clock times? Is the Fingercheck pay week Sunday–Saturday?
