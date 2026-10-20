"""Review B2 — the start-up race: a clock-in made with no signal must survive opening the app on a slow connection while
the phone is busy (timers/taps saving during start-up). Before the fix the clock-in was turned into a delete."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def punches(): return [r for r in srv('/__records?coll=punches')]
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,W,ew,_=await login(b,'Carlos','Testpass123','iphone'); await ready(W); await settle(W)
            net('down'); await W.wait_for_timeout(300)
            pid=await W.evaluate("(()=>{const id=nid('p');D.punches.push({id,who:me().id,site:'t32',in:Date.now()-60000,out:null,offline:true});save();return id})()")
            await W.wait_for_timeout(300)
            check('clock-in made with no signal is waiting on the phone',(pid in (await W.evaluate("localStorage.getItem('ex_queue')||''"))))
            # next app start: slow sign-in check, and the phone saves every 100 ms while starting (reminder timers, taps)
            await W.add_init_script("""(()=>{const iv=setInterval(()=>{if(window.EX_sb&&EX_sb.auth&&!EX_sb.__slow){EX_sb.__slow=1;const g=EX_sb.auth.getUser.bind(EX_sb.auth);EX_sb.auth.getUser=()=>new Promise(r=>setTimeout(()=>r(g()),1500));}},5);
              window.addEventListener('load',()=>{const t=setInterval(()=>{try{if(typeof save==='function'&&typeof me==='function'&&me())save();}catch(e){}if(window.EX_ready&&EX_ready())clearInterval(t);},100);});})()""")
            net('ok')
            await W.reload(); await until(W,"EX_ready&&EX_ready()",20000); await settle(W); await W.wait_for_timeout(1500); await settle(W)
            sv=[r for r in punches() if r['id']==pid]
            check('after opening the app on a slow connection, the clock-in reached the server (not deleted)',sv and not sv[0]['deleted'],sv)
            check('… and it is still on the phone',await W.evaluate(f"D.punches.some(x=>x.id==='{pid}')"))
            check('… nothing left waiting',await W.evaluate("Object.keys(JSON.parse(localStorage.getItem('ex_queue')||'{}')).length")==0)
            check('no errors',not ew,ew[:3])
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
