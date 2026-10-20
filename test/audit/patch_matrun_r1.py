"""R1 — Baruch 2026-10-20 18:48: material runs during working hours are PAID working time — never deducted. A lunch that
overlaps a run counts those minutes once, as work (run); only lunch minutes outside any run use the 40-minute paid lunch
allowance (L1). The automatic punch-out (left the site, not back within 60 min) is unchanged.
usage: python3 patch_matrun_r1.py path/to/index.html"""
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s; c=s.count(a); assert c==1,(c,a[:80]); s=s.replace(a,b)
rep("// overlaps an off-site trip is not taken off a second time. Trips keep their own rule (unchanged).",
    "// overlaps a material run (off-site trip) is counted once, as work. R1: material runs are paid working time — never deducted.")
rep("// lunch time of one clock entry (ms), inside the entry and not already off the clock as an off-site trip",
    "// lunch time of one clock entry (ms), inside the entry and outside any material run (run minutes are paid work)")
rep("// hours on the clock for one entry: clock time minus off-site trips minus UNPAID lunch (paid lunch stays in)\nfunction punchDur(p){const end=p.out||p.away||Date.now();let d=(end-p.in)/3600000;const clip=(a,b)=>Math.max(0,Math.min(b,end)-Math.max(a,p.in))/3600000;(p.trips||[]).forEach(tr=>{if(tr.back)d-=clip(tr.left,tr.back);});d-=lunchInfo(p).unpaid/3600000;return Math.max(0,d);}",
    "// hours on the clock for one entry: clock time minus UNPAID lunch (paid lunch and material runs stay in — R1)\nfunction punchDur(p){const end=p.out||p.away||Date.now();let d=(end-p.in)/3600000;d-=lunchInfo(p).unpaid/3600000;return Math.max(0,d);}\n// material-run minutes inside one clock entry (shown for information; paid, never deducted)\nfunction runMs(p){if(!p)return 0;const end=p.out||p.away||Date.now();return _ivLen((p.trips||[]).filter(tr=>tr&&tr.left).map(tr=>[Math.max(+tr.left||0,p.in),Math.min(+(tr.back||Date.now()),end)]));}")
rep("// one person's day: worked (clock time minus trips), paid lunch, unpaid lunch, payable (worked minus unpaid lunch) — hours",
    "// one person's day: worked (clock time, material runs included), paid lunch, unpaid lunch, payable (worked minus unpaid lunch) — hours")
rep("// Reuses punchDur (breaks, off-site trips and manual corrections are already inside it) and weekStart (Sun–Sat).",
    "// Reuses punchDur (lunch rule and manual corrections are already inside it; material runs are paid time) and weekStart (Sun–Sat).")
rep("""↳ '+t('off site')+' '+fmtT(tr.left)+'–'+fmtT(tr.back)+' ('+Math.round((tr.back-tr.left)/60000)+' min)</div>'""",
    """↳ '+t('material run')+' '+fmtT(tr.left)+'–'+fmtT(tr.back)+' ('+Math.round((tr.back-tr.left)/60000)+' min, '+t('paid')+')</div>'""")
rep("""↳ material run ${fmtT(t.left)}–${fmtT(t.back)} (${Math.round((t.back-t.left)/60000)} min, kept on clock)""",
    """↳ ${t('material run')} ${fmtT(t.left)}–${fmtT(t.back)} (${Math.round((t.back-t.left)/60000)} min, ${t('paid')})""")
rep('''Object.assign(ES,{"Lunch":"Almuerzo",''','''Object.assign(ES,{"material run":"vuelta por material","Lunch":"Almuerzo",''')
open(p,'w',encoding='utf-8').write(s); print('R1 applied')
