# Features v1 — handed over to the audit session (20 Oct 2026)

Baruch chose to keep the audit session's version of the five features. This branch (`features/staging`) is **not**
to be merged or deployed. Nothing from it was applied to the staging or production database, and no app files were
published anywhere. It is kept only so the audit session can reuse the tests and the checklist below.

## Worth checking in the version that is kept (each one was a real bug in this branch, found by tests or review)
1. **Person cards in search show weekly hours / punch status** to anyone who can search people (crew leaders, Material,
   Accountant, Bookkeeper). Limit them to Owner, all-access, Payroll, site managers, and a leader for his own crew.
2. **Typing in a job field and tapping away must never clear the job** of an existing punch or schedule row; required
   jobs must be checked on every save, not only for new entries.
3. **New task: blanking the job must also untick the site manager** that the old default job ticked automatically.
4. **Clock NO workers** must not land on the clock screen after sign-in (`setRole` → `goTab('punch')`), and still need a
   way to request time off (that button only lives on the clock screen).
5. **Schedule notices must not list a guessed job** for exception rows (`patch` / `cancel` / `replace`) or a removed day
   while an ongoing job continues.
6. **The task box rewrote typed text on blur** (`parseVoice` squeezes all whitespace and removes words) — the main
   line-break bug. `.trim()` on save also removes first-line indentation (saveJob, saveEst, saveSvc, saveInspResult,
   semiSubmit, injury, saveMat). Material and estimate lists use `pre-line`, which drops indentation — use `pre-wrap`.
7. **Phone notifications follow the phone, not the person**: the push record of the previous user stays after sign-out.
8. `openInbox` marked every alert read just by opening the list; the bell did not refresh while someone typed.
9. Existing tests that need the job picked: `test/audit/payroll_ui.py` (add missed punch).

## Reusable tests
`test/features/suite.py` (111 browser checks, 7 roles, iPhone/Android/desktop) · `notify_test.sql` (database) ·
`clock_guard_staging.sql` (who may change Time Clock Required, real staging DB, rolled back) · `run_all.sh`.
