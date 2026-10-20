"""Audit — hours / time clock regression checks (staging). Runs the real app code on the local stand-in server."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
H=lambda h:int(h*3600000)
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,A,e,_=await login(b,'Baruch','Testpass123','desktop'); await ready(A)
            # H1 auto punch-out final after 60 min although the phone was asleep
            r=await A.evaluate("""(()=>{const now=Date.now();const p={id:'pa1',who:'u1',site:'t32',in:now-8*3600000,away:now-3*3600000};D.punches.push(p);
              finalizeAway('u1');return {out:p.out,away:p.away,dur:punchDur(p)}})()""")
            check('auto punch-out left un-finalized for 3 h → final at the time he left (5 h, not 8 h)',r['out'] and abs(r['dur']-5)<0.01 and r['away'] is None,r)
            r=await A.evaluate("(()=>{const now=Date.now();const p={id:'pa2',who:'u1',site:'t32',in:now-2*3600000,away:now-1800000};D.punches.push(p);finalizeAway('u1');return {out:p.out||null,away:!!p.away}})()")
            check('… but within 60 min it stays open (he can still come back)',r['out'] is None and r['away'],r)
            await A.evaluate("D.punches=D.punches.filter(p=>!/^pa/.test(p.id));save()")
            # H2 one counting rule everywhere
            ws=await A.evaluate("weekStart(new Date()).getTime()")
            await A.evaluate(f"""(()=>{{const ws={ws};D.punches.push({{id:'pc1',who:'u7',site:'t32',in:ws+86400000+8*3600000,out:ws+86400000+17*3600000}},{{id:'pc2',who:'u7',site:'t32',in:ws+2*86400000+8*3600000,out:ws+2*86400000+17*3600000,pending:true}},{{id:'pc3',who:'u7',site:'t32',in:ws+3*86400000+8*3600000,out:ws+3*86400000+8*3600000,rejected:true}});save();}})()""")
            wk=await A.evaluate("weekStats('u7').total")
            hp=await A.evaluate(f"hrPunches({ws},{ws}+7*864e5,p=>p.who==='u7').reduce((a,p)=>a+punchDur(p),0)")
            await A.evaluate("goTab('hours')"); await A.evaluate("hrRange='week';document.getElementById('hrWho').value='u7';renderHours()"); await A.wait_for_timeout(200)
            txt=await A.evaluate("document.getElementById('hrList').innerText")
            check('pending punch: not counted on the week card, Hours list or Job Hours (all 9.00 h)',abs(wk-9)<0.01 and abs(hp-9)<0.01 and ('9.00' in txt),(wk,hp,txt[:200]))
            check('… and the Hours list says it is waiting for approval',('Waiting for approval' in txt),txt[:300])
            await A.evaluate("D.punches=D.punches.filter(p=>!/^pc/.test(p.id));save()")
            # H3 a stuck break doesn't eat a corrected punch
            await A.evaluate("(()=>{const now=Date.now();D.punches.push({id:'pb1',who:'u8',site:'t32',in:now-6*3600000,breakStart:now-5*3600000});save();})()")
            i=await A.evaluate("D.punches.findIndex(p=>p.id==='pb1')")
            await A.evaluate(f"openPunchEdit({i})"); await A.evaluate("(()=>{const pe=D.punches.find(p=>p.id==='pb1');const tm=x=>new Date(x).toTimeString().slice(0,5);document.getElementById('peIn').value=tm(pe.in);document.getElementById('peOut').value=tm(pe.in+5*3600000);document.getElementById('peDate').value=dkey(new Date(pe.in));document.getElementById('peWhy').value='forgot to punch out';savePunchEdit();})()")
            d1=await A.evaluate("punchDur(D.punches.find(p=>p.id==='pb1'))"); await A.wait_for_timeout(1500); d2=await A.evaluate("punchDur(D.punches.find(p=>p.id==='pb1'))")
            check('payroll fixes a punch with a stuck break → 5.00 h and it stays 5.00 h',abs(d1-5)<0.02 and abs(d2-d1)<0.0001,(d1,d2))
            # H4 the edit form remembers the punch, not its position
            i=await A.evaluate("D.punches.findIndex(p=>p.id==='pb1')"); await A.evaluate(f"openPunchEdit({i})")
            await A.evaluate("D.punches.unshift({id:'pz0',who:'u9',site:'t54',in:Date.now()-3600000,out:Date.now()})")   # list shifts (sync / trim) while the form is open
            await A.evaluate("document.getElementById('peWhy').value='site fix';document.getElementById('peSite').value='t70';savePunchEdit()")
            r=await A.evaluate("[D.punches.find(p=>p.id==='pb1').site,D.punches.find(p=>p.id==='pz0').site,D.punches.find(p=>p.id==='pz0').who]")
            check('list shifts while the edit form is open → the edit still goes to the right punch',r==['t70','t54','u9'],r)
            # H5/H6 daylight saving time (America/New_York)
            r=await A.evaluate("""(()=>{const ws=new Date('2026-11-01T00:00:00').getTime();const pin=new Date('2026-11-07T23:30:00').getTime();
              D.punches.push({id:'pd1',who:'u10',site:'t32',in:pin,out:pin+20*60000});const st=weekStats('u10',new Date('2026-11-04T12:00'));const nx=weekStats('u10',new Date('2026-11-10T12:00'));return [st.total,nx.total,st.days[6]]})()""")
            check('clocks go back (Nov 1): a Saturday 11:30 PM punch counts in its own week, once',abs(r[0]-1/3)<0.01 and r[1]==0 and abs(r[2]-1/3)<0.01,r)
            r=await A.evaluate("""(()=>{const pin=new Date('2027-03-14T00:30:00').getTime();D.punches.push({id:'pd2',who:'u11',site:'t32',in:pin,out:pin+3600000});
              const before=weekStats('u11',new Date('2027-03-10T12:00')),after=weekStats('u11',new Date('2027-03-16T12:00'));return [before.total,after.total,String(after.total)]})()""")
            check('clocks go forward (Mar 14): a Sunday 12:30 AM punch counts only in the new week (no NaN)',r[0]==0 and abs(r[1]-1)<0.01 and r[2]!='NaN',r)
            # H7 a missed punch from long ago still reaches the server
            await A.evaluate("save.p=0")  # force the hourly trim to run on the next save
            await A.evaluate("(()=>{document.getElementById('hrDate').value=dkey(new Date(Date.now()-200*864e5));openPunchEdit(null);document.getElementById('peWho').value='u12';document.getElementById('peSite').value='t27';document.getElementById('peIn').value='07:00';document.getElementById('peOut').value='15:00';document.getElementById('peWhy').value='old missed punch';savePunchEdit();})()")
            await settle(A,10000)
            got=[r for r in srv('/__records?coll=punches') if r['data'].get('who')=='u12']
            check('a missed punch added for 200 days ago reaches the server (not trimmed first)',len(got)==1,len(got))
            # H8 a forgotten punch-out doesn't inflate the live week total
            await A.evaluate("(()=>{D.punches.push({id:'ps1',who:'u13',site:'t32',in:Date.now()-30*3600000});save();})()")
            check('forgotten punch-out (30 h open) is not counted live on the week card',await A.evaluate("weekStats('u13').total")==0)
            # H9 weekly summary only from the owner's phone
            cw,W,ew,_=await login(b,'Carlos','Testpass123','iphone'); await ready(W)
            n0=len(srv('/__records?coll=inbox')); await W.evaluate("D.wkSum='';weeklySummaryCheck&&weeklySummaryCheck()"); await W.wait_for_timeout(1500)
            check("a worker's phone never sends the company weekly summary",len(srv('/__records?coll=inbox'))==n0)
            errs=e+ew; check('no page errors',not errs,errs[:3])
            await b.close()
    finally: sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
