# Live stock-count security fix — how it was tested and how to apply / undo

Scope: database only (no app files change, no data changes). Separate from the schedule release and from the audit.

What it closes (all reproduced on a faithful copy of the live functions, see tests/security/prod_stock_fix_test.sql):
- any signed-in worker could set any garage count directly (database API), or add an item with any count
- office "whole item" saves could carry a count
- a "pick-up" of +50 added stock; a "return" of −5 removed it; a "count" sent as plain amounts skipped the office-only rule
- an amount sent as text was accepted
- (latent) the stock system's pass stayed on until the end of the request

Tests
1. tests/security/prod_stock_fix_test.sql — real staging database, live apply_stock_txn copied verbatim (md5 checked),
   one transaction, rolled back. Today: 10 holes reproduced. With the fix: 25/25 pass (holes closed; normal pick-up,
   return, multi-item, retry-applied-once, shortage refused, office/owner counts, recount check, new item, history rows,
   renaming keeps the count). The fix runs twice without harm and keeps an exact copy of today's function.
2. tests/security/live_app_stock_fix.py — the LIVE app code (this branch = live main) against the stand-in server that
   enforces the same rules: owner count, put-back, two-item pick-up, rename, offline pick-up then reconnect: 6/6,
   and 0 of the app's stock moves tripped the new rules.
3. test/v2/t_v2_regression.py on the live app code with the rules enforced: 19/19, 0 moves refused.

Apply (after approval): run db/prod_stock_security_fix.sql on the live project once. It refuses to run if the live
function is not the exact version tested.
Undo: the two commented lines at the bottom of the file (disable the trigger; restore the saved function).

## Applied to LIVE — 2026-10-20 (approved by Baruch)
Before: every live database function, trigger and policy (62 objects) saved in private.fn_backup ('pre-stock-fix/…')
and a copy outside the database; apply_stock_txn copy matches md5 36d8402e…; stock counts and stock history checksums
recorded (stock 4087de63… / 1797, history 035a4132… / 2).
After: function patched (md5 changed, '-- SEC moves' present), count guard trigger on; stock and history checksums
identical to before (nothing changed). Live permission test with real employee accounts inside a transaction that
was rolled back (nothing kept; only a stock sequence number was used up): 13/13 pass — worker cannot set counts,
normal pick-up and return work, retry applied once, +50 pick-up / −5 return / count-as-amount refused, worker count
refused, Material office count works, rename keeps count, owner count works, owner cannot set counts directly,
history cannot be written directly. Afterwards: no test rows left, checksums unchanged.
Rollback (tested on an exact copy): the two lines at the bottom of prod_stock_security_fix.sql.
