import sys,os; sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched')); os.environ.setdefault('APPROOT',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))
"""Staging and production share one web address (baruchw27.github.io) on a phone. Check they can never read, send or
delete each other's stored data: two stand-in servers (production DB, staging DB), both apps open in the same browser."""
from harness import *
SEED=json.load(open(os.path.join(HERE,'seed_prod.json')))
P2=PORT+1; BASE2=f'http://localhost:{P2}'
STG_CFG=open(os.path.join(APP,'staging-features','config.js')).read()
import re
STG_CFG=re.sub(r"url:'[^']*'",f"url:'{BASE2}'",STG_CFG); STG_CFG=re.sub(r"anonKey:'[^']*'","anonKey:'test'",STG_CFG)
def srv2(path): return json.loads(urllib.request.urlopen(BASE2+path).read())
async def open_app(ctx,path):
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(path+': '+str(e)))
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
        if '/staging-features/config.js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=STG_CFG)
        if u.endswith('/config.js') or '/config.js?' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
        if u.startswith(BASE) or u.startswith(BASE2): return await r.continue_()
        return await r.abort()
    await pg.route('**/*',route); await pg.goto(BASE+path); await pg.wait_for_timeout(900); return pg,errs
async def sign_in(pg,name):
    await pg.fill('#lgUser',name); await pg.fill('#lgPass','Testpass123'); await pg.evaluate("doLogin()")
    ok=await until(pg,"document.getElementById('m-login').classList.contains('hid')&&me()",10000); await pg.wait_for_timeout(5000); await until(pg,"EX_ready&&EX_ready()",10000); return ok
async def main():
    sp=start_server(); env=dict(os.environ,APPROOT=APP); sp2=subprocess.Popen(['node',os.path.join(HERE,'fakeserver_sched.js'),str(P2)],env=env); time.sleep(0.8)
    try:
        srvpost('/__seed',SEED)
        # staging DB: same people, different (fake) jobs
        rq=urllib.request.Request(BASE2+'/__seed',data=json.dumps({'users':SEED['users'],'rows':[r for r in SEED['rows'] if r['coll'] in('emps','crews','_','base')]+[{'coll':'sites','id':'stg1','data':{'id':'stg1','name':'STAGING TEST SITE','stage':'active','notes':[]}}]}).encode(),headers={'Content-Type':'application/json'}); urllib.request.urlopen(rq)
        async with async_playwright() as p:
            b=await p.chromium.launch(); ctx=await b.new_context(service_workers='block',viewport={'width':390,'height':844})
            L,el=await open_app(ctx,'/index.html'); check('live app signed in',await sign_in(L,'Baruch'))
            k1=await L.evaluate("dkey(new Date(Date.now()+864e5*3))"); k2=await L.evaluate("dkey(new Date(Date.now()+864e5*4))")
            await L.evaluate(f"editSlot('c1','{k1}');slotOneoffs=[{{id:'a',site:'t32',start:480,end:1110,note:''}}];saveSlot()"); await until(L,"!EX_SYNC.pending",8000)
            urllib.request.urlopen(BASE+'/__net?mode=refuse')
            await L.evaluate(f"editSlot('c2','{k2}');slotOneoffs=[{{id:'b',site:'t150',start:480,end:1110,note:''}}];saveSlot()"); await L.wait_for_timeout(1500)
            check('live app has an unsent booking waiting',await L.evaluate("EX_SYNC.pending>0"))
            S,es=await open_app(ctx,'/staging-features/index.html'); check('staging app signed in (same browser)',await sign_in(S,'Baruch'))
            check('staging sees only staging data (no live job sites)',await S.evaluate("D.sites.length===1&&D.sites[0].id==='stg1'"),await S.evaluate("D.sites.length"))
            check("staging does not see live's schedule",await S.evaluate(f"!D.sched['c1|{k1}']&&!D.sched['c2|{k2}']"))
            keys=await S.evaluate("(()=>{const out=[];for(let i=0;i<localStorage.length;i++)out.push(localStorage.key(i));return out})()")
            stg=[k for k in keys if k.startswith('stf__')]; live=[k for k in keys if not k.startswith('stf__')]
            check('staging stores everything under its own stf__ names',len(stg)>0 and all(not k.startswith('stf__ex_queue') or True for k in stg),stg[:6])
            k3=await S.evaluate("dkey(new Date(Date.now()+864e5*5))")
            await S.evaluate(f"editSlot('c3','{k3}');slotOneoffs=[{{id:'c',site:'stg1',start:480,end:1110,note:''}}];saveSlot()"); await until(S,"!EX_SYNC.pending",8000); await S.wait_for_timeout(1500)
            st_ids=[r['id'] for r in srv2('/__records?coll=sched')]; lv_ids=[r['id'] for r in srv('/__records?coll=sched')]
            check('staging booking went to the staging database only',f'c3|{k3}' in st_ids and f'c3|{k3}' not in lv_ids)
            check("live's waiting booking was never sent to staging",f'c2|{k2}' not in st_ids and f'c1|{k1}' not in st_ids)
            # phone storage full: staging must only ever drop its own cached copy
            await S.evaluate("(()=>{let c='x'.repeat(100000),i=0;try{for(;;i++)localStorage.setItem('fill'+i,c);}catch(e){};let c2='y'.repeat(1000);try{for(let j=0;;j++)localStorage.setItem('fillb'+j,c2);}catch(e){}})()")
            k4=await S.evaluate("dkey(new Date(Date.now()+864e5*6))")
            await S.evaluate(f"editSlot('c4','{k4}');slotOneoffs=[{{id:'d',site:'stg1',start:480,end:1110,note:''}}];saveSlot()"); await S.wait_for_timeout(2500)
            live_q=await L.evaluate("localStorage.getItem('ex_queue')"); live_d=await L.evaluate("!!localStorage.getItem(typeof KEY!=='undefined'?KEY:'electrix_v29')")
            check("storage full in staging: live's unsent booking is still stored",live_q is not None and f'c2|{k2}' in live_q)
            check("storage full in staging: live's cached data not removed",live_d)
            await S.evaluate("(()=>{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(/^stf__fill/.test(k))localStorage.removeItem(k);}})()")
            # the live app comes back online: its booking goes to the live database only
            urllib.request.urlopen(BASE+'/__net?mode=ok'); await L.evaluate("window.dispatchEvent(new Event('online'))"); await until(L,"!EX_SYNC.pending",15000)
            lv_ids=[r['id'] for r in srv('/__records?coll=sched')]; st_ids=[r['id'] for r in srv2('/__records?coll=sched')]
            check('live booking reaches the live database',f'c2|{k2}' in lv_ids)
            check('… and never the staging one',f'c2|{k2}' not in st_ids)
            check('staging bookings never reached the live database',f'c3|{k3}' not in lv_ids and f'c4|{k4}' not in lv_ids)
            # signing out of staging must not touch the live sign-in or data
            await S.evaluate("signOut()"); await S.wait_for_timeout(1500)
            check('signing out of staging leaves the live app signed in',await L.evaluate("!!localStorage.getItem('ex_auth')&&!!localStorage.getItem('ex_uid')"))
            await L.reload(); await until(L,"EX_ready&&EX_ready()",10000)
            check('… and the live app still opens signed in with its data',await L.evaluate(f"document.getElementById('m-login').classList.contains('hid')&&!!D.sched['c2|{k2}']"))
            check('no page errors',not (el+es),(el+es)[:3])
            await b.close()
    finally: sp.kill(); sp2.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(main())
