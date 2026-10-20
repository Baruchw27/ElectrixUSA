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
            errs=e; check('no page errors',not errs,errs[:3])
            await b.close()
    finally: sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
