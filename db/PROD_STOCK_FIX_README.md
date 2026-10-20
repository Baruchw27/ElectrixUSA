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
