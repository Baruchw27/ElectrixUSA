# Electrix USA — coordinated production release (Scanner V2 + stock protections)

**Nothing here runs until Baruch gives final approval.** Every step below was rehearsed on staging on Oct 19–20 2026
(see TEST_LOG.md). Production today: 1,796 stock items, all counts 0, apply_stock_txn md5 36d8402e….

## What changes
| Part | Change | Needed for |
| --- | --- | --- |
| Database | `guard_stock_qty` + trigger (counts change only inside a stock transaction) | stock security |
| Database | `apply_stock_txn` with count version, ordered locks, safe new items | double counting, multi-phone |
| App files | index.html, sync.js, scanner-v2.js, scanner-v2-ui.js, catalog-real.json, sw.js, version.json | Scanner V2, phone fixes |
| AI (only if approved) | ai_usage caps, hardened `ai` function, production secret, `ai:true` in config.js | AI label reading |
Not changed: config.js (unless AI), extras.js, all other database objects, the `upc` function, field-test logging (staging only).

## Order (database protections BEFORE the scanner)
1. **Check** — run `00_checks.sql` on production; save the output (counts fingerprint, apply_stock_txn md5 = 36d8402e…).
2. **Database** — run `01_db_forward.sql` on production (one transaction; takes about a second).
3. **Check again** — `00_checks.sql`: counts fingerprint **identical** to step 1; apply_stock_txn md5 = b504913a…; count guard ON.
   If anything differs: run `09_db_rollback.sql` and stop.
4. **App** — `staging/release/build_prod_release.sh <folder>` (add `--ai` only if AI approved), review the file list,
   copy those files to the repo root, commit, push. Phones pick it up on their next open (service worker cache electrix-v13).
5. **AI (only if approved)** — apply `../sql/ai_usage_caps.sql`, deploy `../functions/ai/index.ts` as `ai`, set the
   production secret `ANTHROPIC_API_KEY` (dedicated key with a monthly spend limit in the Anthropic Console).
6. **Smoke test on a real phone** — sign in, scan 3 items, put back 1, take out 1; check the history and counts.

Between steps 3 and 4, phones on today's app keep working: their stock moves go through the same transaction, and any
count they try to write through normal sync is ignored (tested: old app on new database, 9/9 and 19/19).

## Rollback
- **App:** `git revert` the release commit and push (phones reload to today's app; unsent moves are kept and sent once — tested).
- **Database:** `09_db_rollback.sql` (switches the count guard off and restores today's apply_stock_txn exactly; md5 back to
  36d8402e…). Counts are not changed (tested: fingerprint identical before/after). Roll back the app first.
- **AI:** remove the production secret (AI calls stop immediately; the scanner falls back to its own label reading).
