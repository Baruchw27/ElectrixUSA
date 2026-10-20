"""Audit — stock moves on the phone (staging)."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def stocklog(tid): return any(r['id']==tid and not r['deleted'] for r in srv('/__records?coll=stockLog'))
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,A,e,_=await login(b,'Baruch','Testpass123','iphone'); await ready(A)
            urllib.request.urlopen(BASE+'/__stockfail?code=22023')
            t1=await A.evaluate("commitStockTxn('in',[{id:'s_9',name:'Item 9',unit:'ea',qty:4}],'t32').id"); await A.wait_for_timeout(2500)
            t2=await A.evaluate("commitStockTxn('in',[{id:'s_9',name:'Item 9',unit:'ea',qty:2}],'t32').id"); await A.wait_for_timeout(2500); await A.evaluate("flushStockQ()"); await A.wait_for_timeout(2000)
            q=await A.evaluate("stockQ().map(x=>x.id)")
            check('a stock move refused with an unknown server error is recorded for the office, not retried forever',t1 not in q and await A.evaluate(f"(D.rejq||[]).some(x=>x.id==='rej_{t1}')"),q)
            check('… and it no longer blocks the next move (applied)',stocklog(t2) and t2 not in q)
            # the server applies a pick-up but its answer never reaches the phone (signal drops right then)
            q0=await A.evaluate("stockItem('s_9').qty"); srvq=lambda:[r for r in srv('/__records?coll=stock') if r['id']=='s_9'][0]['data']['qty']
            s0=srvq(); urllib.request.urlopen(BASE+'/__droptxn?n=1&then=refuse')
            t3=await A.evaluate("commitStockTxn('out',[{id:'s_9',name:'Item 9',unit:'ea',qty:2}],'t32').id"); await A.wait_for_timeout(1500); net('refuse'); await A.wait_for_timeout(2500)
            shown=await A.evaluate("stockItem('s_9').qty")
            check('answer lost after the server took the pick-up: the phone shows the right count (taken once, not twice)',srvq()==s0-2 and shown==s0-2,{'server':srvq(),'shown':shown,'before':s0})
            net('ok'); await A.evaluate("window.dispatchEvent(new Event('online'))"); await A.wait_for_timeout(1500); await A.evaluate("flushStockQ()"); await A.wait_for_timeout(2500)
            check('… once the signal is back the move is cleared without being applied a second time',srvq()==s0-2 and t3 not in await A.evaluate("stockQ().map(x=>x.id)") and await A.evaluate("stockItem('s_9').qty")==s0-2)
            # reopening the app must not pile up copies of the stock history
            n1=await A.evaluate("D.stockLog.length")
            await A.evaluate("(()=>{for(let i=0;i<5;i++)D.stockLog.push({kind:'in',by:'u1',items:[],ts:Date.now(),applied:true});save();})()")   # what older versions left behind
            srvn=sum(1 for r in srv('/__records?coll=stockLog') if not r['deleted'])
            for _ in range(2):
                await A.reload(); await A.wait_for_timeout(1200); await until(A,"EX_ready&&EX_ready()",20000); await A.wait_for_timeout(1500)
            n2=await A.evaluate("D.stockLog.length"); ids=await A.evaluate("D.stockLog.map(x=>x.id)")
            check('reopening the app twice: stock history is not duplicated (and copies left by older versions are cleared), every entry keeps its id',n2==n1 and len(set(ids))==len(ids) and all(ids),{'before':n1,'after':n2,'server':srvn,'noid':sum(1 for i in ids if not i)})
            errs=e; check('no page errors',not errs,errs[:3])
            await b.close()
    finally: sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
