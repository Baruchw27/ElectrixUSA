#!/bin/bash
# Full test pass: database rules, two-phone sync, every click per role (real + demo), 29 feature flows.
cd "$(dirname "$0")/.."
P="psql -h /tmp/exsqltest -p 55432 -U postgres -v ON_ERROR_STOP=1 -q"
fail=0
echo "== database rules"; $P -c "drop database if exists t1" -c "create database t1" >/dev/null && $P -d t1 -f test/supabase_stub.sql >/dev/null 2>&1; sed 's/create extension if not exists pg_net;/-- stub/' schema.sql > /tmp/exsqltest/schema.sql; $P -d t1 -f /tmp/exsqltest/schema.sql >/dev/null 2>&1 && $P -d t1 -f /tmp/exsqltest/schema.sql >/dev/null 2>&1 || { echo "schema FAILED"; fail=1; }
out=$(psql -h /tmp/exsqltest -p 55432 -U postgres -d t1 -tA -f test/rls_test.sql 2>&1)
for want in "T9 merged|{\"pri\": true, \"status\": \"prog\"}" "T9 deleted|t" "T1 owner sees|4" "T2 worker sees|4" "T3 stranger sees|0" "T5 boss reset|t" "T6 inactive sees|0" "T8 Carlos sees notes|Shared w Carlos" "T8 Yossi sees notes|0" "functions/v1/notify" "functions/v1/trello"; do echo "$out" | grep -qF "$want" || { echo "  ✗ $want"; fail=1; }; done
[ $(echo "$out" | grep -c "functions/v1/") = 2 ] || { echo "  ✗ trigger count"; fail=1; }
echo "  database checks done"
echo "== two phones"; r=$(timeout 500 python3 test/t_sync.py 2>&1); echo "$r" | grep -E "✗|passed"; echo "$r" | grep -q " 0 failed" || fail=1
echo "== every click, real mode"; r=$(timeout 900 python3 test/click_real.py 2>&1 | tail -3); echo "$r"; echo "$r" | grep -q "ALL OK" || fail=1
echo "== every click, demo mode"; r=$(timeout 900 python3 test/click_demo.py 2>&1 | tail -2); echo "$r"; echo "$r" | grep -q "ALL OK" || fail=1
echo "== feature flows"; r=$(timeout 600 python3 test/flow_demo.py 2>&1 | tail -2); echo "$r"; echo "$r" | grep -q "page errors: none" || fail=1
echo "RESULT: $([ $fail = 0 ] && echo ALL PASSED || echo FAILURES)"
