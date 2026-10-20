# Release rehearsal on staging — Oct 19–20 2026

Staging database (rkkxykdkjgdsgkujanau) was first put into **today's production state** with 09_db_rollback.sql
(apply_stock_txn md5 36d8402e… = the production function read from the live database), with 1,809 stock items
(1,800 test items with counts 0–499 added for scale). Then:

| Step | Check | Result |
| --- | --- | --- |
| Production state | An old phone's normal sync writes count 999 | **Accepted** (today's gap; shown, then undone) |
| Production state | A stock move "zz_rel_pre_1" sent (+5) | Applied (74 → 79) |
| 01_db_forward.sql | apply_stock_txn md5 / guard md5 | b504913a… / ffae2d53… (= tested staging versions) |
| 01_db_forward.sql | Counts fingerprint before → after | 9a7f248d… → 9a7f248d… **identical** (1,809 items) |
| After release | Phone retries the move sent before the release | `duplicate: true`, count stays 79 |
| After release | Offline move queued by today's app, sent after release (old message format) | Applied once |
| After release | Old app sync writes qty 999 (patch) | Ignored (count unchanged); other field saved |
| After release | Old app saves a whole item with qty 5000, qv 77 | Ignored |
| After release | Staff login edits a count directly in the table | Ignored |
| After release | 10 race scenarios, real parallel sessions (r10, r11) | 20 / 20 passed |
| After release | Scanner V2 stock SQL checks | Passed |
| 09_db_rollback.sql | apply_stock_txn md5 | 36d8402e… (= production today) |
| 09_db_rollback.sql | Counts fingerprint before → after | 9a7f248d… → 9a7f248d… **identical** |
| After rollback | Old transaction code on an item that has a count version | Works |
| After rollback | Retry of the pre-release move | Still `duplicate: true` |
| Forward again | md5s / fingerprint | b504913a… / ffae2d53… / 9a7f248d… identical |

App side (browser, real app code, simulated server with the new rules):

| Test | Result |
| --- | --- |
| Today's live app against the new database rules (everyday flows) | 19 / 19 (×2) |
| Release build (build_prod_release.sh) everyday flows | 19 / 19 (×2) |
| Release build scanner screens (production config: field test off, AI off) | 70 / 70 |
| Upgrade day: move made offline on today's app, app replaced, phone reconnects | sent once, 9 / 9 |
| App rollback: move made offline on the release build, app reverted | sent once, 9 / 9 |

The 1,800 test items were soft-deleted afterwards. Staging then got the same built-in item list as production
(1,782 names, counts 0) for the real-phone test.
