from harness import *
SEED=json.load(open(os.path.join(HERE,'seed_prod.json')))
async def main():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ca,A,ea,ok=await login(b,'Baruch','Testpass123','iphone')
            cb,B,eb,ok2=await login(b,'Yossi','Testpass123','android')
            check('two phones signed in',ok and ok2)
            for P in (A,B): await P.wait_for_timeout(5500); await until(P,"EX_ready&&EX_ready()",10000)
            d=await A.evaluate("(()=>{const d=new Date();d.setDate(d.getDate()+3);return dkey(d)})()")
            # both see c1 booked at t32
            await A.evaluate(f"editSlot('c1','{d}');slotPickMode('menu');document.getElementById('slotAddSite').value='t32';slotAddFull();saveSlot();0")
            await until(B,f"!!D.sched['c1|{d}']",8000)
            # Yossi's phone loses signal
            await B.evaluate("EX_sb.removeAllChannels()"); await cb.set_offline(True); await B.evaluate("window.dispatchEvent(new Event('offline'))")
            # Baruch changes Crew 1 to t54
            await A.evaluate(f"editSlot('c1','{d}');slotSet(0,'site','t54');saveSlot();0"); await A.wait_for_timeout(1500)
            # offline: Yossi changes Crew 1 (stale copy) AND books Crew 2 for the same day
            await B.evaluate(f"editSlot('c1','{d}');slotSet(0,'site','t70');saveSlot();0"); await B.wait_for_timeout(500)
            await B.evaluate(f"editSlot('c2','{d}');slotOneoffs=[];slotPickMode('menu');document.getElementById('slotAddSite').value='t150';slotAddFull();saveSlot();0"); await B.wait_for_timeout(500)
            await cb.set_offline(False); await B.evaluate("window.dispatchEvent(new Event('online'))"); await B.wait_for_timeout(4000)
            c2=[x for x in srv('/__records?coll=sched') if x['id']==f'c2|{d}']
            print('server c2:',c2,'stale hits',srv('/__state')['stats'].get('stale'))
            print('B toasts',await B.evaluate('window._t'),'B local c2',await B.evaluate(f"JSON.stringify(D.sched['c2|{d}']||null)"))
            check("Yossi's unrelated Crew 2 booking is not lost because of the Crew 1 clash",bool(c2))
            await b.close()
    finally: sp.kill()
asyncio.run(main())
