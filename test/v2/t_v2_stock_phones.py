# Three worker phones + the owner on the real app code (staging build) against the local stand-in server:
# simultaneous take-outs / returns, over-picking, a lost server answer, offline + reconnect, offline over-pick,
# double taps, a phone restarted with unsent counts, and normal sync trying to write counts.
# (The real-database side of the same races is tested by staging/functions/stg-stock-race with real parallel sessions.)
import sys, asyncio, json, os, subprocess, time, urllib.request
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from testpw import team_passwords
HERE = os.path.dirname(os.path.abspath(__file__)); T = os.path.join(HERE, '..'); PORT = 8793; BASE = f'http://localhost:{PORT}'
FAKE = open(os.path.join(T, 'fakeclient.js')).read()
CFG = f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false,trello:false,ai:false,vapid:'BBBB'}};"
ok = []; bad = []
def chk(n, c, extra=''):
    (ok if c else bad).append(n); print(('  ✓ ' if c else '  ✗ ') + n + ('' if c else '  ' + str(extra)[:300]))
def srv(path): return json.loads(urllib.request.urlopen(BASE + path).read())
def sq(iid):
    r = [x for x in srv('/__records?coll=stock') if x['id'] == iid]
    return r[0]['data'].get('qty') if r else None
def logs(): return [x for x in srv('/__records?coll=stockLog') if not x['deleted']]
async def phone(b, name, ctx=None):
    ctx = ctx or await b.new_context(service_workers='block', viewport={'width': 390, 'height': 844})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(name + ': ' + str(e)))
    async def route(r):
        u = r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=FAKE)
        if '/config.js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=CFG)
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await pg.route('**/*', route)
    await pg.add_init_script("window._t=[];window._c=[];const _iv=setInterval(()=>{if(typeof toast==='function'&&!toast._w){const ot=toast;toast=function(a){_t.push(String(a));return ot.apply(this,arguments)};toast._w=1;}if(typeof askConfirm==='function'&&!askConfirm._w){askConfirm=function(m,yes){_c.push(String(m));yes&&yes();};askConfirm._w=1;}},50);")
    await pg.goto(BASE + '/staging/index.html'); await pg.wait_for_timeout(900)
    await hook(pg)
    return ctx, pg, errs
async def hook(pg):
    await pg.evaluate("if(!window._t){window._t=[];const ot=toast;toast=function(a){_t.push(String(a));return ot.apply(this,arguments)};window._c=[];askConfirm=function(m,yes){_c.push(String(m));yes&&yes();};}0")
async def until(pg, js, ms=8000):
    t0 = time.time()
    while time.time() - t0 < ms / 1000:
        try:
            if await pg.evaluate(js): return True
        except Exception: pass
        await asyncio.sleep(0.15)
    return False
async def ev(pg, js):
    await until(pg, "typeof D!=='undefined'&&typeof commitStockTxn==='function'&&!!window.EX_sb&&!!me()", 20000)
    return await pg.evaluate(js)
TX = "([kind,id,n,site])=>{const s=D.stock.find(x=>x.id===id);const t=commitStockTxn(kind,[{id,name:s?s.name:id,unit:'pc',qty:n}],site||D.sites[0].id,{});return t&&t.id;}"
async def main():
    sp = subprocess.Popen(['node', os.path.join(T, 'fakeserver.js'), str(PORT)]); time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            print('setup: owner + three worker phones')
            ca, O, eo = await phone(b, 'owner')
            await O.evaluate("askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);0"); await O.evaluate("exSetup()")
            await until(O, "document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'", 15000)
            await O.evaluate("D.sites.push({id:'site_t1',name:'12 Test Lane',stage:'active',phase:'rough',files:[],links:[]});D.stock.push({id:'s_race1',name:'Leviton 5603-P2W 3-Way Switch White',unit:'pc',qty:0,min:0});save();0")
            pw = await team_passwords(O)   # C13: no passwords in records — fresh test passwords for this run
            workers = [w for w in await O.evaluate("D.emps.filter(e=>e.role==='worker'&&!e.inactive).map(e=>e.name)") if w in pw][:3]
            P = []
            for w in workers:
                c, pg, e = await phone(b, w); await pg.fill('#lgUser', w); await pg.fill('#lgPass', pw[w]); await pg.evaluate("doLogin()")
                okl = await until(pg, f"document.getElementById('m-login').classList.contains('hid')&&window.EX_ME&&me()&&me().name==='{w}'", 20000)
                chk(w + ' signed in', okl); await pg.wait_for_timeout(2000); await hook(pg); P.append((c, pg, e))
            (cA, A, eA), (cB, B, eB), (cC, C, eC) = P
            for pg in (A, B, C): await until(pg, "D.stock.some(x=>x.id==='s_race1')&&D.sites.some(s=>s.id==='site_t1')", 10000)
            await ev(O, f"({TX})(['in','s_race1',50,'site_t1'])"); await until(O, "!stockQ().length", 8000)
            chk('owner put 50 in', sq('s_race1') == 50, sq('s_race1'))
            print('1. Three phones at the same moment: take 10, return 5, take 20')
            await asyncio.gather(ev(A, f"({TX})(['out','s_race1',10,'site_t1'])"), ev(B, f"({TX})(['in','s_race1',5,'site_t1'])"), ev(C, f"({TX})(['out','s_race1',20,'site_t1'])"))
            await asyncio.gather(*[until(pg, "!stockQ().length", 8000) for pg in (A, B, C)])
            chk('server 50 − 10 + 5 − 20 = 25', sq('s_race1') == 25, sq('s_race1'))
            qs = [await pg.evaluate("D.stock.find(x=>x.id==='s_race1').qty") for pg in (A, B, C, O)]
            chk('all phones show 25', all([await until(pg, "D.stock.find(x=>x.id==='s_race1').qty===25", 8000) for pg in (A, B, C, O)]), qs)
            print('2. Over-pick race: 25 in stock, three phones take 10 each at once')
            await asyncio.gather(*[ev(pg, f"({TX})(['out','s_race1',10,'site_t1'])") for pg in (A, B, C)])
            await asyncio.gather(*[until(pg, "!stockQ().length", 8000) for pg in (A, B, C)])
            chk('exactly two allowed → server 5', sq('s_race1') == 5, sq('s_race1'))
            rej = sum([1 for pg in (A, B, C) if await pg.evaluate("_t.some(x=>/Not enough in the garage/.test(x))")])
            chk('the third phone is told "Not enough in the garage" and its change is undone', rej == 1, rej)
            r5 = all([await until(pg, "D.stock.find(x=>x.id==='s_race1').qty===5", 8000) for pg in (A, B, C)])
            chk('every phone ends at 5', r5, [await pg.evaluate("[D.stock.find(x=>x.id==='s_race1').qty,stockSrv.s_race1,stockQ().length,_t.slice(-2)]") for pg in (A, B, C)])
            chk('never below zero on the server', all((i.get('after') or 0) >= 0 for l in logs() for i in l['data'].get('items', [])))
            print('3. Lost answer: the server applies it, the phone never hears back, then retries')
            srv('/__droptxn?n=1')
            tid = await ev(A, f"({TX})(['in','s_race1',7,'site_t1'])"); await A.wait_for_timeout(1500)
            st0 = srv('/__state')['stats']
            chk('the phone did not take the lost answer as saved: still queued, or already re-sent and told "duplicate"', await A.evaluate("stockQ().length===1") or (st0.get('stockDup') or 0) >= 1)
            chk('server already applied it once (12)', sq('s_race1') == 12, sq('s_race1'))
            await A.evaluate("flushStockQ();0"); await until(A, "!stockQ().length", 8000)
            chk('retry → server still 12 (no double count)', sq('s_race1') == 12, sq('s_race1'))
            chk('one history entry for that transaction', len([l for l in logs() if l['id'] == tid]) == 1)
            chk('phone shows 12', await until(A, "D.stock.find(x=>x.id==='s_race1').qty===12", 8000))
            print('4. Phone B offline: takes 3, returns 2; phone C takes 4 meanwhile; B reconnects')
            await cB.set_offline(True); await B.evaluate("window.EX_SYNC&&(EX_SYNC.online=false);0")
            await ev(B, f"({TX})(['out','s_race1',3,'site_t1'])"); await ev(B, f"({TX})(['in','s_race1',2,'site_t1'])")
            await ev(C, f"({TX})(['out','s_race1',4,'site_t1'])"); await until(C, "!stockQ().length", 8000)
            chk('B holds 2 unsent changes', await B.evaluate("stockQ().length===2"))
            chk('server shows C only (8)', sq('s_race1') == 8, sq('s_race1'))
            await cB.set_offline(False); await B.evaluate("window.EX_SYNC&&(EX_SYNC.online=true);flushStockQ();0"); await until(B, "!stockQ().length", 10000)
            chk('after reconnect: 12 − 4 − 3 + 2 = 7', sq('s_race1') == 7, sq('s_race1'))
            await B.evaluate("flushStockQ();0"); await B.wait_for_timeout(600)
            chk('sending again changes nothing (7)', sq('s_race1') == 7, sq('s_race1'))
            print('5. Phone C offline takes 100 (more than exists), then reconnects')
            await cC.set_offline(True); await C.evaluate("window.EX_SYNC&&(EX_SYNC.online=false);0")
            await ev(C, f"({TX})(['out','s_race1',100,'site_t1'])")
            await cC.set_offline(False); await C.evaluate("window.EX_SYNC&&(EX_SYNC.online=true);flushStockQ();0"); await until(C, "!stockQ().length", 10000)
            chk('server refuses, stays 7', sq('s_race1') == 7, sq('s_race1'))
            chk('C is told and its count goes back to 7', await until(C, "D.stock.find(x=>x.id==='s_race1').qty===7&&_t.some(x=>/Not enough/.test(x))", 8000))
            chk('the refused move is kept for the office to review', await C.evaluate("(D.rejq||[]).length>=1"))
            print('6. Double tap on Save')
            n0 = len(logs())
            await A.evaluate("openStockIn();siLines=[{id:'s_race1',name:'x',unit:'pc',qty:3}];(typeof siKindSet==='function'&&siKindSet('new'));document.getElementById('siSrc').value='New inventory';Promise.all([saveStockIn(),saveStockIn(),saveStockIn()]);0")
            await until(A, "!stockQ().length", 8000); await A.wait_for_timeout(500)
            chk('three taps → one transaction (7 + 3 = 10)', sq('s_race1') == 10 and len(logs()) == n0 + 1, (sq('s_race1'), len(logs()) - n0))
            print('7. Phone restarted while it still has unsent counts')
            await cA.set_offline(True); await A.evaluate("window.EX_SYNC&&(EX_SYNC.online=false);0")
            await ev(A, f"({TX})(['in','s_race1',5,'site_t1'])"); await A.wait_for_timeout(300)
            await cA.set_offline(False); await A.reload(); await A.wait_for_timeout(2500); await hook(A)
            await until(A, "!stockQ().length", 12000)
            chk('after restart the saved change is sent once (15)', await until(A, "fetch('/__records?coll=stock').then(r=>r.json()).then(a=>a.find(x=>x.id==='s_race1').data.qty===15)", 12000), sq('s_race1'))
            print('8. Normal sync can never write a count')
            await B.evaluate("const s=D.stock.find(x=>x.id==='s_race1');s.qty=999;s.note='edited';save();0"); await B.wait_for_timeout(1500)
            chk('a phone saving its own wrong count leaves the server at 15', sq('s_race1') == 15, sq('s_race1'))
            chk('the other fields still sync', [x for x in srv('/__records?coll=stock') if x['id'] == 's_race1'][0]['data'].get('note') == 'edited')
            errs = eA + eB + eC + eo
            chk(f'no page errors {errs[:2]}', not errs)
            st = srv('/__state')['stats']; print('   server stats:', {k: st.get(k) for k in ('stockTxn', 'stockDup', 'droppedAnswers')})
            await b.close()
    finally:
        sp.kill()
    print(f"{len(ok)} passed, {len(bad)} failed")
    json.dump({'pass': len(ok), 'fail': len(bad), 'ok': ok, 'bad': bad}, open(os.path.join(HERE, 'out', 'stock_phones_results.json'), 'w'), indent=1)
asyncio.run(main())
