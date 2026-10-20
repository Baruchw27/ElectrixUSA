#!/bin/bash
# Builds the production app files for the release INTO A SEPARATE FOLDER ($1). It never touches the live files.
# The live site changes only when, after Baruch's approval, this folder's files are copied to the repo root and pushed.
#   usage: staging/release/build_prod_release.sh /path/to/out [--ai]
set -e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"; OUT="$1"; VER="vrel$(date +%m%d)"
[ -n "$OUT" ] || { echo "usage: $0 OUTDIR [--ai]"; exit 1; }
rm -rf "$OUT"; mkdir -p "$OUT"
# start from the live site exactly as it is (git HEAD of the root files), so nothing else changes
git -C "$REPO" archive HEAD index.html sync.js extras.js config.js manifest.json sw.js version.json icon-192.png icon-512.png apple-touch-icon.png logo-light.svg logo-dark.svg | tar -x -C "$OUT"
# the tested staging app code
for f in index.html sync.js scanner-v2.js scanner-v2-ui.js catalog-real.json; do cp "$REPO/staging/$f" "$OUT/$f"; done
# production version numbers (cache busting) and service worker: same as today + the 3 new files, new cache name
sed -i -E "s/vscan[0-9a-z]+/$VER/g" "$OUT/index.html"
echo "{\"v\":\"$VER\"}" > "$OUT/version.json"
python3 - "$OUT/sw.js" <<'PY'
import re,sys
p=sys.argv[1]; s=open(p).read()
m=re.search(r"const C='electrix-v(\d+)'",s); s=s.replace(m.group(0),"const C='electrix-v%d'"%(int(m.group(1))+1))
s=s.replace("'logo-dark.svg'];","'logo-dark.svg','scanner-v2.js','scanner-v2-ui.js','catalog-real.json'];")
open(p,'w').write(s)
PY
# AI label reading only when approved (and only once the production server secret is set)
if [ "$2" = "--ai" ]; then sed -i "s/ai:false/ai:true/" "$OUT/config.js"; fi
grep -q "fieldtest" "$OUT/config.js" && { echo "ERROR: field test flag in production config"; exit 1; }
echo "built $VER in $OUT"; (cd "$OUT" && sha256sum index.html sync.js scanner-v2.js scanner-v2-ui.js catalog-real.json sw.js version.json config.js)
