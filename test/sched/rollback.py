"""Rolling back Schedule v2.1 must not strand or lose anything the new version created: unsent schedule changes,
clock-ins and stock moves (normal storage and full storage), plus schedule rows written in the new formats.
usage: REL=<release app dir> RB=<rollback app dir> [PLAIN=<today's live app dir>] python3 rollback.py"""
from storage_full import *
import shutil
REL=os.environ['REL']; RB=os.environ['RB']; PLAIN=os.environ.get('PLAIN')
SERVE=os.path.join(os.environ.get('TMPDIR_RB','/tmp/claude-0/-home-claude/5aa50abd-a2aa-5734-9ec2-3116988f3ee5/scratchpad'),'rb_serve')
FILES=['index.html','sync.js','extras.js','sw.js','config.js','manifest.json','version.json','sched-v21.js','restore-shim.js','icon-192.png','icon-512.png','apple-touch-icon.png','logo-light.svg','logo-dark.svg']
def deploy(src):
    os.makedirs(SERVE,exist_ok=True)
    for f in FILES:
        t=os.path.join(SERVE,f)
        if os.path.exists(t): os.remove(t)
        if os.path.exists(os.path.join(src,f)): shutil.copy(os.path.join(src,f),t)
async def scenario(b,label,full,rollback_dir):
    deploy(REL); srvpost('/__seed',SEED)
    ctx=await b.new_context(service_workers='block',**VIEW['iphone']); P=await ctx.new_page(); errs=[]; P.on('pageerror',lambda e:errs.append(str(e)))
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
        if u.endswith('/config.js') or '/config.js?' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await P.route('**/*',route); await P.goto(BASE+'/index.html'); await P.wait_for_timeout(1200)
    await P.fill('#lgUser','Baruch'); await P.fill('#lgPass','Testpass123'); await P.evaluate("doLogin()"); await until(P,"me()&&me().name==='Baruch'",10000); await until(P,"EX_ready&&EX_ready()",15000); await P.wait_for_timeout(5000)
    check(f'[{label}] new version running',await P.evaluate("window.EX_SYNC_V===21"))
    # a copied day (new format) saved normally first
    k0=await P.evaluate("dkey(new Date(Date.now()+864e5*150))"); k1=await P.evaluate("dkey(new Date(Date.now()+864e5*151))")
    await P.evaluate(f"editSlot('c1','{k0}');slotOneoffs=[{{id:'a',site:'t32',start:480,end:1110,note:''}}];renderSlotEditor();saveSlot()"); await until(P,"!EX_SYNC.pending",10000); await P.wait_for_timeout(500)
    await P.evaluate(f"EX_copyDay('{k0}',['{k1}'],['c1'],false)"); await until(P,"!EX_SYNC.pending",10000); await P.wait_for_timeout(500)
    if full: await P.evaluate(FILL)
    net('refuse')
    k=await P.evaluate("dkey(new Date(Date.now()+864e5*152))")
    await P.evaluate(f"editSlot('c2','{k}');slotOneoffs=[{{id:'b',site:'t150',start:480,end:1110,note:''}}];renderSlotEditor();saveSlot()"); await P.wait_for_timeout(16500); await P.evaluate("hide('m-ask')")
    pid=await P.evaluate("(()=>{const id=nid('p');D.punches.push({id,who:me().id,site:'t32',in:Date.now()-3600000,out:Date.now()});save();return id})()")
    tid=await P.evaluate("(()=>{const t=commitStockTxn('in',[{id:'s_7',name:'Item 7',unit:'ea',qty:2}],'t32');return t&&t.id})()")
    await P.wait_for_timeout(2500)
    if full: check(f'[{label}] (storage was full: the waiting work is only in IndexedDB)',not (f'c2|{k}' in (await P.evaluate("localStorage.getItem('ex_queue')||''"))))
    # ── roll back ──
    deploy(rollback_dir); await P.reload(); await P.wait_for_timeout(2500)
    if full: await P.evaluate(UNFILL)
    net('ok')
    await until(P,"typeof EX_ready==='function'&&EX_ready()",45000); await P.wait_for_timeout(1500)
    try: await P.evaluate("typeof flushStockQ==='function'&&flushStockQ()")
    except Exception: pass
    await until(P,"!EX_SYNC.pending",20000); await P.wait_for_timeout(3000)
    check(f'[{label}] rolled-back app is running (old version)',await P.evaluate("window.EX_SYNC_V!==21"))
    pays=[(x['who'],x['t']) for x in srv('/__payloads') for r in x['rows'] if r['id']==f'c2|{k}']
    check(f'[{label}] unsent schedule change reached the server after rollback',sched(f'c2|{k}') is not None,pays)
    check(f'[{label}] unsent clock-in reached the server after rollback',has('punches',pid))
    check(f'[{label}] unsent stock move reached the server after rollback',stocklog(tid))
    check(f'[{label}] days saved by the new version still show in the old version',await P.evaluate(f"effectiveAsgs('c1','{k1}').map(a=>a.site).join()==='t32'&&effectiveAsgs('c1','{k0}').map(a=>a.site).join()==='t32'"))
    check(f'[{label}] no page errors after rollback',not errs,errs[:3])
    await ctx.close()
async def main():
    deploy(REL)
    os.environ['APPROOT']=SERVE
    sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver_sched.js'),str(PORT)],env=dict(os.environ,APPROOT=SERVE)); time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b=await p.chromium.launch()
            await scenario(b,'rollback build, normal storage',False,RB)
            await scenario(b,'rollback build, storage full',True,RB)
            if PLAIN:
                await scenario(b,'plain revert (no shim), storage full',True,PLAIN)
            await b.close()
    finally: sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(main())
