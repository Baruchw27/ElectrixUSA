import asyncio,os,time,subprocess,json,urllib.request,uuid
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'t_sync.py')).read().split('async def main')[0])
SP='/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/'
async def m():
    sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)]);time.sleep(0.8)
    try:
        rows=[r for r in json.load(open(SP+'seed_rows.json')) if r['coll'] not in ('sites','stock')];users=[]
        for r in rows:
            if r['coll']=='emps':
                uid=str(uuid.uuid4());r['data']['authUid']=uid;users.append({'email':r['data']['authEmail'],'id':uid,'pass':'ownerpw1' if r['id']=='u1' else 'worker123'})
        urllib.request.urlopen(urllib.request.Request(BASE+'/__seed',data=json.dumps({'rows':rows,'users':users}).encode(),headers={'Content-Type':'application/json'}))
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ca,A,ea=await phone(b,'owner')
            cdp=await ca.new_cdp_session(A);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{'options':{'protocol':'ctap2','transport':'internal','hasResidentKey':True,'hasUserVerification':True,'isUserVerified':True,'automaticPresenceSimulation':True}})
            check('setup link hidden once set up',await until(A,"!document.getElementById('exSetupBtn')",3000))
            await A.fill('#lgUser','Baruch');await A.fill('#lgPass','ownerpw1');await A.evaluate("doLogin()")
            check('signed in',await until(A,"me()&&me().role==='owner'&&document.getElementById('m-login').classList.contains('hid')",10000))
            check('Face ID offered after sign-in',await until(A,"_c.some(x=>/Face ID/.test(x))",5000),await A.evaluate("_c"))
            check('Face ID turned on',await until(A,"EX_lockOn()",5000))
            await A.reload();await A.wait_for_timeout(2500)
            check('lock screen on reopen, then unlocks with Face ID',await until(A,"!document.getElementById('exLock')&&me()&&me().role==='owner'",8000))
            await A.evaluate("EX_lock()");check('lock shows',await A.evaluate("!!document.getElementById('exLock')"))
            await A.evaluate("document.getElementById('exUnlock').click()");check('tap unlock works',await until(A,"!document.getElementById('exLock')",5000))
            await A.evaluate("goTab('more')");check('More has Face ID lock (On)',await A.evaluate("/Face ID lock\\s*On/.test(document.getElementById('moreGrid').innerText)"))
            await A.evaluate("exFaceIdToggle()");await A.wait_for_timeout(300);check('can turn it off',await A.evaluate("!EX_lockOn()"))
            check('no page errors',not ea,ea)
            await b.close()
    finally: sp.kill()
    print(ok,'passed',len(bad),'failed',bad)
asyncio.run(m())
