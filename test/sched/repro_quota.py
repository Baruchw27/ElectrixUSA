from harness import *
SEED=json.load(open(os.path.join(HERE,'seed_prod.json')))
async def fill(A,leave):
    # fill localStorage with a stand-in for the STAGING copy (same web address) until only `leave` chars are free
    return await A.evaluate(f"""(()=>{{let chunk='x'.repeat(100000),i=0;try{{for(;;i++)localStorage.setItem('stg__filler'+i,chunk);}}catch(e){{}}
      // free some room back
      let freed=0;for(let j=i-1;j>=0&&freed<{leave};j--){{localStorage.removeItem('stg__filler'+j);freed+=100000;}}
      if({leave}===0){{let c2='y'.repeat(2000),k2=0;try{{for(;;k2++)localStorage.setItem('stg__f2_'+k2,c2);}}catch(e){{}};let c3='z'.repeat(50);try{{for(let k3=0;;k3++)localStorage.setItem('stg__f3_'+k3,c3);}}catch(e){{}}}}
      let used=0;for(let k=0;k<localStorage.length;k++){{const key=localStorage.key(k);used+=key.length+(localStorage.getItem(key)||'').length;}}return {{chunks:i,used}};}})()""")
async def main():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ca,A,ea,ok=await login(b,'Baruch','Testpass123','iphone')
            await A.wait_for_timeout(6000); await until(A,"EX_ready&&EX_ready()",10000)
            dsize=await A.evaluate("JSON.stringify(D).length")
            print('D size chars',dsize)
            print('fill',await fill(A,int(os.environ.get("LEAVE","0"))))   # phone storage nearly full (shared with the staging copy)
            tm=await A.evaluate("(()=>{const d=new Date();d.setDate(d.getDate()+2);return dkey(d)})()")
            # owner books Crew 3 on a slow connection
            urllib.request.urlopen(BASE+'/__net?mode=2500')
            await A.evaluate(f"goTab('sched');schedView='plan';renderSched();editSlot('c3','{tm}');slotPickMode('menu');document.getElementById('slotAddSite').value='t32';slotAddFull();saveSlot();0")
            await A.wait_for_timeout(300)
            q=await A.evaluate("localStorage.getItem('ex_queue')")
            print('queue in storage right after save:',q[:120] if q else q, '| in-memory pending:',await A.evaluate("EX_SYNC.pending"))
            # app is closed/relaunched (or auto-update reload) before the slow save finishes
            await A.reload(); await A.wait_for_timeout(500); urllib.request.urlopen(BASE+'/__net?mode=ok')
            await until(A,"EX_ready&&EX_ready()",15000); await A.wait_for_timeout(3000)
            r=[x for x in srv('/__records?coll=sched') if x['id']==f'c3|{tm}']
            local=await A.evaluate(f"JSON.stringify(D.sched['c3|{tm}']||null)")
            check('booking survives a reload when phone storage is nearly full',bool(r),f'server={r} local={local}')
            await b.close()
    finally: sp.kill()
asyncio.run(main())
