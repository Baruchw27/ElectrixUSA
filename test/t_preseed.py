"""Server set up by Claude (team + sign-ins, no jobs/catalog yet) → owner's first sign-in fills in jobs and catalog → a worker sees them."""
import asyncio,os,time,subprocess,json,urllib.request,uuid
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'t_sync.py')).read().split('async def main')[0])
SP='/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/'
async def m():
    sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)]);time.sleep(0.8)
    try:
        rows=[r for r in json.load(open(SP+'seed_rows.json')) if r['coll'] not in ('sites','stock')]
        users=[]
        for r in rows:
            if r['coll']=='emps':
                uid=str(uuid.uuid4());r['data']['authUid']=uid;users.append({'email':r['data']['authEmail'],'id':uid,'pass':'ownerpw1' if r['id']=='u1' else 'worker123'})
        req=urllib.request.Request(BASE+'/__seed',data=json.dumps({'rows':rows,'users':users}).encode(),headers={'Content-Type':'application/json'});urllib.request.urlopen(req)
        print('server before:',srv('/__state')['records'])
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ca,A,ea=await phone(b,'owner')
            await A.fill('#lgUser','Baruch');await A.fill('#lgPass','ownerpw1');await A.evaluate("doLogin()")
            check('owner signs in',await until(A,"me()&&me().role==='owner'&&document.getElementById('m-login').classList.contains('hid')",10000))
            check('jobs and catalog uploaded by owner phone',await until(A,"fetch('/__state').then(r=>r.json()).then(s=>s.records>=2200)",20000),srv('/__state')['records'])
            check('no demo tasks or punches uploaded',all(r['coll'] not in ('jobs','punches','exps','mats') for r in srv('/__records')))
            check('catalog quantities start at zero',all((r['data'].get('qty',0)==0) for r in srv('/__records?coll=stock')))
            check('owner has no Punch tab',await A.evaluate("![...document.querySelectorAll('.tab')].some(b=>b.style.display!=='none'&&/Punch/.test(b.textContent))"))
            check('owner can pick anyone in the top menu',await A.evaluate("!document.getElementById('roleSel').disabled&&document.getElementById('roleSel').options.length>=20"))
            await A.evaluate("setRole(D.emps.find(e=>e.name==='Carlos').id)");await A.wait_for_timeout(300)
            check('viewing as Carlos shows his screens and a red banner',await A.evaluate("me().name==='Carlos'&&!!document.getElementById('exViewAs')&&[...document.querySelectorAll('.tab')].some(b=>b.style.display!=='none'&&/Punch/.test(b.textContent))"))
            await A.evaluate("document.querySelector('#exViewAs button').click()");await A.wait_for_timeout(300)
            check('Back to me returns to Baruch',await A.evaluate("me().name==='Baruch'&&!document.getElementById('exViewAs')"))
            cb,B,eb=await phone(b,'worker')
            await B.fill('#lgUser','Carlos');await B.fill('#lgPass','worker123');await B.evaluate("doLogin()")
            check('worker signs in and sees all 426 jobs',await until(B,"me()&&me().name==='Carlos'&&D.sites.length===426",10000),await B.evaluate("D.sites.length"))
            check('worker cannot switch people',await B.evaluate("document.getElementById('roleSel').disabled"))
            await B.evaluate("setRole('u1')");check('worker setRole ignored',await B.evaluate("me().name==='Carlos'"))
            await B.reload();await B.wait_for_timeout(2500)
            check('no duplicate catalog after reload',await B.evaluate("D.stock.length")==len([r for r in srv('/__records?coll=stock')]),(await B.evaluate("D.stock.length")))
            await A.reload();await A.wait_for_timeout(3000)
            check('owner reload does not upload again',srv('/__state')['records']<=2300,srv('/__state')['records'])
            check('no page errors',not(ea+eb),ea+eb)
            await b.close()
    finally: sp.kill()
    print(ok,'passed',len(bad),'failed',bad)
asyncio.run(m())
