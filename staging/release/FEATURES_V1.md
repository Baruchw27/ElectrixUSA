# Electrix USA — Features v1 production release plan (NOT deployed — waiting for Baruch's approval)

Five features, built and tested on staging: universal search · Time Clock Required YES/NO · text exactly as typed ·
notifications + My Tasks · job fields start blank. Branch `features/staging`; preview copy `staging-features/`.

## Order — this release goes AFTER the releases already waiting
1. Schedule v2.1 release (`release/schedule-v21`) — separate, already waiting for approval.
2. Stock count security fix (`security/stock-count`) and the scanner/stock release (`staging/release/RELEASE.md`).
3. Audit repairs (`audit/staging`) — the features were built on top of this branch.
4. **Features v1** (this file). It must not be shipped before 1–3: it was built and tested on their code.

## Steps (each one is reversible)
| # | What | How | Undo |
|---|---|---|---|
| 1 | Database: notification rules | run `db/features_v1_notify.sql` on production (adds a private queue, one trigger, one 20-second job; `on_record_change` keeps doing the same and also passes the alert id) | `drop trigger records_fv1_notices on records; select cron.unschedule('fv1-notices');` and re-run the old `on_record_change` from schema.sql |
| 2 | Phone notifications | deploy `functions/notify/index.ts` as `notify` (older app versions keep working: extra fields are optional) | redeploy the previous `notify` |
| 3 | App files | apply `test/features/patch_features.py` to the released `index.html`; add `features-v1.js`; add the push / tap handlers and `features-v1.js` to `sw.js` (as in `staging/sw.js`); new cache name | `git revert` the release commit |
| 4 | People | run `staging/release/features_v1_prod_data.sql` (six people → Time Clock Required = NO) | set `clock` back with the Team screen (YES) |
| 5 | Check on a real phone | sign in as a worker: bell, search, a task with blank lines, tap a phone notification; sign in as Yossi: no Clock In | — |

## Tested on staging (see test/features/)
`test/features/run_all.sh` — the new checks plus every existing staging suite. `notify_test.sql` — the server rules.
`clock_guard_staging.sql` — who may change the setting, on the real staging database.
