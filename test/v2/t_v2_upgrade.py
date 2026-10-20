# Release-day test: a phone still on TODAY's live app makes a pick-up while offline; the app is then replaced by the
# release build (same web address, files swapped on disk) and the phone comes back online and reloads. The unsent move
# must be sent exactly once. Also: the release build sending a move first, then the OLD app's phone retrying an old move.
# usage: python3 t_v2_upgrade.py <dir with today's live files + test/> <dir with the release build> <port>
#        … <release build dir + test/> <today's live files> <port> rollback   → the same test for an app rollback
import asyncio, json, os, shutil, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright
OLD, NEW, PORT = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 8799
BASE = f'http://localhost:{PORT}'; FAKE = open(os.path.join(OLD, 'test', 'fakeclient.js')).read()
CFG = f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false,trello:false,ai:false,vapid:'BBBB'}};"
ok = []; bad = []
def chk(n, c, x=''): (ok if c else bad).append(n); print(('  ✓ ' if c else '  ✗ ') + n + ('' if c else '  ' + str(x)[:200]))
def srv(p): return json.loads(urllib.request.urlopen(BASE + p).read())
def qty(i):
    r = [x for x in srv('/__records?coll=stock') if x['id'] == i]; return r[0]['data'].get('qty') if r else None
async def until(pg, js, ms=10000):
    t0 = time.time()
    while time.time() - t0 < ms / 1000:
        try:
            if await pg.evaluate(js): return True
        except Exception: pass
        await asyncio.sleep(0.2)
    return False
async def phone(b, name):
    ctx = await b.new_context(service_workers='block', viewport={'width': 390, 'height': 844}); pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(name + ': ' + str(e)))
    async def route(r):
        u = r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=FAKE)
        if '/config.js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=CFG)
        if '/version.json' in u: return await r.fulfill(status=200, content_type='application/json', body='{"v":"x"}')
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await pg.route('**/*', route); await pg.add_init_script("sessionStorage.setItem('ex_upd','x');setInterval(()=>{if(typeof askConfirm==='function'&&!askConfirm._w){askConfirm=function(m,y){y&&y();};askConfirm._w=1;}},50);")
    await pg.goto(BASE + '/index.html'); await pg.wait_for_timeout(900); return ctx, pg, errs
APP = ['index.html', 'sync.js', 'extras.js', 'scanner-v2.js', 'scanner-v2-ui.js', 'catalog-real.json', 'sw.js', 'version.json']
async def main():
    root = OLD
    sp = subprocess.Popen(['node', os.path.join(root, 'test', 'fakeserver.js'), str(PORT)], stdout=subprocess.DEVNULL); time.sleep(0.8)
    saved = {f: open(os.path.join(root, f), 'rb').read() for f in APP if os.path.exists(os.path.join(root, f))}
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            cO, O, eO = await phone(b, 'owner')
            await O.evaluate("askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);0"); await O.evaluate("exSetup()")
            await until(O, "document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'", 15000)
            await until(O, "(D.keep||[]).some(n=>/Team passwords/.test(n.title||'')&&/: /.test(n.body||''))", 40000)
            note = await O.evaluate("(D.keep||[]).find(n=>/Team passwords/.test(n.title||''))?.body||''")
            pw = {l.split(': ')[0]: l.split(': ')[1] for l in note.split('\n') if ': ' in l}
            ws = [x for x in await O.evaluate("D.emps.filter(e=>e.role==='worker'&&!e.inactive).map(e=>e.name)") if x in pw]
            if not ws: print('DEBUG note', repr(note[:200]), await O.evaluate("D.emps.map(e=>e.name+':'+e.role)"), eO)
            w = ws[0]
            await O.evaluate("D.sites.push({id:'site_u1',name:'1 Upgrade Way',stage:'active',phase:'rough',files:[],links:[]});D.stock.push({id:'s_up1',name:'Leviton 5603-2W',unit:'pc',qty:0,min:0});save();0")
            await O.wait_for_timeout(1200)
            await O.evaluate("commitStockTxn('in',[{id:'s_up1',name:'Leviton 5603-2W',unit:'pc',qty:30}],'site_u1',{});0"); await until(O, "!stockQ().length")
            chk("today's live app: 30 put back", qty('s_up1') == 30, qty('s_up1'))
            cW, W, eW = await phone(b, w)
            await W.fill('#lgUser', w); await W.fill('#lgPass', pw[w]); await W.evaluate("doLogin()")
            await until(W, f"document.getElementById('m-login').classList.contains('hid')&&me()&&me().name==='{w}'", 20000); await W.wait_for_timeout(1500)
            await until(W, "D.stock.some(s=>s.id==='s_up1'&&s.qty===30)")
            await cW.set_offline(True); await W.evaluate("window.EX_SYNC&&(EX_SYNC.online=false);0")
            await W.evaluate("commitStockTxn('out',[{id:'s_up1',name:'Leviton 5603-2W',unit:'pc',qty:7}],'site_u1',{});0"); await W.wait_for_timeout(300)
            chk('old app, offline: pick-up of 7 waiting on the phone', await W.evaluate("stockQ().length===1") and qty('s_up1') == 30)
            # ---- release: swap the app files on the server to the release build
            for f in APP:
                if os.path.exists(os.path.join(NEW, f)): shutil.copy(os.path.join(NEW, f), os.path.join(root, f))
            await cW.set_offline(False); await W.reload(); await W.wait_for_timeout(2500)
            if len(sys.argv) > 4 and sys.argv[4] == 'rollback':
                chk('phone now runs the previous app again (rollback)', await until(W, "typeof window.SV2==='undefined'&&typeof commitStockTxn==='function'", 15000))
            else:
                chk('phone now runs the release build', await until(W, "typeof window.SV2==='object'&&typeof stockFromServer==='function'", 15000))
            await until(W, "!stockQ().length", 15000)
            chk('the move made offline on the old app is sent once after the update (30 − 7 = 23)', qty('s_up1') == 23, qty('s_up1'))
            logs = [x for x in srv('/__records?coll=stockLog') if any(i.get('id') == 's_up1' for i in x['data'].get('items', []))]
            chk('history: 1 put-back + 1 pick-up, no duplicates', len(logs) == 2, len(logs))
            # the office phone is still on the old code (not reloaded) and keeps working with the new server rules
            await O.evaluate("commitStockTxn('out',[{id:'s_up1',name:'Leviton 5603-2W',unit:'pc',qty:3}],'site_u1',{});0"); await until(O, "!stockQ().length")
            chk('a phone not yet updated still works (23 − 3 = 20)', qty('s_up1') == 20, qty('s_up1'))
            await O.evaluate("(()=>{const s=D.stock.find(x=>x.id==='s_up1');s.qty=999;s.min=5;save();})()"); await O.wait_for_timeout(1500)
            chk('a not-updated phone cannot overwrite the count through sync (stays 20), other fields still save', qty('s_up1') == 20 and [x for x in srv('/__records?coll=stock') if x['id'] == 's_up1'][0]['data'].get('min') == 5, qty('s_up1'))
            chk('updated phone shows 20', await until(W, "D.stock.find(s=>s.id==='s_up1').qty===20", 10000))
            chk(f'no page errors {(eO + eW)[:2]}', not (eO + eW))
            await b.close()
    finally:
        sp.kill()
        for f, data in saved.items(): open(os.path.join(root, f), 'wb').write(data)
    print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
