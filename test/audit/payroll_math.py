"""Payroll math check — every number worked out by hand first, then compared with what the app calculates
(the same functions every Hours / payroll screen uses: punchDur, weekStats, payCounts). Phone time zone: New York.
Cases marked POLICY show what the app does TODAY where the company has to decide the rule; they pass when the app
does exactly what is described, so a later policy change is a deliberate, visible change."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
CASES=[
 # name, JS that returns hours, hand-computed expected (hours), tolerance
 ('plain day 7:00–15:30, 30-min break → 8.0 h', "punchDur(P(2026,10,12,7,0,15,30,{breaks:[B(2026,10,12,12,0,12,30)]}))", 8.0),
 ('no break 7:00–15:30 → 8.5 h', "punchDur(P(2026,10,12,7,0,15,30))", 8.5),
 ('two breaks (15 + 30 min) → 7.75 h', "punchDur(P(2026,10,12,7,0,15,30,{breaks:[B(2026,10,12,9,0,9,15),B(2026,10,12,12,0,12,30)]}))", 7.75),
 ('break partly outside the shift only counts the part inside (6:45–7:15 break on a 7:00–15:30 shift) → 8.25 h', "punchDur(P(2026,10,12,7,0,15,30,{breaks:[B(2026,10,12,6,45,7,15)]}))", 8.25),
 ('POLICY material run: left 10:00, back 10:40 is NOT paid today → 8.5 − 0.667 = 7.833 h', "punchDur(P(2026,10,12,7,0,15,30,{trips:[{left:T(2026,10,12,10,0),back:T(2026,10,12,10,40)}]}))", 7.8333),
 ('a material run still in progress (not back yet) is not taken off', "punchDur(P(2026,10,12,7,0,15,30,{trips:[{left:T(2026,10,12,10,0)}]}))", 8.5),
 ('crosses midnight: 18:00 → 02:00 = 8.0 h', "punchDur(P2(2026,10,12,18,0,2026,10,13,2,0))", 8.0),
 ('clocks go back (Sun Nov 1 2026): Sat 22:00 → Sun 06:00 is really 9 h on the clock face 8 h → pays 9.0', "punchDur(P2(2026,10,31,22,0,2026,11,1,6,0))", 9.0),
 ('clocks go forward (Sun Mar 8 2026): Sat 22:00 → Sun 06:00 is really 7 h → pays 7.0', "punchDur(P2(2026,3,7,22,0,2026,3,8,6,0))", 7.0),
 ('bad data (out before in) never goes negative → 0', "punchDur(P(2026,10,12,15,0,7,0))", 0.0),
 ('week Mon–Fri 9 h each = 45 h → 40 regular', "WK([['12',9],['13',9],['14',9],['15',9],['16',9]]).reg", 40.0),
 ('… and 5 overtime', "WK([['12',9],['13',9],['14',9],['15',9],['16',9]]).ot", 5.0),
 ('week of 38 h → no overtime', "WK([['12',8],['13',8],['14',8],['15',8],['16',6]]).ot", 0.0),
 ('the week is Sunday–Saturday: Sunday 8 h + Mon–Fri 8 h = 48 h → 8 OT (Sun Oct 11 belongs to the week of Oct 11)', "WK([['11',8],['12',8],['13',8],['14',8],['15',8],['16',8]]).ot", 8.0),
 ('Saturday Oct 17 is the last day of that week (6 × 8 h incl. Sat → 8 OT)', "WK([['12',8],['13',8],['14',8],['15',8],['16',8],['17',8]]).ot", 8.0),
 ('the next Sunday (Oct 18) starts a new week (not counted in the week of Oct 11)', "WK([['12',8],['13',8],['14',8],['15',8],['16',8],['18',8]]).total", 40.0),
 ('waiting (late entry not approved yet), rejected and removed entries are not paid', "WK([['12',8],['13',8,{pending:true}],['14',8,{rejected:true}],['15',8,{voided:{why:'dup'}}]]).total", 8.0),
 ('a forgotten punch-out (open more than 14 h) is not counted until fixed', "(()=>{const p={id:'zzS',who:'u7',site:'t32',in:Date.now()-15*3600000};D.punches.push(p);const r=weekStats('u7',Date.now()).total;D.punches.pop();return r;})()", 0.0),
 ('travel pay: 50-minute drive at $30/h → $25.00', "(()=>{const r=D.travelRate,m=D.travelMin;D.travelRate=30;D.travelMin=25;const v=travelPayFor({id:'x'},50);D.travelRate=r;D.travelMin=m;return v;})()", 25.0),
 ('travel pay: 20-minute drive is a local job → $0', "(()=>{const r=D.travelRate,m=D.travelMin;D.travelRate=30;D.travelMin=25;const v=travelPayFor({id:'x'},20);D.travelRate=r;D.travelMin=m;return v;})()", 0.0),
 ('travel pay: a job with a fixed travel amount ($40) pays that amount', "travelPayFor({id:'x',travelPay:40},90)", 40.0),
 ('POLICY shift that crosses into a new week (Sat 22:00 → Sun 06:00): all 8 h are counted in the week it STARTED', "(()=>{clr();D.punches.push(P2(2026,10,17,22,0,2026,10,18,6,0));const a=weekStats('u7',T(2026,10,15,12,0)).total,b=weekStats('u7',T(2026,10,19,12,0)).total;return a*10+b;})()", 80.0),
 ('POLICY a break taken during a material run is taken off twice today (8.5 − 1.0 run − 0.5 break = 7.0; once would be 7.5)', "punchDur(P(2026,10,12,7,0,15,30,{trips:[{left:T(2026,10,12,11,45),back:T(2026,10,12,12,45)}],breaks:[B(2026,10,12,12,0,12,30)]}))", 7.0),
]
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,M,e,_=await login(b,'Miriam','Testpass123','desktop'); await ready(M); await settle(M)
            await M.evaluate("""(()=>{window.T=(y,mo,d,h,mi)=>new Date(y,mo-1,d,h,mi).getTime();
              window.B=(y,mo,d,h1,m1,h2,m2)=>({s:T(y,mo,d,h1,m1),e:T(y,mo,d,h2,m2)});
              window.P=(y,mo,d,h1,m1,h2,m2,x)=>Object.assign({id:'zz'+Math.random(),who:'u7',site:'t32',in:T(y,mo,d,h1,m1),out:T(y,mo,d,h2,m2)},x||{});
              window.P2=(y1,mo1,d1,h1,m1,y2,mo2,d2,h2,m2)=>({id:'zz'+Math.random(),who:'u7',site:'t32',in:T(y1,mo1,d1,h1,m1),out:T(y2,mo2,d2,h2,m2)});
              window._keep=D.punches.slice();window.clr=()=>{D.punches=_keep.filter(p=>p.who!=='u7');};
              window.WK=(days)=>{clr();days.forEach(([d,h,x])=>D.punches.push(Object.assign(P(2026,10,+d,7,0,7,0),{out:T(2026,10,+d,7,0)+h*3600000},x||{})));return weekStats('u7',T(2026,10,14,12,0));};
              return 1;})()""")
            print('Hand-computed payroll cases (New York time):')
            for name,js,want in CASES:
                got=await M.evaluate(js)
                check(f'{name}  [app: {round(got,3)}]',abs(got-want)<0.01,f'expected {want}, app says {got}')
            await M.evaluate("D.punches=_keep")
            check('no page errors',not e,e[:3])
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
