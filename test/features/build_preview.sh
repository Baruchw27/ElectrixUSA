#!/bin/bash
# Builds the features preview copy: staging-features/ = staging/ (with Features v1) under its own address,
# its own saved-data prefix (stf__), its own offline cache and its own banner. Same STAGING database, fake data only.
# usage: test/features/build_preview.sh   (run from anywhere)
set -e
cd "$(dirname "$0")/../.."
SRC=staging; OUT=staging-features
rm -rf "$OUT"; mkdir -p "$OUT"
for f in index.html sync.js extras.js config.js sw.js manifest.json version.json features-v1.js sched-v21.js selftest.js scanner-v2.js scanner-v2-ui.js \
         catalog-real.json icon-192.png icon-512.png apple-touch-icon.png logo-light.svg logo-dark.svg; do cp "$SRC/$f" "$OUT/$f"; done
python3 - "$OUT" <<'EOF'
import sys,re,json
o=sys.argv[1]
def sub(f,a,b):
    p=o+'/'+f;s=open(p).read();assert s.count(a)>=1,(f,a[:60]);s=s.replace(a,b);open(p,'w').write(s)
sub('config.js',"var P='stg__'","var P='stf__'")
sub('config.js',"b.textContent='STAGING — fake test data'","b.textContent='STAGING — new features preview (fake data)'")
sub('config.js',"document.title='STAGING · '+document.title","document.title='PREVIEW · '+document.title")
sub('sw.js',"const C='electrix-staging-v17';","const C='electrix-stfeat-v1';")
sub('sw.js',"k.startsWith('electrix-staging')","k.startsWith('electrix-stfeat')")
m=json.load(open(o+'/manifest.json'));m['name']='Electrix (features preview)';m['short_name']='Electrix preview';json.dump(m,open(o+'/manifest.json','w'))
json.dump({'v':'vfeat1'},open(o+'/version.json','w'))
sub('index.html',"window.EX_VER='vsch21a'","window.EX_VER='vfeat1'")
EOF
echo "built $OUT ($(ls $OUT | wc -l) files)"
