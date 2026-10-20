#!/bin/bash
# Features v1 — everything, one command: the new checks + every existing staging suite, against one app folder.
# usage: test/features/run_all.sh [app folder, default staging]      (needs local Postgres at /tmp/exsqltest:55432 for the DB part)
cd "$(dirname "$0")/../.."; ROOT=$(pwd); APP=$(cd "${1:-staging}" && pwd)
line(){ printf '%-34s %s\n' "$1" "$2"; }
r(){ local name=$1 dir=$2; shift 2; local out; out=$(cd "$dir" && APPROOT=$APP timeout 2400 "$@" 2>&1 | grep -E '[0-9]+ passed, [0-9]+ failed|ALL OK|clicks:|✗' | tr '\n' ' ' | cut -c1-400); line "$name" "$out"; }
echo "Features v1 test run — app: $APP — $(date '+%Y-%m-%d %H:%M')"
r "features suite (5 features)"   test/features env PORT=8795 python3 suite.py
if [ -S /tmp/exsqltest/.s.PGSQL.55432 ]; then
  P="psql -h /tmp/exsqltest -p 55432 -U postgres"
  $P -d fv1 -q -v ON_ERROR_STOP=1 -f db/features_v1_notify.sql >/dev/null 2>&1
  out=$($P -d fv1 -tA -f test/features/notify_test.sql 2>&1 | awk -F'|' '/^N[0-9]/{t++; if($2==$3)p++; else print "✗ "$1}END{print p" passed, "t-p" failed"}' | tr '\n' ' ')
  line "notification rules (database)" "$out"
fi
r "schedule suite"                 test/sched env PORT=8850 python3 suite.py
r "schedule suite 2"               test/sched env PORT=8853 python3 suite2.py
r "schedule review"                test/sched env PORT=8856 python3 suite3.py
r "every button, every role"       test/sched env PORT=8859 python3 click_all.py
r "storage full, all work kept"    test/sched env PORT=8862 python3 storage_full.py
for k in iphone android desktop; do r "on-phone self-test $k" test/sched env PORT=8865 KIND=$k python3 run_selftest.py; done
r "hours / time clock"             test/audit env PORT=8870 python3 hours.py
r "payroll screens"                test/audit env PORT=8873 python3 payroll_ui.py
r "stock history"                  test/audit env PORT=8876 python3 stock.py
r "growth / start-up"              test/audit env PORT=8879 python3 growth.py
r "scanner screens"                test/v2 python3 t_v2_flows.py "$APP/index.html"
r "scanner, two phones"            test/v2 python3 t_v2_twophones.py
r "stock, three phones"            test/v2 python3 t_v2_stock_phones.py
