# Schedule v2.1 tests (staging)

Run against the staging app (or any copy of the app folder) on a local stand-in server — no internet needed.

```
cd test/sched
python3 make_seed.py && python3 seed_prod.py          # made-up, production-sized data
APPROOT=../../staging python3 suite.py                 # 73 checks: create/edit/delete/copy on iPhone, Android and desktop
                                                       # sizes, multi-crew + people moves, site changes, every failure mode
APPROOT=../../staging python3 repro_stale.py           # a clash on one day must not drop other changes
APPROOT=../../staging LEAVE=0 python3 repro_quota.py   # phone storage full + reload must not lose a booking
APPROOT=../../staging python3 repro_loan.py            # "Move a person" opens
```
Point `APPROOT` at the repo root (`..` `..`) to run the same checks on the live app's code.
`fakeserver_sched.js` is `test/fakeserver.js` plus: the database's schedule revision guard (a stale day makes the whole
call fail, exactly like the real database), switches to refuse schedule writes (`/__deny?coll=sched`), inject a server
error (`/__fail?code=500`), and a log of every save sent (`/__payloads`).
