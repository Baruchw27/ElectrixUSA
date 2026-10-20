#!/bin/bash
# Builds the PRODUCTION app files for the audit release into a separate folder ($1). Never touches the live files.
# The live site changes only when, after Baruch's approval, the folder's files are copied to the repo root and pushed.
#   usage: release_audit/build_prod_app.sh OUTDIR [CACHE_NUMBER]   (default cache electrix-v17: live v14, schedule v15, its rollback v16)
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$1"; N="${2:-17}"; VER="vaud$(date +%m%d)"
[ -n "$OUT" ] || { echo "usage: $0 OUTDIR [N]"; exit 1; }
rm -rf "$OUT"; mkdir -p "$OUT"
# start from the live site exactly as it is today (origin/main root files: config, icons, manifest…)
git -C "$REPO" fetch -q origin main
git -C "$REPO" archive origin/main index.html sync.js extras.js config.js manifest.json sw.js version.json icon-192.png icon-512.png apple-touch-icon.png logo-light.svg logo-dark.svg | tar -x -C "$OUT"
# the tested staging app code (everything the audit changed)
for f in index.html sync.js extras.js scanner-v2.js scanner-v2-ui.js catalog-real.json sched-v21.js; do cp "$REPO/staging/$f" "$OUT/$f"; done
# staging-only phone self-test is not shipped
sed -i -E 's#<script src="selftest\.js\?[a-z0-9]+"></script>##' "$OUT/index.html"
grep -q 'selftest.js' "$OUT/index.html" && { echo "ERROR: selftest still referenced"; exit 1; }
sed -i -E "s/\?vsch21a/?$VER/g" "$OUT/index.html"
echo "{\"v\":\"$VER\"}" > "$OUT/version.json"
# service worker: the staging one (notification tap → right screen) with the production cache name and clean-up rule
cp "$REPO/staging/sw.js" "$OUT/sw.js"
python3 - "$OUT/sw.js" "$N" <<'PY'
import sys
p,n=sys.argv[1],sys.argv[2]; s=open(p).read()
a="const C='electrix-staging-v17'; // STAGING: own cache name"
assert a in s; s=s.replace(a,"const C='electrix-v%s';"%n)
b="ks.filter(k=>k!==C&&k.startsWith('electrix-staging'))"
assert b in s; s=s.replace(b,"ks.filter(k=>k!==C&&!k.startsWith('electrix-staging'))")
open(p,'w').write(s)
PY
grep -q "staging" "$OUT/config.js" && { echo "ERROR: staging config"; exit 1; }
grep -q "fieldtest" "$OUT/config.js" && { echo "ERROR: field test flag in production config"; exit 1; }
grep -q "lnbcrptcdufnmqsvsisv" "$OUT/config.js" || { echo "ERROR: config is not production"; exit 1; }
echo "built $VER (cache electrix-v$N) in $OUT"; (cd "$OUT" && sha256sum index.html sync.js extras.js scanner-v2.js scanner-v2-ui.js catalog-real.json sched-v21.js sw.js version.json config.js)
