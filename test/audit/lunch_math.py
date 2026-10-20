"""L1 — paid lunch: up to 40 minutes of lunch per person per workday are paid, the rest unpaid. Every number is worked
out by hand first and compared with what the app calculates (punchDur / lunchInfo / dayLunchSummary / weekStats —
the same functions every Hours and payroll screen uses). Phone time zone: New York. Shift 7:00–15:30 = 8.5 h on the clock."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
H=lambda m: m/60
CASES=[
 ('30-min lunch → 30 paid → 8.5 h', "punchDur(P(12,7,0,15,30,{breaks:[B(12,12,0,12,30)]}))", 8.5),
 ('40-min lunch → 40 paid → 8.5 h', "punchDur(P(12,7,0,15,30,{breaks:[B(12,12,0,12,40)]}))", 8.5),
 ('60-min lunch → 40 paid + 20 unpaid → 8.1667 h', "punchDur(P(12,7,0,15,30,{breaks:[B(12,12,0,13,0)]}))", 8.5-H(20)),
 ('… lunchInfo says 40 paid / 20 unpaid', "(()=>{const i=lunchInfo(P(12,7,0,15,30,{breaks:[B(12,12,0,13,0)]}));return i.paid/60000*100+i.unpaid/60000;})()", 4020),
 ('75-min lunch → 40 paid + 35 unpaid → 7.9167 h', "punchDur(P(12,7,0,15,30,{breaks:[B(12,12,0,13,15)]}))", 8.5-H(35)),
 ('two lunches 25 + 25 → 40 paid, 10 unpaid → 8.3333 h', "punchDur(P(12,7,0,15,30,{breaks:[B(12,10,0,10,25),B(12,12,0,12,25)]}))", 8.5-H(10)),
 ('R1 lunch overlapping a material run: run 11:45–12:45 (paid work) + lunch 12:30–13:30 → lunch outside the run 45 min → 40 paid, 5 unpaid → 8.5 − 0.0833 = 8.4167 h',
  "punchDur(P(12,7,0,15,30,{trips:[{left:T(12,11,45),back:T(12,12,45)}],breaks:[B(12,12,30,13,30)]}))", 8.5-H(5)),
 ('R1 lunch completely inside a material run is counted once, as paid work → 8.5 h', "punchDur(P(12,7,0,15,30,{trips:[{left:T(12,11,45),back:T(12,12,45)}],breaks:[B(12,12,0,12,30)]}))", 8.5),
 ('R1 45-min material run, no lunch → nothing deducted → 8.5 h', "punchDur(P(12,7,0,15,30,{trips:[{left:T(12,10,0),back:T(12,10,45)}]}))", 8.5),
 ('… the run is still shown as its own figure: 45 min', "runMs(P(12,7,0,15,30,{trips:[{left:T(12,10,0),back:T(12,10,45)}]}))/60000", 45),
 ('R1 material run in progress (left, not back yet) on a finished entry → nothing deducted → 8.5 h', "punchDur(P(12,7,0,15,30,{trips:[{left:T(12,14,0)}]}))", 8.5),
 ('R1 open entry, run in progress for 25 min → hours keep counting (3.0 h after 3 h on the clock)', "(()=>{const n=Date.now();return punchDur({id:'zzRp',who:'u7',site:'t32',in:n-3*3600000,out:null,trips:[{left:n-25*60000}]});})()", 3.0),
 ('unchanged: automatic punch-out (left the site 20 min ago, not back) — hours stop at leaving until they come back → 2.6667 h', "(()=>{const n=Date.now();return punchDur({id:'zzRa',who:'u7',site:'t32',in:n-3*3600000,out:null,away:n-20*60000});})()", 3-H(20)),
 ('R1 60-min lunch fully inside a 90-min run → 0 deducted → 8.5 h', "punchDur(P(12,7,0,15,30,{trips:[{left:T(12,11,30),back:T(12,13,0)}],breaks:[B(12,11,45,12,45)]}))", 8.5),
 ('R1 60-min lunch with 20 min overlapping a run → 40 lunch minutes outside the run, all paid → 8.5 h', "punchDur(P(12,7,0,15,30,{trips:[{left:T(12,11,0),back:T(12,12,20)}],breaks:[B(12,12,0,13,0)]}))", 8.5),
 ('R1 75-min lunch with 15 min overlapping a run → 60 outside → 40 paid, 20 unpaid → 8.1667 h', "punchDur(P(12,7,0,15,30,{trips:[{left:T(12,11,0),back:T(12,12,15)}],breaks:[B(12,12,0,13,15)]}))", 8.5-H(20)),
 ('… lunchInfo for that case: 60 lunch minutes outside the run, 40 paid / 20 unpaid', "(()=>{const i=lunchInfo(P(12,7,0,15,30,{trips:[{left:T(12,11,0),back:T(12,12,15)}],breaks:[B(12,12,0,13,15)]}));return i.lunch/60000*10000+i.paid/60000*100+i.unpaid/60000;})()", 604020),
 ('overnight 18:00 → 02:00 with a 75-min lunch 23:30–00:45 across midnight → 8 − 35 min = 7.4167 h', "punchDur({id:'zzN',who:'u7',site:'t32',in:T(12,18,0),out:T(13,2,0),breaks:[{s:T(12,23,30),e:T(13,0,45)}]})", 8-H(35)),
 ('lunch still in progress (in 3 h ago, on lunch for 50 min) → 40 paid so far, 10 unpaid → 2.8333 h', "(()=>{const n=Date.now();return punchDur({id:'zzO',who:'u7',site:'t32',in:n-3*3600000,out:null,breakStart:n-50*60000});})()", 3-H(10)),
 ('site switch splits the day: 7:00–11:00 (lunch 25) + 11:00–15:30 (lunch 25) share 40 min → first entry 4.0 h',
  "(()=>{clr();const a=P(12,7,0,11,0,{id:'zzA',breaks:[B(12,10,30,10,55)]}),b=P(12,11,0,15,30,{id:'zzB',transfer:true,breaks:[B(12,12,0,12,25)]});D.punches.push(a,b);return punchDur(a);})()", 4.0),
 ('… second entry gets the remaining 15 paid, 10 unpaid → 4.5 − 0.1667 = 4.3333 h', "punchDur(D.punches.find(p=>p.id==='zzB'))", 4.5-H(10)),
 ('… day summary: worked 8.5 h · 40 min paid lunch · 10 min unpaid · payable 8.3333 h',
  "(()=>{const s=dayLunchSummary('u7','2026-10-12');return Math.round(s.worked*1000)*1e6+Math.round(s.paidLunch)*1000+Math.round(s.unpaidLunch)+s.payable/1000;})()", 8500*1e6+40*1000+10+8.3333/1000),
 ('the next day has its own 40 minutes (30-min lunch on Oct 13 fully paid) → 8.5 h',
  "(()=>{const c=P(13,7,0,15,30,{id:'zzC',breaks:[B(13,12,0,12,30)]});D.punches.push(c);return punchDur(c);})()", 8.5),
 ('a rejected entry does not use up the allowance: rejected 7:00–11:00 with 40-min lunch + real 11:00–15:30 with 40-min lunch → 4.5 h',
  "(()=>{clr();D.punches.push(P(14,7,0,11,0,{id:'zzR',rejected:true,breaks:[B(14,10,0,10,40)]}));const g=P(14,11,0,15,30,{id:'zzG',breaks:[B(14,12,0,12,40)]});D.punches.push(g);return punchDur(g);})()", 4.5),
 ('a different person the same day has their own 40 minutes',
  "(()=>{clr();D.punches.push(P(15,7,0,15,30,{id:'zzX',breaks:[B(15,12,0,12,40)]}));const o=Object.assign(P(15,7,0,15,30,{id:'zzY',breaks:[B(15,12,0,12,40)]}),{who:'u8'});D.punches.push(o);return punchDur(o);})()", 8.5),
 ('weekly totals use payable hours: 5 days with a 60-min lunch = 5 × 8.1667 = 40.8333 h',
  "(()=>{clr();for(const d of [12,13,14,15,16])D.punches.push(P(d,7,0,15,30,{breaks:[B(d,12,0,13,0)]}));return weekStats('u7',T(14,12,0)).total;})()", 5*(8.5-H(20))),
 ('… overtime still after 40 h in the Sun–Sat week → 0.8333 h OT', "weekStats('u7',T(14,12,0)).ot", 5*(8.5-H(20))-40),
 ('old punches keep their real times (the calculation does not change the record)',
  "(()=>{const p=P(12,7,0,15,30,{breaks:[B(12,12,0,13,0)]});const j=JSON.stringify(p);punchDur(p);lunchInfo(p);return JSON.stringify(p)===j?1:0;})()", 1),
]
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,M,e,_=await login(b,'Miriam','Testpass123','desktop'); await ready(M); await settle(M)
            await M.evaluate("""(()=>{window.T=(d,h,mi)=>new Date(2026,9,d,h,mi).getTime();
              window.B=(d,h1,m1,h2,m2)=>({s:T(d,h1,m1),e:T(d,h2,m2)});
              window.P=(d,h1,m1,h2,m2,x)=>Object.assign({id:'zz'+Math.random(),who:'u7',site:'t32',in:T(d,h1,m1),out:T(d,h2,m2)},x||{});
              window._keep=D.punches.slice();window.clr=()=>{D.punches=_keep.filter(p=>p.who!=='u7'&&p.who!=='u8');};clr();
              return 1;})()""")
            print('Hand-computed paid-lunch cases (New York time):')
            for name,js,want in CASES:
                got=await M.evaluate(js)
                check(f'{name}  [app: {round(got,4)}]',abs(got-want)<0.01,f'expected {want}, app says {got}')
            await M.evaluate("D.punches=_keep")
            # wording: the button says Lunch (Spanish: Almuerzo); same data fields as before
            check('the button says Lunch','Lunch' in (await M.evaluate("(document.getElementById('breakBtn')||{}).textContent||''")))
            check('… and Almuerzo in Spanish',await M.evaluate("ES['Lunch']==='Almuerzo'&&ES['Back from lunch']==='Volver del almuerzo'"))
            check('no page errors',not e,e[:3])
            await b.close()
        # a worker on the clock: tap Lunch, back from lunch, the punch keeps breaks[] and the screen shows today's split
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,W,e2,_=await login(b,'Carlos','Testpass123','iphone'); await ready(W); await settle(W)
            await W.evaluate("(()=>{const n=Date.now();D.punches=D.punches.filter(p=>!(p.who===me().id&&!p.out));D.punches.push({id:nid('p'),who:me().id,site:'t32',in:n-4*3600000,out:null});save();goTab('punch');renderPunch();})()")
            await W.evaluate("toggleBreak()"); await W.wait_for_timeout(150)
            on=await W.evaluate("(()=>{const p=D.punches.find(x=>x.who===me().id&&!x.out);return !!p.breakStart&&document.getElementById('breakBtn').textContent.includes('Back from lunch');})()")
            check('worker taps Lunch: lunch starts (breakStart saved) and the button says Back from lunch',on)
            await W.evaluate("(()=>{const p=D.punches.find(x=>x.who===me().id&&!x.out);p.breakStart=Date.now()-55*60000;toggleBreak();})()"); await W.wait_for_timeout(150)
            st=await W.evaluate("(()=>{const p=D.punches.find(x=>x.who===me().id&&!x.out);const ln=document.getElementById('lunchNote');return [!p.breakStart&&(p.breaks||[]).length===1, ln?ln.textContent:''];})()")
            check('back from a 55-min lunch: saved as one lunch on the clock entry',st[0],st)
            check('… the punch screen shows worked / 40 min paid lunch / 15 min unpaid / payable',('40 min paid lunch' in st[1]) and ('15 min unpaid lunch' in st[1]) and ('payable' in st[1]),st[1])
            await settle(W)
            r=[x for x in srv('/__records?coll=punches') if (x['data'] or {}).get('who')=='u7' and not (x['data'] or {}).get('out') and not x['deleted']]
            check('… and the lunch reached the server copy',bool(r) and len((r[-1]['data'] or {}).get('breaks') or [])==1,r[-1:] )
            check('no page errors (worker)',not e2,e2[:3])
            await b.close()
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
