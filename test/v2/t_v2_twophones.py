# Scanner V2 with two worker phones at the same time + offline, against the local stand-in server (real sync code).
import asyncio, json, os, subprocess, time, urllib.request
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); T = os.path.join(HERE, '..'); PORT = 8791; BASE = f'http://localhost:{PORT}'
FAKE = open(os.path.join(T, 'fakeclient.js')).read()
CFG = f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false,trello:false,ai:false,vapid:'BBBB'}};"
INIT = """window.EX_fakeScan=(v,cb)=>{window._scan=cb;return ()=>{};};
navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');setInterval(()=>{g.fillStyle='#ccc';g.fillRect(0,0,640,480)},100);return c.captureStream(10);};"""
ok = []; bad = []
def chk(n, c, extra=''):
    (ok if c else bad).append(n); print(('  ✓ ' if c else '  ✗ ') + n + ('' if c else '  ' + str(extra)[:300]))
def srv(path): return json.loads(urllib.request.urlopen(BASE + path).read())
def ck(b): s = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(b))); return str((10 - s % 10) % 10)
BX = '2007847720011'; BX += ck(BX); EA = '07847720011'; EA += ck(EA)
LBL = "QTY\nQTE\nCANT 10\n5601-2W\nWHITE / BLANC / BLANCO\nSINGLE-POLE SWITCH GROUNDING\nLEVITON"
async def phone(b, name):
    ctx = await b.new_context(service_workers='block', viewport={'width': 390, 'height': 844}); await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(name + ': ' + str(e)))
    async def route(r):
        u = r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=FAKE)
        if '/config.js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=CFG)
        if os.environ.get('OLD_SYNC') and '/staging/sync.js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=open(os.environ['OLD_SYNC']).read())
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await pg.route('**/*', route)
    await pg.goto(BASE + '/staging/index.html'); await pg.wait_for_timeout(900)
    await pg.evaluate("window._c=[];askConfirm=function(m,yes){_c.push(String(m));yes&&yes();};0")
    return ctx, pg, errs
async def until(pg, js, ms=8000):
    t0 = time.time()
    while time.time() - t0 < ms / 1000:
        try:
            if await pg.evaluate(js): return True
        except Exception: pass
        await asyncio.sleep(0.15)
    return False
async def main():
    sp = subprocess.Popen(['node', os.path.join(T, 'fakeserver.js'), str(PORT)]); time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            print('setup: owner + two worker phones')
            ca, A0, ea = await phone(b, 'owner')
            await A0.evaluate("askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);0"); await A0.evaluate("exSetup()")
            await until(A0, "document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'", 15000)
            await until(A0, "(D.keep||[]).some(n=>/Team passwords/.test(n.title||'')&&/: /.test(n.body||''))", 40000)
            await A0.evaluate("D.sites.push({id:'site_t1',name:'12 Test Lane',stage:'active',phase:'rough',files:[],links:[]});save();0")
            note = await A0.evaluate("(D.keep||[]).find(n=>/Team passwords/.test(n.title||''))?.body||''")
            pw = {l.split(': ')[0]: l.split(': ')[1] for l in note.split('\n') if ': ' in l}
            workers = await A0.evaluate("D.emps.filter(e=>e.role==='worker'&&!e.inactive).map(e=>e.name)")
            w1, w2 = [w for w in workers if w in pw][:2]
            print('   workers:', w1, w2)
            phones = []
            for w in (w1, w2):
                c, P, e = await phone(b, w); await P.fill('#lgUser', w); await P.fill('#lgPass', pw[w]); await P.evaluate("doLogin()")
                chk(w + ' signed in', await until(P, f"document.getElementById('m-login').classList.contains('hid')&&window.EX_ME&&me()&&me().name==='{w}'", 20000), await P.evaluate("(me()||{}).name+' '+document.getElementById('lgErr').textContent"))
                await P.wait_for_timeout(2500)
                await P.evaluate(f"window.EX_upc=async()=>({{found:false}});window.ocrText=async()=>{json.dumps(LBL)};document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));0")
                phones.append((c, P, e))
            (c1, A, e1), (c2, B, e2) = phones
            before = len([r for r in srv('/__records?coll=stock') if not r['deleted']])
            print('1. Both phones scan the SAME brand-new box at the same moment')
            for P in (A, B): await P.evaluate(f"window.EX_upc=async()=>({{found:false}});window.ocrText=async()=>{json.dumps(LBL)};document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));0")
            await asyncio.gather(A.evaluate("scanQuick('in');0"), B.evaluate("scanQuick('in');0")); await A.wait_for_timeout(1600)
            await asyncio.gather(A.evaluate(f"_scan('{BX}','itf');0"), B.evaluate(f"_scan('{BX}','itf');0")); await A.wait_for_timeout(1200)
            chk('both read the label: Leviton 5601-2W, 10 per box', all([await P.evaluate("document.getElementById('v2p').value==='5601-2W'&&document.getElementById('v2n').value==='10'") for P in (A, B)]))
            await asyncio.gather(A.evaluate("v2SaveNew();0"), B.evaluate("v2SaveNew();0")); await A.wait_for_timeout(300)
            await asyncio.gather(A.evaluate("scQ(0,2);scQOk();0"), B.evaluate("scQ(0,2);scQOk();0"))
            await asyncio.gather(A.evaluate("scanFinish();scFrom('new');scComplete();0"), B.evaluate("scanFinish();scFrom('new');scComplete();0"))
            iid = await A.evaluate("D.stock.find(x=>x.model==='5601-2W').id")
            ok1 = await until(A, f"fetch('/__records?coll=stock').then(r=>r.json()).then(a=>{{const x=a.find(r=>r.id==='{iid}');return x&&x.data.qty===40}})", 12000)
            st = [r for r in srv('/__records?coll=stock') if not r['deleted']]
            chk('server: ONE item, not two', len([r for r in st if r['data'].get('model') == '5601-2W' or r['id'] == iid]) == 1, [r['id'] for r in st if '5601' in json.dumps(r['data'])])
            chk('server: 2 boxes + 2 boxes = 40 pieces (nothing lost, nothing doubled)', ok1, [r['data'].get('qty') for r in st if r['id'] == iid])
            chk('server: one box barcode link', len([r for r in srv('/__records?coll=bc') if not r['deleted'] and r['data'].get('code') == BX]) == 1, srv('/__records?coll=bc'))
            chk('server: total stock items grew by exactly 1', len(st) == before + 1, (before, len(st)))
            chk('phone A shows 40', await until(A, f"(D.stock.find(x=>x.id==='{iid}')||{{}}).qty===40", 8000))
            chk('phone B shows 40', await until(B, f"(D.stock.find(x=>x.id==='{iid}')||{{}}).qty===40", 8000))
            print('2. Phone B learns the barcode from phone A — instant on B too')
            await until(B, f"!!Object.values(D.bc||{{}}).find(m=>m.code==='{BX}')", 8000)
            await B.evaluate("scanQuick('in');0"); await B.wait_for_timeout(1500); await B.evaluate("window.EX_upc=async()=>{window._lk=1;return {found:false}};0")
            await B.evaluate(f"_scan('{BX}','itf');0"); await B.wait_for_timeout(400)
            chk('instant "how many boxes" on phone B', 'boxes' in (await B.evaluate("document.getElementById('scSheet').innerText")).lower())
            await B.evaluate("scSkip();scanClose();0")
            print('3. Two phones link different barcodes of the same item at the same moment')
            await asyncio.gather(A.evaluate("scanQuick('in');0"), B.evaluate("scanQuick('in');0")); await A.wait_for_timeout(1600)
            await A.evaluate(f"_scan('{EA}','upc_a');0"); await A.wait_for_timeout(500)
            await B.evaluate(f"D.stock.push({{id:'s_extra',name:'Leviton 5601-2W white (spare box)',unit:'pc',qty:0}});save();0")
            CODE128 = 'ELX-BIN-5601'
            await B.evaluate(f"_scan('{CODE128}','code_128');0"); await B.wait_for_timeout(500)
            fam = await A.evaluate("document.getElementById('scSheet').innerText")
            chk('single switch barcode → asks "single item of a box you have"', 'SINGLE item of a box' in fam, fam[:200])
            await asyncio.gather(A.evaluate(f"v2FamilyYes('{iid}');0"), B.evaluate(f"v2Pick('{iid}');0")); await A.wait_for_timeout(300)
            await B.evaluate("v2PackOne();0"); await B.wait_for_timeout(200)  # V2.1: the person confirms what one scan counts
            await asyncio.gather(A.evaluate("scSkip();scanClose();0"), B.evaluate("scSkip();scanClose();0"))
            ok3 = await until(A, f"fetch('/__records?coll=bc').then(r=>r.json()).then(a=>a.filter(r=>!r.deleted&&r.data.item==='{iid}').length===3)", 8000)
            chk('all 3 barcodes of the item kept (box, single, bin label)', ok3, [r['data'] for r in srv('/__records?coll=bc')])
            print('4. Phone B offline: scanning keeps working, counts sync once, no double count')
            await c2.set_offline(True); await B.evaluate("window.EX_SYNC&&(EX_SYNC.online=false);0")
            await B.evaluate("scanQuick('in');0"); await B.wait_for_timeout(1500)
            await B.evaluate(f"_scan('{BX}','itf');0"); await B.wait_for_timeout(400)
            chk('known box works offline', 'boxes' in (await B.evaluate("document.getElementById('scSheet').innerText")).lower())
            await B.evaluate("scQ(0,1);scQOk();scanFinish();scFrom('new');scComplete();0"); await B.wait_for_timeout(600)
            chk('waiting to send while offline', await B.evaluate("JSON.parse(localStorage.getItem((typeof KEY!=='undefined'?KEY:'electrix_v29')+'__stockq')||'[]').length>=1"))
            q_off = [r['data'].get('qty') for r in srv('/__records?coll=stock') if r['id'] == iid][0]
            chk('server unchanged while offline (40)', q_off == 40, q_off)
            await c2.set_offline(False); await B.evaluate("window.EX_SYNC&&(EX_SYNC.online=true);try{window.dispatchEvent(new Event('online'))}catch(e){};flushStockQ();0")
            ok4 = await until(A, f"fetch('/__records?coll=stock').then(r=>r.json()).then(a=>a.find(r=>r.id==='{iid}').data.qty===50)", 15000)
            chk('back online: +10 sent once → 50', ok4, [r['data'].get('qty') for r in srv('/__records?coll=stock') if r['id'] == iid])
            await B.evaluate("flushStockQ();0"); await B.wait_for_timeout(800)
            q2 = [r['data'].get('qty') for r in srv('/__records?coll=stock') if r['id'] == iid][0]
            chk('sending again does not double count (still 50)', q2 == 50, q2)
            chk('phone A sees 50', await until(A, f"(D.stock.find(x=>x.id==='{iid}')||{{}}).qty===50", 8000))
            print('5. Taking out more than is in the garage is refused')
            await A.evaluate("scanQuick('out');0"); await A.wait_for_timeout(1500)
            await A.evaluate(f"_scan('{BX}','itf');0"); await A.wait_for_timeout(400)
            await A.evaluate("scQ(0,9);scQOk();0")
            await A.evaluate("scanFinish();const j=document.getElementById('scJob');j.value=[...j.options].map(o=>o.value).find(v=>v)||'';scComplete();0"); await A.wait_for_timeout(1500)
            q3 = [r['data'].get('qty') for r in srv('/__records?coll=stock') if r['id'] == iid][0]
            chk('90 out of 50 refused, stock stays 50', q3 == 50, q3)
            errs = e1 + e2
            chk(f'no page errors {errs[:2]}', not errs)
            await b.close()
    finally:
        sp.kill()
    print(f"{len(ok)} passed, {len(bad)} failed")
    json.dump({'pass': len(ok), 'fail': len(bad), 'ok': ok, 'bad': bad}, open(os.path.join(HERE, 'out', 'twophones_results.json'), 'w'), indent=1)
asyncio.run(main())
