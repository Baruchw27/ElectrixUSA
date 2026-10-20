#!/bin/bash
# Run every schedule check (and the scanner/stock regression suites for staging) against one app folder.
# usage: run_everything.sh <app folder> <label> <port base>
APP=$(cd "$1" && pwd); L=$2; P=${3:-8850}; cd "$(dirname "$0")"
r(){ local name=$1; shift; local out; out=$(APPROOT=$APP PORT=$P timeout 2400 "$@" 2>&1 | grep -E '[0-9]+ passed, [0-9]+ failed|ALL OK|clicks:|✗' | tr '\n' ' '); echo "$L | $name | $out"; P=$((P+3)); }
r suite python3 suite.py
r suite2 python3 suite2.py
r suite3-review python3 suite3.py
r isolation python3 isolation.py
r every-button python3 click_all.py
r repro-stale python3 repro_stale.py
r repro-loan python3 repro_loan.py
LEAVE=0 r repro-storage-full python3 repro_quota.py
if [ -f "$APP/selftest.js" ]; then for k in iphone android desktop; do KIND=$k r selftest-$k python3 run_selftest.py; done; fi
